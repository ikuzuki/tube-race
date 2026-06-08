// Share text for Tube Race. Deliberately SPOILER-FREE: it never includes
// station names, only the date, a 0-3 star rating, the weighted score against
// par, a stops·changes breakdown, the streak and the site URL.
//
// The weighted SCORE = stops + 4*changes (see lib/score); par's score is the
// cost the Dijkstra par minimises. Lower wins. Stars are the friendly headline;
// "% optimal" = round(best / score * 100) is kept as supporting detail.

/** Where the game lives. TODO: set to the real domain when hosting is decided. */
export const SITE_URL = 'https://tube-race.app'

export interface ShareInput {
  /** ISO date string, e.g. "2026-06-06". */
  dateISO: string
  solved: boolean
  /** Weighted score for the run = stops + 4*changes (includes any hint cost). */
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

/** Percentage of optimal at or above which a solved run earns its third star. */
export const THREE_STAR_PERCENT = 90
/** Percentage of optimal at or above which a solved run earns its second star. */
export const TWO_STAR_PERCENT = 60

/**
 * A 0-3 star rating for a run, kept deliberately lenient: gave up is 0, any
 * solve is at least 1, a decent run ({@link TWO_STAR_PERCENT}%+ of optimal) is
 * 2, and a near-perfect run ({@link THREE_STAR_PERCENT}%+, which an optimal
 * route always clears) is 3. The exact percentage is internal (see
 * percentOptimal); only the stars are surfaced.
 */
export function starRating(score: number, parScore: number, solved: boolean): 0 | 1 | 2 | 3 {
  if (!solved) return 0
  const pct = percentOptimal(score, parScore)
  if (pct >= THREE_STAR_PERCENT) return 3
  if (pct >= TWO_STAR_PERCENT) return 2
  return 1
}

/** Render a rating as filled/empty stars out of three, e.g. 2 -> "⭐⭐☆". */
export function starString(stars: number): string {
  const n = Math.max(0, Math.min(3, stars))
  return '⭐'.repeat(n) + '☆'.repeat(3 - n)
}

/**
 * Compose the copy-pasteable / native-share string: a title line carrying the
 * date and star rating, a score-vs-par line with the % optimal, a stops·changes
 * breakdown, the streak, and the site URL. Pure and deterministic for a given
 * input; spoiler-free.
 */
export function buildShareText(o: ShareInput): string {
  const stars = starRating(o.score, o.parScore, o.solved)
  const title = `Tube Race ${o.dateISO} ${starString(stars)}`

  const result = o.solved ? `Score ${o.score} (best ${o.parScore})` : 'Gave up'

  const breakdown = `${o.stops}/${o.parStops} stops · ${o.changes}/${o.parChanges} changes`

  const streakLine = `Streak: ${o.streak}`

  return [title, result, breakdown, streakLine, SITE_URL].join('\n')
}
