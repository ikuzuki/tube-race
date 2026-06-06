// UI-only geometry helpers. No engine/DOM state; pure functions so they can be
// unit-tested in isolation and reused across map components.
//
// V2 uses a FIXED WORLD projection: every station is projected once into a large,
// stable world-coordinate space (independent of fog or viewport). The map's SVG
// `viewBox` is then a moving window into this world, driven by the follow-camera
// (see hooks/useCamera.ts). Because world coords never change, a station sits in
// the same place whether or not it is currently on screen — panning the camera is
// just moving the viewBox.

import type { Station } from '../engine'

/** A point in world (or SVG user) units. */
export interface Point {
  x: number
  y: number
}

/** Axis-aligned bounds in world units. */
export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** A fixed projection of all stations into a stable world-coordinate space. */
export interface WorldProjection {
  /** Project a station (or any lat/lon) to fixed world coordinates. */
  project(lat: number, lon: number): Point
  /** Total world extent (true aspect ratio preserved). */
  worldWidth: number
  worldHeight: number
  /** Bounds of the projected stations (== {0,0,worldWidth,worldHeight}). */
  bounds: WorldBounds
}

const DEG2RAD = Math.PI / 180

/** Default world width in user units; height follows London's true aspect. */
export const WORLD_WIDTH = 2000

/**
 * Build a fixed world projection covering every station.
 *
 * Longitude is scaled by cos(meanLatitude) before projecting so that, at London's
 * latitude, a degree of longitude and a degree of latitude map to comparable
 * distances (otherwise the map is horizontally stretched). The Y axis is inverted
 * — higher latitude sits higher on screen (smaller y). A single uniform scale is
 * applied to both axes so the map keeps its true aspect ratio; `worldWidth` is
 * fixed (default {@link WORLD_WIDTH}) and `worldHeight` is derived from the data's
 * aspect, so the camera's fixed zoom means the same thing across puzzles.
 *
 * The projection is independent of any viewport — it is the stable "world" the
 * follow-camera pans over.
 */
export function makeWorldProjection(
  stations: Station[],
  worldWidth = WORLD_WIDTH,
): WorldProjection {
  if (stations.length === 0) {
    // Degenerate: nothing to fit. Treat as a 1:1 square; everything maps to centre.
    const centre = worldWidth / 2
    return {
      worldWidth,
      worldHeight: worldWidth,
      bounds: { minX: 0, minY: 0, maxX: worldWidth, maxY: worldWidth },
      project: () => ({ x: centre, y: centre }),
    }
  }

  const meanLat = stations.reduce((sum, s) => sum + s.lat, 0) / stations.length
  const lonScale = Math.cos(meanLat * DEG2RAD)

  // Corrected planar space: X grows with longitude, Y with latitude.
  const xs = stations.map((s) => s.lon * lonScale)
  const ys = stations.map((s) => s.lat)

  const minLonX = Math.min(...xs)
  const maxLonX = Math.max(...xs)
  const minLatY = Math.min(...ys)
  const maxLatY = Math.max(...ys)

  const spanX = maxLonX - minLonX || 1e-9
  const spanY = maxLatY - minLatY || 1e-9

  // One uniform scale so longitude maps to the full requested width; latitude
  // then fills whatever height that scale implies, preserving true aspect.
  const scale = worldWidth / spanX
  const worldHeight = spanY * scale

  return {
    worldWidth,
    worldHeight,
    bounds: { minX: 0, minY: 0, maxX: worldWidth, maxY: worldHeight },
    project(lat: number, lon: number): Point {
      const x = (lon * lonScale - minLonX) * scale
      // Invert Y: max latitude -> top (y = 0).
      const y = (maxLatY - lat) * scale
      return { x, y }
    },
  }
}
