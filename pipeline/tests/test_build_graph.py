"""Tests for graph building, station merging, and edge de-duplication.

HTTP is mocked with ``respx``; no test touches the network. Fixtures are tiny
hand-made route-sequence responses shaped like the real TfL payload, crafted to
exercise specific merge behaviours (cross-line station union, undirected edge
collapse, preservation of parallel edges on different lines).
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import respx

from tube_pipeline.build_graph import (
    LINE_COLOURS,
    LINE_NAMES,
    build_graph,
    write_graph,
)
from tube_pipeline.models import TubeGraph
from tube_pipeline.tfl_client import BASE_URL, MODELLED_LINE_IDS, TflClient


def _stop(
    stop_id: str,
    name: str,
    lat: float,
    lon: float,
    line_ids: list[str],
    *,
    zone: str | None = None,
    top_most_parent_id: str | None = None,
) -> dict[str, Any]:
    """Build a minimal stopPoint dict shaped like the TfL payload.

    Parameters
    ----------
    stop_id : str
        Station-level Naptan id.
    name : str
        Station display name.
    lat, lon : float
        WGS84 coordinates.
    line_ids : list of str
        Line ids to expose in the stop's ``lines`` array.
    zone : str or None, optional
        Fare zone string.
    top_most_parent_id : str or None, optional
        Value for ``topMostParentId`` (e.g. a ``HUB...`` id).

    Returns
    -------
    dict
        A stopPoint dict.
    """
    sp: dict[str, Any] = {
        "id": stop_id,
        "name": name,
        "lat": lat,
        "lon": lon,
        "lines": [{"id": lid, "name": lid.title()} for lid in line_ids],
    }
    if zone is not None:
        sp["zone"] = zone
    if top_most_parent_id is not None:
        sp["topMostParentId"] = top_most_parent_id
    return sp


def _sequence(stop_points: list[dict[str, Any]]) -> dict[str, Any]:
    """Wrap an ordered stopPoint list in a route-sequence response.

    Parameters
    ----------
    stop_points : list of dict
        Ordered stop points forming one branch.

    Returns
    -------
    dict
        A response with a single ``stopPointSequences`` entry.
    """
    return {"stopPointSequences": [{"stopPoint": stop_points}]}


def _empty_sequence() -> dict[str, Any]:
    """Return a route-sequence response with no stops.

    Returns
    -------
    dict
        A response whose ``stopPointSequences`` is empty.
    """
    return {"stopPointSequences": []}


# Station ids used across the fixtures.
VIC = "940GZZLUVIC"  # Victoria
GPK = "940GZZLUGPK"  # Green Park
EUS = "940GZZLUEUS"  # Euston
KSX = "940GZZLUKSX"  # King's Cross St. Pancras
WST = "940GZZLUWST"  # Warren Street


def _victoria_inbound() -> dict[str, Any]:
    """Victoria line inbound: Victoria -> Green Park -> Warren St -> Euston -> King's Cross.

    Returns
    -------
    dict
        Route-sequence response for the victoria line, inbound.
    """
    return _sequence(
        [
            _stop(VIC, "Victoria", 51.4965, -0.1447, ["victoria", "district"], zone="1"),
            _stop(GPK, "Green Park", 51.5067, -0.1428, ["victoria", "jubilee"], zone="1"),
            _stop(WST, "Warren Street", 51.5247, -0.1384, ["victoria", "northern"], zone="1"),
            # Euston: topMostParentId is a HUB -> must be ignored as merge key.
            _stop(
                EUS,
                "Euston",
                51.5282,
                -0.1337,
                ["victoria", "northern"],
                zone="1",
                top_most_parent_id="HUBEUS",
            ),
            _stop(
                KSX,
                "King's Cross St. Pancras",
                51.5308,
                -0.1238,
                ["victoria", "northern", "piccadilly"],
                zone="1",
                top_most_parent_id="HUBKGX",
            ),
        ]
    )


def _victoria_outbound() -> dict[str, Any]:
    """Victoria line outbound: the exact reverse of inbound.

    Returns
    -------
    dict
        Route-sequence response for the victoria line, outbound. Used to prove
        inbound/outbound edges collapse to one undirected edge.
    """
    return _sequence(
        [
            _stop(KSX, "King's Cross St. Pancras", 51.5308, -0.1238, ["victoria"], zone="1"),
            _stop(EUS, "Euston", 51.5282, -0.1337, ["victoria"], zone="1"),
            _stop(WST, "Warren Street", 51.5247, -0.1384, ["victoria"], zone="1"),
            _stop(GPK, "Green Park", 51.5067, -0.1428, ["victoria"], zone="1"),
            _stop(VIC, "Victoria", 51.4965, -0.1447, ["victoria"], zone="1"),
        ]
    )


def _northern_inbound() -> dict[str, Any]:
    """Northern line inbound: Warren St -> Euston -> King's Cross.

    Shares the Euston<->King's Cross hop with the victoria line, so a parallel
    edge on a different line must be preserved.

    Returns
    -------
    dict
        Route-sequence response for the northern line, inbound.
    """
    return _sequence(
        [
            # Northern reports Warren Street with no explicit zone -> tests that
            # an earlier non-null zone (from victoria) is retained on merge.
            _stop(WST, "Warren Street", 51.5247, -0.1384, ["northern"]),
            _stop(EUS, "Euston", 51.5282, -0.1337, ["northern"], zone="1"),
            _stop(KSX, "King's Cross St. Pancras", 51.5308, -0.1238, ["northern"], zone="1"),
        ]
    )


def _mock_all_lines(router: respx.Router, *, victoria: bool, northern: bool) -> None:
    """Register respx routes for every tube line and direction.

    Lines other than the ones populated return empty sequences, so the full
    19-line iteration in :func:`build_graph` succeeds without network access.

    Parameters
    ----------
    router : respx.Router
        The active respx router.
    victoria : bool
        When True, the victoria line returns populated inbound/outbound data.
    northern : bool
        When True, the northern line returns populated inbound data.
    """
    for line_id in MODELLED_LINE_IDS:
        for direction in ("inbound", "outbound"):
            url = f"{BASE_URL}/Line/{line_id}/Route/Sequence/{direction}"
            if line_id == "victoria" and victoria:
                body = _victoria_inbound() if direction == "inbound" else _victoria_outbound()
            elif line_id == "northern" and northern and direction == "inbound":
                body = _northern_inbound()
            else:
                body = _empty_sequence()
            router.get(url).mock(return_value=httpx.Response(200, json=body))


@pytest.fixture
def graph() -> TubeGraph:
    """Build a graph from the victoria + northern fixtures with mocked HTTP.

    Returns
    -------
    TubeGraph
        The graph produced by :func:`build_graph` against the fixtures.
    """
    with respx.mock(assert_all_called=False) as router:
        _mock_all_lines(router, victoria=True, northern=True)
        with TflClient(client=httpx.Client()) as client:
            return build_graph(client, generated_at="2026-06-06")


def _station_by_id(g: TubeGraph, station_id: str) -> Any:
    """Return the station with the given id, or fail the test.

    Parameters
    ----------
    g : TubeGraph
        Graph to search.
    station_id : str
        Station id to find.

    Returns
    -------
    Station
        The matching station.
    """
    for station in g.stations:
        if station.id == station_id:
            return station
    raise AssertionError(f"station {station_id!r} not found")


def test_stations_deduped_across_lines(graph: TubeGraph) -> None:
    """Each physical station appears exactly once despite multiple lines."""
    ids = [s.id for s in graph.stations]
    assert len(ids) == len(set(ids)), "station ids must be unique"
    # Five distinct stations across the two fixtures.
    assert set(ids) == {VIC, GPK, WST, EUS, KSX}


def test_station_lines_union(graph: TubeGraph) -> None:
    """A station's lines are the union of every line that reports it."""
    # Euston seen on victoria (inbound + outbound) and northern.
    euston = _station_by_id(graph, EUS)
    assert euston.lines == ["northern", "victoria"]
    # King's Cross reports three lines on the victoria fixture plus northern.
    ksx = _station_by_id(graph, KSX)
    assert ksx.lines == ["northern", "piccadilly", "victoria"]


def test_station_lines_intersected_with_modelled_only(graph: TubeGraph) -> None:
    """Only modelled line ids survive on a station's line list."""
    for station in graph.stations:
        assert set(station.lines) <= set(MODELLED_LINE_IDS)


def test_interchange_detection(graph: TubeGraph) -> None:
    """Interchanges are stations whose line count exceeds one."""
    ksx = _station_by_id(graph, KSX)
    assert len(ksx.lines) > 1


def test_hub_parent_id_not_used_as_station_id(graph: TubeGraph) -> None:
    """A HUB topMostParentId is ignored; the Naptan id is the node id."""
    ids = {s.id for s in graph.stations}
    assert EUS in ids
    assert KSX in ids
    assert "HUBEUS" not in ids
    assert "HUBKGX" not in ids


def _edge_keys(g: TubeGraph) -> set[tuple[str, str, str]]:
    """Return the set of ``(from, to, line)`` edge keys.

    Parameters
    ----------
    g : TubeGraph
        Graph to read.

    Returns
    -------
    set of tuple
        One tuple per edge.
    """
    return {(e.from_, e.to, e.line) for e in g.edges}


def test_edges_undirected_and_deduped(graph: TubeGraph) -> None:
    """Inbound and outbound traversals collapse to one undirected edge."""
    keys = _edge_keys(graph)
    # Victoria has 4 hops over 5 stations; outbound is the reverse -> still 4.
    victoria_edges = {k for k in keys if k[2] == "victoria"}
    assert len(victoria_edges) == 4
    # Each edge is stored with from <= to (canonical orientation).
    for frm, to, _line in keys:
        assert frm <= to
    # No duplicate undirected edge on the same line.
    assert len(keys) == len({(frm, to, line) for frm, to, line in keys})


def test_parallel_edges_on_different_lines_preserved(graph: TubeGraph) -> None:
    """Euston<->King's Cross exists on both victoria and northern."""
    keys = _edge_keys(graph)
    low, high = (EUS, KSX) if EUS <= KSX else (KSX, EUS)
    assert (low, high, "victoria") in keys
    assert (low, high, "northern") in keys


def test_no_self_loops(graph: TubeGraph) -> None:
    """No edge connects a station to itself."""
    for edge in graph.edges:
        assert edge.from_ != edge.to


def test_zone_retained_when_later_seen_null(graph: TubeGraph) -> None:
    """A station's non-null zone survives a later null-zone sighting."""
    # Warren Street has zone '1' from victoria, then null from northern.
    warren = _station_by_id(graph, WST)
    assert warren.zone == "1"


def test_lines_metadata_names_and_colours(graph: TubeGraph) -> None:
    """All 19 modelled lines are present with the hardcoded names and colours."""
    assert len(graph.lines) == len(MODELLED_LINE_IDS)
    by_id = {line.id: line for line in graph.lines}
    assert set(by_id) == set(MODELLED_LINE_IDS)
    for line_id, line in by_id.items():
        assert line.colour == LINE_COLOURS[line_id]
        assert line.name == LINE_NAMES[line_id]
        assert line.colour.startswith("#")
    # Spot-check the two ampersand display names.
    assert by_id["hammersmith-city"].name == "Hammersmith & City"
    assert by_id["waterloo-city"].name == "Waterloo & City"


def test_output_validates_against_schema(graph: TubeGraph) -> None:
    """A round-trip through camelCase JSON re-validates as a TubeGraph."""
    payload = graph.model_dump(by_alias=True)
    # Aliased keys must be present.
    assert payload["generatedAt"] == "2026-06-06"
    assert payload["edges"][0]["from"]
    reparsed = TubeGraph.model_validate(payload)
    assert reparsed.generated_at == "2026-06-06"
    assert len(reparsed.stations) == len(graph.stations)
    assert len(reparsed.edges) == len(graph.edges)


def test_generated_at_is_passed_through() -> None:
    """The build stamps the caller-provided date verbatim (determinism)."""
    with respx.mock(assert_all_called=False) as router:
        _mock_all_lines(router, victoria=True, northern=False)
        with TflClient(client=httpx.Client()) as client:
            g = build_graph(client, generated_at="1999-12-31")
    assert g.generated_at == "1999-12-31"
    assert g.version == "1.0"


def test_write_graph_round_trips(graph: TubeGraph, tmp_path: Any) -> None:
    """write_graph emits valid, alias-keyed JSON that re-parses cleanly."""
    out = tmp_path / "nested" / "graph.json"
    write_graph(graph, str(out))
    assert out.exists()
    text = out.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert '"from"' in text  # alias used, not "from_"
    assert '"generatedAt"' in text
    reparsed = TubeGraph.model_validate_json(text)
    assert {s.id for s in reparsed.stations} == {s.id for s in graph.stations}


# --- Cross-mode interchange merging (DLR/Elizabeth/Overground onto the tube) ---

RAIL_EUS = "910GEUSTON"  # a non-tube (Elizabeth) stop co-located with tube Euston
ELZ_FAR = "910GFAKEFR"  # an Elizabeth-only stop with no tube counterpart


def _elizabeth_inbound() -> dict[str, Any]:
    """Elizabeth line inbound sharing Euston's hub with the tube, then one solo stop.

    The Euston stop carries a distinct Naptan but the same ``HUBEUS`` as the
    tube's Euston, so the two must fuse into one node.

    Returns
    -------
    dict
        Route-sequence response for the elizabeth line, inbound.
    """
    return _sequence(
        [
            _stop(
                RAIL_EUS,
                "Euston",
                51.5282,
                -0.1337,
                ["elizabeth"],
                zone="1",
                top_most_parent_id="HUBEUS",
            ),
            _stop(ELZ_FAR, "Faketon", 51.50, -0.10, ["elizabeth"], zone="2"),
        ]
    )


def _mock_with_elizabeth(router: respx.Router) -> None:
    """Mock all lines empty except a populated victoria + elizabeth pair."""
    for line_id in MODELLED_LINE_IDS:
        for direction in ("inbound", "outbound"):
            url = f"{BASE_URL}/Line/{line_id}/Route/Sequence/{direction}"
            if line_id == "victoria":
                body = _victoria_inbound() if direction == "inbound" else _victoria_outbound()
            elif line_id == "elizabeth" and direction == "inbound":
                body = _elizabeth_inbound()
            else:
                body = _empty_sequence()
            router.get(url).mock(return_value=httpx.Response(200, json=body))


def test_cross_mode_interchange_fuses_into_one_node() -> None:
    """A co-located non-tube stop merges into the tube node via the shared hub."""
    with respx.mock(assert_all_called=False) as router:
        _mock_with_elizabeth(router)
        with TflClient(client=httpx.Client()) as client:
            g = build_graph(client, generated_at="2026-06-06")

    ids = {s.id for s in g.stations}
    # The rail Naptan collapses into the tube Euston; it is not a separate node.
    assert RAIL_EUS not in ids
    assert EUS in ids
    euston = _station_by_id(g, EUS)
    # Euston now carries both the tube line and the Elizabeth line.
    assert "victoria" in euston.lines
    assert "elizabeth" in euston.lines
    # A genuinely solo non-tube stop keeps its own id.
    assert ELZ_FAR in ids


def test_solo_hub_is_not_remapped() -> None:
    """A hub with only one stop (no second mode) leaves the id unchanged."""
    with respx.mock(assert_all_called=False) as router:
        _mock_all_lines(router, victoria=True, northern=True)
        with TflClient(client=httpx.Client()) as client:
            g = build_graph(client, generated_at="2026-06-06")
    ids = {s.id for s in g.stations}
    # KSX has HUBKGX but no co-located second-mode stop in this fixture.
    assert KSX in ids
    assert "HUBKGX" not in ids
