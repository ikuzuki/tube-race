// Deterministic daily-puzzle selection.
//
// Pure TypeScript. All randomness is seeded from the ISO date string via the
// engine's seeded PRNG (see rng.ts) — no Date.now()/Math.random() here.

import type { Adjacency, DailyPuzzle, DifficultyBand, PathResult, TubeGraph } from './types'
import { shortestPath } from './dijkstra'
import { randInt, seededRng } from './rng'

const DEFAULT_MIN_HOPS = 6
const DEFAULT_MAX_HOPS = 12
const DEFAULT_MIN_CHANGES = 1
const MAX_ATTEMPTS = 1000

/** Does a path satisfy the difficulty band? */
function withinBand(
  path: PathResult,
  minHops: number,
  maxHops: number,
  minChanges: number,
): boolean {
  return path.hops >= minHops && path.hops <= maxHops && path.changes >= minChanges
}

/**
 * How far a path is from satisfying the band, for deterministic fallback
 * ranking (lower is better; 0 means it qualifies). Combines hop distance from
 * the band interval with any shortfall in line changes.
 */
function bandPenalty(
  path: PathResult,
  minHops: number,
  maxHops: number,
  minChanges: number,
): number {
  let p = 0
  if (path.hops < minHops) p += minHops - path.hops
  else if (path.hops > maxHops) p += path.hops - maxHops
  if (path.changes < minChanges) p += minChanges - path.changes
  return p
}

/**
 * Deterministically derive the day's puzzle from an ISO date string.
 *
 * Repeatedly draws a distinct (start, target) pair from a PRNG seeded on
 * `dateISO`, computes the optimal route, and accepts the first pair whose route
 * falls inside the difficulty band (default 6–12 hops, ≥1 line change). If no
 * pair qualifies within {@link MAX_ATTEMPTS}, falls back to the best-scoring
 * pair seen (deterministic, since the draw sequence is fixed by the seed).
 *
 * The returned `par` is the optimal {@link PathResult} the player is scored
 * against. The same date always produces the same puzzle.
 */
export function dailyPuzzle(
  graph: TubeGraph,
  adj: Adjacency,
  dateISO: string,
  band?: DifficultyBand,
): DailyPuzzle {
  const minHops = band?.minHops ?? DEFAULT_MIN_HOPS
  const maxHops = band?.maxHops ?? DEFAULT_MAX_HOPS
  const minChanges = band?.minChanges ?? DEFAULT_MIN_CHANGES

  const stations = graph.stations
  const n = stations.length
  if (n < 2) {
    throw new Error('dailyPuzzle: graph needs at least two stations')
  }

  const rng = seededRng(dateISO)

  let bestPenalty = Infinity
  let bestStart: string | null = null
  let bestTarget: string | null = null
  let bestPar: PathResult | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const i = randInt(rng, n)
    let j = randInt(rng, n)
    if (i === j) j = (j + 1) % n // ensure distinct without consuming the draw count unpredictably

    const startId = stations[i].id
    const targetId = stations[j].id

    const par = shortestPath(adj, startId, targetId)
    if (!par) continue

    if (withinBand(par, minHops, maxHops, minChanges)) {
      return { date: dateISO, startId, targetId, par }
    }

    const penalty = bandPenalty(par, minHops, maxHops, minChanges)
    // Strict improvement only, so the earliest-drawn best pair wins => stable.
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestStart = startId
      bestTarget = targetId
      bestPar = par
    }
  }

  if (bestPar && bestStart && bestTarget) {
    return { date: dateISO, startId: bestStart, targetId: bestTarget, par: bestPar }
  }

  // No reachable pair was ever drawn — exhaustively scan for any connected pair
  // so we never return an unsolvable puzzle.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const par = shortestPath(adj, stations[i].id, stations[j].id)
      if (par) {
        return { date: dateISO, startId: stations[i].id, targetId: stations[j].id, par }
      }
    }
  }

  throw new Error('dailyPuzzle: no connected pair of stations exists in the graph')
}
