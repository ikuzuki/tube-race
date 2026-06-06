"""Command-line entry point for the Tube Race pipeline.

Usage
-----
``python -m tube_pipeline.cli build --out web/public/data/graph.json``
``python -m tube_pipeline.cli enrich --graph web/public/data/graph.json \\
    --out web/public/data/stations-info.json``

The ``build`` command fetches live TfL route sequences and writes the
``graph.json`` artefact. The ``enrich`` command reads that graph and writes a
companion ``stations-info.json`` of per-station trivia from Wikidata and
Wikipedia. The build date stamped into each artefact defaults to today (UTC),
so the CLI is the source of non-determinism that the underlying build/enrich
functions deliberately avoid.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date

import httpx

from tube_pipeline.build_graph import build_graph, write_graph
from tube_pipeline.enrich import (
    StationUsageClient,
    WikidataClient,
    WikipediaClient,
    enrich_stations,
    load_graph_stations,
    write_station_info,
)
from tube_pipeline.tfl_client import TflClient

DEFAULT_OUT_PATH: str = "web/public/data/graph.json"
"""Default destination for the generated graph artefact."""

DEFAULT_GRAPH_PATH: str = "web/public/data/graph.json"
"""Default location of the input graph for ``enrich``."""

DEFAULT_INFO_OUT_PATH: str = "web/public/data/stations-info.json"
"""Default destination for the generated station-info artefact."""


def _build_command(args: argparse.Namespace) -> int:
    """Run the ``build`` subcommand: fetch live data and write the graph.

    Parameters
    ----------
    args : argparse.Namespace
        Parsed arguments. Uses ``args.out`` for the output path.

    Returns
    -------
    int
        Process exit code (``0`` on success).
    """
    generated_at = date.today().isoformat()
    with TflClient() as client:
        graph = build_graph(client, generated_at=generated_at)
    write_graph(graph, args.out)
    print(
        f"Wrote {args.out}: "
        f"{len(graph.stations)} stations, "
        f"{len(graph.edges)} edges, "
        f"{len(graph.lines)} lines (generatedAt={graph.generated_at})."
    )
    return 0


def _enrich_command(args: argparse.Namespace) -> int:
    """Run the ``enrich`` subcommand: read the graph and write station info.

    Reads station ids/coordinates from ``args.graph``, fetches Wikidata
    candidates, Wikipedia summaries and TfL station-usage figures, and writes the
    enriched ``stations-info.json`` to ``args.out``. If the TfL usage download
    fails the existing artefact is left untouched and a non-zero code returned.

    Parameters
    ----------
    args : argparse.Namespace
        Parsed arguments. Uses ``args.graph`` and ``args.out``.

    Returns
    -------
    int
        Process exit code (``0`` on success, ``1`` if a source fetch failed).
    """
    generated_at = date.today().isoformat()
    graph_stations = load_graph_stations(args.graph)
    try:
        with (
            WikidataClient() as wikidata,
            WikipediaClient() as wikipedia,
            StationUsageClient() as usage_client,
        ):
            info_file = enrich_stations(
                graph_stations,
                wikidata=wikidata,
                wikipedia=wikipedia,
                generated_at=generated_at,
                usage_client=usage_client,
            )
    except (httpx.HTTPError, ValueError) as exc:
        # Fail loud and leave the prior artefact intact rather than writing a
        # version with a source (Wikidata, Wikipedia or TfL usage) silently
        # dropped.
        print(
            f"Enrichment aborted: could not fetch/parse a data source: {exc}. "
            f"Left {args.out} unchanged.",
            file=sys.stderr,
        )
        return 1
    write_station_info(info_file, args.out)
    print(
        f"Wrote {args.out}: "
        f"{info_file.counts.total} stations, "
        f"{info_file.counts.with_opened} with openedYear, "
        f"{info_file.counts.with_traffic} with dailyTraffic "
        f"(generatedAt={info_file.generated_at})."
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Construct the argument parser for the CLI.

    Returns
    -------
    argparse.ArgumentParser
        Parser exposing the ``build`` and ``enrich`` subcommands.
    """
    parser = argparse.ArgumentParser(
        prog="tube_pipeline.cli",
        description="Build the Tube Race graph.json from TfL Open Data.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser(
        "build",
        help="Fetch live TfL data and write graph.json.",
    )
    build.add_argument(
        "--out",
        default=DEFAULT_OUT_PATH,
        help=f"Output path for graph.json (default: {DEFAULT_OUT_PATH}).",
    )
    build.set_defaults(func=_build_command)

    enrich = subparsers.add_parser(
        "enrich",
        help="Read graph.json and write stations-info.json from Wikidata/Wikipedia.",
    )
    enrich.add_argument(
        "--graph",
        default=DEFAULT_GRAPH_PATH,
        help=f"Input graph.json path (default: {DEFAULT_GRAPH_PATH}).",
    )
    enrich.add_argument(
        "--out",
        default=DEFAULT_INFO_OUT_PATH,
        help=f"Output path for stations-info.json (default: {DEFAULT_INFO_OUT_PATH}).",
    )
    enrich.set_defaults(func=_enrich_command)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Parse arguments and dispatch to the selected subcommand.

    Parameters
    ----------
    argv : list of str or None, optional
        Argument vector to parse. Defaults to ``sys.argv[1:]`` when ``None``.

    Returns
    -------
    int
        Process exit code from the dispatched subcommand.
    """
    parser = build_parser()
    args = parser.parse_args(argv)
    exit_code: int = args.func(args)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
