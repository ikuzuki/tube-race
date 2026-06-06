// Seeded pseudo-random number generation for the engine.
//
// Determinism is mandatory (see SPEC.md): the engine never calls Date.now() or
// Math.random(). All randomness derives from a string seed (the ISO date),
// hashed with cyrb53 and fed into a mulberry32 generator.

/**
 * cyrb53 string hash. Produces a well-distributed 53-bit integer from a string.
 * Public-domain algorithm (bryc). Used to turn a date string into a numeric seed.
 */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/**
 * mulberry32 PRNG. Returns a generator producing floats in [0, 1).
 * Deterministic for a given 32-bit integer seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Build a seeded float generator from an arbitrary string seed.
 * Same string => identical sequence.
 */
export function seededRng(seedStr: string): () => number {
  return mulberry32(cyrb53(seedStr))
}

/** Integer in [0, max) drawn from the supplied generator. */
export function randInt(rng: () => number, max: number): number {
  return Math.floor(rng() * max)
}
