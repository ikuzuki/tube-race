import { describe, expect, it } from 'vitest'
import { buildShareText, type ShareInput } from './share'

function input(over: Partial<ShareInput> = {}): ShareInput {
  return {
    dateISO: '2026-06-06',
    solved: true,
    stops: 7,
    parStops: 7,
    changes: 1,
    parChanges: 1,
    streak: 3,
    ...over,
  }
}

describe('buildShareText — structure', () => {
  it('produces a four-line block: title, result, squares, streak', () => {
    const lines = buildShareText(input()).split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('Tube Race 2026-06-06')
    expect(lines[3]).toBe('Streak: 3')
  })

  it('includes the date and the stops figures', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7 }))
    expect(text).toContain('2026-06-06')
    expect(text).toContain('9/7 stops')
  })

  it('includes the changes figures', () => {
    const text = buildShareText(input({ changes: 3, parChanges: 1 }))
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
    const allowedWords = /Tube|Race|stops|changes|Optimal|Streak|Gave|up/g
    const stripped = text.replace(allowedWords, '').replace(/[0-9/:·\s🟩🟨⬛.-]/g, '')
    expect(stripped).toBe('')
  })
})

describe('buildShareText — square row reflects closeness to optimal', () => {
  it('is all green when optimal (no stops over par)', () => {
    const row = buildShareText(input({ stops: 7, parStops: 7 })).split('\n')[2]
    expect(row).toBe('🟩🟩🟩🟩🟩')
    expect(row).not.toContain('🟨')
  })

  it('appends an "Optimal!" tag to the result line when on par', () => {
    const text = buildShareText(input({ stops: 7, parStops: 7 }))
    expect(text).toContain('Optimal!')
  })

  it('shows fewer green cells as the run runs further over par', () => {
    const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length
    const one = buildShareText(input({ stops: 8, parStops: 7 })).split('\n')[2]
    const three = buildShareText(input({ stops: 10, parStops: 7 })).split('\n')[2]
    expect(count(one, '🟩')).toBeGreaterThan(count(three, '🟩'))
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
    expect(lines[2]).toBe('⬛⬛⬛⬛⬛')
    expect(text).not.toContain('🟩')
  })
})
