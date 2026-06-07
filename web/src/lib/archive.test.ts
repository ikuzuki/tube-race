import { describe, expect, it } from 'vitest'
import { archiveDates, LAUNCH_DATE, recordCompletion, type ArchiveCompletions } from './archive'

describe('archiveDates', () => {
  it('lists yesterday back to launch, newest first, excluding today', () => {
    const dates = archiveDates('2026-06-07')
    expect(dates[0]).toBe('2026-06-06') // yesterday
    expect(dates[dates.length - 1]).toBe(LAUNCH_DATE)
    expect(dates).not.toContain('2026-06-07') // never today's puzzle
    expect([...dates].sort().reverse()).toEqual(dates) // strictly descending
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is empty on launch day (no past dailies yet) and grows by one a day', () => {
    expect(archiveDates(LAUNCH_DATE)).toEqual([])
    // The day after launch yields exactly the launch date (derived so this
    // stays correct whatever LAUNCH_DATE is set to).
    const dayAfter = new Date(`${LAUNCH_DATE}T00:00:00Z`)
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
    expect(archiveDates(dayAfter.toISOString().slice(0, 10))).toEqual([LAUNCH_DATE])
  })

  it('respects the max cap', () => {
    expect(archiveDates('2027-01-01', 5)).toHaveLength(5)
  })
})

describe('recordCompletion', () => {
  const solved = { solved: true, score: 10, parScore: 9 }

  it('stores a first result', () => {
    const next = recordCompletion({}, '2026-05-18', solved)
    expect(next['2026-05-18']).toEqual(solved)
  })

  it('keeps the better (lower) solved score', () => {
    const map: ArchiveCompletions = { '2026-05-18': solved }
    const worse = recordCompletion(map, '2026-05-18', { solved: true, score: 14, parScore: 9 })
    expect(worse).toBe(map) // unchanged, same reference
    const better = recordCompletion(map, '2026-05-18', { solved: true, score: 9, parScore: 9 })
    expect(better['2026-05-18'].score).toBe(9)
  })

  it('never downgrades a solve to an attempt', () => {
    const map: ArchiveCompletions = { '2026-05-18': solved }
    const next = recordCompletion(map, '2026-05-18', { solved: false, score: 3, parScore: 9 })
    expect(next).toBe(map)
  })

  it('upgrades an attempt to a solve', () => {
    const map: ArchiveCompletions = {
      '2026-05-18': { solved: false, score: 3, parScore: 9 },
    }
    const next = recordCompletion(map, '2026-05-18', solved)
    expect(next['2026-05-18'].solved).toBe(true)
  })

  it('does not mutate the input map', () => {
    const map: ArchiveCompletions = {}
    recordCompletion(map, '2026-05-18', solved)
    expect(map).toEqual({})
  })
})
