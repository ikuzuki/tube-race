// Coarse compass-point word from a bearing, for sighted players beside the
// distance (the dial's aria-label still announces precise degrees). Pure.

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/**
 * The nearest 8-point compass word for a bearing in degrees (0 = north,
 * clockwise). Wraps, so 360 and negative bearings normalise correctly:
 * 337.5..22.5 -> N, 22.5..67.5 -> NE, and so on.
 */
export function compassWord(bearingDeg: number): string {
  const idx = Math.round(((bearingDeg % 360) + 360) / 45) % 8
  return POINTS[idx]
}
