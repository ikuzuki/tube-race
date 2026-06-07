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

/** Points over best covered by each lost square. */
export const SQUARE_BAND = 3

/** One-line legend for the square row, shown wherever the squares appear. */
export const SQUARES_RULE = `Five green means you matched the best score; one square drops for every ${SQUARE_BAND} points over.`

/**
 * Build the square row conveying closeness to optimal. Fixed, legible bands on
 * points-over-best (score = stops + 4*changes, so a band is less than one line
 * change):
 *   - 0 over (optimal)  -> 5 green
 *   - 1-3 over          -> 4 green
 *   - 4-6 over          -> 3 green   ...and so on, one fewer green per 3 over.
 * A solved run always shows one amber cell after its greens (so even a rough
 * solve differs from the all-grey DNF row); the rest are grey. Reveals nothing
 * about the route.
 */
function squares(solved: boolean, over: number): string {
  if (!solved) return GREY.repeat(ROW_LEN)
  const green = Math.max(0, ROW_LEN - Math.ceil(over / SQUARE_BAND))
  const amber = green < ROW_LEN ? 1 : 0
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
