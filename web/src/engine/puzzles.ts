// Precomputed puzzle lookup. Selecting a daily/Expert puzzle means searching
// many random endpoint pairs for one whose route fits the day's difficulty band
// (Expert especially is rare and slow). That search is deterministic per date,
// so it is run once at build time (see web/scripts/precompute-puzzles.ts) and
// the chosen ENDPOINTS are shipped in web/public/data/puzzles.json. The app
// just reads the endpoints and recomputes `par` with the cheap shortestPath, so
// the file stays tiny and par can never go stale against the graph.
//
// Any date outside the precomputed range falls back to on-the-fly generation,
// so the game never breaks past the horizon.

import type { Adjacency, DailyPuzzle, TubeGraph } from './types'
import { shortestPath } from './dijkstra'
import { greedyGap, greedyPath } from './greedy'
import { classifyDifficulty } from './difficulty'
import { dailyExpert, dailyPuzzle } from './daily'

/** The chosen start/target for one puzzle. */
export interface Endpoints {
  startId: string
  targetId: string
}

/** Precomputed endpoints per date, for both the daily and Expert tracks. */
export type PuzzleIndex = Record<string, { daily: Endpoints; expert: Endpoints }>

/**
 * Build a full {@link DailyPuzzle} from stored endpoints by recomputing the
 * optimal route (cheap) and re-deriving the difficulty tier for the chip.
 * Returns null if the endpoints do not resolve to a route (so the caller can
 * fall back to fresh generation).
 */
export function puzzleFromEndpoints(
  graph: TubeGraph,
  adj: Adjacency,
  dateISO: string,
  ep: Endpoints,
): DailyPuzzle | null {
  const par = shortestPath(adj, ep.startId, ep.targetId)
  if (!par) return null
  const gap = greedyGap(par, greedyPath(graph, adj, ep.startId, ep.targetId))
  const tier = classifyDifficulty(par, gap) ?? undefined
  return { date: dateISO, startId: ep.startId, targetId: ep.targetId, par, tier, gap }
}

/**
 * The ordinary daily for a date: from the precomputed index when present, else
 * generated on the fly (dates beyond the precomputed horizon).
 */
export function resolveDaily(
  graph: TubeGraph,
  adj: Adjacency,
  dateISO: string,
  index?: PuzzleIndex | null,
): DailyPuzzle {
  const ep = index?.[dateISO]?.daily
  return (ep && puzzleFromEndpoints(graph, adj, dateISO, ep)) || dailyPuzzle(graph, adj, dateISO)
}

/** The Expert puzzle for a date, from the index when present, else generated. */
export function resolveExpert(
  graph: TubeGraph,
  adj: Adjacency,
  dateISO: string,
  index?: PuzzleIndex | null,
): DailyPuzzle {
  const ep = index?.[dateISO]?.expert
  return (ep && puzzleFromEndpoints(graph, adj, dateISO, ep)) || dailyExpert(graph, adj, dateISO)
}

/**
 * Fetch the precomputed endpoints index. Tolerant: a missing or unreadable file
 * yields null, and every caller falls back to on-the-fly generation, so the app
 * still works without it.
 */
export async function loadPuzzles(url = '/data/puzzles.json'): Promise<PuzzleIndex | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as PuzzleIndex
  } catch {
    return null
  }
}
