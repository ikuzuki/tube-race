// Follow-camera for the Playfield map.
//
// The map renders all stations into a fixed world-coordinate space
// (lib/projection.ts). The SVG `viewBox` is a moving window into that world,
// centred on the player's current station at a fixed zoom that frames the local
// neighbourhood. When the centre changes, the viewBox is animated from old to new
// over a short ease (interruptible). All the geometry is pure and lives in the
// exported helpers below; the hook only owns React/rAF lifecycle.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point } from '../lib/projection'

/** A camera window in world units: top-left (x,y) plus width/height. */
export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** Fraction of the world width visible across the viewport at zoom = 1. */
export const BASE_VIEW_FRACTION = 0.12

/** Zoom is clamped to this range. >1 = zoomed in (smaller window). */
export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 3.5

/** Camera animation duration (ms) and easing — matches --ease-cam in index.css. */
export const CAMERA_MS = 400

/** clamp helper. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Clamp a zoom level to the allowed range. */
export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM)
}

/**
 * Compute the viewBox for a given world centre, zoom and pixel aspect ratio.
 *
 * `baseWidth` is the world width visible at zoom 1 (see {@link BASE_VIEW_FRACTION}).
 * The visible width shrinks as zoom grows; the visible height is derived from
 * `aspect` (= container pixel width / height) so the projection is never
 * distorted. The window is centred on `centre`.
 */
export function computeViewBox(
  centre: Point,
  zoom: number,
  baseWidth: number,
  aspect: number,
): ViewBox {
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
  const w = baseWidth / clampZoom(zoom)
  const h = w / safeAspect
  return {
    x: centre.x - w / 2,
    y: centre.y - h / 2,
    w,
    h,
  }
}

/** Serialise a viewBox to the SVG `viewBox` attribute string. */
export function viewBoxString(vb: ViewBox): string {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`
}

/** Is a world point inside the viewBox (optionally inset by `margin` units)? */
export function isPointInViewBox(p: Point, vb: ViewBox, margin = 0): boolean {
  return (
    p.x >= vb.x + margin &&
    p.x <= vb.x + vb.w - margin &&
    p.y >= vb.y + margin &&
    p.y <= vb.y + vb.h - margin
  )
}

/** Cubic-bezier(.22,1,.36,1) — the --ease-cam curve, evaluated at t in [0,1]. */
export function easeCam(t: number): number {
  return cubicBezier(0.22, 1, 0.36, 1, clamp(t, 0, 1))
}

/** Linear interpolation between two viewBoxes. */
export function lerpViewBox(a: ViewBox, b: ViewBox, t: number): ViewBox {
  const k = clamp(t, 0, 1)
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    w: a.w + (b.w - a.w) * k,
    h: a.h + (b.h - a.h) * k,
  }
}

/**
 * Where a ray from the viewBox centre toward `target` (a world point outside the
 * box) crosses the viewBox edge, returned in world units, plus the side it hits.
 * Used to pin the off-screen target arrow to the viewport rim.
 */
export function viewBoxEdgePoint(
  target: Point,
  vb: ViewBox,
  inset = 0,
): { point: Point; angleDeg: number } {
  const cx = vb.x + vb.w / 2
  const cy = vb.y + vb.h / 2
  const dx = target.x - cx
  const dy = target.y - cy
  // Half-extents, pulled in by `inset` so the marker sits just inside the rim.
  const hx = Math.max(vb.w / 2 - inset, 1e-6)
  const hy = Math.max(vb.h / 2 - inset, 1e-6)

  // Scale the direction vector to the nearest box edge.
  const scaleX = dx !== 0 ? hx / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? hy / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)

  const point = { x: cx + dx * scale, y: cy + dy * scale }
  // Screen angle: y grows downward, 0deg points right (SVG convention).
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  return { point, angleDeg }
}

/** Cubic-bezier solver for the (0,0)->(1,1) curve with control points (x1,y1),(x2,y2). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Solve for the parametric s where bezierX(s) == t, then return bezierY(s).
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by

  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const sampleDX = (s: number) => (3 * ax * s + 2 * bx) * s + cx

  // Newton-Raphson, falling back to bisection.
  let s = t
  for (let i = 0; i < 8; i++) {
    const x = sampleX(s) - t
    const d = sampleDX(s)
    if (Math.abs(x) < 1e-6) return sampleY(s)
    if (Math.abs(d) < 1e-6) break
    s -= x / d
  }
  let lo = 0
  let hi = 1
  s = t
  while (lo < hi) {
    const x = sampleX(s)
    if (Math.abs(x - t) < 1e-6) break
    if (x < t) lo = s
    else hi = s
    s = (lo + hi) / 2
  }
  return sampleY(s)
}

export interface UseCameraResult {
  /** Current viewBox as an SVG attribute string. */
  viewBox: string
  /** Current viewBox object (for hit-testing the off-screen target etc.). */
  viewBoxObj: ViewBox
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  /** Multiply zoom by a factor (wheel/pinch), clamped. */
  zoomBy: (factor: number) => void
  /** Snap the camera back onto the current centre at the current zoom. */
  recenter: () => void
}

interface UseCameraOptions {
  /** World point to keep centred (typically the current station). */
  centre: Point
  /** A value that changes when the centre should re-animate (e.g. currentId). */
  centreKey: string
  /** Total world width (from the projection), used to size the base window. */
  worldWidth: number
  /** Container aspect ratio (pixel width / height). */
  aspect: number
  /** Optional initial zoom. */
  initialZoom?: number
}

/**
 * Follow-camera hook. Keeps `centre` framed at a fixed-ish zoom and animates the
 * viewBox whenever `centreKey` changes, over {@link CAMERA_MS} using
 * {@link easeCam}. The animation is interruptible: a new target mid-flight starts
 * a fresh ease from wherever the camera currently is.
 */
export function useCamera({
  centre,
  centreKey,
  worldWidth,
  aspect,
  initialZoom = 1,
}: UseCameraOptions): UseCameraResult {
  const baseWidth = worldWidth * BASE_VIEW_FRACTION
  const [zoom, setZoom] = useState(() => clampZoom(initialZoom))

  // The viewBox we render. Initialised on the first centre.
  const [viewBoxObj, setViewBoxObj] = useState<ViewBox>(() =>
    computeViewBox(centre, clampZoom(initialZoom), baseWidth, aspect),
  )

  const rafRef = useRef<number | null>(null)
  const fromRef = useRef<ViewBox>(viewBoxObj)
  const currentRef = useRef<ViewBox>(viewBoxObj)
  currentRef.current = viewBoxObj

  const animateTo = useCallback((target: ViewBox) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    fromRef.current = currentRef.current
    const start =
      typeof performance !== 'undefined' ? performance.now() : Date.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const t = CAMERA_MS > 0 ? elapsed / CAMERA_MS : 1
      if (t >= 1) {
        setViewBoxObj(target)
        rafRef.current = null
        return
      }
      setViewBoxObj(lerpViewBox(fromRef.current, target, easeCam(t)))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Re-aim the camera whenever the centre identity or zoom/aspect changes.
  // Centre-key change => animate; zoom/aspect change => follow smoothly too.
  useEffect(() => {
    const target = computeViewBox(centre, zoom, baseWidth, aspect)
    animateTo(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey, zoom, baseWidth, aspect, animateTo])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => clampZoom(z * factor))
  }, [])
  const zoomIn = useCallback(() => zoomBy(1.3), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / 1.3), [zoomBy])
  const recenter = useCallback(() => {
    animateTo(computeViewBox(centre, zoom, baseWidth, aspect))
  }, [animateTo, centre, zoom, baseWidth, aspect])

  return {
    viewBox: viewBoxString(viewBoxObj),
    viewBoxObj,
    zoom,
    zoomIn,
    zoomOut,
    zoomBy,
    recenter,
  }
}
