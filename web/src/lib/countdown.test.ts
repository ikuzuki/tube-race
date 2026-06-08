import { describe, expect, it } from 'vitest'
import { formatCountdown, msToNextUtcMidnight } from './countdown'

describe('msToNextUtcMidnight', () => {
  it('counts to the next UTC midnight', () => {
    // 22:00:00 UTC -> 2 hours to midnight.
    const now = new Date('2026-06-08T22:00:00Z')
    expect(msToNextUtcMidnight(now)).toBe(2 * 3600 * 1000)
  })

  it('is a full day just after midnight', () => {
    const now = new Date('2026-06-08T00:00:00Z')
    expect(msToNextUtcMidnight(now)).toBe(24 * 3600 * 1000)
  })

  it('handles a month/year boundary', () => {
    const now = new Date('2026-12-31T23:59:59Z')
    expect(msToNextUtcMidnight(now)).toBe(1000)
  })

  it('never returns negative', () => {
    expect(msToNextUtcMidnight(new Date('2026-06-08T23:59:59.999Z'))).toBeGreaterThanOrEqual(0)
  })
})

describe('formatCountdown', () => {
  it('formats hours, minutes and seconds zero-padded', () => {
    expect(formatCountdown((2 * 3600 + 3 * 60 + 9) * 1000)).toBe('02:03:09')
  })

  it('shows all zeros at or below zero', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(-5000)).toBe('00:00:00')
  })

  it('floors sub-second remainders', () => {
    expect(formatCountdown(1999)).toBe('00:00:01')
  })

  it('handles the full-day case', () => {
    expect(formatCountdown(24 * 3600 * 1000)).toBe('24:00:00')
  })
})
