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
import os
import sys
from datetime import date

import httpx

from tube_pipeline.build_graph import build_graph, write_graph
from tube_pipeline.enrich import (
    AnthropicClient,
    StationUsageClient,
    WikidataClient,
    WikipediaClient,
    apply_curated_stats,
    enrich_stations,
    is_generic_definition,
    load_graph_stations,
    load_station_info_file,
    refresh_fun_facts,
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


def _refresh_facts_command(args: argparse.Namespace) -> int:
    """Run the ``refresh-facts`` subcommand: redo only the ``funFact`` field.

    Loads the existing ``stations-info.json``, re-derives one punchy, sourced,
    spoiler-free fun fact per station from Wikipedia (via the Anthropic API when
    ``ANTHROPIC_API_KEY`` is set, otherwise a heuristic), and writes the artefact
    back with every other field preserved. On a Wikipedia/parse failure the prior
    artefact is left untouched and a non-zero code returned.

    Parameters
    ----------
    args : argparse.Namespace
        Parsed arguments. Uses ``args.info`` (input) and ``args.out`` (output).

    Returns
    -------
    int
        Process exit code (``0`` on success, ``1`` on a fetch/parse failure).
    """
    info_file = load_station_info_file(args.info)
    api_key = os.environ.get("ANTHROPIC_API_KEY") or None
    method = "AI (claude-haiku) + heuristic fallback" if api_key else "heuristic only"
    print(f"Refreshing fun facts for {len(info_file.stations)} stations [{method}].")
    try:
        with WikipediaClient() as wikipedia:
            ai_client = AnthropicClient(api_key) if api_key else None
            try:
                refreshed = refresh_fun_facts(info_file, wikipedia, ai_client=ai_client)
            finally:
                if ai_client is not None:
                    ai_client.close()
    except (httpx.HTTPError, ValueError) as exc:
        print(
            f"Fun-fact refresh aborted: could not fetch/parse Wikipedia: {exc}. "
            f"Left {args.out} unchanged.",
            file=sys.stderr,
        )
        return 1
    write_station_info(refreshed, args.out)
    generic = sum(
        1
        for info in refreshed.stations.values()
        if info.fun_fact is None or is_generic_definition(info.fun_fact)
    )
    total = len(refreshed.stations)
    print(
        f"Wrote {args.out}: refreshed funFact for {total} stations "
        f"({total - generic} non-generic, {generic} still-generic/missing)."
    )
    return 0


def _apply_stats_command(args: argparse.Namespace) -> int:
    """Run the ``apply-stats`` subcommand: fill stat gaps and recompute ranks.

    Loads the existing ``stations-info.json``, fills missing ``openedYear`` /
    ``dailyTraffic`` values from the curated overrides (``curated_stats``),
    recomputes both ranks over the full coverage, and writes the artefact back.
    Pure merge -- no network access.

    Parameters
    ----------
    args : argparse.Namespace
        Parsed arguments. Uses ``args.info`` (input) and ``args.out`` (output).

    Returns
    -------
    int
        Process exit code (``0`` on success).
    """
    info_file = load_station_info_file(args.info)
    before_opened = info_file.counts.with_opened
    before_traffic = info_file.counts.with_traffic
    merged = apply_curated_stats(info_file)
    write_station_info(merged, args.out)
    print(
        f"Wrote {args.out}: "
        f"{merged.counts.total} stations, "
        f"openedYear {before_opened} -> {merged.counts.with_opened}, "
        f"dailyTraffic {before_traffic} -> {merged.counts.with_traffic} "
        f"(ranks recomputed)."
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Construct the argument parser for the CLI.

    Returns
    -------
    argparse.ArgumentParser
        Parser exposing the ``build``, ``enrich`` and ``refresh-facts``
        subcommands.
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

    refresh = subparsers.add_parser(
        "refresh-facts",
        help="Redo only the funFact field in stations-info.json from Wikipedia (+optional AI).",
    )
    refresh.add_argument(
        "--info",
        default=DEFAULT_INFO_OUT_PATH,
        help=f"Input stations-info.json path (default: {DEFAULT_INFO_OUT_PATH}).",
    )
    refresh.add_argument(
        "--out",
        default=DEFAULT_INFO_OUT_PATH,
        help=f"Output path for stations-info.json (default: {DEFAULT_INFO_OUT_PATH}).",
    )
    refresh.set_defaults(func=_refresh_facts_command)

    apply_stats = subparsers.add_parser(
        "apply-stats",
        help="Fill missing openedYear/dailyTraffic from curated overrides and recompute ranks.",
    )
    apply_stats.add_argument(
        "--info",
        default=DEFAULT_INFO_OUT_PATH,
        help=f"Input stations-info.json path (default: {DEFAULT_INFO_OUT_PATH}).",
    )
    apply_stats.add_argument(
        "--out",
        default=DEFAULT_INFO_OUT_PATH,
        help=f"Output path for stations-info.json (default: {DEFAULT_INFO_OUT_PATH}).",
    )
    apply_stats.set_defaults(func=_apply_stats_command)
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
