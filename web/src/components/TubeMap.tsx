// The fog-of-war SVG map.
//
// Only revealed stations are drawn; an edge is drawn only when BOTH endpoints
// are revealed, coloured by its line. The current station is highlighted,
// visited stations are styled distinctly, and the legal-move neighbours are
// inviting and clickable. The target is always shown as a labelled flag marker
// so the player can aim — but the engine never reveals the target's own
// neighbours until it is reached, so the network around it stays fogged.

import { useMemo, useState } from 'react'
import type {
  Adjacency,
  GameState,
  Line,
  Neighbour,
  Station,
  TubeGraph,
} from '../engine'
import { legalMoves as engineLegalMoves } from '../engine'
import { displayName, makeProjector, type Point } from '../lib/projection'

interface TubeMapProps {
  graph: TubeGraph
  adj: Adjacency
  state: GameState
  onMove: (to: Neighbour) => void
  width?: number
  height?: number
}

const FALLBACK_LINE_COLOUR = '#9ca3af'

export default function TubeMap({
  graph,
  adj,
  state,
  onMove,
  width = 760,
  height = 560,
}: TubeMapProps) {
  // Track which neighbour station is currently asking the player to pick a line
  // (only happens when parallel lines connect to it).
  const [picking, setPicking] = useState<string | null>(null)

  // Projection + indices are derived from the immutable graph, so memoise on it.
  const projector = useMemo(
    () => makeProjector(graph.stations, width, height),
    [graph, width, height],
  )
  const stationById = useMemo(() => {
    const m = new Map<string, Station>()
    for (const s of graph.stations) m.set(s.id, s)
    return m
  }, [graph])
  const lineById = useMemo(() => {
    const m = new Map<string, Line>()
    for (const l of graph.lines) m.set(l.id, l)
    return m
  }, [graph])
  const pos = useMemo(() => {
    const m = new Map<string, Point>()
    for (const s of graph.stations) m.set(s.id, projector.project(s.lat, s.lon))
    return m
  }, [graph, projector])

  const colourOf = (lineId: string) =>
    lineById.get(lineId)?.colour ?? FALLBACK_LINE_COLOUR

  const revealed = state.revealed
  const visited = useMemo(() => {
    const s = new Set<string>([state.startId])
    for (const m of state.path) s.add(m.stationId)
    return s
  }, [state.startId, state.path])

  // Legal moves grouped by destination station, so parallel lines collapse into
  // one clickable node with a line picker.
  const movesByStation = useMemo(() => {
    const m = new Map<string, Neighbour[]>()
    for (const nb of engineLegalMoves(state, adj)) {
      const list = m.get(nb.stationId)
      if (list) list.push(nb)
      else m.set(nb.stationId, [nb])
    }
    return m
  }, [state, adj])

  // Edges to draw: both endpoints revealed.
  const visibleEdges = useMemo(
    () =>
      graph.edges.filter(
        (e) => revealed.has(e.from) && revealed.has(e.to),
      ),
    [graph, revealed],
  )

  const targetPos = pos.get(state.puzzle.targetId)
  const targetStation = stationById.get(state.puzzle.targetId)

  const handleNodeClick = (stationId: string) => {
    const options = movesByStation.get(stationId)
    if (!options || options.length === 0) return
    if (options.length === 1) {
      setPicking(null)
      onMove(options[0])
    } else {
      // Toggle the line picker for this neighbour.
      setPicking((cur) => (cur === stationId ? null : stationId))
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full rounded-xl border border-neutral-800 bg-neutral-950"
      role="img"
      aria-label="Tube map (fog of war)"
    >
      {/* Edges first so nodes sit on top. */}
      <g strokeLinecap="round">
        {visibleEdges.map((e, i) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          return (
            <line
              key={`${e.from}-${e.to}-${e.line}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={colourOf(e.line)}
              strokeWidth={4}
              strokeOpacity={0.85}
            />
          )
        })}
      </g>

      {/* Target marker — always shown so the player can aim. Pulsing ring + flag.
          Purely decorative: pointer-events-none so it never eats a click meant
          for the target's own move node beneath it (you win by clicking it). */}
      {targetPos && targetStation && (
        <g
          data-testid="target-marker"
          aria-label={`Target ${displayName(targetStation.name)}`}
          style={{ pointerEvents: 'none' }}
        >
          <circle
            cx={targetPos.x}
            cy={targetPos.y}
            r={14}
            className="fill-none stroke-emerald-400"
            strokeWidth={2}
            strokeDasharray="3 3"
          >
            <animate
              attributeName="r"
              values="12;16;12"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
          <text
            x={targetPos.x}
            y={targetPos.y + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={15}
          >
            🏁
          </text>
          <text
            x={targetPos.x}
            y={targetPos.y - 20}
            textAnchor="middle"
            className="fill-emerald-300 font-semibold"
            fontSize={11}
            style={{ paintOrder: 'stroke', stroke: '#0a0a0a', strokeWidth: 3 }}
          >
            {displayName(targetStation.name)}
          </text>
        </g>
      )}

      {/* Revealed station nodes. */}
      {[...revealed].map((id) => {
        const p = pos.get(id)
        const st = stationById.get(id)
        if (!p || !st) return null

        const isCurrent = id === state.currentId
        const isVisited = visited.has(id) && !isCurrent
        const moveOptions = movesByStation.get(id)
        const isLegal = !!moveOptions && !isCurrent
        const isInterchange = st.lines.length > 1

        let fill = '#404040' // default revealed-but-unreachable
        let stroke = '#1f2937'
        let radius = 5
        if (isVisited) {
          fill = '#6b7280'
          stroke = '#9ca3af'
        }
        if (isLegal) {
          fill = '#f8fafc'
          stroke = '#34d399'
          radius = 7
        }
        if (isCurrent) {
          fill = '#34d399'
          stroke = '#a7f3d0'
          radius = 9
        }

        return (
          <g key={id}>
            {isCurrent && (
              <circle
                cx={p.x}
                cy={p.y}
                r={14}
                className="fill-emerald-400/20 stroke-emerald-400/40"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={radius}
              fill={fill}
              stroke={stroke}
              strokeWidth={isInterchange ? 2.5 : 1.5}
              role={isLegal ? 'button' : undefined}
              tabIndex={isLegal ? 0 : undefined}
              aria-label={
                isLegal
                  ? `Move to ${displayName(st.name)}`
                  : displayName(st.name)
              }
              data-station={id}
              data-legal={isLegal ? 'true' : undefined}
              data-current={isCurrent ? 'true' : undefined}
              className={isLegal ? 'cursor-pointer' : undefined}
              onClick={isLegal ? () => handleNodeClick(id) : undefined}
              onKeyDown={
                isLegal
                  ? (ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        handleNodeClick(id)
                      }
                    }
                  : undefined
              }
            />
            {/* Label the current node and legal neighbours; keep the map calm
                elsewhere by leaving plain revealed dots unlabelled. The target
                is already labelled by its flag marker, so skip its node label. */}
            {(isCurrent || isLegal) && id !== state.puzzle.targetId && (
              <text
                x={p.x}
                y={p.y - radius - 5}
                textAnchor="middle"
                fontSize={10}
                className={
                  isCurrent
                    ? 'pointer-events-none fill-emerald-200 font-semibold'
                    : 'pointer-events-none fill-neutral-300'
                }
                style={{
                  paintOrder: 'stroke',
                  stroke: '#0a0a0a',
                  strokeWidth: 3,
                }}
              >
                {displayName(st.name)}
              </text>
            )}

            {/* Parallel-line picker: pills for each line connecting here. */}
            {isLegal && picking === id && moveOptions.length > 1 && (
              <g data-testid={`line-picker-${id}`}>
                {moveOptions.map((opt, idx) => {
                  const pillW = 30
                  const gap = 4
                  const totalW = moveOptions.length * pillW + (moveOptions.length - 1) * gap
                  const startX = p.x - totalW / 2
                  const x = startX + idx * (pillW + gap)
                  const y = p.y + radius + 6
                  return (
                    <g
                      key={opt.line}
                      role="button"
                      tabIndex={0}
                      aria-label={`Take the ${lineById.get(opt.line)?.name ?? opt.line} line to ${displayName(st.name)}`}
                      data-line-pill={opt.line}
                      className="cursor-pointer"
                      onClick={() => {
                        setPicking(null)
                        onMove(opt)
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault()
                          setPicking(null)
                          onMove(opt)
                        }
                      }}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={pillW}
                        height={14}
                        rx={7}
                        fill={colourOf(opt.line)}
                        stroke="#0a0a0a"
                        strokeWidth={1}
                      />
                      <text
                        x={x + pillW / 2}
                        y={y + 7}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={8}
                        className="pointer-events-none fill-white font-semibold"
                      >
                        {(lineById.get(opt.line)?.name ?? opt.line).slice(0, 4)}
                      </text>
                    </g>
                  )
                })}
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
