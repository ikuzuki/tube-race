// Persistent journey banner: where you started, where you're headed, and a
// line-coloured ribbon of every leg ridden so far in between. The ribbon grows
// left to right as the player moves, with interchange markers at each line
// change and a dashed tail to the destination while the run is live. Fixed
// height; long meandering runs scroll horizontally (kept pinned to the newest
// leg) rather than breaking the layout. Purely presentational.

import { useEffect, useRef } from 'react'
import type { Station } from '../engine'
import { displayName } from '../lib/format'
import type { RouteLeg } from '../lib/route'
import { stopsLabel } from '../lib/route'
import { lineColour } from '../theme'

/** Ribbon pixels per stop ridden. */
const STOP_PX = 18

interface JourneyBannerProps {
  startName: string
  targetName: string
  /** Legs ridden so far (see lib/route journeyLegs). Empty before the first move. */
  legs: RouteLeg[]
  /** Line id -> display name, for leg tooltips. */
  lineNames: Map<string, string>
  /** Station index, for change-marker tooltips. */
  stationsById: Map<string, Station>
  solved: boolean
}

export default function JourneyBanner({
  startName,
  targetName,
  legs,
  lineNames,
  stationsById,
  solved,
}: JourneyBannerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const ridden = legs.reduce((n, l) => n + l.stops, 0)

  // Keep the newest leg in view as the ribbon grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [ridden])

  const name = (id: string): string => displayName(stationsById.get(id)?.name ?? id)
  const line = (id: string): string => lineNames.get(id) ?? id

  const journeyText =
    legs.length === 0
      ? 'No moves yet'
      : legs
          .map(
            (leg, i) =>
              `${i > 0 ? `change at ${name(leg.fromId)}, ` : ''}${stopsLabel(leg.stops)} on ${line(leg.lineId)}`,
          )
          .join(', ')

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-stone-200 bg-paper px-4 py-2.5"
      aria-label="Journey"
    >
      <Endpoint label="Start" name={startName} align="left" />

      {/* On narrow screens the ribbon wraps onto its own full-width row below
          the endpoints; from sm up it sits between them. */}
      <div
        ref={scrollRef}
        className="order-last min-w-0 basis-full overflow-x-auto overflow-y-hidden sm:order-none sm:flex-1 sm:basis-0"
        role="img"
        aria-label={`Journey so far: ${journeyText}`}
      >
        <div className="flex h-6 w-full min-w-max items-center px-1">
          {/* Start marker */}
          <span
            className="h-3 w-3 shrink-0 rounded-full border-2 border-progress bg-paper"
            title={startName}
          />

          {legs.map((leg, i) => (
            <span key={`${leg.lineId}-${leg.fromId}-${i}`} className="flex shrink-0 items-center">
              {i > 0 && (
                <span
                  className="z-10 -mx-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-ink bg-paper"
                  title={`Change at ${name(leg.fromId)}`}
                />
              )}
              <span
                className="h-2 shrink-0"
                style={{ width: leg.stops * STOP_PX, backgroundColor: lineColour(leg.lineId) }}
                title={`${line(leg.lineId)}: ${stopsLabel(leg.stops)} to ${name(leg.toId)}`}
              />
            </span>
          ))}

          {solved ? (
            <FlagMarker title={targetName} reached />
          ) : (
            <>
              {/* You-are-here marker on the end of the ridden ribbon. */}
              <span
                className="z-10 -ml-0.5 h-3 w-3 shrink-0 rounded-full bg-progress ring-2 ring-progress-ring/50"
                title="You are here"
              />
              {/* Dashed tail: the unknown remainder of the journey. Flexes to
                  fill spare width so the flag hugs the right edge, but never
                  collapses below a visible stub on long scrolling runs. */}
              <span
                className="mx-1 h-0 min-w-10 flex-1 border-t-2 border-dashed border-stone-200"
                aria-hidden
              />
              <FlagMarker title={targetName} reached={false} />
            </>
          )}
        </div>
      </div>

      <Endpoint label="Destination" name={targetName} align="right" />
    </section>
  )
}

function Endpoint({
  label,
  name,
  align,
}: {
  label: string
  name: string
  align: 'left' | 'right'
}) {
  return (
    <div className={`w-[7.5rem] min-w-0 sm:w-36 ${align === 'right' ? 'text-right' : ''}`}>
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <p className="truncate text-sm font-bold leading-tight text-ink" title={name}>
        {name}
      </p>
    </div>
  )
}

/** Destination roundel-ish marker: filled once reached, hollow while pending. */
function FlagMarker({ title, reached }: { title: string; reached: boolean }) {
  return (
    <span
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
        reached ? 'border-progress bg-progress' : 'border-flag bg-paper'
      }`}
      title={title}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${reached ? 'bg-paper' : 'bg-flag'}`} />
    </span>
  )
}
