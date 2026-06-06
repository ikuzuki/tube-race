import { describe, expect, it } from 'vitest'
import { makeWorldProjection, WORLD_WIDTH } from './projection'
import type { Station } from '../engine'

function st(id: string, lat: number, lon: number): Station {
  return { id, name: id, lat, lon, lines: [] }
}

describe('makeWorldProjection', () => {
  const stations = [
    st('sw', 51.4, -0.2), // south + west
    st('ne', 51.6, 0.1), // north + east
  ]
  const proj = makeWorldProjection(stations)

  it('inverts latitude: higher lat -> smaller y (higher on screen)', () => {
    const north = proj.project(51.6, 0.0)
    const south = proj.project(51.4, 0.0)
    expect(north.y).toBeLessThan(south.y)
  })

  it('keeps longitude monotonic: greater lon -> greater x', () => {
    const west = proj.project(51.5, -0.2)
    const east = proj.project(51.5, 0.1)
    expect(east.x).toBeGreaterThan(west.x)
  })

  it('fills the fixed world width along longitude', () => {
    expect(proj.worldWidth).toBe(WORLD_WIDTH)
    const west = proj.project(51.5, -0.2)
    const east = proj.project(51.5, 0.1)
    expect(west.x).toBeCloseTo(0)
    expect(east.x).toBeCloseTo(WORLD_WIDTH)
  })

  it('uses one uniform scale on both axes (true aspect, no stretch)', () => {
    // A square delta in cos-corrected lat/lon must map to a square in world
    // units. Compare the x-units-per-corrected-lon to the y-units-per-lat.
    const meanLat = (51.4 + 51.6) / 2
    const lonScale = Math.cos((meanLat * Math.PI) / 180)
    const p0 = proj.project(51.5, -0.1)
    const pLon = proj.project(51.5, -0.1 + 0.01) // +0.01 deg lon
    const pLat = proj.project(51.5 + 0.01, -0.1) // +0.01 deg lat
    const xPerCorrectedLon = (pLon.x - p0.x) / (0.01 * lonScale)
    const yPerLat = Math.abs(pLat.y - p0.y) / 0.01
    expect(xPerCorrectedLon).toBeCloseTo(yPerLat, 3)
  })

  it('reports bounds matching the world extent', () => {
    expect(proj.worldHeight).toBeGreaterThan(0)
    expect(proj.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: proj.worldWidth,
      maxY: proj.worldHeight,
    })
  })

  it('projects world coordinates that are independent of any viewport size', () => {
    // Same station, same projection -> identical world point on every call.
    const a = proj.project(51.5, -0.05)
    const b = proj.project(51.5, -0.05)
    expect(a).toEqual(b)
  })

  it('does not throw on a single-station (degenerate) input', () => {
    const single = makeWorldProjection([st('only', 51.5, -0.1)])
    const p = single.project(51.5, -0.1)
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  })

  it('does not throw on empty input', () => {
    const empty = makeWorldProjection([])
    const p = empty.project(51.5, -0.1)
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  })
})
