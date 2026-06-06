// Heads-up display: where you're headed, how you're doing against par, and the
// compass hint. Read-only; all values derived from engine state by the parent.

import Compass from './Compass'

interface HudProps {
  targetName: string
  hops: number
  parHops: number
  changes: number
  parChanges: number
  bearingDeg: number
  km: number
}

function Stat({
  label,
  value,
  par,
}: {
  label: string
  value: number
  par: number
}) {
  const over = value > par
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        <span className={over ? 'text-amber-400' : 'text-neutral-100'}>
          {value}
        </span>
        <span className="text-neutral-600"> / {par}</span>
      </span>
    </div>
  )
}

export default function Hud({
  targetName,
  hops,
  parHops,
  changes,
  parChanges,
  bearingDeg,
  km,
}: HudProps) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-xl border border-neutral-800 bg-neutral-900/70 px-5 py-3 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Destination
        </span>
        <span className="text-xl font-semibold tracking-tight text-emerald-300">
          {targetName}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <Stat label="Stops" value={hops} par={parHops} />
        <Stat label="Changes" value={changes} par={parChanges} />
      </div>

      <Compass bearingDeg={bearingDeg} km={km} />
    </div>
  )
}
