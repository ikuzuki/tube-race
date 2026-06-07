import { describe, expect, it } from 'vitest'
import { ARCHIVE_DATES, recordCompletion, type ArchiveCompletions } from './archive'

describe('ARCHIVE_DATES', () => {
  it('holds ten unique ISO dates in chronological order', () => {
    expect(ARCHIVE_DATES).toHaveLength(10)
    expect(new Set(ARCHIVE_DATES).size).toBe(10)
    for (const d of ARCHIVE_DATES) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect([...ARCHIVE_DATES].sort()).toEqual([...ARCHIVE_DATES])
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
