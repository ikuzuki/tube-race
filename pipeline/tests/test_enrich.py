"""Tests for the station-info enrichment. All HTTP is mocked via respx.

The network is never hit: the Wikidata SPARQL endpoint and the Wikipedia
summary endpoint are both stubbed. Wikipedia summaries are routed by article
title so a single handler can serve the whole station set.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx
import pytest
import respx

from tube_pipeline.enrich import (
    WIKIDATA_SPARQL_URL,
    WIKIPEDIA_SUMMARY_URL,
    GraphStation,
    WikidataClient,
    WikidataStation,
    WikipediaClient,
    _assign_ranks,
    _daily_from_annual,
    _resolve_article,
    _retry_after_seconds,
    article_title_from_url,
    build_station_infos,
    enrich_stations,
    first_sentence,
    haversine_m,
    load_graph_stations,
    match_candidate,
    normalise_name,
    parse_opened_year,
    parse_wkt_point,
)
from tube_pipeline.models import StationInfoFile

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
