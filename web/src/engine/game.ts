// Game state, moves, compass, scoring and the shareable grid.
//
// Pure TypeScript. All mutating-looking operations return fresh state; the
// inputs are never mutated.

import type {
  Adjacency,
  Compass,
  DailyPuzzle,
  GameState,
  Move,
  Neighbour,
  Score,
  Station,
  TubeGraph,
} from './types'
import { DEFAULT_CHANGE_PENALTY } from './dijkstra'
import { stationIndex } from './graph'

/** Mean Earth radius in kilometres, for the haversine compass. */
const EARTH_RADIUS_KM = 6371

/** Reveal a station plus everything one hop away from it. */
function revealAround(stationId: string, adj: Adjacency, into: Set<string>): void {
  into.add(stationId)
  const neighbours = adj.get(stationId)
  if (neighbours) {
    for (const nb of neighbours) into.add(nb.stationId)
  }
}

/**
 * Initialise game state at the puzzle's start station. The start node and its
 * immediate neighbours are revealed (1-hop fog); the path is empty and nothing
 * is solved unless the puzzle is degenerate (start === target).
 */
export function initGame(puzzle: DailyPuzzle, graph: TubeGraph, adj: Adjacency): GameState {
  void graph // graph is part of the contract signature; reveal uses adjacency.
  const revealed = new Set<string>()
  revealAround(puzzle.startId, adj, revealed)
  return {
    puzzle,
    startId: puzzle.startId,
    currentId: puzzle.startId,
    path: [],
    revealed,
    changes: 0,
    solved: puzzle.startId === puzzle.targetId,
  }
}

/** The currently selectable adjacent stations (one entry per (station, line)). */
export function legalMoves(state: GameState, adj: Adjacency): Neighbour[] {
  const neighbours = adj.get(state.currentId)
  // Return a defensive copy so callers can't mutate the adjacency list.
  return neighbours ? neighbours.slice() : []
}

/**
 * Apply a legal move along a chosen neighbour edge, returning new state.
 *
 * Validates that `to` is an actual neighbour of the current station on the
 * specified line (parallel edges make the line significant). Increments the
 * change count only when `to.line` differs from the line used on the previous
 * move — the first move never counts as a change. Reveals the destination and
 * its neighbours, and marks the game solved on reaching the target.
 *
 * Pure: the input state (its `revealed` Set and `path` array) is not mutated.
 */
export function move(state: GameState, to: Neighbour, adj: Adjacency): GameState {
  const neighbours = adj.get(state.currentId)
  const legal = neighbours?.some((nb) => nb.stationId === to.stationId && nb.line === to.line)
  if (!legal) {
    throw new Error(
      `move: illegal move from ${state.currentId} to ${to.stationId} on ${to.line}`,
    )
  }

  const prevLine = state.path.length > 0 ? state.path[state.path.length - 1].line : null
  const isChange = prevLine !== null && to.line !== prevLine

  const newPath: Move[] = state.path.slice()
  newPath.push({ stationId: to.stationId, line: to.line })

  const newRevealed = new Set<string>(state.revealed)
  revealAround(to.stationId, adj, newRevealed)

  return {
    puzzle: state.puzzle,
    startId: state.startId,
    currentId: to.stationId,
    path: newPath,
    revealed: newRevealed,
    changes: state.changes + (isChange ? 1 : 0),
    solved: to.stationId === state.puzzle.targetId,
  }
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI
}

function requireStation(index: Map<string, Station>, id: string): Station {
  const s = index.get(id)
  if (!s) throw new Error(`compass: unknown station ${id}`)
  return s
}

/**
 * Bearing and straight-line (haversine) distance from one station to another.
 * `bearingDeg` is the initial great-circle bearing in [0, 360), 0 = north,
 * increasing clockwise. `km` is the haversine distance.
 */
export function compass(graph: TubeGraph, fromId: string, targetId: string): Compass {
  const index = stationIndex(graph)
  const from = requireStation(index, fromId)
  const target = requireStation(index, targetId)

  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(target.lat)
  const dLat = toRadians(target.lat - from.lat)
  const dLon = toRadians(target.lon - from.lon)

  // Haversine distance.
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const km = EARTH_RADIUS_KM * c

  // Initial bearing.
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearingDeg = (toDegrees(Math.atan2(y, x)) + 360) % 360

  return { bearingDeg, km }
}

/** Has the player reached the target? */
export function isSolved(state: GameState): boolean {
  return state.solved
}

/**
 * Score the finished (or in-progress) game against par. `hops` is the number of
 * moves taken; `changes` the line changes incurred. Deltas are player minus par
 * (>= 0 means at or over par). `optimal` is true when the player's weighted cost
 * (hops + changes * {@link DEFAULT_CHANGE_PENALTY}) matched or beat par.cost.
 */
export function score(state: GameState): Score {
  const hops = state.path.length
  const changes = state.changes
  const parHops = state.puzzle.par.hops
  const parChanges = state.puzzle.par.changes
  const cost = hops + changes * DEFAULT_CHANGE_PENALTY

  return {
    hops,
    changes,
    parHops,
    parChanges,
    hopsDelta: hops - parHops,
    changesDelta: changes - parChanges,
    optimal: cost <= state.puzzle.par.cost,
  }
}

/**
 * Spoiler-free shareable summary (Wordle-style). No station names. A title line
 * with the date, a result line comparing hops/changes to par, and a compact
 * emoji trail — one square per hop, with a flag at the start and a target at the
 * end. Square colour encodes whether the player matched par.
 */
export function shareGrid(state: GameState, dateISO: string): string {
  const s = score(state)
  const solved = state.solved

  const title = `Tube Race ${dateISO}`

  const resultLine = solved
    ? `Solved — ${s.hops} stops / ${s.changes} changes (par ${s.parHops}/${s.parChanges})`
    : `Gave up — ${s.hops} stops / ${s.changes} changes (par ${s.parHops}/${s.parChanges})`

  // Trail: a flag, one square per hop taken, then a destination marker if solved.
  // Green squares while at/under par hops, yellow once over — never reveals
  // which stations were visited.
  const squares: string[] = []
  for (let i = 0; i < s.hops; i++) {
    squares.push(i < s.parHops ? '🟩' : '🟨')
  }
  const trail = `🚇${squares.join('')}${solved ? '🏁' : '🟥'}`

  return `${title}\n${resultLine}\n${trail}`
}
