"""Pydantic models defining the Tube Race graph artefact.

These models are the schema of ``web/public/data/graph.json`` and the contract
shared between this pipeline and the TypeScript engine. Keep them in sync with
``web/src/engine/types.ts``.

JSON uses camelCase keys (``generatedAt``) and the reserved word ``from`` for
edges. Fields are snake_case in Python with aliases, so always serialise with
``model_dump(by_alias=True)``.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Line(BaseModel):
    """A tube line."""

    id: str = Field(..., description="TfL line id, e.g. 'victoria'.")
    name: str = Field(..., description="Display name, e.g. 'Victoria'.")
    colour: str = Field(..., description="Hex colour including the leading '#'.")


class Station(BaseModel):
    """A merged station node (one per physical station, not per platform)."""

    id: str = Field(..., description="Merged station identity (parent Naptan code).")
    name: str = Field(..., description="Display name, e.g. 'Victoria'.")
    lat: float = Field(..., description="WGS84 latitude in decimal degrees.")
    lon: float = Field(..., description="WGS84 longitude in decimal degrees.")
    lines: list[str] = Field(..., description="Ids of every line serving the station.")
    zone: str | None = Field(default=None, description="Fare zone, e.g. '1' or '2/3'.")


class Edge(BaseModel):
    """An undirected adjacency between two stations on a single line."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(..., alias="from", description="Source station id.")
    to: str = Field(..., description="Destination station id.")
    line: str = Field(..., description="Line id this adjacency belongs to.")


class TubeGraph(BaseModel):
    """The full graph artefact serialised to ``graph.json``."""

    model_config = ConfigDict(populate_by_name=True)

    version: str = Field(default="1.0", description="Schema version.")
    generated_at: str = Field(..., alias="generatedAt", description="ISO date of build.")
    lines: list[Line]
    stations: list[Station]
    edges: list[Edge]


class StationInfo(BaseModel):
    """Best-effort trivia/stats for one station, shown on the game cards.

    Every field except ``name`` is optional: only the facts that could be
    resolved from open data are present. Serialise with
    ``model_dump(by_alias=True, exclude_none=True)`` so absent fields are
    omitted rather than emitted as ``null``.
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., description="Display name, e.g. 'Victoria'.")
    opened_year: int | None = Field(
        default=None, alias="openedYear", description="Year the station opened."
    )
    opened_rank: int | None = Field(
        default=None, alias="openedRank", description="1 = oldest on the network."
    )
    daily_traffic: int | None = Field(
        default=None, alias="dailyTraffic", description="Approx. daily entries + exits."
    )
    daily_traffic_rank: int | None = Field(
        default=None, alias="dailyTrafficRank", description="1 = busiest on the network."
    )
    fun_fact: str | None = Field(
        default=None, alias="funFact", description="One punchy, sourced sentence."
    )
    wiki_url: str | None = Field(
        default=None, alias="wikiUrl", description="Link to the Wikipedia article."
    )


class StationInfoCounts(BaseModel):
    """Headline coverage counts for the station-info artefact."""

    total: int = Field(..., description="Total stations in the graph.")
    with_opened: int = Field(
        ..., alias="withOpened", description="Stations with a known opening year."
    )
    with_traffic: int = Field(
        ..., alias="withTraffic", description="Stations with an estimated daily traffic."
    )


class StationInfoFile(BaseModel):
    """The full station-info artefact serialised to ``stations-info.json``.

    Keyed by the same station ids as ``graph.json``.
    """

    model_config = ConfigDict(populate_by_name=True)

    version: str = Field(default="1.0", description="Schema version.")
    generated_at: str = Field(..., alias="generatedAt", description="ISO date of build.")
    counts: StationInfoCounts
    stations: dict[str, StationInfo] = Field(
        ..., description="Station info keyed by graph station id."
    )
