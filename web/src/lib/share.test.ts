import { describe, expect, it } from 'vitest'
import {
  buildShareText,
  percentOptimal,
  starRating,
  starString,
  SITE_URL,
  type ShareInput,
} from './share'
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
    expect(percentOptimal(22, 11)).toBe(50)
    expect(percentOptimal(14, 11)).toBe(79)
  })

  it('clamps to [0, 100] and guards bad input', () => {
    expect(percentOptimal(0, 11)).toBe(100)
    expect(percentOptimal(9, 11)).toBe(100)
    expect(percentOptimal(100000, 1)).toBe(0)
  })
})

describe('starRating', () => {
  it('gives 0 stars for an unsolved run', () => {
    expect(starRating(11, 11, false)).toBe(0)
  })

  it('gives 3 stars only for an optimal (par-matching) run', () => {
    expect(starRating(11, 11, true)).toBe(3)
    // A hint adds to the score, pushing it over par -> never 3 stars.
    expect(starRating(14, 11, true)).not.toBe(3)
  })

  it('gives 2 stars for a strong run (>= 80% optimal)', () => {
    // 13 vs 11 -> 85% -> 2 stars.
    expect(starRating(13, 11, true)).toBe(2)
  })

  it('gives 1 star for a solved but weak run', () => {
    // 22 vs 11 -> 50% -> 1 star.
    expect(starRating(22, 11, true)).toBe(1)
  })
})

describe('starString', () => {
  it('renders filled then empty stars out of three', () => {
    expect(starString(3)).toBe('⭐⭐⭐')
    expect(starString(2)).toBe('⭐⭐☆')
    expect(starString(0)).toBe('☆☆☆')
  })

  it('clamps out-of-range input', () => {
    expect(starString(5)).toBe('⭐⭐⭐')
    expect(starString(-1)).toBe('☆☆☆')
  })
})

describe('buildShareText — structure', () => {
  it('puts the date and star rating on the title line', () => {
    const text = buildShareText(input()) // optimal -> 3 stars
    expect(text.split('\n')[0]).toBe('Tube Race 2026-06-06 ⭐⭐⭐')
  })

  it('ends with the site URL', () => {
    const lines = buildShareText(input()).split('\n')
    expect(lines[lines.length - 1]).toBe(SITE_URL)
  })

  it('leads the result line with the weighted score against par (no % text)', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7, changes: 2, parChanges: 1 }))
    // score = 9 + 4*2 = 17, par = 7 + 4*1 = 11.
    expect(text).toContain('Score 17 (best 11)')
    expect(text).not.toContain('% optimal')
  })

  it('keeps a stops·changes breakdown line and the streak', () => {
    const text = buildShareText(input({ stops: 9, parStops: 7, changes: 3, parChanges: 1 }))
    expect(text).toContain('9/7 stops')
    expect(text).toContain('3/1 changes')
    expect(text).toContain('Streak: 3')
  })

  it('renders a "Gave up" result with zero stars', () => {
    const text = buildShareText(input({ solved: false }))
    expect(text.split('\n')[0]).toBe('Tube Race 2026-06-06 ☆☆☆')
    expect(text).toContain('Gave up')
  })

  it('is deterministic for a given input', () => {
    expect(buildShareText(input())).toBe(buildShareText(input()))
  })
})

describe('buildShareText — spoiler-free', () => {
  it('leaks no station names', () => {
    const text = buildShareText(input())
    expect(text).not.toMatch(
      /Victoria|Brixton|Euston|King|Cross|Paddington|Bank|Oxford|Baker|Waterloo/i,
    )
  })

  it('emits no square/emoji grid (stars only)', () => {
    const text = buildShareText(input({ stops: 12, parStops: 7 }))
    expect(text).not.toMatch(/🟩|🟨|⬛|🟥|🟧/)
  })
})
