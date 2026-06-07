// Turn-by-turn narration of a route: which line to board, how many stops to
// ride, and where to change. Makes the optimal route legible without having to
// trace a coloured line on the map. Presentational; legs are computed from the
// PathResult by lib/route.

import type { PathResult, Station } from '../engine'
import { displayName } from '../lib/format'
import { routeLegs, stopsLabel } from '../lib/route'
import { lineColour, lineTextColour } from '../theme'

interface RouteNarrationProps {
  path: PathResult
  stationsById: Map<string, Station>
  /** Line id -> display name. */
  lineNames: Map<string, string>
  className?: string
}

export default function RouteNarration({
  path,
  stationsById,
  lineNames,
  className,
}: RouteNarrationProps) {
  const legs = routeLegs(path)
  if (legs.length === 0) return null

  const name = (id: string): string => displayName(stationsById.get(id)?.name ?? id)

  return (
    <ol className={`flex flex-col gap-2 ${className ?? ''}`} aria-label="Best route, step by step">
      {legs.map((leg, i) => (
        <li key={`${leg.lineId}-${leg.fromId}-${i}`} className="flex flex-col gap-1">
          {i > 0 && (
            <span className="text-xs font-semibold text-ink-soft">Change at {name(leg.fromId)}</span>
          )}
          <div className="flex items-center gap-2">
            <LinePill lineId={leg.lineId} lineName={lineNames.get(leg.lineId) ?? leg.lineId} />
            <span className="text-sm text-ink">
              {i === 0 ? 'Ride' : 'then ride'} {stopsLabel(leg.stops)} to{' '}
              <span className="font-semibold">{name(leg.toId)}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function LinePill({ lineId, lineName }: { lineId: string; lineName: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: lineColour(lineId), color: lineTextColour(lineId) }}
    >
      {lineName}
    </span>
  )
}
