import { describe, expect, it } from 'vitest'
import { makeProjector, displayName } from './projection'
import type { Station } from '../engine'

function st(id: string, lat: number, lon: number): Station {
  return { id, name: id, lat, lon, lines: [] }
}

describe('displayName', () => {
  it('strips the " Underground Station" suffix', () => {
    expect(displayName('Victoria Underground Station')).toBe('Victoria')
  })

  it('strips a bare " Station" suffix', () => {
    expect(displayName('Euston Station')).toBe('Euston')
  })

  it('leaves a clean name untouched', () => {
    expect(displayName("King's Cross St. Pancras")).toBe(
      "King's Cross St. Pancras",
    )
  })
})

describe('makeProjector', () => {
  const stations = [
    st('sw', 51.40, -0.20), // south + west
    st('ne', 51.60, 0.10), // north + east
  ]
  const proj = makeProjector(stations, 800, 600, 20)

  it('inverts latitude: higher lat -> smaller y (higher on screen)', () => {
    const north = proj.project(51.60, 0.0)
    const south = proj.project(51.40, 0.0)
    expect(north.y).toBeLessThan(south.y)
  })

  it('keeps longitude monotonic: greater lon -> greater x', () => {
    const west = proj.project(51.5, -0.20)
    const east = proj.project(51.5, 0.10)
    expect(east.x).toBeGreaterThan(west.x)
  })

  it('keeps every projected point within the viewport', () => {
    for (const s of stations) {
      const p = proj.project(s.lat, s.lon)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(800)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(600)
    }
  })

  it('does not throw on a single-station (degenerate) input', () => {
    const single = makeProjector([st('only', 51.5, -0.1)], 100, 100)
    const p = single.project(51.5, -0.1)
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  })
})
