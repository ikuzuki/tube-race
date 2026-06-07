// A tiny dependency-free confetti burst for the result card. Spawns `count`
// paper flecks from the top of its positioned parent, lets gravity pull them
// down while they spin and fade, then stops after a short run. Canvas-based so
// it never reflows the layout; pointer-events-none so it never blocks the card.
// The caller decides whether to render it at all (it should be omitted under
// prefers-reduced-motion), so this component always animates when mounted.

import { useEffect, useRef } from 'react'

interface ConfettiProps {
  /** Number of flecks to spawn. More for a stronger (optimal-run) celebration. */
  count: number
}

/** Roundel-ish palette: progress green plus a few line colours. */
const COLOURS = ['#1ea672', '#34d399', '#f5a524', '#e32017', '#0098d4', '#ffd300', '#9b0056']

const DURATION_MS = 1300

interface Fleck {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  size: number
  colour: string
}

export default function Confetti({ count }: ConfettiProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / unsupported: no-op rather than throw
    const parent = canvas.parentElement
    const w = (canvas.width = parent?.clientWidth || 360)
    const h = (canvas.height = parent?.clientHeight || 480)

    // Burst from across the top, fired up and out; gravity does the rest.
    const flecks: Fleck[] = Array.from({ length: count }, () => ({
      x: w * (0.2 + Math.random() * 0.6),
      y: -10,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 5 + 4,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    }))

    let raf = 0
    let start: number | null = null
    const gravity = 0.16

    const tick = (t: number): void => {
      if (start === null) start = t
      const elapsed = t - start
      const fade = Math.max(0, 1 - elapsed / DURATION_MS)
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = fade
      for (const f of flecks) {
        f.vy += gravity
        f.x += f.vx
        f.y += f.vy
        f.rot += f.vrot
        ctx.save()
        ctx.translate(f.x, f.y)
        ctx.rotate(f.rot)
        ctx.fillStyle = f.colour
        ctx.fillRect(-f.size / 2, -f.size / 2, f.size, f.size * 0.6)
        ctx.restore()
      }
      ctx.globalAlpha = 1
      if (elapsed < DURATION_MS) {
        raf = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, w, h)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [count])

  return (
    <canvas ref={ref} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
  )
}
