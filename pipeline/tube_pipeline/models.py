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
