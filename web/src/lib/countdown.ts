// Countdown to the next puzzle. The app derives "today" from
// `new Date().toISOString().slice(0, 10)`, i.e. the UTC calendar day, so the
// next puzzle lands at the next UTC midnight. We deliberately count to UTC
// midnight (not the viewer's local midnight) so the countdown matches when the
// puzzle actually rolls over, the same for everyone worldwide. Pure helpers;
// the caller supplies `now` so they stay testable.

/** Milliseconds from `now` until the next UTC midnight (always > 0). */
export function msToNextUtcMidnight(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1, // start of tomorrow, UTC
  )
  return Math.max(0, next - now.getTime())
}

/** Format a millisecond duration as zero-padded "HH:MM:SS" (clamped at 0). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
