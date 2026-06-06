// PlayfieldMap — the fog-of-war Tube map with a follow-camera.
//
// All stations are projected once into a fixed world space (lib/projection). The
// SVG viewBox is a window into that world, centred on the player's current
// station at a fixed zoom (hooks/useCamera) and animated as they move. This file
// is presentational + camera only: it consumes engine `state` and calls `onMove`;
// it never mutates engine state, fetches data, or touches storage/routing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type {
  Adjacency,
  GameState,
  Neighbour,
  Station,
  TubeGraph,
} from '../engine'
import { compass } from '../engine'
import { displayName } from '../lib/format'
import { lineColour as themeLineColour, lineTextColour } from '../theme'
import {
  makeWorldProjection,
  type Point,
  type WorldProjection,
} from '../lib/projection'
import {
  isPointInViewBox,
  useCamera,
  viewBoxEdgePoint,
  type ViewBox,
} from '../hooks/useCamera'

export interface PlayfieldMapProps {
  graph: TubeGraph
  adj: Adjacency
  /** Engine GameState: currentId, path, revealed, changes, solved, puzzle. */
  state: GameState
  /** One entry per (station, line) reachable in one hop. */
  legalMoves: Neighbour[]
  /** Line the player arrived on = state.path.at(-1)?.line ?? null. */
  currentLine: string | null
  targetId: string
  stationsById: Map<string, Station>
  onMove: (to: Neighbour) => void
  className?: string
}

// --- sizing, all expressed as a fraction of the visible view width so that
// nodes / strokes / labels keep a constant ON-SCREEN size at any zoom level. ---
const NODE_R = 0.02
const CURRENT_R = 0.03
const CONTINUE_R = 0.032
const SWITCH_R = 0.018
const EDGE_W = 0.006
const TRAIL_W = 0.012
const LABEL_SIZE = 0.026

/** Resolve a line's colour from the graph, falling back to the theme palette. */
function useLineColour(graph: TubeGraph) {
  return useMemo(() => {
    const byId = new Map(graph.lines.map((l) => [l.id, l.colour]))
    return (lineId: string) => byId.get(lineId) ?? themeLineColour(lineId)
  }, [graph])
}

/** Container aspect ratio (w/h) tracked via ResizeObserver. */
function useAspect(ref: React.RefObject<HTMLElement | null>): number {
  const [aspect, setAspect] = useState(1.4)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return aspect
}

interface RenderEdge {
  key: string
  from: Point
  to: Point
  colour: string
}

export default function PlayfieldMap({
  graph,
  adj,
  state,
  legalMoves,
  currentLine,
  targetId,
  stationsById,
  onMove,
  className,
}: PlayfieldMapProps) {
  // `adj` is part of the orchestrator contract; the map derives edges from
  // `graph.edges` and consumes pre-computed `legalMoves`, so it isn't read here.
  void adj

  const containerRef = useRef<HTMLDivElement>(null)
  const aspect = useAspect(containerRef)
  const colourOf = useLineColour(graph)

  // Fixed world projection over ALL stations — stable regardless of fog.
  const proj: WorldProjection = useMemo(
    () => makeWorldProjection(graph.stations),
    [graph.stations],
  )

  // World position of any station id (falls back to world centre if unknown).
  const worldOf = useCallback(
    (id: string): Point => {
      const s = stationsById.get(id)
      if (!s) return { x: proj.worldWidth / 2, y: proj.worldHeight / 2 }
      return proj.project(s.lat, s.lon)
    },
    [proj, stationsById],
  )

  const currentPos = worldOf(state.currentId)

  const camera = useCamera({
    centre: currentPos,
    centreKey: state.currentId,
    worldWidth: proj.worldWidth,
    aspect,
  })
  const vb = camera.viewBoxObj

  // Visible-width-relative sizing so on-screen sizes stay constant across zoom.
  const u = vb.w
  const r = {
    node: NODE_R * u,
    current: CURRENT_R * u,
    continue: CONTINUE_R * u,
    switch: SWITCH_R * u,
    edge: EDGE_W * u,
    trail: TRAIL_W * u,
    label: LABEL_SIZE * u,
  }

  // --- Pending line-switch confirmation. Cleared on move / current change. ---
  const [pendingSwitch, setPendingSwitch] = useState<Neighbour | null>(null)
  useEffect(() => {
    setPendingSwitch(null)
  }, [state.currentId])

  const commitMove = useCallback(
    (to: Neighbour) => {
      setPendingSwitch(null)
      onMove(to)
    },
    [onMove],
  )

  // Classify legal moves. Continuation = same line as arrival (or the very first
  // move, when currentLine is null). These are the bright one-tap defaults.
  const moveClass = useMemo(() => {
    const continueSet = new Set<string>()
    const switchSet = new Set<string>()
    const byStation = new Map<string, Neighbour[]>()
    for (const m of legalMoves) {
      const isContinue = currentLine === null || m.line === currentLine
      ;(isContinue ? continueSet : switchSet).add(m.stationId)
      const arr = byStation.get(m.stationId) ?? []
      arr.push(m)
      byStation.set(m.stationId, arr)
    }
    // A station is a "switch-only" target if NO continuation edge reaches it.
    for (const id of continueSet) switchSet.delete(id)
    return { continueSet, switchSet, byStation }
  }, [legalMoves, currentLine])

  // --- Edges: only when BOTH endpoints are revealed. ---
  const edges: RenderEdge[] = useMemo(() => {
    const out: RenderEdge[] = []
    for (let i = 0; i < graph.edges.length; i++) {
      const e = graph.edges[i]
      if (!state.revealed.has(e.from) || !state.revealed.has(e.to)) continue
      out.push({
        key: `${e.from}:${e.to}:${e.line}:${i}`,
        from: worldOf(e.from),
        to: worldOf(e.to),
        colour: colourOf(e.line),
      })
    }
    return out
  }, [graph.edges, state.revealed, worldOf, colourOf])

  // --- Visited trail: segment the travelled path by the line used per hop. ---
  const trailSegments = useMemo(() => {
    const segs: { key: string; from: Point; to: Point; colour: string }[] = []
    let prevId = state.startId
    state.path.forEach((mv, i) => {
      segs.push({
        key: `trail:${i}:${mv.stationId}`,
        from: worldOf(prevId),
        to: worldOf(mv.stationId),
        colour: colourOf(mv.line),
      })
      prevId = mv.stationId
    })
    return segs
  }, [state.path, state.startId, worldOf, colourOf])

  // --- Revealed stations to draw. ---
  const revealedStations = useMemo(
    () => [...state.revealed].map((id) => stationsById.get(id)).filter(Boolean) as Station[],
    [state.revealed, stationsById],
  )

  // Set membership for fast lookups while rendering.
  const legalStationIds = moveClass.byStation

  // --- Target: compass + on/off-screen treatment. ---
  const targetPos = worldOf(targetId)
  const targetOnScreen = isPointInViewBox(targetPos, vb, r.current)
  const targetAdjacent = legalStationIds.has(targetId)
  const compassToTarget = useMemo(() => {
    if (state.currentId === targetId) return { bearingDeg: 0, km: 0 }
    try {
      return compass(graph, state.currentId, targetId)
    } catch {
      return { bearingDeg: 0, km: 0 }
    }
  }, [graph, state.currentId, targetId])

  // --- Labels with greedy collision avoidance. ---
  const labels = useMemo(
    () =>
      computeLabels({
        state,
        targetId,
        legalStationIds,
        stationsById,
        worldOf,
        vb,
        labelSize: r.label,
      }),
    [state, targetId, legalStationIds, stationsById, worldOf, vb, r.label],
  )

  // Wheel zoom (clamped). Attached natively as a NON-passive listener so
  // preventDefault() is honoured — React's onWheel is passive, which both logs an
  // error and fails to stop the page scrolling. A ref keeps the latest camera so
  // the listener is bound once.
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      cameraRef.current.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  return (
    <div
      ref={containerRef}
      className={clsx('relative h-full w-full overflow-hidden bg-map', className)}
    >
      <svg
        className="h-full w-full touch-none select-none"
        viewBox={camera.viewBox}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Tube map"
        onClick={() => setPendingSwitch(null)}
      >
        {/* Edges (fogged network) */}
        <g>
          {edges.map((e) => (
            <line
              key={e.key}
              x1={e.from.x}
              y1={e.from.y}
              x2={e.to.x}
              y2={e.to.y}
              stroke={e.colour}
              strokeWidth={r.edge}
              strokeLinecap="round"
              opacity={0.55}
            />
          ))}
        </g>

        {/* Visited trail, brighter and thicker, on top of edges */}
        <g>
          {trailSegments.map((s) => (
            <line
              key={s.key}
              x1={s.from.x}
              y1={s.from.y}
              x2={s.to.x}
              y2={s.to.y}
              stroke={s.colour}
              strokeWidth={r.trail}
              strokeLinecap="round"
              opacity={0.95}
            />
          ))}
        </g>

        {/* Stations */}
        <g>
          {revealedStations.map((s) => {
            const p = proj.project(s.lat, s.lon)
            const isCurrent = s.id === state.currentId
            const isStart = s.id === state.startId
            const moves = legalStationIds.get(s.id)
            const isContinue = moveClass.continueSet.has(s.id)
            const isSwitch = moveClass.switchSet.has(s.id)
            return (
              <StationNode
                key={s.id}
                name={displayName(s.name)}
                x={p.x}
                y={p.y}
                isCurrent={isCurrent}
                isStart={isStart}
                isContinue={isContinue}
                isSwitch={isSwitch}
                isInterchange={s.lines.length > 1}
                moves={moves}
                currentLine={currentLine}
                colourOf={colourOf}
                r={r}
                pending={pendingSwitch}
                onContinue={(m) => commitMove(m)}
                onRequestSwitch={(m) => setPendingSwitch(m)}
              />
            )
          })}
        </g>

        {/* On-screen target marker (decorative; never blocks the node click) */}
        {targetOnScreen && (
          <TargetFlag
            x={targetPos.x}
            y={targetPos.y}
            r={r.current}
            reached={state.solved}
          />
        )}

        {/* Labels */}
        <g>
          {labels.map((l) => (
            <MapLabel key={l.id} label={l} fontSize={r.label} />
          ))}
        </g>
      </svg>

      {/* Off-screen target compass arrow, pinned to the viewport rim */}
      {!targetOnScreen && !targetAdjacent && (
        <EdgeCompass
          vb={vb}
          targetPos={targetPos}
          km={compassToTarget.km}
          containerRef={containerRef}
        />
      )}

      {/* Pending line-change confirm chip (HTML overlay, easy to tap) */}
      {pendingSwitch && (
        <SwitchConfirm
          neighbour={pendingSwitch}
          lineName={graph.lines.find((l) => l.id === pendingSwitch.line)?.name ?? pendingSwitch.line}
          colour={colourOf(pendingSwitch.line)}
          onConfirm={() => commitMove(pendingSwitch)}
          onCancel={() => setPendingSwitch(null)}
        />
      )}

      {/* Controls */}
      <MapControls
        onZoomIn={camera.zoomIn}
        onZoomOut={camera.zoomOut}
        onRecenter={camera.recenter}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Station node
// ---------------------------------------------------------------------------

interface NodeRadii {
  node: number
  current: number
  continue: number
  switch: number
  edge: number
  trail: number
  label: number
}

interface StationNodeProps {
  name: string
  x: number
  y: number
  isCurrent: boolean
  isStart: boolean
  isContinue: boolean
  isSwitch: boolean
  isInterchange: boolean
  moves?: Neighbour[]
  currentLine: string | null
  colourOf: (lineId: string) => string
  r: NodeRadii
  pending: Neighbour | null
  onContinue: (m: Neighbour) => void
  onRequestSwitch: (m: Neighbour) => void
}

function StationNode({
  name,
  x,
  y,
  isCurrent,
  isStart,
  isContinue,
  isSwitch,
  isInterchange,
  moves,
  currentLine,
  colourOf,
  r,
  pending,
  onContinue,
  onRequestSwitch,
}: StationNodeProps) {
  // Default move to apply: prefer a continuation edge; else the first edge.
  const continueMove = moves?.find((m) => currentLine === null || m.line === currentLine)
  const anyMove = moves?.[0]
  const lineForColour = continueMove?.line ?? anyMove?.line

  const handleClick = (e: React.MouseEvent) => {
    if (!moves || moves.length === 0) return
    e.stopPropagation()
    if (isContinue && continueMove) {
      onContinue(continueMove)
    } else if (isSwitch && anyMove) {
      // Deliberate: arm the confirm chip rather than committing immediately.
      onRequestSwitch(anyMove)
    }
  }

  const isPending =
    pending != null &&
    (moves?.some((m) => m.line === pending.line && m.stationId === pending.stationId) ?? false)

  // Current station: prominent teal node + pulsing ring.
  if (isCurrent) {
    return (
      <g style={reveal()}>
        <circle
          cx={x}
          cy={y}
          r={r.current * 1.9}
          fill="none"
          stroke="var(--color-progress-ring)"
          strokeWidth={r.edge}
          style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'pulse-ring 1.8s ease-out infinite' }}
        />
        <circle cx={x} cy={y} r={r.current} fill="var(--color-progress)" stroke="#ffffff" strokeWidth={r.edge} />
        <circle cx={x} cy={y} r={r.current * 0.4} fill="#ffffff" />
      </g>
    )
  }

  // Continuation move: large, bright, gently pulsing one-tap target.
  if (isContinue) {
    const col = colourOf(lineForColour ?? '')
    return (
      <g
        style={{ cursor: 'pointer', ...reveal() }}
        onClick={handleClick}
        role="button"
        aria-label={`Move to ${name}`}
      >
        <circle
          cx={x}
          cy={y}
          r={r.continue * 1.7}
          fill={col}
          opacity={0.25}
          style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'pulse-ring 2.2s ease-out infinite' }}
        />
        <circle cx={x} cy={y} r={r.continue} fill={col} stroke="#ffffff" strokeWidth={r.edge * 1.2} />
      </g>
    )
  }

  // Switch move: smaller, muted, marked as a line change. Armed chip when pending.
  if (isSwitch) {
    const col = colourOf(anyMove?.line ?? '')
    return (
      <g
        style={{ cursor: 'pointer', ...reveal() }}
        onClick={handleClick}
        role="button"
        aria-label={`Change line to reach ${name}`}
      >
        <circle
          cx={x}
          cy={y}
          r={r.switch + r.edge * (isPending ? 2.5 : 0)}
          fill="#0b0e13"
          stroke={col}
          strokeWidth={r.edge * 1.6}
          strokeDasharray={`${r.edge * 2} ${r.edge * 1.5}`}
          opacity={isPending ? 1 : 0.85}
        />
        <circle cx={x} cy={y} r={r.switch * 0.45} fill={col} opacity={0.8} />
      </g>
    )
  }

  // Plain revealed station (and/or interchange).
  return (
    <g style={reveal()}>
      <circle
        cx={x}
        cy={y}
        r={isStart ? r.node * 1.1 : r.node}
        fill="var(--color-map-700)"
        stroke={isInterchange ? '#cbd5e1' : 'var(--color-map-500)'}
        strokeWidth={r.edge}
      />
      {isStart && <circle cx={x} cy={y} r={r.node * 0.4} fill="#94a3b8" />}
    </g>
  )
}

/** reveal-in keyframe applied to freshly drawn nodes. */
function reveal(): React.CSSProperties {
  return {
    transformBox: 'fill-box',
    transformOrigin: 'center',
    animation: 'reveal-in 360ms var(--ease-cam) both',
  }
}

// ---------------------------------------------------------------------------
// Target flag (on-screen) — pointer-events:none so it never blocks node clicks
// ---------------------------------------------------------------------------

function TargetFlag({ x, y, r, reached }: { x: number; y: number; r: number; reached: boolean }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle
        cx={x}
        cy={y}
        r={r * 2.2}
        fill="none"
        stroke="var(--color-flag)"
        strokeWidth={r * 0.18}
        strokeDasharray={`${r * 0.5} ${r * 0.4}`}
        style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'target-spin 14s linear infinite' }}
      />
      <circle cx={x} cy={y} r={r * 0.9} fill="none" stroke="var(--color-flag)" strokeWidth={r * 0.45} />
      <rect x={x - r * 1.4} y={y - r * 0.28} width={r * 2.8} height={r * 0.56} fill={reached ? 'var(--color-progress)' : '#1c3f94'} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

interface LabelItem {
  id: string
  text: string
  x: number
  y: number
  emphasis: 'current' | 'target' | 'move' | 'visited'
}

function MapLabel({ label, fontSize }: { label: LabelItem; fontSize: number }) {
  const weight = label.emphasis === 'current' || label.emphasis === 'target' ? 700 : 500
  const fill =
    label.emphasis === 'target'
      ? 'var(--color-flag)'
      : label.emphasis === 'current'
        ? 'var(--color-progress-ring)'
        : '#e7e2d6'
  return (
    <text
      x={label.x}
      y={label.y}
      fontSize={fontSize}
      fontWeight={weight}
      fill={fill}
      stroke="#0b0e13"
      strokeWidth={fontSize * 0.18}
      paintOrder="stroke"
      textAnchor="middle"
      style={{ pointerEvents: 'none', fontFamily: 'var(--font-display)' }}
    >
      {label.text}
    </text>
  )
}

interface ComputeLabelsArgs {
  state: GameState
  targetId: string
  legalStationIds: Map<string, Neighbour[]>
  stationsById: Map<string, Station>
  worldOf: (id: string) => Point
  vb: ViewBox
  labelSize: number
}

/**
 * Build labels for only the relevant stations (current, target, legal moves,
 * recently visited) and drop any that would collide with a higher-priority one.
 * Greedy by priority; AABB overlap test in world units.
 */
function computeLabels({
  state,
  targetId,
  legalStationIds,
  stationsById,
  worldOf,
  vb,
  labelSize,
}: ComputeLabelsArgs): LabelItem[] {
  type Candidate = { id: string; emphasis: LabelItem['emphasis']; priority: number }
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  const add = (id: string, emphasis: LabelItem['emphasis'], priority: number) => {
    if (!id || seen.has(id)) return
    if (!stationsById.has(id)) return
    seen.add(id)
    candidates.push({ id, emphasis, priority })
  }

  add(state.currentId, 'current', 0)
  add(targetId, 'target', 1)
  for (const id of legalStationIds.keys()) add(id, 'move', 2)
  // Recently visited (last two before current) for orientation.
  const recent = state.path.slice(-3, -1).map((m) => m.stationId)
  for (const id of recent) add(id, 'visited', 3)

  candidates.sort((a, b) => a.priority - b.priority)

  const placed: { x: number; y: number; w: number; h: number }[] = []
  const out: LabelItem[] = []
  const charW = labelSize * 0.58
  const h = labelSize * 1.1

  for (const c of candidates) {
    const s = stationsById.get(c.id)!
    const p = worldOf(c.id)
    // Only label what's on screen (with a small margin).
    if (!isPointInViewBox(p, vb, -labelSize * 2)) continue
    const text = displayName(s.name)
    const w = Math.max(text.length * charW, labelSize)
    // Label sits just above the node.
    const lx = p.x
    const ly = p.y - labelSize * 1.5
    const box = { x: lx - w / 2, y: ly - h / 2, w, h }
    const collides = placed.some(
      (q) =>
        box.x < q.x + q.w &&
        box.x + box.w > q.x &&
        box.y < q.y + q.h &&
        box.y + box.h > q.y,
    )
    if (collides) continue
    placed.push(box)
    out.push({ id: c.id, text, x: lx, y: ly, emphasis: c.emphasis })
  }
  return out
}

// ---------------------------------------------------------------------------
// Off-screen target compass (HTML overlay so it can sit above the SVG cleanly)
// ---------------------------------------------------------------------------

function EdgeCompass({
  vb,
  targetPos,
  km,
  containerRef,
}: {
  vb: ViewBox
  targetPos: Point
  km: number
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  // Edge point in world units -> fraction of the viewBox -> container px.
  const { point, angleDeg } = viewBoxEdgePoint(targetPos, vb, vb.w * 0.06)
  const fx = (point.x - vb.x) / vb.w
  const fy = (point.y - vb.y) / vb.h
  const rect = containerRef.current?.getBoundingClientRect()
  const left = (rect?.width ?? 0) * fx
  const top = (rect?.height ?? 0) * fy

  return (
    <div
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      style={{ left, top }}
    >
      <div
        className="grid h-8 w-8 place-items-center rounded-full bg-flag text-ink shadow-lg"
        style={{ transform: `rotate(${angleDeg}deg)` }}
        aria-hidden
      >
        {/* Arrow points along +x at 0deg, matching angleDeg. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h12M13 6l6 6-6 6" />
        </svg>
      </div>
      <span className="rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-semibold text-paper tabular-nums">
        {formatKm(km)}
      </span>
    </div>
  )
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

// ---------------------------------------------------------------------------
// Line-change confirm chip
// ---------------------------------------------------------------------------

function SwitchConfirm({
  neighbour,
  lineName,
  colour,
  onConfirm,
  onCancel,
}: {
  neighbour: Neighbour
  lineName: string
  colour: string
  onConfirm: () => void
  onCancel: () => void
}) {
  void neighbour
  return (
    <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full bg-paper/95 py-1.5 pl-3 pr-1.5 shadow-xl ring-1 ring-stone-200">
        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
        <span className="text-sm font-medium text-ink">
          Change to {lineName} <span className="text-warn">(+1 change)</span>
        </span>
        <button
          onClick={onConfirm}
          className="rounded-full px-3 py-1 text-sm font-semibold text-paper shadow-sm"
          style={{ background: colour, color: lineTextColour(neighbour.line) }}
        >
          Switch
        </button>
        <button
          onClick={onCancel}
          aria-label="Cancel line change"
          className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-stone"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function MapControls({
  onZoomIn,
  onZoomOut,
  onRecenter,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onRecenter: () => void
}) {
  const btn =
    'grid h-9 w-9 place-items-center rounded-lg bg-paper/90 text-ink shadow-md ring-1 ring-stone-200 transition hover:bg-paper active:scale-95'
  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
      <button onClick={onZoomIn} className={btn} aria-label="Zoom in">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button onClick={onZoomOut} className={btn} aria-label="Zoom out">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button onClick={onRecenter} className={btn} aria-label="Recenter on me">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </div>
  )
}
