// UI-only geometry + naming helpers. No engine/DOM state; pure functions so they
// can be unit-tested in isolation and reused across map components.

import type { Station } from '../engine'

/** A station's projected position in SVG user units. */
export interface Point {
  x: number
  y: number
}

/** Inputs needed to project lat/lon into a fixed-size SVG viewport. */
export interface Projector {
  /** Project a station (or any lat/lon) to SVG coordinates. */
  project(lat: number, lon: number): Point
  /** The viewport the projection fits into. */
  width: number
  height: number
}

const DEG2RAD = Math.PI / 180

/**
 * Build a projector that fits every station into a `width`×`height` viewport
 * with uniform padding.
 *
 * Longitude is scaled by cos(meanLatitude) before fitting so that, at London's
 * latitude, a degree of longitude and a degree of latitude map to comparable
 * screen distances (otherwise the map is horizontally stretched). The y axis is
 * inverted — higher latitude sits higher on screen. A single uniform scale is
 * used for both axes so the map keeps its true aspect ratio, then the result is
 * centred within the viewport.
 */
export function makeProjector(
  stations: Station[],
  width: number,
  height: number,
  padding = 28,
): Projector {
  if (stations.length === 0) {
    // Degenerate: nothing to fit. Project everything to the centre.
    return {
      width,
      height,
      project: () => ({ x: width / 2, y: height / 2 }),
    }
  }

  const meanLat =
    stations.reduce((sum, s) => sum + s.lat, 0) / stations.length
  const lonScale = Math.cos(meanLat * DEG2RAD)

  // Work in a corrected planar space: X grows with longitude, Y with latitude.
  const xs = stations.map((s) => s.lon * lonScale)
  const ys = stations.map((s) => s.lat)

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const spanX = maxX - minX || 1e-9
  const spanY = maxY - minY || 1e-9

  const availW = Math.max(width - padding * 2, 1)
  const availH = Math.max(height - padding * 2, 1)

  // Uniform scale keeps the true aspect ratio; pick the limiting axis.
  const scale = Math.min(availW / spanX, availH / spanY)

  const drawnW = spanX * scale
  const drawnH = spanY * scale
  // Centre the drawn extent inside the available area.
  const offX = padding + (availW - drawnW) / 2
  const offY = padding + (availH - drawnH) / 2

  return {
    width,
    height,
    project(lat: number, lon: number): Point {
      const px = (lon * lonScale - minX) * scale + offX
      // Invert Y: max latitude -> top (small y).
      const py = (maxY - lat) * scale + offY
      return { x: px, y: py }
    },
  }
}

/**
 * Strip the verbose TfL suffix from a station name for display.
 * "Victoria Underground Station" -> "Victoria", "Euston Station" -> "Euston".
 */
export function displayName(name: string): string {
  return name
    .replace(/\s+Underground Station$/i, '')
    .replace(/\s+Station$/i, '')
    .trim()
}
