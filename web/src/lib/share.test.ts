import { describe, expect, it } from 'vitest'
import { buildShareText, percentOptimal, type ShareInput } from './share'
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

describe('percentOptimal', () => {
  it('is 100 for an optimal run (score equals best)', () => {
    expect(percentOptimal(11, 11)).toBe(100)
  })

  it('falls below 100 as the score runs over best', () => {
    // 22 vs best 11 -> half as good -> 50%.
    expect(percentOptimal(22, 11)).toBe(50)
    // 14 vs best 11 -> round(11/14*100) = 79.
    expect(percentOptimal(14, 11)).toBe(79)
  })

  it('clamps to [0, 100] and guards bad input', () => {
    expect(percentOptimal(0, 11)).toBe(100) // non-positive score
    expect(percentOptimal(9, 11)).toBe(100) // sub-par cannot happen, reads 100
    expect(percentOptimal(100000, 1)).toBe(0)
  })
})

describe('buildShareText — structure', () => {
  it('produces a four-line block: title, result, breakdown, streak', () => {
    const lines = buildShareText(input()).split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('Tube Race 2026-06-06')
    expect(lines[3]).toBe('Streak: 3')
  })

  it('leads the result line with the weighted score and % optimal', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7, changes: 2, parChanges: 1 }))
    expect(text).toContain('2026-06-06')
    // score = 9 + 4*2 = 17, par = 7 + 4*1 = 11, 11/17 -> 65%.
    expect(text).toContain('Score 17 (best 11), 65% optimal')
  })

  it('reads 100% optimal on an optimal run', () => {
    const text = buildShareText(input({ stops: 7, parStops: 7, changes: 1, parChanges: 1 }))
    expect(text).toContain('100% optimal')
  })

  it('keeps a stops·changes breakdown line', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7, changes: 3, parChanges: 1 }))
    expect(text).toContain('9/7 stops')
    expect(text).toContain('3/1 changes')
  })

  it('is deterministic for a given input', () => {
    expect(buildShareText(input())).toBe(buildShareText(input()))
  })

  it('renders a "Gave up" result for an unsolved game with no percentage', () => {
    const text = buildShareText(input({ solved: false }))
    const lines = text.split('\n')
    expect(lines[1]).toBe('Gave up')
    expect(text).not.toContain('% optimal')
  })
})

describe('buildShareText — spoiler-free', () => {
  it('leaks no station names', () => {
    const text = buildShareText(input())
    expect(text).not.toMatch(
      /Victoria|Brixton|Euston|King|Cross|Paddington|Bank|Oxford|Baker|Waterloo/i,
    )
  })

  it('contains only the title, numbers and fixed template words — no route', () => {
    const text = buildShareText(input({ stops: 8, parStops: 6 }))
    const allowedWords = /Tube|Race|Score|best|optimal|stops|changes|Streak|Gave|up/g
    const stripped = text.replace(allowedWords, '').replace(/[0-9/:·(),%\s.-]/g, '')
    expect(stripped).toBe('')
  })

  it('emits no square/emoji grid', () => {
    const text = buildShareText(input({ stops: 12, parStops: 7 }))
    expect(text).not.toMatch(/🟩|🟨|⬛|🟥|🟧/)
  })
})
