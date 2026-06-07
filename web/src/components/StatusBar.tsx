// Single status bar combining the score readout, the start-to-destination
// journey (with its line-coloured ride ribbon) and the compass into one card,
// so the wide empty space the separate score panel used to leave is filled by
// the journey. Layout: score block on the left, the journey ribbon flexing
// through the middle, compass on the right; on narrow screens the journey wraps
// onto its own row. Purely presentational, every value arrives as a prop.

import { useEffect, useRef } from 'react'
import type { Station } from '../engine'
import { displayName } from '../lib/format'
import type { RouteLeg } from '../lib/route'
import { stopsLabel } from '../lib/route'
import { AMBER_LIMIT, deltaTone, points, type Tone } from '../lib/score'
import { isOverground, lineColour, lineTextColour } from '../theme'
import { ChangeIcon, StopIcon } from './icons'

/** Ribbon pixels per stop ridden. */
const STOP_PX = 18

// Live HUD colouring: neutral ink while at or under best (nothing earned yet),
// amber a little over, red well over. Green is reserved for the final verdict.
function liveTone(tone: Tone): string {
  return tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink'
}

interface StatusBarProps {
  startName: string
  targetName: string
  /** Legs ridden so far (lib/route journeyLegs). Empty before the first move. */
  legs: RouteLeg[]
  lineNames: Map<string, string>
  stationsById: Map<string, Station>
  solved: boolean
  /** Line id currently ridden, or null before the first move. */
  currentLineId: string | null
  currentLineName: string | null
  hops: number
  parHops: number
  changes: number
  parChanges: number
  /** Bearing to target in degrees (0 = north, clockwise). */
  bearingDeg: number
  /** Straight-line distance to target in km. */
  km: number
}

export default function StatusBar(props: StatusBarProps) {
  const { currentLineId, currentLineName, hops, parHops, changes, parChanges, bearingDeg, km } =
    props
  const score = points(hops, changes)
  const parScore = points(parHops, parChanges)

  return (
    <section
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-stone-200 bg-paper px-3 py-2 sm:gap-x-6 sm:gap-y-3 sm:px-4 sm:py-3"
      aria-label="Game status"
    >
      <div className="flex shrink-0 flex-col gap-0.5 sm:gap-1.5">
        <ScoreReadout score={score} parScore={parScore} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
          <SubStat
            label="Stops"
            value={hops}
            best={parHops}
            amber={AMBER_LIMIT.stops}
            icon={<StopIcon />}
          />
          <SubStat
            label="Changes"
            value={changes}
            best={parChanges}
            amber={AMBER_LIMIT.changes}
            icon={<ChangeIcon />}
          />
          <LineBadge lineId={currentLineId} lineName={currentLineName} />
        </div>
      </div>

      <Journey
        startName={props.startName}
        targetName={props.targetName}
        legs={props.legs}
        lineNames={props.lineNames}
        stationsById={props.stationsById}
        solved={props.solved}
      />

      <div className="ml-auto shrink-0 sm:ml-0">
        <Compass bearingDeg={bearingDeg} km={km} />
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------- //
// Score                                                                       //
// --------------------------------------------------------------------------- //

function ScoreReadout({ score, parScore }: { score: number; parScore: number }) {
  const tone = liveTone(deltaTone(score, parScore, AMBER_LIMIT.score(parScore)))
  return (
    <div className="min-w-0" aria-label={`Score ${score}, best possible ${parScore}`}>
      {/* The "Score" caption is redundant on a phone where space is dear; the
          big tonal number with "/ N best" reads on its own. */}
      <span className="hidden sm:block">
        <Label>Score</Label>
      </span>
      <p className="leading-none tabular-nums">
        <span className={`text-3xl font-extrabold ${tone}`}>{score}</span>
        <span className="ml-1 text-base font-semibold text-ink-soft">/ {parScore} best</span>
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

function SubStat({
  label,
  value,
  best,
  amber,
  icon,
}: {
  label: string
  value: number
  best: number
  amber: number
  icon: React.ReactNode
}) {
  const tone = liveTone(deltaTone(value, best, amber))
  // Phone: icon + value on one inline line (the icon names the stat, the colour
  // grades it). Desktop (sm+): caption above the value, as before.
  return (
    <div className="flex items-center gap-1 sm:flex-col sm:items-start sm:gap-0">
      <span className="flex items-center gap-1 text-ink-soft">
        <span className="text-sm leading-none" aria-hidden="true">
          {icon}
        </span>
        <span className="hidden sm:inline">
          <Label>{label}</Label>
        </span>
      </span>
      <p className="text-sm font-semibold leading-tight tabular-nums">
        <span className={tone}>{value}</span>
      </p>
    </div>
  )
}

function LineBadge({ lineId, lineName }: { lineId: string | null; lineName: string | null }) {
  if (!lineId) {
    return (
      <div className="flex flex-col">
        <span className="hidden sm:block">
          <Label>Line</Label>
        </span>
        <span className="inline-flex w-fit items-center rounded-full bg-stone px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
          Boarding…
        </span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col">
      <span className="hidden sm:block">
        <Label>Line</Label>
      </span>
      <span
        className="inline-flex w-fit max-w-[10rem] items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: lineColour(lineId), color: lineTextColour(lineId) }}
        title={lineName ?? lineId}
      >
        {lineName ?? lineId}
      </span>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Journey (start -> ribbon -> destination)                                    //
// --------------------------------------------------------------------------- //

interface JourneyProps {
  startName: string
  targetName: string
  legs: RouteLeg[]
  lineNames: Map<string, string>
  stationsById: Map<string, Station>
  solved: boolean
}

function Journey({ startName, targetName, legs, lineNames, stationsById, solved }: JourneyProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const ridden = legs.reduce((n, l) => n + l.stops, 0)
  const empty = legs.length === 0

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [ridden])

  const name = (id: string): string => displayName(stationsById.get(id)?.name ?? id)
  const line = (id: string): string => lineNames.get(id) ?? id

  const journeyText = empty
    ? 'No moves yet'
    : legs
        .map(
          (leg, i) =>
            `${i > 0 ? `change at ${name(leg.fromId)}, ` : ''}${stopsLabel(leg.stops)} on ${line(leg.lineId)}`,
        )
        .join(', ')

  // Before the first move there is no ride to show, so narrow screens get a
  // one-line "Start to Destination" instead of the full ribbon row; the ribbon
  // appears with the first leg. From sm up the full row always shows.
  return (
    <>
      {empty && (
        <p className="order-last min-w-0 basis-full truncate text-sm font-bold leading-tight text-ink sm:hidden">
          {startName} <span className="font-semibold text-ink-soft">to</span> {targetName}
        </p>
      )}
      <div
        className={`order-last min-w-0 basis-full items-center gap-3 sm:order-none sm:flex sm:flex-1 sm:basis-0 ${
          empty ? 'hidden' : 'flex'
        }`}
      >
      <Endpoint label="Start" name={startName} align="left" />

      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        role="img"
        aria-label={`Journey so far: ${journeyText}`}
      >
        <div className="flex h-6 w-full min-w-max items-center px-1">
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
                style={{ width: leg.stops * STOP_PX, ...legStyle(leg.lineId) }}
                title={`${line(leg.lineId)}: ${stopsLabel(leg.stops)} to ${name(leg.toId)}`}
              />
            </span>
          ))}

          {solved ? (
            <FlagMarker title={targetName} reached />
          ) : (
            <>
              <span
                className="z-10 -ml-0.5 h-3 w-3 shrink-0 rounded-full bg-progress ring-2 ring-progress-ring/50"
                title="You are here"
              />
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
      </div>
    </>
  )
}

/**
 * Ribbon fill for a leg: solid line colour, except Overground lines which get
 * a dashed (striped) texture to match their rendering on the map.
 */
function legStyle(lineId: string): React.CSSProperties {
  const colour = lineColour(lineId)
  if (!isOverground(lineId)) return { backgroundColor: colour }
  return {
    background: `repeating-linear-gradient(90deg, ${colour} 0 9px, transparent 9px 13px)`,
  }
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
    <div className={`w-[6rem] min-w-0 shrink-0 sm:w-32 ${align === 'right' ? 'text-right' : ''}`}>
      {/* The Start/Destination caption is dropped on a phone to keep the journey
          to a single slim row; the pin/flag context lives on the result card. */}
      <span className="hidden sm:block">
        <Label>{label}</Label>
      </span>
      <p
        className="truncate text-sm font-bold leading-tight text-ink sm:whitespace-normal sm:break-words"
        title={name}
      >
        {name}
      </p>
    </div>
  )
}

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

// --------------------------------------------------------------------------- //
// Compass                                                                     //
// --------------------------------------------------------------------------- //

function Compass({ bearingDeg, km }: { bearingDeg: number; km: number }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 sm:gap-1"
      aria-label={`Destination is ${formatKm(km)} away, bearing ${Math.round(bearingDeg)} degrees`}
    >
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-hidden="true"
        className="h-9 w-9 sm:h-14 sm:w-14"
      >
        <circle cx="50" cy="50" r="44" fill="var(--color-map)" stroke="var(--color-stone-200)" strokeWidth="3" />
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
        <g transform={`rotate(${bearingDeg} 50 50)`} style={{ transition: 'transform 0.4s var(--ease-cam)' }}>
          <polygon points="50,16 44,52 56,52" fill="var(--color-progress)" />
          <polygon points="50,84 44,52 56,52" fill="var(--color-map-500)" />
        </g>
        <circle cx="50" cy="50" r="5" fill="var(--color-stone)" stroke="var(--color-map)" strokeWidth="2" />
      </svg>
      <span className="text-[0.7rem] font-semibold tabular-nums text-ink sm:text-xs">
        {formatKm(km)}
      </span>
    </div>
  )
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
