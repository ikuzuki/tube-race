import { describe, expect, it } from 'vitest'
import { cyrb53, mulberry32, randInt, seededRng } from './rng'

describe('rng', () => {
  it('cyrb53 is deterministic and differs across inputs', () => {
    expect(cyrb53('2026-06-06')).toBe(cyrb53('2026-06-06'))
    expect(cyrb53('2026-06-06')).not.toBe(cyrb53('2026-06-07'))
  })

  it('mulberry32 produces a deterministic sequence for a seed', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('mulberry32 outputs floats in [0, 1)', () => {
    const gen = mulberry32(98765)
    for (let i = 0; i < 1000; i++) {
      const v = gen()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('seededRng gives identical streams for identical seed strings', () => {
    const r1 = seededRng('hello')
    const r2 = seededRng('hello')
    const r3 = seededRng('world')
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
    // Very unlikely to collide on the first draw for different seeds.
    expect(seededRng('hello')()).not.toBe(seededRng('world')())
    void r3
  })

  it('randInt stays within [0, max)', () => {
    const gen = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const v = randInt(gen, 22)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(22)
    }
  })
})
