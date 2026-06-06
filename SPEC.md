# Tube Race build spec

Single source of truth for the game. The three build streams (pipeline, engine,
UI) all code against the contracts defined here. If something is ambiguous,
this file wins.

## The game

A daily fog-of-war navigation puzzle on the London Underground.

- You start at a START station and must reach a TARGET station.
- Fog of war: only your current station and the stations one hop away (adjacent
  on any line) are visible. Anything you have ever revealed STAYS revealed, so
  you build up a map as you explore.
- You move by selecting a visible adjacent station. Each selection is one hop.
- A compass shows the straight-line bearing and distance in km to the target, so
  play is skilful rather than blind. The compass does NOT reveal the network, only
  geography (you know roughly where the target is, not how the lines connect).
- Goal: reach the target in as few hops and line changes as possible.
- On arrival you are scored against the optimal route computed by Dijkstra, e.g.
  "9 stops, 2 changes (optimal: 7 stops, 1 change)".
- One puzzle per day, identical for everyone (seeded by the date). Shareable as a
  spoiler-free emoji grid.

Two modes. The engine must support both; the UI ships Navigate first.
- Navigate (default): target known, map fogged. This is the MVP.
- Hunt (later): target hidden, you name stations and get distance metrics back.

## Architecture

Fully static. No server, no LLM, no per-play cost.

- `pipeline/` (Python) fetches TfL Open Data and writes
  `web/public/data/graph.json`. Runs occasionally on a dev machine, never at
  runtime.
- `web/` (React + TypeScript + Vite) loads `graph.json` and runs the entire game
  client-side: Dijkstra, daily seed, scoring, fog.
- Deploy target: a static host (Cloudflare Pages / GitHub Pages).

## Data contract: graph.json

Path: `web/public/data/graph.json`, fetched at runtime from `/data/graph.json`.

```json
{
  "version": "1.0",
  "generatedAt": "2026-06-06",
  "lines": [
    { "id": "victoria", "name": "Victoria", "colour": "#0098D4" }
  ],
  "stations": [
    {
      "id": "940GZZLUVIC",
      "name": "Victoria",
      "lat": 51.4965,
      "lon": -0.1447,
      "lines": ["victoria", "district", "circle"],
      "zone": "1"
    }
  ],
  "edges": [
    { "from": "940GZZLUVIC", "to": "940GZZLUGPK", "line": "victoria" }
  ]
}
```

Rules:

- `station.id` is the MERGED station identity (TfL parent / hub Naptan), never a
  per-platform StopPoint id. Victoria-on-Victoria and Victoria-on-District are
  ONE node.
- `station.lines` lists every line id serving the station. This drives
  interchanges: an interchange is any station whose `lines` length is > 1.
- `edges` are undirected. `{from, to, line}` means you can travel between the two
  stations on that line, both ways. Store each adjacency once; the engine makes it
  bidirectional. There can be parallel edges between the same pair on different
  lines.
- `lat`/`lon` are WGS84 decimal degrees, used for rendering and the compass.
- `zone` is optional (string; may be "1", "2", or boundary like "2/3").

## Engine API contract

`web/src/engine/types.ts` is authoritative for types (provided in the scaffold).
The engine is pure TypeScript: no React, no DOM. Fully unit-tested with Vitest,
tests colocated as `*.test.ts`. Determinism is mandatory: no `Date.now()` or
`Math.random()` inside the engine. The date is always passed in as a parameter;
any randomness is seeded from a hash of the date string (use a small PRNG such as
mulberry32).

Modules and the functions to implement:

`graph.ts`
- `loadGraph(url?: string): Promise<TubeGraph>` fetch and parse graph.json.
- `buildAdjacency(g: TubeGraph): Adjacency` build `Map<stationId, Neighbour[]>`,
  bidirectional, one Neighbour per (station, line) reachable in one hop.
- `stationById(g: TubeGraph): Map<string, Station>` index for lookups.

`dijkstra.ts`
- `shortestPath(adj, startId, targetId, opts?): PathResult | null`
  weighted: each hop costs 1, each line change costs `opts.changePenalty`
  (default 4). Track the line you arrive on so changes are counted correctly.
  Returns ordered station ids, hop count, change count, total cost. `null` if
  unreachable.
- `graphDistanceStops(adj, fromId, targetId): number` minimum hops only (BFS),
  used for the optional harder "stops remaining" hint and difficulty checks.

`daily.ts`
- `dailyPuzzle(g, adj, dateISO, opts?): DailyPuzzle` deterministic from
  `dateISO`. Pick start and target whose optimal route falls inside a difficulty
  band (default: 6 to 12 hops and at least 1 line change). Reseed deterministically
  until a pair qualifies. Returns start, target and the computed par (PathResult).

`game.ts`
- `initGame(puzzle, g, adj): GameState`
- `legalMoves(state, adj): Neighbour[]` adjacents of the current station.
- `move(state, to: Neighbour, adj): GameState` validate the move is legal (`to`
  is one of the current station's neighbours), advance, update revealed set and
  the player's path/line-change count. A line change is counted when `to.line`
  differs from the line used on the previous move (the first move never counts as
  a change). Because parallel edges exist (e.g. Euston to King's Cross on both
  Victoria and Northern), the chosen line must be explicit. Pure: returns new
  state, does not mutate.
- `compass(g, fromId, targetId): Compass` `{ bearingDeg, km }` from lat/lon
  (haversine + initial bearing).
- `isSolved(state): boolean`
- `score(state): Score` hops, changes, and deltas vs par.
- `shareGrid(state, dateISO): string` spoiler-free multiline emoji summary
  (think Wordle squares: result line plus a compact trail, no station names).

## Conventions

Python: ruff (line-length 100), mypy strict, type hints on every signature,
NumPy-style docstrings, pydantic v2 for the graph models (see
`pipeline/tube_pipeline/models.py`), httpx for TfL calls. Tests in
`pipeline/tests` with pytest; mock HTTP with `respx`, never hit the network in a
test. CLI entry: `python -m tube_pipeline.cli build --out <path>`.

TypeScript: strict, no `any`. Vitest. The engine must have zero React/DOM
imports so it stays unit-testable in isolation. UI styling with Tailwind v4
utility classes (already wired via `@tailwindcss/vite`).

## TfL data source

- Base URL: `https://api.tfl.gov.uk`
- Ordered stops per line:
  `GET /Line/{lineId}/Route/Sequence/{direction}` with direction `inbound` and
  `outbound`. `response.stopPointSequences[].stopPoint[]` is the ordered list;
  consecutive entries form edges. Each stopPoint carries `id`, `name`, `lat`,
  `lon`, `lines`, and parent identity. Merge platforms to a station via
  `topMostParentId` / `stationNaptan` (fall back to the stop's own id if absent).
- The 11 tube line ids: `bakerloo`, `central`, `circle`, `district`,
  `hammersmith-city`, `jubilee`, `metropolitan`, `northern`, `piccadilly`,
  `victoria`, `waterloo-city`.
- Line colours/names: `GET /Line/Mode/tube`, or hardcode the 11 official colours.
- No API key needed at low volume. Support an optional `TFL_APP_KEY` env var sent
  as a query param to lift rate limits.

## Scope for this build

MVP = Navigate mode, real graph, 1-hop fog that persists as you explore, compass
hint, click-to-move, win screen scored vs Dijkstra par, daily seed, basic share
grid, SVG map using lat/lon projected to screen. UI polish and Hunt mode come
later. Ship something playable and correct over something pretty.
