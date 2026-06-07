// Deterministic greedy "compass player" and the greedy-gap difficulty metric.
//
// The solver models how a player uses the compass: from each position take the
// adjacent move that most reduces straight-line distance to the target,
// preferring to stay on the current line on ties and avoiding stations already
// visited where possible. Comparing its weighted cost with the optimal route's
// gives the puzzle's greedy gap: ~1.0 means the compass trivially solves it,
// larger means the bearing misleads. Pure TypeScript, fully deterministic.

import type { Adjacency, Neighbour, PathResult, Station, TubeGraph } from './types'
import { DEFAULT_CHANGE_PENALTY } from './dijkstra'
import { stationIndex } from './graph'

export interface GreedyOptions {
  /** Cost added per line change. Default 4 (matches the game's scoring). */
  changePenalty?: number
  /** Hop cap before the solver gives up. Default 2x the station count. */
  maxSteps?: number
}

/** Squared-distance-free haversine central angle (monotonic in distance). */
function centralAngle(a: Station, b: Station): number {
  const rad = (d: number): number => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Walk the graph the way a compass-led player would and return the resulting
 * route, or `null` when the walk fails to reach the target within the step cap
 * (a strong signal the compass actively misleads on this puzzle).
 *
 * Move choice each step, in order:
 *   1. unvisited neighbour stations are preferred over revisits (a player
 *      remembers where they have been; revisits only happen out of dead ends),
 *   2. among those, the station closest (straight-line) to the target wins,
 *   3. on a distance tie, staying on the current line wins,
 *   4. remaining ties resolve by adjacency order (stable for a given graph).
 */
export function greedyPath(
  graph: TubeGraph,
  adj: Adjacency,
  startId: string,
  targetId: string,
  opts?: GreedyOptions,
): PathResult | null {
  const changePenalty = opts?.changePenalty ?? DEFAULT_CHANGE_PENALTY
  const maxSteps = opts?.maxSteps ?? 2 * adj.size

  if (!adj.has(startId) || !adj.has(targetId)) return null
  if (startId === targetId) {
    return { stations: [startId], hops: 0, changes: 0, cost: 0, lines: [] }
  }

  const index = stationIndex(graph)
  const target = index.get(targetId)
  if (!target) return null

  const visited = new Set<string>([startId])
  const stations: string[] = [startId]
  const lines: string[] = []
  let changes = 0
  let currentId = startId
  let currentLine: string | null = null

  for (let step = 0; step < maxSteps; step++) {
    const neighbours = adj.get(currentId)
    if (!neighbours || neighbours.length === 0) return null

    const unvisited = neighbours.filter((nb) => !visited.has(nb.stationId))
    const pool = unvisited.length > 0 ? unvisited : neighbours

    // Pick the pool station closest to the target; among edges to the same
    // station (parallel lines) prefer the current line. Strict improvement
    // comparisons keep the earliest candidate on ties => stable.
    let best: Neighbour | null = null
    let bestDist = Infinity
    let bestStay = false
    for (const nb of pool) {
      const s = index.get(nb.stationId)
      if (!s) continue
      const d = centralAngle(s, target)
      const stay = currentLine === null || nb.line === currentLine
      if (d < bestDist || (d === bestDist && stay && !bestStay)) {
        best = nb
        bestDist = d
        bestStay = stay
      }
    }
    if (!best) return null

    if (currentLine !== null && best.line !== currentLine) changes++
    stations.push(best.stationId)
    lines.push(best.line)
    visited.add(best.stationId)
    currentId = best.stationId
    currentLine = best.line

    if (currentId === targetId) {
      const hops = stations.length - 1
      return { stations, hops, changes, cost: hops + changes * changePenalty, lines }
    }
  }

  return null
}

/**
 * Difficulty metric: the greedy route's weighted cost over the optimal route's.
 * 1.0 means the compass strategy is already optimal (boring); larger means the
 * optimal route is non-obvious. `Infinity` when greedy never reaches the target.
 */
export function greedyGap(par: PathResult, greedy: PathResult | null): number {
  if (par.cost <= 0) return 1
  if (!greedy) return Infinity
  return greedy.cost / par.cost
}
