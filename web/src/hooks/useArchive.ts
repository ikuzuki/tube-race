// React binding for the pure archive-completion logic in lib/archive. Owns the
// localStorage persistence so the menu/modal components stay presentational.

import { useCallback, useState } from 'react'
import {
  recordCompletion,
  type ArchiveCompletion,
  type ArchiveCompletions,
} from '../lib/archive'

const STORAGE_KEY = 'tube-race:archive:v1'

/** Read persisted completions, falling back to empty on miss or parse error. */
function loadCompletions(): ArchiveCompletions {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ArchiveCompletions) : {}
  } catch {
    return {}
  }
}

function persist(map: ArchiveCompletions): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage full or unavailable (e.g. private mode): degrade silently.
  }
}

export interface UseArchive {
  completions: ArchiveCompletions
  /** Fold a finished run into the map (best result per date wins) and persist. */
  record: (dateISO: string, completion: ArchiveCompletion) => void
}

export function useArchive(): UseArchive {
  const [completions, setCompletions] = useState<ArchiveCompletions>(loadCompletions)

  const record = useCallback((dateISO: string, completion: ArchiveCompletion) => {
    setCompletions((prev) => {
      const next = recordCompletion(prev, dateISO, completion)
      if (next === prev) return prev
      persist(next)
      return next
    })
  }, [])

  return { completions, record }
}
