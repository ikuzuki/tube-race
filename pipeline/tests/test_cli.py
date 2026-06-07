"""Tests for the CLI entry point. HTTP is mocked; the network is never hit."""

from __future__ import annotations

from pathlib import Path

import httpx
import respx

from tube_pipeline.cli import DEFAULT_OUT_PATH, build_parser, main
from tube_pipeline.models import TubeGraph
from tube_pipeline.tfl_client import BASE_URL, MODELLED_LINE_IDS


def _mock_empty_network(router: respx.Router) -> None:
    """Mock every line/direction with an empty sequence response.

    Parameters
    ----------
    router : respx.Router
        The active respx router.
    """
    for line_id in MODELLED_LINE_IDS:
        for direction in ("inbound", "outbound"):
            router.get(f"{BASE_URL}/Line/{line_id}/Route/Sequence/{direction}").mock(
                return_value=httpx.Response(200, json={"stopPointSequences": []})
            )


def test_default_out_path_matches_spec() -> None:
    """The default output path is the contract location for graph.json."""
    assert DEFAULT_OUT_PATH == "web/public/data/graph.json"


def test_parser_requires_a_subcommand() -> None:
    """Invoking with no subcommand exits non-zero (required subparser)."""
    parser = build_parser()
    try:
        parser.parse_args([])
    except SystemExit as exc:
        assert exc.code != 0
    else:  # pragma: no cover - defensive
        raise AssertionError("expected SystemExit for missing subcommand")


def test_build_writes_file_and_returns_zero(tmp_path: Path) -> None:
    """`build --out` writes a schema-valid graph and returns exit code 0."""
    out = tmp_path / "graph.json"
    with respx.mock(assert_all_called=False) as router:
        _mock_empty_network(router)
        code = main(["build", "--out", str(out)])
    assert code == 0
    assert out.exists()
    graph = TubeGraph.model_validate_json(out.read_text(encoding="utf-8"))
    # Empty network -> 19 lines, no stations, no edges.
    assert len(graph.lines) == len(MODELLED_LINE_IDS)
    assert graph.stations == []
    assert graph.edges == []
