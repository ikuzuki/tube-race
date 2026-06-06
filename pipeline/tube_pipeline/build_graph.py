"""Build the Tube Race ``graph.json`` artefact from TfL route sequences.

The flow is: for every tube line, fetch both directions of its route sequence,
walk each ordered ``stopPoint`` list to derive undirected edges, and merge the
stop points into station nodes keyed by their station-level Naptan id. Line
display names and colours are hardcoded (the colour endpoint is flaky and the
set is fixed at 11 lines).

See ``SPEC.md`` ("Data contract: graph.json", "TfL data source") for the rules
this module enforces -- in particular undirected, de-duplicated edges that
nonetheless preserve parallel edges on different lines.

A note on station identity
--------------------------
For tube stops, ``stopPoint.id`` is already the station-level Naptan (e.g.
``940GZZLUVIC``) and is consistent across lines, so it is used as the station
id and the merge key. ``topMostParentId`` is only preferred when it is present
and is *not* a multi-modal hub id (``HUB...``); in live TfL data every tube
``topMostParentId`` is a ``HUB...`` id, so in practice ``id`` is always used.
This keeps station ids aligned with the data contract's ``940GZZLU...`` Naptans
rather than collapsing tube stations into mainline hubs.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any

from tube_pipeline.models import Edge, Line, Station, TubeGraph
from tube_pipeline.tfl_client import TUBE_LINE_IDS, TflClient

DIRECTIONS: tuple[str, ...] = ("inbound", "outbound")
"""The two directions fetched per line; their edges are collapsed together."""

# Official TfL line colours (hex, including the leading '#').
LINE_COLOURS: dict[str, str] = {
    "bakerloo": "#B36305",
    "central": "#E32017",
    "circle": "#FFD300",
    "district": "#00782A",
    "hammersmith-city": "#F3A9BB",
    "jubilee": "#A0A5A9",
    "metropolitan": "#9B0056",
    "northern": "#000000",
    "piccadilly": "#003688",
    "victoria": "#0098D4",
    "waterloo-city": "#95CDBA",
}

# Display names for the 11 tube lines.
LINE_NAMES: dict[str, str] = {
    "bakerloo": "Bakerloo",
    "central": "Central",
    "circle": "Circle",
    "district": "District",
    "hammersmith-city": "Hammersmith & City",
    "jubilee": "Jubilee",
    "metropolitan": "Metropolitan",
    "northern": "Northern",
    "piccadilly": "Piccadilly",
    "victoria": "Victoria",
    "waterloo-city": "Waterloo & City",
}

_TUBE_LINE_SET: frozenset[str] = frozenset(TUBE_LINE_IDS)


def _station_id(stop_point: dict[str, Any]) -> str:
    """Resolve the merged station id for a stop point.

    Uses ``stopPoint.id`` (the station-level Naptan for tube). A
    ``topMostParentId`` is preferred only when present and not a multi-modal
    hub id (``HUB...``); in live tube data this branch is never taken.

    Parameters
    ----------
    stop_point : dict
        A single ``stopPoint`` entry from a route sequence.

    Returns
    -------
    str
        The station id to use as the merge key and node id.
    """
    own_id = str(stop_point["id"])
    parent = stop_point.get("topMostParentId")
    if isinstance(parent, str) and parent and parent != own_id and not parent.startswith("HUB"):
        return parent
    return own_id


def _stop_line_ids(stop_point: dict[str, Any]) -> set[str]:
    """Extract the tube line ids a stop point serves.

    Reads the stop point's ``lines`` array and intersects the reported line
    ids with the 11 modelled tube lines.

    Parameters
    ----------
    stop_point : dict
        A single ``stopPoint`` entry from a route sequence.

    Returns
    -------
    set of str
        Tube line ids serving this stop point (possibly empty).
    """
    reported = {
        str(line["id"])
        for line in stop_point.get("lines", [])
        if isinstance(line, dict) and "id" in line
    }
    return reported & _TUBE_LINE_SET


def _zone_of(stop_point: dict[str, Any]) -> str | None:
    """Best-effort fare zone for a stop point.

    Parameters
    ----------
    stop_point : dict
        A single ``stopPoint`` entry from a route sequence.

    Returns
    -------
    str or None
        The zone string (e.g. ``"1"`` or ``"2/3"``) if present and non-empty,
        otherwise ``None``. Never raises -- zone is non-blocking.
    """
    zone = stop_point.get("zone")
    if isinstance(zone, str) and zone.strip():
        return zone.strip()
    for prop in stop_point.get("additionalProperties", []):
        if isinstance(prop, dict) and prop.get("key") == "Zone":
            value = prop.get("value")
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _iter_stop_pairs(
    sequence_response: dict[str, Any],
) -> Iterator[tuple[dict[str, Any], dict[str, Any]]]:
    """Yield consecutive stop-point pairs from a route-sequence response.

    Walks every ``stopPointSequences[].stopPoint[]`` list and yields each
    adjacent ``(a, b)`` pair, which represents one edge on the line.

    Parameters
    ----------
    sequence_response : dict
        A decoded ``/Line/{id}/Route/Sequence/{direction}`` response.

    Yields
    ------
    tuple of (dict, dict)
        Consecutive stop-point pairs in route order.
    """
    for seq in sequence_response.get("stopPointSequences", []):
        stop_points = seq.get("stopPoint", [])
        yield from zip(stop_points, stop_points[1:], strict=False)


class _GraphAccumulator:
    """Mutable accumulator that merges stop points into a graph.

    Collects stations (deduped/unioned by id) and undirected edges (deduped by
    ``(min(a, b), max(a, b), line)`` so inbound/outbound collapse but parallel
    edges on different lines are preserved).
    """

    def __init__(self) -> None:
        self._stations: dict[str, Station] = {}
        self._edges: dict[tuple[str, str, str], Edge] = {}

    def add_stop_point(self, stop_point: dict[str, Any], line_id: str) -> str:
        """Merge a stop point into the station set and return its id.

        Parameters
        ----------
        stop_point : dict
            A single ``stopPoint`` entry from a route sequence.
        line_id : str
            The line currently being processed; always added to the station's
            line set (the stop appeared on this line's route).

        Returns
        -------
        str
            The merged station id for this stop point.
        """
        station_id = _station_id(stop_point)
        lines = _stop_line_ids(stop_point)
        lines.add(line_id)

        existing = self._stations.get(station_id)
        if existing is None:
            name = stop_point.get("name") or stop_point.get("commonName") or station_id
            self._stations[station_id] = Station(
                id=station_id,
                name=str(name),
                lat=float(stop_point["lat"]),
                lon=float(stop_point["lon"]),
                lines=sorted(lines),
                zone=_zone_of(stop_point),
            )
        else:
            merged = set(existing.lines) | lines
            existing.lines = sorted(merged)
            if existing.zone is None:
                existing.zone = _zone_of(stop_point)
        return station_id

    def add_edge(self, station_a: str, station_b: str, line_id: str) -> None:
        """Record an undirected edge between two stations on a line.

        Self-loops (``station_a == station_b``) are ignored. The dedup key is
        order-independent in the station pair but keeps the line distinct, so
        parallel edges on different lines both survive.

        Parameters
        ----------
        station_a, station_b : str
            The merged station ids at each end of the edge.
        line_id : str
            The line the adjacency belongs to.
        """
        if station_a == station_b:
            return
        low, high = (station_a, station_b) if station_a <= station_b else (station_b, station_a)
        key = (low, high, line_id)
        if key not in self._edges:
            # Construct via the alias keys ("from") so the model's reserved-word
            # field is populated without relying on alias-named kwargs.
            self._edges[key] = Edge.model_validate({"from": low, "to": high, "line": line_id})

    def stations(self) -> list[Station]:
        """Return stations sorted by id for deterministic output.

        Returns
        -------
        list of Station
            All merged stations, ordered by id.
        """
        return [self._stations[k] for k in sorted(self._stations)]

    def edges(self) -> list[Edge]:
        """Return edges sorted for deterministic output.

        Returns
        -------
        list of Edge
            All undirected edges, ordered by ``(from, to, line)``.
        """
        return [self._edges[k] for k in sorted(self._edges)]


def _ingest_line(acc: _GraphAccumulator, line_id: str, sequence_response: dict[str, Any]) -> None:
    """Fold one direction's route sequence into the accumulator.

    Parameters
    ----------
    acc : _GraphAccumulator
        The accumulator to update in place.
    line_id : str
        The line the response belongs to.
    sequence_response : dict
        A decoded route-sequence response for ``line_id``.
    """
    for first, second in _iter_stop_pairs(sequence_response):
        id_a = acc.add_stop_point(first, line_id)
        id_b = acc.add_stop_point(second, line_id)
        acc.add_edge(id_a, id_b, line_id)


def _build_lines(line_ids: Iterable[str]) -> list[Line]:
    """Build the line metadata list from hardcoded names and colours.

    Parameters
    ----------
    line_ids : iterable of str
        The tube line ids to include, in the desired output order.

    Returns
    -------
    list of Line
        One :class:`~tube_pipeline.models.Line` per id.
    """
    return [
        Line(id=line_id, name=LINE_NAMES[line_id], colour=LINE_COLOURS[line_id])
        for line_id in line_ids
    ]


def build_graph(client: TflClient, generated_at: str) -> TubeGraph:
    """Build the full tube graph by fetching every line in both directions.

    Parameters
    ----------
    client : TflClient
        Client used to fetch route sequences from TfL.
    generated_at : str
        Build date as an ISO ``YYYY-MM-DD`` string, written verbatim to the
        artefact's ``generatedAt`` field. Passed in (not derived) so builds are
        deterministic and testable.

    Returns
    -------
    TubeGraph
        The merged graph: 11 lines, deduped stations, and undirected,
        line-distinct edges.
    """
    acc = _GraphAccumulator()
    for line_id in TUBE_LINE_IDS:
        for direction in DIRECTIONS:
            response = client.route_sequence(line_id, direction)
            _ingest_line(acc, line_id, response)

    # Build via model_validate so the aliased ``generatedAt`` field is set
    # without relying on alias-named kwargs (keeps the type checker happy).
    return TubeGraph.model_validate(
        {
            "version": "1.0",
            "generatedAt": generated_at,
            "lines": _build_lines(TUBE_LINE_IDS),
            "stations": acc.stations(),
            "edges": acc.edges(),
        }
    )


def write_graph(graph: TubeGraph, out_path: str) -> None:
    """Serialise a graph to JSON on disk.

    Writes camelCase keys (and ``from`` for edges) via ``by_alias=True``,
    pretty-printed with two-space indentation and a trailing newline, UTF-8
    encoded. Parent directories are created if missing.

    Parameters
    ----------
    graph : TubeGraph
        The graph to serialise.
    out_path : str
        Destination file path. Parent directories are created as needed.
    """
    import json
    from pathlib import Path

    destination = Path(out_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = graph.model_dump(by_alias=True)
    destination.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
