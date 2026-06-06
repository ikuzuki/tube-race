import { describe, expect, it } from 'vitest'
import {
  clamp,
  clampZoom,
  computeViewBox,
  easeCam,
  isPointInViewBox,
  lerpViewBox,
  viewBoxEdgePoint,
  viewBoxString,
  MIN_ZOOM,
  MAX_ZOOM,
  type ViewBox,
} from './useCamera'

describe('clamp / clampZoom', () => {
  it('clamps to the given range', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })

  it('clampZoom enforces MIN/MAX', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(1)).toBe(1)
  })
})

describe('computeViewBox', () => {
  const centre = { x: 1000, y: 500 }

  it('centres the window on the given point', () => {
    const vb = computeViewBox(centre, 1, 200, 1)
    expect(vb.x + vb.w / 2).toBeCloseTo(centre.x)
    expect(vb.y + vb.h / 2).toBeCloseTo(centre.y)
  })

  it('zooming in shrinks the visible window', () => {
    const out = computeViewBox(centre, 1, 200, 1)
    const inn = computeViewBox(centre, 2, 200, 1)
    expect(inn.w).toBeLessThan(out.w)
    expect(inn.w).toBeCloseTo(out.w / 2)
  })

  it('derives height from aspect so the projection is not distorted', () => {
    const vb = computeViewBox(centre, 1, 200, 2) // 2:1 wide container
    expect(vb.w / vb.h).toBeCloseTo(2)
  })

  it('falls back to square when aspect is invalid', () => {
    const vb = computeViewBox(centre, 1, 200, 0)
    expect(vb.w).toBeCloseTo(vb.h)
  })

  it('respects the zoom clamp', () => {
    const tooFar = computeViewBox(centre, 1000, 200, 1)
    const atMax = computeViewBox(centre, MAX_ZOOM, 200, 1)
    expect(tooFar.w).toBeCloseTo(atMax.w)
  })
})

describe('viewBoxString', () => {
  it('serialises in SVG order', () => {
    expect(viewBoxString({ x: 1, y: 2, w: 3, h: 4 })).toBe('1 2 3 4')
  })
})

describe('isPointInViewBox', () => {
  const vb: ViewBox = { x: 0, y: 0, w: 100, h: 100 }

  it('detects inside / outside', () => {
    expect(isPointInViewBox({ x: 50, y: 50 }, vb)).toBe(true)
    expect(isPointInViewBox({ x: 150, y: 50 }, vb)).toBe(false)
    expect(isPointInViewBox({ x: -1, y: 50 }, vb)).toBe(false)
  })

  it('honours an inset margin', () => {
    expect(isPointInViewBox({ x: 5, y: 50 }, vb, 10)).toBe(false)
    expect(isPointInViewBox({ x: 50, y: 50 }, vb, 10)).toBe(true)
  })
})

describe('lerpViewBox', () => {
  const a: ViewBox = { x: 0, y: 0, w: 10, h: 10 }
  const b: ViewBox = { x: 100, y: 200, w: 20, h: 20 }

  it('returns endpoints at t=0 and t=1', () => {
    expect(lerpViewBox(a, b, 0)).toEqual(a)
    expect(lerpViewBox(a, b, 1)).toEqual(b)
  })

  it('interpolates the midpoint', () => {
    const m = lerpViewBox(a, b, 0.5)
    expect(m.x).toBeCloseTo(50)
    expect(m.y).toBeCloseTo(100)
    expect(m.w).toBeCloseTo(15)
  })
})

describe('easeCam', () => {
  it('pins the endpoints', () => {
    expect(easeCam(0)).toBeCloseTo(0)
    expect(easeCam(1)).toBeCloseTo(1)
  })

  it('is monotonic and overshoot-free within [0,1]', () => {
    let prev = -Infinity
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeCam(t)
      expect(v).toBeGreaterThanOrEqual(-1e-6)
      expect(v).toBeLessThanOrEqual(1 + 1e-6)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
  })

  it('eases out (fast then slow): past halfway by t=0.5', () => {
    expect(easeCam(0.5)).toBeGreaterThan(0.5)
  })
})

describe('viewBoxEdgePoint', () => {
  const vb: ViewBox = { x: 0, y: 0, w: 100, h: 100 } // centre (50,50)

  it('lands on the right edge for a target due east', () => {
    const { point, angleDeg } = viewBoxEdgePoint({ x: 500, y: 50 }, vb)
    expect(point.x).toBeCloseTo(100)
    expect(point.y).toBeCloseTo(50)
    expect(angleDeg).toBeCloseTo(0)
  })

  it('lands on the bottom edge for a target due south (screen y grows down)', () => {
    const { point, angleDeg } = viewBoxEdgePoint({ x: 50, y: 500 }, vb)
    expect(point.y).toBeCloseTo(100)
    expect(point.x).toBeCloseTo(50)
    expect(angleDeg).toBeCloseTo(90)
  })

  it('pulls the point inside the rim when inset is given', () => {
    const { point } = viewBoxEdgePoint({ x: 500, y: 50 }, vb, 10)
    expect(point.x).toBeLessThan(100)
    expect(point.x).toBeCloseTo(90)
  })
})
