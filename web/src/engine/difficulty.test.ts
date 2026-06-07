import { describe, expect, it } from 'vitest'
import { classifyDifficulty, matchesTier, tierForDate, tierPenalty, TIER_SPECS } from './difficulty'
import type { PathResult, Tier } from './types'

function par(hops: number, changes: number): PathResult {
  return {
    stations: Array.from({ length: hops + 1 }, (_, i) => `s${i}`),
    hops,
    changes,
    cost: hops + 4 * changes,
  }
}

describe('matchesTier', () => {
  it('accepts an in-band easy puzzle', () => {
    expect(matchesTier(par(7, 1), 1.05, 'easy')).toBe(true)
  })

  it('rejects an easy puzzle whose gap is too large', () => {
    expect(matchesTier(par(7, 1), 1.3, 'easy')).toBe(false)
  })

  it('rejects an easy puzzle with no change', () => {
    expect(matchesTier(par(7, 0), 1.0, 'easy')).toBe(false)
  })

  it('accepts an in-band medium puzzle', () => {
    expect(matchesTier(par(10, 2), 1.3, 'medium')).toBe(true)
  })

  it('requires two changes for medium', () => {
    expect(matchesTier(par(10, 1), 1.3, 'medium')).toBe(false)
  })

  it('accepts a hard puzzle even when greedy never arrives (gap Infinity)', () => {
    expect(matchesTier(par(12, 2), Infinity, 'hard')).toBe(true)
  })

  it('enforces the hop guardrails', () => {
    expect(matchesTier(par(4, 1), 1.05, 'easy')).toBe(false)
    expect(matchesTier(par(17, 2), 1.5, 'hard')).toBe(false)
  })
})

describe('classifyDifficulty', () => {
  it('returns the gentlest matching tier', () => {
    // hops 8-9, >=2 changes, gap exactly 1.15 satisfies easy AND medium.
    expect(classifyDifficulty(par(8, 2), 1.15)).toBe('easy')
    expect(classifyDifficulty(par(10, 2), 1.3)).toBe('medium')
    expect(classifyDifficulty(par(12, 2), 2.0)).toBe('hard')
    // Expert needs 3+ changes and a long route the hard band's hop cap excludes.
    expect(classifyDifficulty(par(18, 3), 2.5)).toBe('expert')
  })

  it('returns null when nothing fits', () => {
    expect(classifyDifficulty(par(3, 0), 1.0)).toBeNull()
  })
})

describe('tierPenalty', () => {
  it('is zero inside the band', () => {
    expect(tierPenalty(par(7, 1), 1.05, 'easy')).toBe(0)
  })

  it('grows with hop distance from the guardrails', () => {
    expect(tierPenalty(par(4, 1), 1.05, 'easy')).toBeGreaterThan(0)
    expect(tierPenalty(par(3, 1), 1.05, 'easy')).toBeGreaterThan(
      tierPenalty(par(4, 1), 1.05, 'easy'),
    )
  })

  it('weights gap distance heavily and handles Infinity', () => {
    const nearBand = tierPenalty(par(10, 2), 1.41, 'medium')
    const offBand = tierPenalty(par(10, 2), 2.0, 'medium')
    const unreachable = tierPenalty(par(10, 2), Infinity, 'medium')
    expect(offBand).toBeGreaterThan(nearBand)
    expect(unreachable).toBeGreaterThan(offBand)
    expect(Number.isFinite(unreachable)).toBe(true)
  })
})

describe('tierForDate', () => {
  it('is deterministic for a date', () => {
    expect(tierForDate('2026-06-07')).toBe(tierForDate('2026-06-07'))
  })

  it('serves a sensible accessible-leaning mix over a year', () => {
    const counts: Record<Tier, number> = { easy: 0, medium: 0, hard: 0, expert: 0 }
    const start = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)
      counts[tierForDate(d)]++
    }
    // Targets are ~40/45/15; allow generous slack for a 365-sample draw.
    expect(counts.easy / 365).toBeGreaterThan(0.3)
    expect(counts.easy / 365).toBeLessThan(0.5)
    expect(counts.medium / 365).toBeGreaterThan(0.35)
    expect(counts.medium / 365).toBeLessThan(0.55)
    expect(counts.hard / 365).toBeGreaterThan(0.07)
    expect(counts.hard / 365).toBeLessThan(0.25)
    // Expert is never served by the ordinary daily; it is its own track.
    expect(counts.expert).toBe(0)
  })
})

describe('TIER_SPECS', () => {
  it('keeps the daily-rotation hop ceiling modest so puzzles never get tedious-long', () => {
    // The rotation tiers stay short; only the opt-in Expert track runs longer.
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      expect(TIER_SPECS[tier].maxHops).toBeLessThanOrEqual(16)
    }
    expect(TIER_SPECS.expert.maxHops).toBeLessThanOrEqual(20)
    expect(TIER_SPECS.expert.minChanges).toBeGreaterThanOrEqual(3)
  })
})
