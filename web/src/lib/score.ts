// Single comparable score for a run. Stops and changes are folded into one
// number so two runs are directly rankable (the V2 split of stops-vs-par AND
// changes-vs-par made "who did best" ambiguous). This is exactly the cost the
// Dijkstra par minimises: 1 per stop, CHANGE_WEIGHT per line change. Lower wins.

export const CHANGE_WEIGHT = 4

/** Weighted score for a route. Lower is better. */
export function points(stops: number, changes: number): number {
  return stops + CHANGE_WEIGHT * changes
}

/** How a value compares to the best possible: at/under, a little over, well over. */
export type Tone = 'good' | 'warn' | 'bad'

/**
 * Classify a value against its best (par): `good` when you matched or beat it,
 * `warn` when over by up to `amberLimit`, `bad` beyond. Drives the green / amber
 * / red coding of scores, stops and changes.
 */
export function deltaTone(value: number, best: number, amberLimit: number): Tone {
  const over = value - best
  if (over <= 0) return 'good'
  if (over <= amberLimit) return 'warn'
  return 'bad'
}

/** Amber tolerance before a metric reads red. Changes are dear, so least slack. */
export const AMBER_LIMIT = {
  /** Half the best score (min 2) over par is still amber; more is red. */
  score: (best: number) => Math.max(2, Math.round(best * 0.5)),
  stops: 2,
  changes: 1,
} as const
