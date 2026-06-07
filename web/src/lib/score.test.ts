import { describe, expect, it } from 'vitest'
import { AMBER_LIMIT, CHANGE_WEIGHT, deltaTone, points } from './score'

describe('points', () => {
  it('weights a change at CHANGE_WEIGHT stops', () => {
    expect(points(5, 0)).toBe(5)
    expect(points(5, 1)).toBe(5 + CHANGE_WEIGHT)
    expect(points(0, 2)).toBe(2 * CHANGE_WEIGHT)
  })
})

describe('deltaTone', () => {
  it('is good at or under best', () => {
    expect(deltaTone(8, 8, 2)).toBe('good')
    expect(deltaTone(6, 8, 2)).toBe('good')
  })

  it('is warn within the amber limit and bad beyond', () => {
    expect(deltaTone(9, 8, 2)).toBe('warn') // +1
    expect(deltaTone(10, 8, 2)).toBe('warn') // +2 == limit
    expect(deltaTone(11, 8, 2)).toBe('bad') // +3
  })

  it('treats changes strictly: one over is amber, two over is red', () => {
    expect(deltaTone(2, 1, AMBER_LIMIT.changes)).toBe('warn')
    expect(deltaTone(3, 1, AMBER_LIMIT.changes)).toBe('bad')
  })

  it('scales the score limit with the best, with a floor', () => {
    expect(AMBER_LIMIT.score(20)).toBe(10)
    expect(AMBER_LIMIT.score(2)).toBe(2) // floor
  })
})
