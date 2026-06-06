import { describe, expect, it } from 'vitest'
import {
  applyResult,
  bucket,
  EMPTY_STATS,
  type GameResult,
  type Stats,
} from './stats'

function result(over: Partial<GameResult> & Pick<GameResult, 'date'>): GameResult {
  return { solved: true, scoreOverPar: 0, optimal: false, ...over }
}

describe('bucket', () => {
  it('maps small over-par counts to their own bucket', () => {
    expect(bucket(0)).toBe('0')
    expect(bucket(1)).toBe('1')
    expect(bucket(2)).toBe('2')
    expect(bucket(3)).toBe('3')
    expect(bucket(4)).toBe('4')
  })

  it('collapses 5 or more into the "5+" bucket', () => {
    expect(bucket(5)).toBe('5+')
    expect(bucket(9)).toBe('5+')
  })

  it('clamps negatives (better than par should not happen, but stays safe) to "0"', () => {
    expect(bucket(-1)).toBe('0')
  })
})

describe('EMPTY_STATS', () => {
  it('is all zeroes with a full set of distribution buckets', () => {
    expect(EMPTY_STATS.played).toBe(0)
    expect(EMPTY_STATS.lastResultDate).toBeNull()
    expect(Object.keys(EMPTY_STATS.distribution).sort()).toEqual(
      ['0', '1', '2', '3', '4', '5+'].sort(),
    )
    for (const v of Object.values(EMPTY_STATS.distribution)) expect(v).toBe(0)
  })
})

describe('applyResult — counting', () => {
  it('increments played and solved on a win', () => {
    const s = applyResult(EMPTY_STATS, result({ date: '2026-06-06' }))
    expect(s.played).toBe(1)
    expect(s.solved).toBe(1)
    expect(s.lastResultDate).toBe('2026-06-06')
  })

  it('increments played but not solved on a loss, and zeroes the streak', () => {
    const seeded: Stats = { ...EMPTY_STATS, curStreak: 4, lastResultDate: '2026-06-05' }
    const s = applyResult(seeded, result({ date: '2026-06-06', solved: false }))
    expect(s.played).toBe(1)
    expect(s.solved).toBe(0)
    expect(s.curStreak).toBe(0)
  })

  it('counts optimal wins only when solved and optimal', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-06-06', optimal: true }))
    expect(s.optimalCount).toBe(1)
    // not optimal
    s = applyResult(s, result({ date: '2026-06-07', optimal: false }))
    expect(s.optimalCount).toBe(1)
    // optimal flag on a loss must not count
    s = applyResult(s, result({ date: '2026-06-08', solved: false, optimal: true }))
    expect(s.optimalCount).toBe(1)
  })

  it('does not mutate the input stats or its distribution', () => {
    const before = JSON.stringify(EMPTY_STATS)
    const out = applyResult(EMPTY_STATS, result({ date: '2026-06-06', scoreOverPar: 2 }))
    expect(JSON.stringify(EMPTY_STATS)).toBe(before)
    expect(out.distribution).not.toBe(EMPTY_STATS.distribution)
  })
})

describe('applyResult — idempotency per date', () => {
  it('returns the same record when the date matches lastResultDate', () => {
    const first = applyResult(EMPTY_STATS, result({ date: '2026-06-06', scoreOverPar: 1 }))
    const replay = applyResult(first, result({ date: '2026-06-06', scoreOverPar: 1 }))
    expect(replay).toBe(first)
  })

  it('does not double-count played/solved/distribution on replay', () => {
    const first = applyResult(EMPTY_STATS, result({ date: '2026-06-06', scoreOverPar: 1 }))
    // Even a *different* outcome on the same date is ignored — first write wins.
    const replay = applyResult(first, result({ date: '2026-06-06', solved: false }))
    expect(replay.played).toBe(1)
    expect(replay.solved).toBe(1)
    expect(replay.distribution['1']).toBe(1)
  })
})

describe('applyResult — streak rules', () => {
  it('starts a streak at 1 with no prior result', () => {
    const s = applyResult(EMPTY_STATS, result({ date: '2026-06-06' }))
    expect(s.curStreak).toBe(1)
    expect(s.maxStreak).toBe(1)
  })

  it('increments on the immediately-following calendar day', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-06-06' }))
    s = applyResult(s, result({ date: '2026-06-07' }))
    s = applyResult(s, result({ date: '2026-06-08' }))
    expect(s.curStreak).toBe(3)
    expect(s.maxStreak).toBe(3)
  })

  it('crosses a month boundary as consecutive days', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-01-31' }))
    s = applyResult(s, result({ date: '2026-02-01' }))
    expect(s.curStreak).toBe(2)
  })

  it('crosses a year boundary as consecutive days', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2025-12-31' }))
    s = applyResult(s, result({ date: '2026-01-01' }))
    expect(s.curStreak).toBe(2)
  })

  it('resets to 1 when a solved game lands after a gap', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-06-06' }))
    s = applyResult(s, result({ date: '2026-06-07' })) // streak 2
    expect(s.curStreak).toBe(2)
    s = applyResult(s, result({ date: '2026-06-10' })) // gap -> reset to 1
    expect(s.curStreak).toBe(1)
  })

  it('resets to 0 on a loss and restarts at 1 the next solved day', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-06-06' }))
    s = applyResult(s, result({ date: '2026-06-07' })) // streak 2
    s = applyResult(s, result({ date: '2026-06-08', solved: false })) // reset to 0
    expect(s.curStreak).toBe(0)
    s = applyResult(s, result({ date: '2026-06-09' })) // day after, but prior was a loss
    expect(s.curStreak).toBe(1)
  })

  it('preserves the high-water mark in maxStreak after a reset', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-06-01' }))
    s = applyResult(s, result({ date: '2026-06-02' }))
    s = applyResult(s, result({ date: '2026-06-03' })) // streak 3, max 3
    s = applyResult(s, result({ date: '2026-06-05' })) // gap -> streak 1
    expect(s.curStreak).toBe(1)
    expect(s.maxStreak).toBe(3)
  })
})

describe('applyResult — distribution', () => {
  it('buckets solved games by score over par', () => {
    let s = applyResult(EMPTY_STATS, result({ date: '2026-06-01', scoreOverPar: 0 }))
    s = applyResult(s, result({ date: '2026-06-02', scoreOverPar: 2 }))
    s = applyResult(s, result({ date: '2026-06-03', scoreOverPar: 2 }))
    s = applyResult(s, result({ date: '2026-06-04', scoreOverPar: 7 }))
    expect(s.distribution['0']).toBe(1)
    expect(s.distribution['2']).toBe(2)
    expect(s.distribution['5+']).toBe(1)
  })

  it('does not record a distribution bucket for a loss', () => {
    const s = applyResult(
      EMPTY_STATS,
      result({ date: '2026-06-06', solved: false, scoreOverPar: 3 }),
    )
    expect(s.distribution['3']).toBe(0)
  })
})
