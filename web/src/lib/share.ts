// Worldle-style share text for Tube Race. Deliberately SPOILER-FREE: it never
// includes station names, only the date, the weighted-score-vs-par result, a
// stops·changes breakdown line, a tiny row of squares conveying how close to
// optimal the run was, and the streak.
//
// The headline metric is the single weighted SCORE = stops + 4*changes (see
// lib/score); par's score is the cost the Dijkstra par minimises. Lower wins.
//
// Colour language matches the rest of the app: green = optimal/progress,
// amber = a little over par, grey = further over (never red).

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

const GREEN = '🟩'
const AMBER = '🟨'
const GREY = '⬛'

const ROW_LEN = 5

/**
 * Build the square row conveying closeness to optimal, based on how far over par
 * the run's weighted score was. A glanceable "how close were you" bar that
 * reveals nothing about the route:
 *   - optimal (0 over)      -> all green
 *   - a little over par     -> some green then amber
 *   - further over (or DNF) -> green/amber shrink, trailing cells go grey
 * More green is better; cells fill green, then amber, then grey, left to right.
 */
function squares(solved: boolean, over: number): string {
  if (!solved) return GREY.repeat(ROW_LEN)
  // Green = how close to optimal: a perfect run is all green; each point over par
  // converts one green cell to amber, up to a 2-cell amber band, after which
  // remaining cells are grey.
  const green = Math.max(0, ROW_LEN - over)
  const amber = Math.min(ROW_LEN - green, 2)
  const grey = ROW_LEN - green - amber
  return GREEN.repeat(green) + AMBER.repeat(amber) + GREY.repeat(grey)
}

/**
 * Compose the copy-pasteable share string: a title line, a score-vs-par result
 * line, a stops·changes breakdown line, a row of squares, and a streak line.
 * Pure and deterministic for a given input.
 */
export function buildShareText(o: ShareInput): string {
  const title = `Tube Race ${o.dateISO}`

  const over = Math.max(0, o.score - o.parScore)
  const result = o.solved
    ? `Score ${o.score} (best ${o.parScore})${over === 0 ? ' · Optimal!' : ''}`
    : 'Gave up'

  const breakdown = `${o.stops}/${o.parStops} stops · ${o.changes}/${o.parChanges} changes`

  const row = squares(o.solved, over)

  const streakLine = `Streak: ${o.streak}`

  return [title, result, breakdown, row, streakLine].join('\n')
}
