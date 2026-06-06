// Pure stats logic for Tube Race. No React, no localStorage — this module only
// transforms a Stats record given a single GameResult, so it can be unit-tested
// in isolation. The localStorage wiring lives in hooks/useStats.ts.
//
// Streak + distribution rules (see the build spec):
//  - applyResult is idempotent per date: replaying the same calendar day (e.g. a
//    page refresh) must not double-count. Keyed off lastResultDate.
//  - Streak: solved on the day immediately after lastResultDate => +1; solved
//    with a gap or no prior result => reset to 1; not solved => reset to 0.
//  - distribution buckets a solved game by how far its weighted SCORE ran over
//    par (score = stops + 4*changes, the single comparable metric — see
//    lib/score), not by stops alone.

/** The distribution buckets, in display order. */
export const BUCKETS = ['0', '1', '2', '3', '4', '5+'] as const

export interface Stats {
  /** Games where a result was recorded (solved or not). */
  played: number
  /** Games solved. */
  solved: number
  /** Current consecutive-day solving streak. */
  curStreak: number
  /** Best streak ever reached. */
  maxStreak: number
  /** ISO date of the most recently recorded result, or null if none. */
  lastResultDate: string | null
  /** Solved games that matched par exactly (optimal). */
  optimalCount: number
  /** Solved-game counts keyed by score-over-par bucket ("0".."5+"). */
  distribution: Record<string, number>
}

export interface GameResult {
  /** ISO date string, e.g. "2026-06-06". */
  date: string
  solved: boolean
  /** How far the player's weighted score ran over par (>= 0). */
  scoreOverPar: number
  /** True if the player's route matched or beat par. */
  optimal: boolean
}

/** A fresh stats record with an empty distribution across every bucket. */
export const EMPTY_STATS: Stats = {
  played: 0,
  solved: 0,
  curStreak: 0,
  maxStreak: 0,
  lastResultDate: null,
  optimalCount: 0,
  distribution: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 },
}

/** Map a score-over-par count to its histogram bucket. Clamps negatives to "0". */
export function bucket(scoreOverPar: number): string {
  if (scoreOverPar <= 0) return '0'
  if (scoreOverPar >= 5) return '5+'
  return String(scoreOverPar)
}

/** Parse an ISO yyyy-mm-dd date as a UTC midnight timestamp (ms). */
function parseUtcDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** True if `date` is the calendar day immediately after `prev` (UTC). */
function isDayAfter(prev: string, date: string): boolean {
  const prevMs = parseUtcDay(prev)
  const dateMs = parseUtcDay(date)
  if (Number.isNaN(prevMs) || Number.isNaN(dateMs)) return false
  const ONE_DAY = 86_400_000
  return dateMs - prevMs === ONE_DAY
}

/**
 * Fold a single game result into the running stats. Pure: returns a new Stats
 * object and never mutates the input (the distribution is cloned).
 *
 * Idempotent per date — if `result.date` equals `stats.lastResultDate` the
 * input is returned unchanged, so a refresh or replay of the same day cannot
 * double-count.
 */
export function applyResult(stats: Stats, result: GameResult): Stats {
  // Idempotency guard: the same day's result has already been folded in.
  if (result.date === stats.lastResultDate) return stats

  let curStreak: number
  if (!result.solved) {
    curStreak = 0
  } else if (stats.lastResultDate && isDayAfter(stats.lastResultDate, result.date)) {
    curStreak = stats.curStreak + 1
  } else {
    // Solved with a gap, out of order, or no prior result: a fresh streak of 1.
    curStreak = 1
  }

  const distribution = { ...stats.distribution }
  if (result.solved) {
    const key = bucket(result.scoreOverPar)
    distribution[key] = (distribution[key] ?? 0) + 1
  }

  return {
    played: stats.played + 1,
    solved: stats.solved + (result.solved ? 1 : 0),
    curStreak,
    maxStreak: Math.max(stats.maxStreak, curStreak),
    lastResultDate: result.date,
    optimalCount: stats.optimalCount + (result.solved && result.optimal ? 1 : 0),
    distribution,
  }
}
