"""Command-line entry point for the Tube Race pipeline.

Usage
-----
``python -m tube_pipeline.cli build --out web/public/data/graph.json``

The ``build`` command fetches live TfL route sequences and writes the
``graph.json`` artefact. The build date stamped into the artefact defaults to
today (UTC), so the CLI is the source of non-determinism that
:func:`tube_pipeline.build_graph.build_graph` deliberately avoids.
"""

from __future__ import annotations

import argparse
from datetime import date

from tube_pipeline.build_graph import build_graph, write_graph
from tube_pipeline.tfl_client import TflClient

DEFAULT_OUT_PATH: str = "web/public/data/graph.json"
"""Default destination for the generated graph artefact."""


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


def build_parser() -> argparse.ArgumentParser:
    """Construct the argument parser for the CLI.

    Returns
    -------
    argparse.ArgumentParser
        Parser exposing the ``build`` subcommand.
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
