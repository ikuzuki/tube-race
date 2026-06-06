"""Tests for the station-info enrichment. All HTTP is mocked via respx.

The network is never hit: the Wikidata SPARQL endpoint and the Wikipedia
summary endpoint are both stubbed. Wikipedia summaries are routed by article
title so a single handler can serve the whole station set.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx
import pytest
import respx

from tube_pipeline.enrich import (
    ANTHROPIC_MESSAGES_URL,
    STATION_USAGE_URL,
    WIKIDATA_SPARQL_URL,
    WIKIPEDIA_QUERY_URL,
    WIKIPEDIA_SUMMARY_URL,
    AnthropicClient,
    GraphStation,
    StationUsageClient,
    WikidataClient,
    WikidataStation,
    WikipediaClient,
    _assign_ranks,
    _coerce_float,
    _daily_from_annual,
    _looks_like_line_article,
    _resolve_article,
    _retry_after_seconds,
    article_title_from_url,
    best_fun_fact,
    build_fun_fact_prompt,
    build_station_infos,
    clean_station_name,
    enrich_stations,
    first_sentence,
    haversine_m,
    is_generic_definition,
    load_graph_stations,
    load_station_info_file,
    match_candidate,
    normalise_name,
    parse_fun_fact_response,
    parse_opened_year,
    parse_station_usage,
    parse_wkt_point,
    refresh_fun_facts,
    select_fun_fact,
    usage_match_keys,
)
from tube_pipeline.models import StationInfo, StationInfoCounts, StationInfoFile

# --------------------------------------------------------------------------- #
# Pure-parser unit tests                                                       #
# --------------------------------------------------------------------------- #


def test_parse_wkt_point_extracts_lat_lon() -> None:
    """A WKT Point literal is parsed as (lat, lon), lon first in the source."""
    result = parse_wkt_point("Point(-0.1437 51.4965)")
    assert result is not None
    lat, lon = result
    assert lat == pytest.approx(51.4965)
    assert lon == pytest.approx(-0.1437)


def test_parse_wkt_point_rejects_garbage() -> None:
    """A non-Point literal yields None rather than raising."""
    assert parse_wkt_point("not a point") is None


@pytest.mark.parametrize(
    ("literal", "expected"),
    [
        ("1868-12-24T00:00:00Z", 1868),
        ("+1863-01-01T00:00:00Z", 1863),
        ("1900-01-01T00:00:00Z", 1900),
        ("0500-01-01T00:00:00Z", None),  # implausibly early -> rejected
        ("garbage", None),
    ],
)
def test_parse_opened_year(literal: str, expected: int | None) -> None:
    """Years are parsed from ISO-ish Wikidata date literals, bad ones rejected."""
    assert parse_opened_year(literal) == expected


def test_article_title_from_url_decodes_and_unslugs() -> None:
    """An enwiki URL becomes a human-readable title."""
    url = "https://en.wikipedia.org/wiki/King%27s_Cross_St_Pancras_tube_station"
    assert article_title_from_url(url) == "King's Cross St Pancras tube station"


def test_article_title_from_url_without_wiki_path() -> None:
    """A URL with no /wiki/ segment yields None."""
    assert article_title_from_url("https://example.com/foo") is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Baker Street Underground Station", "baker street"),
        ("King's Cross St. Pancras Underground Station", "kings cross saint pancras"),
        ("Paddington (H&C Line)-Underground", "paddington"),
        ("Hammersmith & City", "hammersmith and city"),
        ("Oval tube station", "oval"),
    ],
)
def test_normalise_name(raw: str, expected: str) -> None:
    """Names normalise consistently across both data sources' conventions."""
    assert normalise_name(raw) == expected


def test_first_sentence_trims_to_one_clause() -> None:
    """The first sentence is returned, trailing prose dropped."""
    extract = "Oval is a London Underground station. It is on the Northern line."
    assert first_sentence(extract) == "Oval is a London Underground station."


def test_first_sentence_caps_length() -> None:
    """A very long single sentence is hard-capped with an ellipsis."""
    extract = "x" * 400
    result = first_sentence(extract, max_len=50)
    assert result is not None
    assert len(result) == 50
    assert result.endswith("…")


def test_first_sentence_ignores_abbreviation_period() -> None:
    """A leading 'St.' abbreviation does not prematurely end the sentence.

    Regression: "St. John's Wood is a ... station." must not truncate to "St.".
    """
    extract = "St. John's Wood is a London Underground station. It is in Westminster."
    assert first_sentence(extract) == "St. John's Wood is a London Underground station."


def test_first_sentence_skips_short_initial_fragment() -> None:
    """An implausibly short first fragment is skipped to the next break."""
    extract = "No. 10 is a place on a famous street in London. More detail follows."
    assert first_sentence(extract) == "No. 10 is a place on a famous street in London."


def test_first_sentence_empty_is_none() -> None:
    """An empty extract yields None."""
    assert first_sentence("   ") is None


def test_haversine_known_distance() -> None:
    """Haversine roughly matches a known short London distance.

    Victoria to Green Park is about 0.8 km as the crow flies.
    """
    dist = haversine_m(51.4965, -0.1447, 51.5067, -0.1428)
    assert 1000.0 < dist < 1300.0


def test_daily_from_annual_rounds_and_guards() -> None:
    """Annual patronage divides by 365; non-positive input yields None."""
    assert _daily_from_annual(36500.0) == 100
    assert _daily_from_annual(0.0) is None
    assert _daily_from_annual(None) is None


# --------------------------------------------------------------------------- #
# Ranking                                                                      #
# --------------------------------------------------------------------------- #


def test_assign_ranks_ascending_for_opening_year() -> None:
    """Ascending ranks put the oldest (smallest year) first."""
    ranks = _assign_ranks({"a": 1900, "b": 1863, "c": 1868}, descending=False)
    assert ranks == {"b": 1, "c": 2, "a": 3}


def test_assign_ranks_descending_for_traffic() -> None:
    """Descending ranks put the busiest (largest) first; ties break by id."""
    ranks = _assign_ranks({"a": 100, "b": 200, "c": 200}, descending=True)
    assert ranks["b"] == 1  # "b" < "c" so wins the tie
    assert ranks["c"] == 2
    assert ranks["a"] == 3


# --------------------------------------------------------------------------- #
# Matching                                                                     #
# --------------------------------------------------------------------------- #


def _candidate(qid: str, name: str, lat: float, lon: float) -> WikidataStation:
    """Build a minimal WikidataStation candidate for matching tests."""
    return WikidataStation(
        qid=qid,
        name=name,
        lat=lat,
        lon=lon,
        opened_year=None,
        annual_patronage=None,
        article_title=None,
    )


def test_match_candidate_prefers_nearest_within_radius() -> None:
    """The nearest candidate inside the radius wins, beating a name match."""
    station = GraphStation(id="s1", name="Oval Underground Station", lat=51.4818, lon=-0.1124)
    near = _candidate("Q1", "Oval tube station", 51.4819, -0.1125)
    far_named = _candidate("Q2", "Oval Underground Station", 51.9, -0.9)
    name_index = {normalise_name(far_named.name): far_named}
    match = match_candidate(station, [near, far_named], name_index)
    assert match is not None
    assert match.qid == "Q1"


def test_match_candidate_falls_back_to_name_when_far() -> None:
    """With no candidate inside the radius, the normalised-name match is used."""
    station = GraphStation(id="s1", name="Oval Underground Station", lat=51.4818, lon=-0.1124)
    far = _candidate("Q9", "Oval tube station", 52.0, -1.0)
    name_index = {normalise_name(far.name): far}
    match = match_candidate(station, [far], name_index)
    assert match is not None
    assert match.qid == "Q9"


def test_match_candidate_returns_none_when_nothing_matches() -> None:
    """No proximity match and no name match yields None."""
    station = GraphStation(id="s1", name="Nowhere Underground Station", lat=51.0, lon=-0.1)
    far = _candidate("Q9", "Somewhere Else", 52.0, -1.0)
    match = match_candidate(station, [far], {})
    assert match is None


# --------------------------------------------------------------------------- #
# SPARQL parsing via the client (respx)                                        #
# --------------------------------------------------------------------------- #


def _sparql_binding(
    qid: str,
    label: str,
    coord: str,
    *,
    opened: str | None = None,
    patronage: str | None = None,
    article: str | None = None,
) -> dict[str, Any]:
    """Construct one SPARQL result binding row."""
    row: dict[str, Any] = {
        "station": {"type": "uri", "value": f"http://www.wikidata.org/entity/{qid}"},
        "stationLabel": {"type": "literal", "value": label},
        "coord": {"type": "literal", "value": coord},
    }
    if opened is not None:
        row["opened"] = {"type": "literal", "value": opened}
    if patronage is not None:
        row["patronage"] = {"type": "literal", "value": patronage}
    if article is not None:
        row["article"] = {"type": "uri", "value": article}
    return row


def _sparql_payload(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Wrap binding rows in a SPARQL JSON results envelope."""
    return {"head": {"vars": []}, "results": {"bindings": rows}}


@respx.mock
def test_wikidata_client_parses_and_merges_rows() -> None:
    """Repeated rows for one entity fold into a single candidate.

    The earliest opening year and the largest patronage survive; coordinates and
    article come from the rows that carry them.
    """
    rows = [
        _sparql_binding(
            "Q1",
            "Oval",
            "Point(-0.1124 51.4818)",
            opened="1890-12-18T00:00:00Z",
            patronage="6900000",
            article="https://en.wikipedia.org/wiki/Oval_tube_station",
        ),
        # Second statement for the same entity: larger patronage, later year.
        _sparql_binding(
            "Q1",
            "Oval",
            "Point(-0.1124 51.4818)",
            opened="1900-01-01T00:00:00Z",
            patronage="7100000",
        ),
    ]
    respx.get(WIKIDATA_SPARQL_URL).mock(
        return_value=httpx.Response(200, json=_sparql_payload(rows))
    )
    with WikidataClient(client=httpx.Client()) as client:
        candidates = client.fetch_stations()
    assert len(candidates) == 1
    cand = candidates[0]
    assert cand.qid == "Q1"
    assert cand.opened_year == 1890  # earliest kept
    assert cand.annual_patronage == 7_100_000.0  # largest kept
    assert cand.article_title == "Oval tube station"
    assert cand.lat == pytest.approx(51.4818)


@respx.mock
def test_wikidata_client_skips_rows_without_coordinates() -> None:
    """Rows lacking a parseable coordinate are dropped."""
    rows = [
        {
            "station": {"value": "http://www.wikidata.org/entity/Q2"},
            "stationLabel": {"value": "No Coord"},
        }
    ]
    respx.get(WIKIDATA_SPARQL_URL).mock(
        return_value=httpx.Response(200, json=_sparql_payload(rows))
    )
    with WikidataClient(client=httpx.Client()) as client:
        assert client.fetch_stations() == []


@respx.mock
def test_wikidata_client_retries_then_succeeds() -> None:
    """A 429 (with Retry-After 0) is retried and the subsequent 200 is used."""
    rows = [_sparql_binding("Q1", "Oval", "Point(-0.1124 51.4818)")]
    responses = [
        httpx.Response(429, headers={"Retry-After": "0"}, text="slow down"),
        httpx.Response(200, json=_sparql_payload(rows)),
    ]
    respx.get(WIKIDATA_SPARQL_URL).mock(side_effect=responses)
    with WikidataClient(client=httpx.Client()) as client:
        candidates = client.fetch_stations()
    assert [c.qid for c in candidates] == ["Q1"]


@respx.mock
def test_wikidata_client_raises_when_retry_after_exceeds_cap() -> None:
    """A persistent 429 asking for longer than the cap raises (fails loud)."""
    respx.get(WIKIDATA_SPARQL_URL).mock(
        return_value=httpx.Response(429, headers={"Retry-After": "100000"}, text="nope")
    )
    with WikidataClient(client=httpx.Client()) as client, pytest.raises(httpx.HTTPStatusError):
        client.fetch_stations()


@pytest.mark.parametrize(
    ("header", "default", "expected"),
    [
        ("5", 2.0, 5.0),
        (None, 2.0, 2.0),
        ("not-a-number", 3.0, 3.0),
    ],
)
def test_retry_after_seconds(header: str | None, default: float, expected: float) -> None:
    """Retry-After is read as integer seconds, with a fallback default."""
    headers = {"Retry-After": header} if header is not None else {}
    response = httpx.Response(429, headers=headers)
    assert _retry_after_seconds(response, default=default) == expected


# --------------------------------------------------------------------------- #
# Wikipedia client (respx)                                                     #
# --------------------------------------------------------------------------- #


def _route_wikipedia(extracts: dict[str, str]) -> None:
    """Route Wikipedia summary requests by decoded article title.

    Parameters
    ----------
    extracts : dict of str to str
        Article title (spaces, not underscores) to the extract text to return.
        A title absent from the map produces a 404.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        title = unquote(request.url.path.rsplit("/", 1)[-1]).replace("_", " ")
        if title in extracts:
            return httpx.Response(200, json={"extract": extracts[title], "title": title})
        return httpx.Response(404, json={"type": "not_found"})

    respx.get(url__startswith=WIKIPEDIA_SUMMARY_URL).mock(side_effect=handler)


@respx.mock
def test_wikipedia_summary_extract_ok_and_404() -> None:
    """A present title returns its extract; a missing one returns None."""
    _route_wikipedia({"Oval tube station": "Oval is a station. More."})
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        assert wiki.summary_extract("Oval tube station") == "Oval is a station. More."
        assert wiki.summary_extract("Does Not Exist tube station") is None


@respx.mock
def test_wikipedia_summary_extract_swallows_transport_error() -> None:
    """A transport-level error yields None rather than propagating."""
    respx.get(url__startswith=WIKIPEDIA_SUMMARY_URL).mock(side_effect=httpx.ConnectError("boom"))
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        assert wiki.summary_extract("Anything") is None


@respx.mock
def test_resolve_article_fallback_preserves_internal_station_word() -> None:
    """The fallback title strips only the trailing suffix, not 'Power Station'.

    A coordinate/name match is unavailable, so the title is derived from the
    graph name; the resulting article title must keep the internal 'Station'.
    """
    station = GraphStation(
        id="bps",
        name="Battersea Power Station Underground Station",
        lat=51.4799,
        lon=-0.1421,
    )
    _route_wikipedia({"Battersea Power Station tube station": "BPS is a station."})
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        wiki_url, fun_fact = _resolve_article(station, None, wiki)
    assert wiki_url == ("https://en.wikipedia.org/wiki/Battersea_Power_Station_tube_station")
    assert fun_fact == "BPS is a station."


# --------------------------------------------------------------------------- #
# build_station_infos and enrich_stations (end to end, mocked)                 #
# --------------------------------------------------------------------------- #


@respx.mock
def test_build_station_infos_matches_and_fetches_facts() -> None:
    """Stations match by proximity and pick up year, traffic, fact, and URL."""
    graph_stations = [
        GraphStation(id="oval", name="Oval Underground Station", lat=51.48185, lon=-0.112439),
        GraphStation(id="ghost", name="Ghost Underground Station", lat=0.0, lon=0.0),
    ]
    candidates = [
        WikidataStation(
            qid="Q1",
            name="Oval",
            lat=51.4819,
            lon=-0.1125,
            opened_year=1890,
            annual_patronage=6_935_000.0,
            article_title="Oval tube station",
        )
    ]
    _route_wikipedia(
        {
            "Oval tube station": "Oval is a London Underground station in Kennington. Founded later.",
        }
    )
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        infos = build_station_infos(graph_stations, candidates, wiki)

    oval = infos["oval"]
    assert oval.opened_year == 1890
    assert oval.daily_traffic == round(6_935_000.0 / 365.0)
    assert oval.fun_fact == "Oval is a London Underground station in Kennington."
    assert oval.wiki_url == "https://en.wikipedia.org/wiki/Oval_tube_station"

    # The unmatched station: no candidate, and its fallback title 404s.
    ghost = infos["ghost"]
    assert ghost.opened_year is None
    assert ghost.daily_traffic is None
    assert ghost.fun_fact is None
    assert ghost.wiki_url is None


@respx.mock
def test_enrich_stations_assigns_ranks_and_counts() -> None:
    """End to end: SPARQL + Wikipedia mocked; ranks and counts computed."""
    rows = [
        _sparql_binding(
            "Q1",
            "Oval",
            "Point(-0.112439 51.48185)",
            opened="1890-12-18T00:00:00Z",
            patronage="6935000",
            article="https://en.wikipedia.org/wiki/Oval_tube_station",
        ),
        _sparql_binding(
            "Q2",
            "Baker Street",
            "Point(-0.15713 51.522883)",
            opened="1863-01-10T00:00:00Z",
            patronage="29790000",
            article="https://en.wikipedia.org/wiki/Baker_Street_tube_station",
        ),
    ]
    respx.get(WIKIDATA_SPARQL_URL).mock(
        return_value=httpx.Response(200, json=_sparql_payload(rows))
    )
    _route_wikipedia(
        {
            "Oval tube station": "Oval is a London Underground station. Trailing.",
            "Baker Street tube station": "Baker Street is a London Underground station. Trailing.",
        }
    )
    graph_stations = [
        GraphStation(id="oval", name="Oval Underground Station", lat=51.48185, lon=-0.112439),
        GraphStation(
            id="baker", name="Baker Street Underground Station", lat=51.522883, lon=-0.15713
        ),
        GraphStation(id="ghost", name="Ghost Underground Station", lat=0.0, lon=0.0),
    ]
    with (
        WikidataClient(client=httpx.Client()) as wd,
        WikipediaClient(client=httpx.Client(), delay_s=0.0) as wp,
    ):
        result = enrich_stations(
            graph_stations, wikidata=wd, wikipedia=wp, generated_at="2026-06-06"
        )

    assert isinstance(result, StationInfoFile)
    assert result.counts.total == 3
    assert result.counts.with_opened == 2
    assert result.counts.with_traffic == 2

    # Baker Street is older (1863 < 1890) -> openedRank 1; Oval rank 2.
    assert result.stations["baker"].opened_rank == 1
    assert result.stations["oval"].opened_rank == 2
    # Baker Street busier -> dailyTrafficRank 1; Oval rank 2.
    assert result.stations["baker"].daily_traffic_rank == 1
    assert result.stations["oval"].daily_traffic_rank == 2
    # The ghost station has no stats and no ranks.
    assert result.stations["ghost"].opened_rank is None
    assert result.stations["ghost"].daily_traffic_rank is None


def test_enrich_stations_dump_matches_camelcase_schema() -> None:
    """The serialised artefact uses camelCase aliases and omits empty fields."""
    rows = [
        _sparql_binding(
            "Q1",
            "Oval",
            "Point(-0.112439 51.48185)",
            opened="1890-12-18T00:00:00Z",
            article="https://en.wikipedia.org/wiki/Oval_tube_station",
        )
    ]
    with respx.mock:
        respx.get(WIKIDATA_SPARQL_URL).mock(
            return_value=httpx.Response(200, json=_sparql_payload(rows))
        )
        _route_wikipedia({"Oval tube station": "Oval is a station."})
        graph_stations = [
            GraphStation(id="oval", name="Oval Underground Station", lat=51.48185, lon=-0.112439)
        ]
        with (
            WikidataClient(client=httpx.Client()) as wd,
            WikipediaClient(client=httpx.Client(), delay_s=0.0) as wp,
        ):
            result = enrich_stations(
                graph_stations, wikidata=wd, wikipedia=wp, generated_at="2026-06-06"
            )

    dumped = result.model_dump(by_alias=True, exclude_none=True)
    assert dumped["version"] == "1.0"
    assert dumped["generatedAt"] == "2026-06-06"
    assert dumped["counts"] == {"total": 1, "withOpened": 1, "withTraffic": 0}
    oval = dumped["stations"]["oval"]
    assert oval["openedYear"] == 1890
    assert oval["openedRank"] == 1
    assert oval["wikiUrl"] == "https://en.wikipedia.org/wiki/Oval_tube_station"
    # No traffic for this station -> the key is omitted entirely.
    assert "dailyTraffic" not in oval
    assert "dailyTrafficRank" not in oval


# --------------------------------------------------------------------------- #
# TfL station usage: name mapping, XLSX parser, client (no network)            #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Acton Town", ("acton town",)),
        # TfL appends a mode token to co-located hubs; it is stripped.
        ("Euston LU", ("euston",)),
        ("Paddington TfL", ("paddington",)),
        ("Victoria LU", ("victoria",)),
        # St. expansion still applies via normalise_name.
        ("King's Cross St. Pancras", ("kings cross saint pancras",)),
        # Structural aliases: one row -> several / renamed graph keys.
        ("Bank and Monument", ("bank", "monument")),
        ("Heathrow Terminals 123", ("heathrow terminals 2 and 3",)),
    ],
)
def test_usage_match_keys(raw: str, expected: tuple[str, ...]) -> None:
    """Usage-file names map to the graph match key(s) they should populate."""
    assert usage_match_keys(raw) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1234, 1234.0),
        (1234.5, 1234.5),
        ("1,234,567", 1234567.0),
        ("  890 ", 890.0),
        ("---", None),
        (None, None),
        (True, None),  # bools are ints in Python but never a count
    ],
)
def test_coerce_float(value: Any, expected: float | None) -> None:
    """Cells coerce to float where numeric; placeholders/None/bool yield None."""
    assert _coerce_float(value) == expected


# A tiny workbook that mirrors the real Annual Station Counts geometry: a few
# title rows, a group-label row, then the Mode/Station/.../En-Ex header. The
# annualised column is told apart from the weekly/12-week columns by its group
# label, exactly as in the live file.
_USAGE_GROUP_ROW: list[Any] = [None, None, None, None, "Weekly", "12-week", "Annualised"]
_USAGE_HEADER_ROW: list[Any] = [
    "Mode",
    "MNLC",
    "Station",
    "Source",
    "En/Ex",
    "En/Ex",
    "En/Ex",
]


def _sample_usage_xlsx(data_rows: list[list[Any]]) -> bytes:
    """Build an in-memory Annual Station Counts-shaped workbook.

    Parameters
    ----------
    data_rows : list of list
        Rows beneath the header, each ``[mode, mnlc, station, source, weekly,
        twelve_week, annualised]``.

    Returns
    -------
    bytes
        The ``.xlsx`` file contents.
    """
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "ACxx"
    ws.append(["COUNTS (LU/LO/DLR/TfL)"])  # title row
    ws.append(["(C) Copyright Transport for London"])  # title row
    ws.append([])  # spacer
    ws.append(_USAGE_GROUP_ROW)
    ws.append(_USAGE_HEADER_ROW)
    for row in data_rows:
        ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def test_parse_station_usage_extracts_lu_annualised() -> None:
    """Only LU rows with a numeric annualised total are kept, keyed by match key."""
    data = _sample_usage_xlsx(
        [
            ["LU", "500", "Acton Town", "Gateline", 100_000, 1_200_000, 4_823_835],
            ["LU", "502", "Euston LU", "Gateline", 90_000, 1_000_000, 29_965_071],
            # National Rail row for the same name: ignored (mode != LU).
            ["NR", "999", "Euston", "Gateline", 80_000, 900_000, 99_999_999],
            # No-data placeholder: skipped.
            ["LU", "777", "Kentish Town", "Gateline", "---", "---", "---"],
        ]
    )
    usage = parse_station_usage(data)
    assert usage == {
        "acton town": 4_823_835.0,
        "euston": 29_965_071.0,
    }
    assert "kentish town" not in usage


def test_parse_station_usage_combined_row_feeds_two_stations() -> None:
    """The combined 'Bank and Monument' row populates both graph keys."""
    data = _sample_usage_xlsx(
        [["LU", "542", "Bank and Monument", "Gateline", 700_000, 8_000_000, 37_200_346]]
    )
    usage = parse_station_usage(data)
    assert usage["bank"] == 37_200_346.0
    assert usage["monument"] == 37_200_346.0


def test_parse_station_usage_keeps_larger_on_key_collision() -> None:
    """When two rows map to one key the larger annual figure wins."""
    data = _sample_usage_xlsx(
        [
            ["LU", "1", "Paddington", "Gateline", 1, 1, 10_000_000],
            ["LU", "2", "Paddington TfL", "Gateline", 1, 1, 48_546_460],
        ]
    )
    usage = parse_station_usage(data)
    assert usage["paddington"] == 48_546_460.0


def test_parse_station_usage_rejects_non_xlsx() -> None:
    """Non-XLSX bytes raise ValueError rather than returning empty."""
    with pytest.raises(ValueError, match="readable XLSX"):
        parse_station_usage(b"this is not a spreadsheet")


def test_parse_station_usage_no_header_returns_empty() -> None:
    """A workbook without a Mode/Station header yields an empty mapping."""
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["something", "else"])
    buffer = io.BytesIO()
    wb.save(buffer)
    assert parse_station_usage(buffer.getvalue()) == {}


@respx.mock
def test_station_usage_client_downloads_and_parses() -> None:
    """The client GETs the workbook and returns the parsed usage mapping."""
    data = _sample_usage_xlsx(
        [["LU", "500", "Acton Town", "Gateline", 100_000, 1_200_000, 4_823_835]]
    )
    respx.get(STATION_USAGE_URL).mock(return_value=httpx.Response(200, content=data))
    with StationUsageClient(client=httpx.Client()) as client:
        usage = client.fetch_usage()
    assert usage == {"acton town": 4_823_835.0}


@respx.mock
def test_station_usage_client_raises_on_http_error() -> None:
    """A non-2xx download fails loud (HTTPStatusError) rather than silent empty."""
    respx.get(STATION_USAGE_URL).mock(return_value=httpx.Response(503, text="down"))
    with (
        StationUsageClient(client=httpx.Client()) as client,
        pytest.raises(httpx.HTTPStatusError),
    ):
        client.fetch_usage()


# --------------------------------------------------------------------------- #
# Traffic source preference (TfL over Wikidata) in build_station_infos         #
# --------------------------------------------------------------------------- #


@respx.mock
def test_build_station_infos_prefers_tfl_usage_over_wikidata() -> None:
    """TfL usage overrides Wikidata patronage for daily traffic where present."""
    graph_stations = [
        GraphStation(id="oval", name="Oval Underground Station", lat=51.48185, lon=-0.112439),
    ]
    candidates = [
        WikidataStation(
            qid="Q1",
            name="Oval",
            lat=51.4819,
            lon=-0.1125,
            opened_year=1890,
            annual_patronage=6_935_000.0,  # would be ~19k/day; TfL must win
            article_title="Oval tube station",
        )
    ]
    _route_wikipedia({"Oval tube station": "Oval is a station."})
    usage = {"oval": 7_300_000.0}  # 20000/day
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        infos = build_station_infos(graph_stations, candidates, wiki, usage=usage)
    assert infos["oval"].daily_traffic == 20_000


@respx.mock
def test_build_station_infos_falls_back_to_wikidata_without_usage() -> None:
    """With no TfL figure for a station, Wikidata patronage still supplies it."""
    graph_stations = [
        GraphStation(id="oval", name="Oval Underground Station", lat=51.48185, lon=-0.112439),
    ]
    candidates = [
        WikidataStation(
            qid="Q1",
            name="Oval",
            lat=51.4819,
            lon=-0.1125,
            opened_year=1890,
            annual_patronage=7_300_000.0,
            article_title="Oval tube station",
        )
    ]
    _route_wikipedia({"Oval tube station": "Oval is a station."})
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        infos = build_station_infos(graph_stations, candidates, wiki, usage={})
    assert infos["oval"].daily_traffic == 20_000


@respx.mock
def test_enrich_stations_uses_usage_client_for_traffic_and_ranks() -> None:
    """End to end with a usage client: TfL drives traffic and its rank."""
    rows = [
        _sparql_binding(
            "Q1",
            "Oval",
            "Point(-0.112439 51.48185)",
            opened="1890-12-18T00:00:00Z",
            article="https://en.wikipedia.org/wiki/Oval_tube_station",
        ),
        _sparql_binding(
            "Q2",
            "Baker Street",
            "Point(-0.15713 51.522883)",
            opened="1863-01-10T00:00:00Z",
            article="https://en.wikipedia.org/wiki/Baker_Street_tube_station",
        ),
    ]
    respx.get(WIKIDATA_SPARQL_URL).mock(
        return_value=httpx.Response(200, json=_sparql_payload(rows))
    )
    _route_wikipedia(
        {
            "Oval tube station": "Oval is a London Underground station. Trailing.",
            "Baker Street tube station": "Baker Street is a station. Trailing.",
        }
    )
    usage_xlsx = _sample_usage_xlsx(
        [
            ["LU", "1", "Oval", "Gateline", 1, 1, 3_650_000],  # 10000/day
            ["LU", "2", "Baker Street", "Gateline", 1, 1, 7_300_000],  # 20000/day
        ]
    )
    respx.get(STATION_USAGE_URL).mock(return_value=httpx.Response(200, content=usage_xlsx))
    graph_stations = [
        GraphStation(id="oval", name="Oval Underground Station", lat=51.48185, lon=-0.112439),
        GraphStation(
            id="baker", name="Baker Street Underground Station", lat=51.522883, lon=-0.15713
        ),
    ]
    with (
        WikidataClient(client=httpx.Client()) as wd,
        WikipediaClient(client=httpx.Client(), delay_s=0.0) as wp,
        StationUsageClient(client=httpx.Client()) as us,
    ):
        result = enrich_stations(
            graph_stations,
            wikidata=wd,
            wikipedia=wp,
            generated_at="2026-06-06",
            usage_client=us,
        )

    assert result.counts.with_traffic == 2
    assert result.stations["oval"].daily_traffic == 10_000
    assert result.stations["baker"].daily_traffic == 20_000
    # Baker Street busier -> rank 1.
    assert result.stations["baker"].daily_traffic_rank == 1
    assert result.stations["oval"].daily_traffic_rank == 2


# --------------------------------------------------------------------------- #
# Graph loading                                                                #
# --------------------------------------------------------------------------- #


def test_load_graph_stations_reads_id_name_coords(tmp_path: Path) -> None:
    """Graph stations are read with id, name and coordinates only."""
    graph = {
        "version": "1.0",
        "generatedAt": "2026-06-06",
        "lines": [],
        "stations": [
            {
                "id": "940GZZLUOVL",
                "name": "Oval Underground Station",
                "lat": 51.48185,
                "lon": -0.112439,
                "lines": ["northern"],
                "zone": "2",
            }
        ],
        "edges": [],
    }
    path = tmp_path / "graph.json"
    path.write_text(json.dumps(graph), encoding="utf-8")
    stations = load_graph_stations(str(path))
    assert len(stations) == 1
    assert stations[0].id == "940GZZLUOVL"
    assert stations[0].name == "Oval Underground Station"
    assert stations[0].lat == pytest.approx(51.48185)


# --------------------------------------------------------------------------- #
# Fun-fact heuristic: skip the dull definition, pick the interesting sentence  #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "sentence",
    [
        "Oval is a London Underground station in the London Borough of Lambeth.",
        "Angel is a London Underground station, located in the Angel area.",
        "Archway is an Underground station.",
        "Bank is a station on the Central line.",
        "Barking is an interchange station in the town of Barking.",
        "Marylebone is a Central London railway terminus and connected tube station.",
        "Amersham is a London Underground and National Rail station in the town.",
        "Earl's Court is a Grade II listed London Underground station in Earl's Court.",
    ],
)
def test_is_generic_definition_flags_boilerplate(sentence: str) -> None:
    """Every flavour of the dull "X is a ... station" opener is detected."""
    assert is_generic_definition(sentence) is True


@pytest.mark.parametrize(
    "sentence",
    [
        "Oval is named after the nearby Oval cricket ground.",
        "The station was the first on the network to use escalators.",
        "It features Art Deco architecture designed by Charles Holden.",
        "Mornington Crescent gave its name to a long-running radio game.",
    ],
)
def test_is_generic_definition_passes_interesting(sentence: str) -> None:
    """Genuinely interesting sentences are not treated as boilerplate."""
    assert is_generic_definition(sentence) is False


def test_best_fun_fact_skips_definition_for_named_after() -> None:
    """The dull first sentence is skipped in favour of a 'named after' fact."""
    extract = (
        "Oval is a London Underground station in the London Borough of Lambeth. "
        "The station takes its name from the nearby Oval cricket ground, home of "
        "Surrey County Cricket Club."
    )
    fact = best_fun_fact(extract)
    assert fact is not None
    assert "cricket ground" in fact
    assert not is_generic_definition(fact)


def test_best_fun_fact_prefers_superlative_over_plain_locator() -> None:
    """A superlative sentence beats a bare locator sentence."""
    extract = (
        "Somewhere is a London Underground station. "
        "It sits next to a road and some houses in the suburb. "
        "It is the deepest station on the entire network at 58 metres below ground."
    )
    fact = best_fun_fact(extract)
    assert fact is not None
    assert "deepest" in fact


def test_best_fun_fact_demotes_line_spoiler_sentence() -> None:
    """A sentence naming a tube line is never preferred (line spoiler)."""
    extract = (
        "Foo is a London Underground station. "
        "It is served by the Victoria line and the Northern line. "
        "The ticket hall contains a mural by a local artist."
    )
    fact = best_fun_fact(extract)
    assert fact is not None
    assert "Victoria line" not in fact
    assert "Northern line" not in fact
    assert "mural" in fact


def test_best_fun_fact_falls_back_to_definition_when_nothing_else() -> None:
    """With only the generic definition available, it is returned, not None."""
    extract = "Borough is a London Underground station."
    fact = best_fun_fact(extract)
    assert fact == "Borough is a London Underground station."


def test_best_fun_fact_caps_length() -> None:
    """A very long chosen sentence is hard-capped with an ellipsis."""
    extract = "Place is a tube station. " + ("It was named after " + "x" * 300 + ".")
    fact = best_fun_fact(extract, max_len=60)
    assert fact is not None
    assert len(fact) == 60
    assert fact.endswith("…")


def test_best_fun_fact_empty_is_none() -> None:
    """An empty extract yields None."""
    assert best_fun_fact("   ") is None


# --------------------------------------------------------------------------- #
# Wikipedia fuller-intro fetch (Action API) with summary fallback              #
# --------------------------------------------------------------------------- #


@respx.mock
def test_intro_extract_uses_query_api() -> None:
    """The Action API lead-section extract is returned when present."""
    intro = "Oval is a tube station. It is named after the Oval cricket ground."
    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(
        return_value=httpx.Response(
            200,
            json={"query": {"pages": {"123": {"title": "Oval tube station", "extract": intro}}}},
        )
    )
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        assert wiki.intro_extract("Oval tube station") == intro


@respx.mock
def test_intro_extract_falls_back_to_summary_on_query_error() -> None:
    """A failed/empty query call falls back to the REST summary extract."""
    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(
        return_value=httpx.Response(500, text="boom")
    )
    _route_wikipedia({"Oval tube station": "Oval summary extract."})
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        assert wiki.intro_extract("Oval tube station") == "Oval summary extract."


@respx.mock
def test_intro_extract_falls_back_when_query_page_has_no_extract() -> None:
    """A query page lacking an extract (missing page) falls back to summary."""
    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(
        return_value=httpx.Response(200, json={"query": {"pages": {"-1": {"missing": ""}}}})
    )
    _route_wikipedia({"Ghost tube station": "Ghost summary."})
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        assert wiki.intro_extract("Ghost tube station") == "Ghost summary."


# --------------------------------------------------------------------------- #
# Anthropic distillation: pure prompt/parse plus mocked HTTP                    #
# --------------------------------------------------------------------------- #


def test_build_fun_fact_prompt_includes_name_and_text() -> None:
    """The prompt carries the station name and the grounding text."""
    prompt = build_fun_fact_prompt("Oval", "Named after the cricket ground.")
    assert "Oval" in prompt
    assert "Named after the cricket ground." in prompt
    assert "NONE" in prompt  # the refusal instruction is present


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "Named after the nearby Oval cricket ground.",
            "Named after the nearby Oval cricket ground.",
        ),
        ('"Quoted fact about a landmark."', "Quoted fact about a landmark."),
        ("Fact one.\nstray second line", "Fact one."),
        ("NONE", None),
        ("None.", None),
        ("It is served by the Victoria line.", None),  # line spoiler rejected
        ("Foo is a London Underground station.", None),  # still generic rejected
    ],
)
def test_parse_fun_fact_response(text: str, expected: str | None) -> None:
    """The Messages response is cleaned; refusals/spoilers/generic map to None."""
    payload = {"content": [{"type": "text", "text": text}]}
    assert parse_fun_fact_response(payload) == expected


def test_parse_fun_fact_response_ignores_non_text_blocks() -> None:
    """Non-text content blocks are skipped; empty content yields None."""
    assert parse_fun_fact_response({"content": [{"type": "tool_use"}]}) is None
    assert parse_fun_fact_response({}) is None


@respx.mock
def test_anthropic_client_distils_fact() -> None:
    """A 200 with a usable sentence returns the distilled fact."""
    respx.post(ANTHROPIC_MESSAGES_URL).mock(
        return_value=httpx.Response(
            200,
            json={"content": [{"type": "text", "text": "Named after the Oval cricket ground."}]},
        )
    )
    with AnthropicClient("key", client=httpx.Client()) as ai:
        fact = ai.distil_fun_fact("Oval", "Oval is named after the Oval cricket ground.")
    assert fact == "Named after the Oval cricket ground."


@respx.mock
def test_anthropic_client_returns_none_on_http_error() -> None:
    """A non-2xx Messages response yields None (caller falls back)."""
    respx.post(ANTHROPIC_MESSAGES_URL).mock(return_value=httpx.Response(429, text="slow down"))
    with AnthropicClient("key", client=httpx.Client()) as ai:
        assert ai.distil_fun_fact("Oval", "Some grounding text.") is None


@respx.mock
def test_anthropic_client_returns_none_on_transport_error() -> None:
    """A transport-level error yields None rather than propagating."""
    respx.post(ANTHROPIC_MESSAGES_URL).mock(side_effect=httpx.ConnectError("boom"))
    with AnthropicClient("key", client=httpx.Client()) as ai:
        assert ai.distil_fun_fact("Oval", "Some grounding text.") is None


def test_anthropic_client_skips_empty_text() -> None:
    """An empty grounding text short-circuits to None without an HTTP call."""
    # No respx route registered: if it made a call it would raise.
    with AnthropicClient("key", client=httpx.Client()) as ai:
        assert ai.distil_fun_fact("Oval", "   ") is None


# --------------------------------------------------------------------------- #
# select_fun_fact, name cleaning, line-article detection                       #
# --------------------------------------------------------------------------- #


def test_select_fun_fact_uses_ai_when_available() -> None:
    """When the AI returns a fact it wins over the heuristic."""

    class _StubAI:
        def distil_fun_fact(self, name: str, intro_text: str) -> str | None:
            return "AI distilled fact."

    fact = select_fun_fact("Oval", "Oval is a tube station. Named after a ground.", _StubAI())  # type: ignore[arg-type]
    assert fact == "AI distilled fact."


def test_select_fun_fact_falls_back_to_heuristic_on_ai_refusal() -> None:
    """When the AI declines (None) the heuristic supplies the fact."""

    class _RefusingAI:
        def distil_fun_fact(self, name: str, intro_text: str) -> str | None:
            return None

    extract = (
        "Oval is a London Underground station in Lambeth. "
        "It is named after the nearby Oval cricket ground."
    )
    fact = select_fun_fact("Oval", extract, _RefusingAI())  # type: ignore[arg-type]
    assert fact is not None
    assert "cricket ground" in fact


def test_select_fun_fact_none_intro_returns_none() -> None:
    """No intro text yields None even with no AI client."""
    assert select_fun_fact("Oval", None) is None
    assert select_fun_fact("Oval", "   ") is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Oval Underground Station", "Oval"),
        ("Paddington (H&C Line)-Underground", "Paddington"),
        ("Battersea Power Station Underground Station", "Battersea Power Station"),
        ("King's Cross St. Pancras Underground Station", "King's Cross St. Pancras"),
    ],
)
def test_clean_station_name(raw: str, expected: str) -> None:
    """The display name is reduced to a human station name for prompts/titles."""
    assert clean_station_name(raw) == expected


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Metropolitan line", True),
        ("Bakerloo line", True),
        ("Bakerloo", True),
        ("Oval tube station", False),
        ("Baker Street tube station", False),
        (None, False),
    ],
)
def test_looks_like_line_article(title: str | None, expected: bool) -> None:
    """Line-article titles are recognised so the caller can refetch a station."""
    assert _looks_like_line_article(title) is expected


# --------------------------------------------------------------------------- #
# refresh_fun_facts: merge new funFacts onto the existing artefact             #
# --------------------------------------------------------------------------- #


def _info_file(stations: dict[str, StationInfo]) -> StationInfoFile:
    """Wrap station infos in a StationInfoFile with matching counts."""
    with_opened = sum(1 for s in stations.values() if s.opened_year is not None)
    with_traffic = sum(1 for s in stations.values() if s.daily_traffic is not None)
    counts = StationInfoCounts.model_validate(
        {"total": len(stations), "withOpened": with_opened, "withTraffic": with_traffic}
    )
    return StationInfoFile.model_validate(
        {
            "version": "1.0",
            "generatedAt": "2026-06-06",
            "counts": counts,
            "stations": stations,
        }
    )


@respx.mock
def test_refresh_fun_facts_updates_only_fun_fact() -> None:
    """funFact is rewritten from the linked article; all else is preserved."""
    oval = StationInfo.model_validate(
        {
            "name": "Oval Underground Station",
            "openedYear": 1890,
            "openedRank": 84,
            "dailyTraffic": 15386,
            "dailyTrafficRank": 107,
            "funFact": "Oval is a London Underground station in the London Borough of Lambeth.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Oval_tube_station",
        }
    )
    info_file = _info_file({"940GZZLUOVL": oval})

    intro = (
        "Oval is a London Underground station in Lambeth. "
        "The station is named after the nearby Oval cricket ground."
    )
    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(
        return_value=httpx.Response(200, json={"query": {"pages": {"1": {"extract": intro}}}})
    )
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        refreshed = refresh_fun_facts(info_file, wiki)

    out = refreshed.stations["940GZZLUOVL"]
    assert "cricket ground" in (out.fun_fact or "")
    assert not is_generic_definition(out.fun_fact or "")
    # Every other field is untouched.
    assert out.name == "Oval Underground Station"
    assert out.opened_year == 1890
    assert out.opened_rank == 84
    assert out.daily_traffic == 15386
    assert out.daily_traffic_rank == 107
    assert out.wiki_url == "https://en.wikipedia.org/wiki/Oval_tube_station"
    # File-level fields preserved.
    assert refreshed.generated_at == "2026-06-06"
    assert refreshed.counts.total == 1


@respx.mock
def test_refresh_fun_facts_keeps_existing_when_fetch_yields_nothing() -> None:
    """A station whose article 404s keeps its prior funFact rather than losing it."""
    ghost = StationInfo.model_validate(
        {
            "name": "Ghost Underground Station",
            "funFact": "Ghost is a London Underground station.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Ghost_tube_station",
        }
    )
    info_file = _info_file({"ghost": ghost})

    # Query API 404s for every title, and so does the REST summary fallback.
    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(return_value=httpx.Response(404, json={}))
    _route_wikipedia({})  # all summary titles 404
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        refreshed = refresh_fun_facts(info_file, wiki)

    assert refreshed.stations["ghost"].fun_fact == "Ghost is a London Underground station."


@respx.mock
def test_refresh_fun_facts_refetches_canonical_for_line_article() -> None:
    """A wikiUrl pointing at a line article triggers a canonical-title refetch.

    The station fact must come from the station's own page, while the wikiUrl is
    left unchanged. Uses a non-curated station so the fetch path is exercised.
    """
    faketon = StationInfo.model_validate(
        {
            "name": "Faketon Underground Station",
            "openedYear": 1863,
            "funFact": "The Example line is a London Underground line.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Metropolitan_line",
        }
    )
    info_file = _info_file({"940GZZLUFKT": faketon})

    def handler(request: httpx.Request) -> httpx.Response:
        # The canonical "Faketon tube station" title is requested (not the line).
        title = request.url.params.get("titles", "")
        if title == "Faketon tube station":
            intro = (
                "Faketon is a London Underground station near the City of London. "
                "It stands on the site of a medieval gate in the old London Wall."
            )
            return httpx.Response(200, json={"query": {"pages": {"1": {"extract": intro}}}})
        return httpx.Response(200, json={"query": {"pages": {"-1": {"missing": ""}}}})

    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(side_effect=handler)
    _route_wikipedia({})  # summary fallback 404s for all titles
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        refreshed = refresh_fun_facts(info_file, wiki)

    out = refreshed.stations["940GZZLUFKT"]
    assert "London Wall" in (out.fun_fact or "")
    assert "Metropolitan line" not in (out.fun_fact or "")
    # wikiUrl is preserved exactly, even though it points at the line article.
    assert out.wiki_url == "https://en.wikipedia.org/wiki/Metropolitan_line"


@respx.mock
def test_refresh_fun_facts_uses_ai_client_when_given() -> None:
    """With an AnthropicClient, the distilled fact is used end to end.

    Uses a non-curated station so the AI path is reached (curated facts skip it).
    """
    testbridge = StationInfo.model_validate(
        {
            "name": "Testbridge Underground Station",
            "funFact": "Testbridge is a London Underground station.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Testbridge_tube_station",
        }
    )
    info_file = _info_file({"940GZZLUTBR": testbridge})

    intro = "Testbridge is a tube station. It is named after a famous bridge."
    respx.get(url__startswith=WIKIPEDIA_QUERY_URL).mock(
        return_value=httpx.Response(200, json={"query": {"pages": {"1": {"extract": intro}}}})
    )
    respx.post(ANTHROPIC_MESSAGES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "Named after the famous Testbridge crossing."}]
            },
        )
    )
    with (
        WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki,
        AnthropicClient("key", client=httpx.Client()) as ai,
    ):
        refreshed = refresh_fun_facts(info_file, wiki, ai_client=ai)

    assert (
        refreshed.stations["940GZZLUTBR"].fun_fact == "Named after the famous Testbridge crossing."
    )


@respx.mock
def test_refresh_fun_facts_uses_curated_override() -> None:
    """A curated station gets its hand-authored fact, with no network fetch."""
    oval = StationInfo.model_validate(
        {
            "name": "Oval Underground Station",
            "funFact": "Oval is a London Underground station.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Oval_tube_station",
        }
    )
    info_file = _info_file({"940GZZLUOVL": oval})

    # No HTTP routes registered: any fetch would raise under respx, proving the
    # curated path skips Wikipedia entirely.
    with WikipediaClient(client=httpx.Client(), delay_s=0.0) as wiki:
        refreshed = refresh_fun_facts(info_file, wiki)

    fact = refreshed.stations["940GZZLUOVL"].fun_fact or ""
    assert "first international cricket venue" in fact


def test_load_station_info_file_roundtrip(tmp_path: Path) -> None:
    """An artefact written to disk loads back through the model validator."""
    oval = StationInfo.model_validate(
        {
            "name": "Oval Underground Station",
            "openedYear": 1890,
            "funFact": "Named after the Oval cricket ground.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Oval_tube_station",
        }
    )
    info_file = _info_file({"940GZZLUOVL": oval})
    path = tmp_path / "stations-info.json"
    path.write_text(
        json.dumps(info_file.model_dump(by_alias=True, exclude_none=True)), encoding="utf-8"
    )
    loaded = load_station_info_file(str(path))
    assert loaded.stations["940GZZLUOVL"].fun_fact == "Named after the Oval cricket ground."
    assert loaded.stations["940GZZLUOVL"].opened_year == 1890
