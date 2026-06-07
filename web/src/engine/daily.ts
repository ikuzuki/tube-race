// Deterministic daily-puzzle selection.
//
// Pure TypeScript. All randomness is seeded from the ISO date string via the
// engine's seeded PRNG (see rng.ts) — no Date.now()/Math.random() here.
//
// Without a band override, selection is difficulty-calibrated: the date picks a
// tier (see difficulty.ts tierForDate), endpoints are drawn with a bias towards
// recognisable stations (landmarks.ts), and a candidate pair is accepted when
// its optimal route AND its greedy gap (greedy.ts) fall inside the tier's band.
// Hop count is only a guardrail; the gap carries the difficulty. Passing an
// explicit band restores the simple hops/changes filter (used by tests).

import type { Adjacency, DailyPuzzle, DifficultyBand, PathResult, Tier, TubeGraph } from './types'
import { shortestPath } from './dijkstra'
import { classifyDifficulty, matchesTier, tierForDate, tierPenalty } from './difficulty'
import { greedyGap, greedyPath } from './greedy'
import { LANDMARK_NAMES } from './landmarks'
import { displayName } from '../lib/format'
import { randInt, seededRng } from './rng'

const MAX_ATTEMPTS = 1000

/** Probability an endpoint is drawn from the landmark pool rather than anywhere. */
const POOL_BIAS = 0.65

/**
 * Deterministically derive the day's puzzle from an ISO date string.
 *
 * The same date always produces the same puzzle. The returned `par` is the
 * optimal {@link PathResult} the player is scored against. With `band` set the
 * legacy hops/changes filter is used; otherwise the tier-calibrated selection
 * described in the file header.
 */
export function dailyPuzzle(
  graph: TubeGraph,
  adj: Adjacency,
  dateISO: string,
  band?: DifficultyBand,
): DailyPuzzle {
  if (graph.stations.length < 2) {
    throw new Error('dailyPuzzle: graph needs at least two stations')
  }
  return band
    ? bandPuzzle(graph, adj, dateISO, band)
    : tierPuzzle(graph, adj, dateISO, tierForDate(dateISO))
}

/**
 * Stations eligible as puzzle endpoints: those with at least two distinct
 * neighbouring stations. Starting (or finishing) at a degree-1 terminus makes
 * the first move a forced non-decision, so such stations are rejected at the
 * draw. Defensive: a degenerate graph with fewer than two eligible stations
 * keeps everything eligible rather than dead-locking the draw loop.
 */
function eligibleEndpoints(graph: TubeGraph, adj: Adjacency): boolean[] {
  const flags = graph.stations.map((s) => {
    const neighbours = adj.get(s.id) ?? []
    return new Set(neighbours.map((nb) => nb.stationId)).size >= 2
  })
  return flags.filter(Boolean).length >= 2 ? flags : graph.stations.map(() => true)
}

/**
 * Tier-calibrated selection: draw landmark-biased endpoint pairs and accept the
 * first whose optimal route and greedy gap satisfy the date's tier. Degree-1
 * endpoints are rejected (see {@link eligibleEndpoints}). If nothing qualifies
 * within {@link MAX_ATTEMPTS}, the closest candidate (deterministic penalty
 * ranking, see difficulty.ts tierPenalty) is used instead.
 */
function tierPuzzle(graph: TubeGraph, adj: Adjacency, dateISO: string, tier: Tier): DailyPuzzle {
  const stations = graph.stations
  const n = stations.length
  const rng = seededRng(dateISO)
  const eligible = eligibleEndpoints(graph, adj)

  const pool: number[] = []
  stations.forEach((s, i) => {
    if (LANDMARK_NAMES.has(displayName(s.name))) pool.push(i)
  })
  const draw = (): number =>
    pool.length > 0 && rng() < POOL_BIAS ? pool[randInt(rng, pool.length)] : randInt(rng, n)

  let bestPenalty = Infinity
  let best: DailyPuzzle | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const i = draw()
    let j = draw()
    if (i === j) j = (j + 1) % n // ensure distinct without consuming an extra draw
    if (!eligible[i] || !eligible[j]) continue // a terminus start/end is a non-decision

    const startId = stations[i].id
    const targetId = stations[j].id
    const par = shortestPath(adj, startId, targetId)
    if (!par) continue

    const gap = greedyGap(par, greedyPath(graph, adj, startId, targetId))
    if (matchesTier(par, gap, tier)) {
      return { date: dateISO, startId, targetId, par, tier, gap }
    }

    // Strict improvement only, so the earliest-drawn best pair wins => stable.
    const penalty = tierPenalty(par, gap, tier)
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      best = {
        date: dateISO,
        startId,
        targetId,
        par,
        tier: classifyDifficulty(par, gap) ?? tier,
        gap,
      }
    }
  }

  return best ?? anyConnectedPair(graph, adj, dateISO)
}

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
 * Legacy band selection: repeatedly draws a distinct (start, target) pair from
 * a PRNG seeded on `dateISO`, computes the optimal route, and accepts the first
 * pair whose route falls inside the band. If no pair qualifies within
 * {@link MAX_ATTEMPTS}, falls back to the best-scoring pair seen
 * (deterministic, since the draw sequence is fixed by the seed).
 */
function bandPuzzle(
  graph: TubeGraph,
  adj: Adjacency,
  dateISO: string,
  band: DifficultyBand,
): DailyPuzzle {
  const minHops = band.minHops ?? 6
  const maxHops = band.maxHops ?? 12
  const minChanges = band.minChanges ?? 1

  const stations = graph.stations
  const n = stations.length
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

  return anyConnectedPair(graph, adj, dateISO)
}

/**
 * Last-resort fallback: exhaustively scan for any connected pair so we never
 * return an unsolvable puzzle.
 */
function anyConnectedPair(graph: TubeGraph, adj: Adjacency, dateISO: string): DailyPuzzle {
  const stations = graph.stations
  for (let i = 0; i < stations.length; i++) {
    for (let j = 0; j < stations.length; j++) {
      if (i === j) continue
      const par = shortestPath(adj, stations[i].id, stations[j].id)
      if (par) {
        return { date: dateISO, startId: stations[i].id, targetId: stations[j].id, par }
      }
    }
  }
  throw new Error('dailyPuzzle: no connected pair of stations exists in the graph')
}
