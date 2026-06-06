// Read-only heads-up display for the active game: where you're headed, your
// weighted SCORE against par (the hero number — score = stops + 4*changes, the
// single comparable metric the Dijkstra par minimises; see lib/score), with
// stops and changes as the breakdown, the line you're currently riding, and a
// compass pointing at the destination. Sits above or beside the map. Purely
// presentational — every value arrives as a prop.

import { lineColour, lineTextColour } from '../theme'
import { points } from '../lib/score'

interface HudProps {
  /** Destination station display name. */
  targetName: string
  /** Line id the player is currently on, or null before the first move. */
  currentLineId: string | null
  /** Line display name, or null before the first move. */
  currentLineName: string | null
  hops: number
  parHops: number
  changes: number
  parChanges: number
  /** Bearing to target in degrees. 0 = north, clockwise. */
  bearingDeg: number
  /** Straight-line distance to target in km. */
  km: number
}

export default function Hud({
  targetName,
  currentLineId,
  currentLineName,
  hops,
  parHops,
  changes,
  parChanges,
  bearingDeg,
  km,
}: HudProps) {
  const score = points(hops, changes)
  const parScore = points(parHops, parChanges)

  return (
    <section
      className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-paper px-4 py-3"
      aria-label="Game status"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <Label>Destination</Label>
          <p className="truncate text-sm font-bold leading-tight text-ink" title={targetName}>
            {targetName}
          </p>
        </div>

        <ScoreReadout score={score} parScore={parScore} />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <SubStat label="Stops" value={hops} par={parHops} overPar={hops > parHops} />
          <SubStat label="Changes" value={changes} par={parChanges} overPar={changes > parChanges} />
          <LineBadge lineId={currentLineId} lineName={currentLineName} />
        </div>
      </div>

      <Compass bearingDeg={bearingDeg} km={km} />
    </section>
  )
}

interface ScoreReadoutProps {
  score: number
  parScore: number
}

/**
 * The hero metric: the run's weighted score against par. Lower is better, so the
 * player's number reads amber once it has crept above par and stays ink (calm)
 * while still at or below it.
 */
function ScoreReadout({ score, parScore }: ScoreReadoutProps) {
  const overPar = score > parScore
  return (
    <div className="min-w-0" aria-label={`Score ${score}, par ${parScore}`}>
      <Label>Score</Label>
      <p className="leading-none tabular-nums">
        <span className={`text-3xl font-extrabold ${overPar ? 'text-warn' : 'text-ink'}`}>
          {score}
        </span>
        <span className="ml-1 text-base font-semibold text-ink-soft">/ {parScore} par</span>
      </p>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">
      {children}
    </span>
  )
}

interface SubStatProps {
  label: string
  value: number
  par: number
  /** Highlight in amber when the player has gone over par. */
  overPar: boolean
}

/** A small breakdown stat (stops / changes) shown under the hero score. */
function SubStat({ label, value, par, overPar }: SubStatProps) {
  return (
    <div className="flex flex-col">
      <Label>{label}</Label>
      <p className="text-sm font-semibold leading-tight tabular-nums">
        <span className={overPar ? 'text-warn' : 'text-ink'}>{value}</span>
        <span className="text-ink-soft"> / {par}</span>
      </p>
    </div>
  )
}

interface LineBadgeProps {
  lineId: string | null
  lineName: string | null
}

function LineBadge({ lineId, lineName }: LineBadgeProps) {
  if (!lineId) {
    return (
      <div className="flex flex-col">
        <Label>Line</Label>
        <span className="inline-flex w-fit items-center rounded-full bg-stone px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
          Boarding…
        </span>
      </div>
    )
  }

  const bg = lineColour(lineId)
  const fg = lineTextColour(lineId)
  return (
    <div className="flex min-w-0 flex-col">
      <Label>Line</Label>
      <span
        className="inline-flex w-fit max-w-[10rem] items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: bg, color: fg }}
        title={lineName ?? lineId}
      >
        {lineName ?? lineId}
      </span>
    </div>
  )
}

interface CompassProps {
  bearingDeg: number
  km: number
}

/**
 * A small compass dial with a needle rotated to the target bearing. SVG
 * rotation is clockwise for positive angles and the needle points up (north) at
 * rest, so `rotate(bearingDeg)` lands it on a 0=N, clockwise bearing directly.
 */
function Compass({ bearingDeg, km }: CompassProps) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      aria-label={`Destination is ${formatKm(km)} away, bearing ${Math.round(bearingDeg)} degrees`}
    >
      <svg width="64" height="64" viewBox="0 0 100 100" role="img" aria-hidden="true">
        {/* Dial */}
        <circle cx="50" cy="50" r="44" fill="var(--color-map)" stroke="var(--color-stone-200)" strokeWidth="3" />
        {/* Cardinal ticks */}
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1="50"
            y1="8"
            x2="50"
            y2="15"
            stroke="var(--color-jubilee)"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <text x="50" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-stone)">
          N
        </text>
        {/* Needle: green half points at the target, grey tail behind. */}
        <g transform={`rotate(${bearingDeg} 50 50)`} style={{ transition: 'transform 0.4s var(--ease-cam)' }}>
          <polygon points="50,16 44,52 56,52" fill="var(--color-progress)" />
          <polygon points="50,84 44,52 56,52" fill="var(--color-map-500)" />
        </g>
        <circle cx="50" cy="50" r="5" fill="var(--color-stone)" stroke="var(--color-map)" strokeWidth="2" />
      </svg>
      <span className="text-xs font-semibold tabular-nums text-ink">{formatKm(km)}</span>
    </div>
  )
}

/** Compact distance readout: metres under 1 km, else one-decimal km. */
function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
