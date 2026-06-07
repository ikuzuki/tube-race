"""Invariants for the hand/AI-curated fun-fact set."""

from __future__ import annotations

from tube_pipeline.curated_facts import CURATED_FACTS


def test_facts_are_present_and_sane() -> None:
    """Every fact is a non-trivial single sentence."""
    assert len(CURATED_FACTS) > 400
    for name, fact in CURATED_FACTS.items():
        assert fact.strip(), f"{name} has an empty fact"
        assert len(fact) >= 20, f"{name} fact is too short: {fact!r}"
        # Starts cleanly: a capital letter, or a leading quote/number.
        assert fact[0].isupper() or fact[0] in "'\"0123456789", (
            f"{name} fact should start cleanly: {fact!r}"
        )


def test_no_dashes_or_html_entities() -> None:
    """Display text must avoid em/en dashes and unescaped HTML entities."""
    for name, fact in CURATED_FACTS.items():
        assert "—" not in fact, f"{name} contains an em dash"
        assert "–" not in fact, f"{name} contains an en dash"
        assert "&amp;" not in fact, f"{name} contains an HTML entity"
        assert "&lt;" not in fact and "&gt;" not in fact, f"{name} contains an HTML entity"
