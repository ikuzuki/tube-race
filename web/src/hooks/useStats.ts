// React binding for the pure stats logic in lib/stats. Owns the localStorage
// persistence so the components that display stats can stay presentational.

import { useCallback, useState } from 'react'
import { applyResult, EMPTY_STATS, type GameResult, type Stats } from '../lib/stats'

const STORAGE_KEY = 'tube-race:stats:v1'

/** Read persisted stats, falling back to EMPTY_STATS on miss or parse error. */
function loadStats(): Stats {
  if (typeof localStorage === 'undefined') return EMPTY_STATS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATS
    const parsed = JSON.parse(raw) as Partial<Stats>
    // Merge over EMPTY_STATS so a stored record missing newer fields stays valid,
    // and the distribution always covers every bucket.
    return {
      ...EMPTY_STATS,
      ...parsed,
      distribution: { ...EMPTY_STATS.distribution, ...(parsed.distribution ?? {}) },
    }
  } catch {
    return EMPTY_STATS
  }
}

function persist(stats: Stats): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // Storage full or unavailable (e.g. private mode): degrade silently.
  }
}

export interface UseStats {
  stats: Stats
  /** Fold a finished game into the stats and persist. Idempotent per date. */
  recordResult: (r: GameResult) => void
}

export function useStats(): UseStats {
  const [stats, setStats] = useState<Stats>(loadStats)

  const recordResult = useCallback((r: GameResult) => {
    setStats((prev) => {
      const next = applyResult(prev, r)
      // applyResult is idempotent per date; skip the write when nothing changed.
      if (next === prev) return prev
      persist(next)
      return next
    })
  }, [])

  return { stats, recordResult }
}
