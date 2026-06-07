"""Tests for the curated stat overrides and the apply_curated_stats merge."""

from __future__ import annotations

from tube_pipeline.curated_stats import (
    CURATED_DAILY_TRAFFIC,
    CURATED_OPENED_YEARS,
    CURATED_WIKI_URLS,
    CURATED_YEAR_CORRECTIONS,
)
from tube_pipeline.enrich import apply_curated_stats
from tube_pipeline.models import StationInfo, StationInfoCounts, StationInfoFile


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


# --------------------------------------------------------------------------- #
# Override data sanity                                                         #
# --------------------------------------------------------------------------- #


def test_curated_opened_years_are_plausible() -> None:
    """Every curated opening year sits in the plausible railway era."""
    for name, year in CURATED_OPENED_YEARS.items():
        assert 1800 <= year <= 2100, f"{name}: implausible year {year}"


def test_curated_daily_traffic_is_positive() -> None:
    """Every curated traffic figure is a positive integer."""
    for name, traffic in CURATED_DAILY_TRAFFIC.items():
        assert isinstance(traffic, int) and traffic > 0, f"{name}: bad traffic {traffic}"


# --------------------------------------------------------------------------- #
# apply_curated_stats: fill-only merge with full rank recompute                #
# --------------------------------------------------------------------------- #


def test_apply_curated_stats_fills_gaps_and_reranks() -> None:
    """Missing values are filled from the overrides and both ranks recomputed."""
    # Kentish Town: missing both. Its traffic is filled from the override; it has
    # no opening-year override (a tube station the source normally covers).
    kentish = StationInfo.model_validate({"name": "Kentish Town Underground Station"})
    oval = StationInfo.model_validate(
        {
            "name": "Oval Underground Station",
            "openedYear": 1890,
            "openedRank": 1,  # stale: was ranked among the old, smaller pool
            "dailyTraffic": 15_386,
            "dailyTrafficRank": 1,
        }
    )
    merged = apply_curated_stats(_info_file({"kt": kentish, "oval": oval}))

    kt = merged.stations["kt"]
    assert kt.daily_traffic == CURATED_DAILY_TRAFFIC["Kentish Town"]
    assert kt.opened_year is None  # no year override for this one
    # Traffic ranks recomputed over the pool: Kentish Town (16k) is busier than
    # Oval (15.4k). Only Oval has an opening year, so it alone gets an opened rank.
    assert kt.daily_traffic_rank == 1
    assert merged.stations["oval"].daily_traffic_rank == 2
    assert merged.stations["oval"].opened_rank == 1
    assert kt.opened_rank is None
    # Counts reflect the post-fill coverage.
    assert merged.counts.with_opened == 1
    assert merged.counts.with_traffic == 2


def test_apply_curated_stats_never_overwrites_source_values() -> None:
    """A value already resolved from an automated source wins over the override."""
    kentish = StationInfo.model_validate(
        {
            "name": "Kentish Town Underground Station",
            "openedYear": 1907,
            "dailyTraffic": 12_345,  # pretend the source had a figure
        }
    )
    merged = apply_curated_stats(_info_file({"kt": kentish}))
    out = merged.stations["kt"]
    assert out.opened_year == 1907
    assert out.daily_traffic == 12_345


def test_apply_curated_stats_corrects_known_bad_years() -> None:
    """A year correction overrides even a present (wrong) source value."""
    poplar = StationInfo.model_validate(
        {"name": "Poplar DLR Station", "openedYear": 2022}  # bad Wikidata claim
    )
    merged = apply_curated_stats(_info_file({"p": poplar}))
    assert merged.stations["p"].opened_year == CURATED_YEAR_CORRECTIONS["Poplar"]


def test_apply_curated_stats_leaves_unknown_stations_alone() -> None:
    """A station with no override keeps its gaps (and gets no rank)."""
    mystery = StationInfo.model_validate({"name": "Nowhere Underground Station"})
    merged = apply_curated_stats(_info_file({"x": mystery}))
    out = merged.stations["x"]
    assert out.opened_year is None
    assert out.daily_traffic is None
    assert out.opened_rank is None
    assert out.daily_traffic_rank is None
    assert merged.counts.with_opened == 0


def test_apply_curated_stats_preserves_other_fields() -> None:
    """funFact, wikiUrl, name and file-level metadata pass through unchanged."""
    info = StationInfo.model_validate(
        {
            "name": "Wapping Rail Station",
            "funFact": "The station sits at the end of the Thames Tunnel.",
            "wikiUrl": "https://en.wikipedia.org/wiki/Wapping_station",
        }
    )
    merged = apply_curated_stats(_info_file({"w": info}))
    out = merged.stations["w"]
    assert out.fun_fact == "The station sits at the end of the Thames Tunnel."
    assert out.wiki_url == "https://en.wikipedia.org/wiki/Wapping_station"
    assert out.name == "Wapping Rail Station"
    assert out.opened_year == CURATED_OPENED_YEARS["Wapping"]
    assert merged.version == "1.0"
    assert merged.generated_at == "2026-06-06"


def test_apply_curated_stats_fills_missing_wiki_url() -> None:
    """A station with no wikiUrl gets one from the override; a present one wins."""
    missing = StationInfo.model_validate({"name": "Brockley Rail Station"})
    present = StationInfo.model_validate(
        {"name": "Homerton Rail Station", "wikiUrl": "https://example.com/already"}
    )
    merged = apply_curated_stats(_info_file({"b": missing, "h": present}))
    assert merged.stations["b"].wiki_url == CURATED_WIKI_URLS["Brockley"]
    assert merged.stations["h"].wiki_url == "https://example.com/already"
