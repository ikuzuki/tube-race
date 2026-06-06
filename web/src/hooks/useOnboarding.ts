// Tracks whether the player has seen the "how to play" card, persisted so the
// first-run onboarding only fires once.

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tube-race:onboarded:v1'

/** Read the persisted onboarding flag; defaults to not-seen. */
function loadSeen(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export interface UseOnboarding {
  /** True once the player has dismissed the how-to-play card. */
  seen: boolean
  /** Mark onboarding complete and persist. */
  markSeen: () => void
}

export function useOnboarding(): UseOnboarding {
  const [seen, setSeen] = useState<boolean>(loadSeen)

  const markSeen = useCallback(() => {
    setSeen(true)
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Storage unavailable (e.g. private mode): the card may reappear, no crash.
    }
  }, [])

  return { seen, markSeen }
}
