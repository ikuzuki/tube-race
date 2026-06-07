// Turn an engine PathResult into human-readable legs: consecutive hops on the
// same line are grouped, so a route reads as "ride N stops on line X, change,
// ride M stops on line Y". Pure; no React or engine mutation.

import type { Move, PathResult } from '../engine'

export interface RouteLeg {
  /** Line id ridden for this leg. */
  lineId: string
  /** Station id where the leg begins (a change point, or the start). */
  fromId: string
  /** Station id where the leg ends (a change point, or the destination). */
  toId: string
  /** Number of stops ridden on this leg (>= 1). */
  stops: number
}

/**
 * Group a path's hops into per-line legs.
 *
 * Returns an empty array for a zero-hop path or one with no recorded line trail
 * (e.g. a hand-built literal without `lines`).
 */
export function routeLegs(path: PathResult): RouteLeg[] {
  const lines = path.lines
  if (!lines || lines.length === 0) return []

  const legs: RouteLeg[] = []
  let i = 0
  while (i < lines.length) {
    const lineId = lines[i]
    let j = i
    while (j < lines.length && lines[j] === lineId) j++
    legs.push({
      lineId,
      fromId: path.stations[i],
      toId: path.stations[j],
      stops: j - i,
    })
    i = j
  }
  return legs
}

/**
 * Legs of the journey ridden so far: the start node plus every move taken,
 * grouped per line exactly like {@link routeLegs}. Empty before the first move.
 */
export function journeyLegs(startId: string, path: Move[]): RouteLeg[] {
  return routeLegs({
    stations: [startId, ...path.map((m) => m.stationId)],
    hops: path.length,
    changes: 0,
    cost: 0,
    lines: path.map((m) => m.line),
  })
}

/** "1 stop" / "N stops". */
export function stopsLabel(stops: number): string {
  return stops === 1 ? '1 stop' : `${stops} stops`
}
