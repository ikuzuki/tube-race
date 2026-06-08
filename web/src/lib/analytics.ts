// Tiny, dependency-free analytics beacon.
//
// Fires a same-origin GET to /e, which a CloudFront Function answers with a 204
// without ever reaching the origin. The request lands in the CloudFront access
// logs, where the event (carried in the query string) is parsed offline by
// Athena. There is no analytics backend and nothing is stored client-side
// beyond a per-tab session id.
//
// Privacy: only event names and coarse props are ever sent (mode, star count,
// score-over-par, a yes/no). Never any station name, route, or personal data.
// Do Not Track is honoured. Any failure is swallowed: analytics must never
// break the game.

const SID_KEY = 'tr_sid'

/** A random, non-personal per-tab token. Lives in sessionStorage (cleared when
 *  the tab closes), used only to group a visit's events. Not a cookie. */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SID_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem(SID_KEY, id)
    return id
  } catch {
    // sessionStorage unavailable (private mode / blocked): fall back to a
    // throwaway token so events still flow, just without session grouping.
    return 'nostore'
  }
}

function doNotTrack(): boolean {
  try {
    const nav = navigator as Navigator & { msDoNotTrack?: string }
    const win = window as Window & { doNotTrack?: string }
    return nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1'
  } catch {
    return false
  }
}

export type TrackProps = Record<string, string | number | boolean>

/** Fire an analytics beacon. No-op under Do Not Track or on any error. */
export function track(event: string, props: TrackProps = {}): void {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return
    if (doNotTrack()) return
    const params = new URLSearchParams({ ev: event, sid: sessionId() })
    for (const [key, value] of Object.entries(props)) params.set(key, String(value))
    // Fire and forget. The .catch keeps a failed beacon from surfacing as an
    // unhandled rejection (e.g. offline, or no endpoint under test).
    void fetch('/e?' + params.toString(), { mode: 'no-cors', keepalive: true }).catch(() => {})
  } catch {
    // Swallow: a beacon must never throw into the game.
  }
}
