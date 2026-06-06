import { describe, expect, it } from 'vitest'
import { buildShareText, type ShareInput } from './share'
import { points } from './score'

// Default to an optimal run (score == parScore). `score`/`parScore` default to
// the weighted score of the given stops/changes so callers can override just the
// raw figures and get a consistent headline, or override score/parScore directly.
function input(over: Partial<ShareInput> = {}): ShareInput {
  const stops = over.stops ?? 7
  const parStops = over.parStops ?? 7
  const changes = over.changes ?? 1
  const parChanges = over.parChanges ?? 1
  return {
    dateISO: '2026-06-06',
    solved: true,
    stops,
    parStops,
    changes,
    parChanges,
    score: points(stops, changes),
    parScore: points(parStops, parChanges),
    streak: 3,
    ...over,
  }
}

describe('buildShareText — structure', () => {
  it('produces a five-line block: title, result, breakdown, squares, streak', () => {
    const lines = buildShareText(input()).split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe('Tube Race 2026-06-06')
    expect(lines[4]).toBe('Streak: 3')
  })

  it('leads the result line with the weighted score against par', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7, changes: 2, parChanges: 1 }))
    expect(text).toContain('2026-06-06')
    // score = 9 + 4*2 = 17, par = 7 + 4*1 = 11
    expect(text).toContain('Score 17 (best 11)')
  })

  it('keeps a stops·changes breakdown line', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7, changes: 3, parChanges: 1 }))
    expect(text).toContain('9/7 stops')
    expect(text).toContain('3/1 changes')
  })

  it('is deterministic for a given input', () => {
    expect(buildShareText(input())).toBe(buildShareText(input()))
  })
})

describe('buildShareText — spoiler-free', () => {
  it('leaks no station names', () => {
    const text = buildShareText(input())
    // No real station names should ever appear.
    expect(text).not.toMatch(
      /Victoria|Brixton|Euston|King|Cross|Paddington|Bank|Oxford|Baker|Waterloo/i,
    )
  })

  it('contains only the title, numbers, square emoji and the streak — no route', () => {
    const text = buildShareText(input({ stops: 8, parStops: 6 }))
    // Strip the known-safe tokens; what remains must not contain letters that
    // could be a station name (only the words in the fixed template survive).
    const allowedWords = /Tube|Race|Score|best|par|stops|changes|Optimal|Streak|Gave|up/g
    const stripped = text.replace(allowedWords, '').replace(/[0-9/:·()\s🟩🟨⬛.-]/g, '')
    expect(stripped).toBe('')
  })
})

describe('buildShareText — square row reflects closeness to optimal', () => {
  it('is all green when optimal (score on par)', () => {
    const row = buildShareText(input({ stops: 7, parStops: 7, changes: 1, parChanges: 1 })).split(
      '\n',
    )[3]
    expect(row).toBe('🟩🟩🟩🟩🟩')
    expect(row).not.toContain('🟨')
  })

  it('appends an "Optimal!" tag to the result line when on par', () => {
    const text = buildShareText(input({ stops: 7, parStops: 7, changes: 1, parChanges: 1 }))
    expect(text).toContain('Optimal!')
  })

  it('shows fewer green cells as the run runs further over par', () => {
    const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length
    // one point over par (one extra stop) vs three over par.
    const one = buildShareText(input({ stops: 8, parStops: 7 })).split('\n')[3]
    const three = buildShareText(input({ stops: 10, parStops: 7 })).split('\n')[3]
    expect(count(one, '🟩')).toBeGreaterThan(count(three, '🟩'))
  })

  it('counts an extra change as a heavier penalty than an extra stop', () => {
    const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length
    // +1 stop = +1 over par; +1 change = +4 over par. The change should leave
    // strictly fewer green cells.
    const extraStop = buildShareText(input({ stops: 8, parStops: 7 })).split('\n')[3]
    const extraChange = buildShareText(input({ changes: 2, parChanges: 1 })).split('\n')[3]
    expect(count(extraChange, '🟩')).toBeLessThan(count(extraStop, '🟩'))
  })

  it('never emits a red square (green/amber/grey only)', () => {
    for (const over of [0, 1, 2, 3, 5, 9]) {
      const text = buildShareText(input({ stops: 7 + over, parStops: 7 }))
      expect(text).not.toContain('🟥')
      expect(text).not.toContain('🟧')
    }
  })

  it('renders a "Gave up" result with a grey row for an unsolved game', () => {
    const text = buildShareText(input({ solved: false }))
    const lines = text.split('\n')
    expect(lines[1]).toBe('Gave up')
    expect(lines[3]).toBe('⬛⬛⬛⬛⬛')
    expect(text).not.toContain('🟩')
  })
})
