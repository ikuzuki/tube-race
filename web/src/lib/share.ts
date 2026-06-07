// Share text for Tube Race. Deliberately SPOILER-FREE: it never includes
// station names, only the date, the weighted score against par, a "% optimal"
// figure that explains itself, a stops·changes breakdown and the streak.
//
// The headline metric is the single weighted SCORE = stops + 4*changes (see
// lib/score); par's score is the cost the Dijkstra par minimises. Lower wins.
// "% optimal" = best / score * 100, so an optimal run is 100% and worse runs
// fall below, needing no legend.

export interface ShareInput {
  /** ISO date string, e.g. "2026-06-06". */
  dateISO: string
  solved: boolean
  /** Weighted score for the run = stops + 4*changes. */
  score: number
  /** Weighted score of the optimal route (par). */
  parScore: number
  stops: number
  parStops: number
  changes: number
  parChanges: number
  streak: number
}

/**
 * How close a run was to the optimal route, as a self-explanatory percentage:
 * `round(best / score * 100)`. An optimal run is 100; a run scoring twice par
 * is 50. Clamped to [0, 100]; a non-positive or sub-par score reads 100 (you
 * cannot beat par, so this only guards against bad input).
 */
export function percentOptimal(score: number, parScore: number): number {
  if (score <= 0 || score <= parScore) return 100
  return Math.max(0, Math.min(100, Math.round((parScore / score) * 100)))
}

/**
 * Compose the copy-pasteable share string: a title line, a score-vs-par result
 * line carrying the % optimal, a stops·changes breakdown line, and a streak
 * line. Pure and deterministic for a given input.
 */
export function buildShareText(o: ShareInput): string {
  const title = `Tube Race ${o.dateISO}`

  const result = o.solved
    ? `Score ${o.score} (best ${o.parScore}), ${percentOptimal(o.score, o.parScore)}% optimal`
    : 'Gave up'

  const breakdown = `${o.stops}/${o.parStops} stops · ${o.changes}/${o.parChanges} changes`

  const streakLine = `Streak: ${o.streak}`

  return [title, result, breakdown, streakLine].join('\n')
}
