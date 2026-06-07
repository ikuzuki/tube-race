// Authoritative type contract for the Tube Race engine.
// See SPEC.md. Mirrors the graph.json schema and pipeline/tube_pipeline/models.py.
// The engine (this folder) must stay pure: no React, no DOM imports.

export interface Line {
  id: string
  name: string
  colour: string
}

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  lines: string[]
  zone?: string
}

export interface Edge {
  from: string
  to: string
  line: string
}

export interface TubeGraph {
  version: string
  generatedAt: string
  lines: Line[]
  stations: Station[]
  edges: Edge[]
}

/** A one-hop move to an adjacent station along a specific line. */
export interface Neighbour {
  stationId: string
  line: string
}

/** Adjacency list keyed by station id; bidirectional. */
export type Adjacency = Map<string, Neighbour[]>

/** Result of a shortest-path search. */
export interface PathResult {
  /** Ordered station ids, start..target inclusive. */
  stations: string[]
  /** Edges traversed (stations.length - 1). */
  hops: number
  /** Line changes along the path. */
  changes: number
  /** Weighted cost = hops + changes * changePenalty. */
  cost: number
  /**
   * Line id used for each hop, length === hops. `lines[i]` is the line ridden
   * from `stations[i]` to `stations[i + 1]`. Present on engine-computed paths;
   * optional so hand-built path literals stay valid.
   */
  lines?: string[]
}

export interface ShortestPathOptions {
  /** Cost added per line change. Default 4. */
  changePenalty?: number
}

export interface DifficultyBand {
  /** Default 6. */
  minHops?: number
  /** Default 12. */
  maxHops?: number
  /** Default 1. */
  minChanges?: number
}

export interface DailyPuzzle {
  /** ISO date string used as the seed, e.g. "2026-06-06". */
  date: string
  startId: string
  targetId: string
  /** Optimal route, the par the player is scored against. */
  par: PathResult
}

/** A single hop the player has taken. */
export interface Move {
  stationId: string
  /** Line used to arrive at stationId. */
  line: string
}

export interface GameState {
  puzzle: DailyPuzzle
  startId: string
  currentId: string
  /** Moves taken so far, excluding the start node. */
  path: Move[]
  /** Every station id ever made visible (persisted fog reveal). */
  revealed: Set<string>
  /** Line changes incurred so far. */
  changes: number
  solved: boolean
}

export interface Compass {
  /** Bearing to target in degrees. 0 = north, clockwise. */
  bearingDeg: number
  /** Straight-line (haversine) distance in km. */
  km: number
}

export interface Score {
  hops: number
  changes: number
  parHops: number
  parChanges: number
  /** hops - parHops (>= 0 means at or over par). */
  hopsDelta: number
  /** changes - parChanges. */
  changesDelta: number
  /** True if the player's weighted cost matched or beat par. */
  optimal: boolean
}

export type GameMode = 'navigate' | 'hunt'
