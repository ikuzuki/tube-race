// The past-puzzles archive: every daily puzzle from launch up to yesterday, in
// reverse-chronological order. Each date yields a stable puzzle via
// `dailyPuzzle(graph, adj, dateISO)` (engine/daily.ts), so the archive grows by
// one every day with no curation. Also holds the pure logic for tracking
// per-puzzle completion. localStorage wiring lives in hooks/useArchive.ts.

/** The first daily puzzle's date. Everything from here to yesterday is playable. */
export const LAUNCH_DATE = '2026-05-28'

/** Cap on how many recent dates the menu derives at once (bounds compute). */
export const MAX_ARCHIVE = 60

/**
 * Past daily-puzzle dates, newest first: from the day before `todayISO` back to
 * {@link LAUNCH_DATE}, capped at `max`. Pure and deterministic for a given
 * `todayISO`; today's puzzle itself is excluded (it's the landing experience).
 */
export function archiveDates(todayISO: string, max: number = MAX_ARCHIVE): string[] {
  const launch = new Date(`${LAUNCH_DATE}T00:00:00Z`)
  const cursor = new Date(`${todayISO}T00:00:00Z`)
  if (Number.isNaN(launch.getTime()) || Number.isNaN(cursor.getTime())) return []
  cursor.setUTCDate(cursor.getUTCDate() - 1) // start at yesterday

  const dates: string[] = []
  while (cursor >= launch && dates.length < max) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return dates
}

/** Best result recorded for one archived puzzle. */
export interface ArchiveCompletion {
  solved: boolean
  /** Player's weighted score (stops + 4*changes). */
  score: number
  /** The optimal route's score, for "score / par" display. */
  parScore: number
}

/** Completion map keyed by puzzle date. */
export type ArchiveCompletions = Record<string, ArchiveCompletion>

/**
 * Fold a finished run into the completion map, keeping the BEST result per
 * date (a solve always beats a non-solve; lower score beats higher). Pure:
 * returns the input unchanged when the new result is not an improvement.
 */
export function recordCompletion(
  map: ArchiveCompletions,
  dateISO: string,
  completion: ArchiveCompletion,
): ArchiveCompletions {
  const prev = map[dateISO]
  if (prev) {
    if (prev.solved && !completion.solved) return map
    if (prev.solved === completion.solved && prev.score <= completion.score) return map
  }
  return { ...map, [dateISO]: completion }
}
