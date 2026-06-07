// Pre/post-game station trivia card. Shows a role tag (Start / Destination), the
// station name, and up to four quick facts that DEGRADE GRACEFULLY — only the
// facts that exist are rendered (daily traffic in particular is often missing).
// Then a fun fact and a Wikipedia link when present. Tube-styled, light, compact.
// Presentational — every value arrives as a prop.

import type { Station } from '../engine'
import type { StationInfo } from '../lib/stationInfo'
import { displayName } from '../lib/format'
import { DestFlagIcon, StartPinIcon } from './icons'

interface StationInfoCardProps {
  roleLabel: 'Start' | 'Destination'
  station: Station
  info?: StationInfo
}

/** Thousands-separated count, e.g. 78000 -> "78,000". */
function formatTraffic(n: number): string {
  return n.toLocaleString('en-GB')
}

export default function StationInfoCard({ roleLabel, station, info }: StationInfoCardProps) {
  const facts: React.ReactNode[] = []

  if (info?.openedYear != null) {
    facts.push(
      <Fact key="opened" label="Opened">
        {info.openedYear}
        {info.openedRank != null && <Rank>#{info.openedRank} oldest</Rank>}
      </Fact>,
    )
  }

  if (info?.dailyTraffic != null) {
    facts.push(
      <Fact key="traffic" label="Daily traffic">
        {formatTraffic(info.dailyTraffic)}
        {info.dailyTrafficRank != null && <Rank>#{info.dailyTrafficRank} busiest</Rank>}
      </Fact>,
    )
  }

  if (station.zone) {
    facts.push(
      <Fact key="zone" label="Zone">
        {station.zone}
      </Fact>,
    )
  }

  // Always available — every station is served by at least one line.
  facts.push(
    <Fact key="lines" label="Served by">
      {station.lines.length} {station.lines.length === 1 ? 'line' : 'lines'}
    </Fact>,
  )

  const isStart = roleLabel === 'Start'
  return (
    <article className="rounded-xl border border-stone-200 bg-paper p-3 text-ink">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${
          isStart ? 'bg-progress/10 text-progress' : 'bg-warn/10 text-warn'
        }`}
      >
        <span className="text-xs leading-none" aria-hidden="true">
          {isStart ? <StartPinIcon /> : <DestFlagIcon />}
        </span>
        {roleLabel}
      </span>

      <h3 className="mt-1.5 text-lg font-bold leading-tight tracking-tight">
        {displayName(station.name)}
      </h3>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">{facts}</dl>

      {/* Show the fun fact in full: facts are one bounded sentence (max ~260
          chars), so the card height stays sensible without truncating them. */}
      {info?.funFact && (
        <p className="mt-2 text-sm italic leading-snug text-ink-soft">{info.funFact}</p>
      )}

      {info?.wikiUrl && (
        <a
          href={info.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-progress underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
        >
          Wikipedia
          <ExternalIcon />
        </a>
      )}
    </article>
  )
}

interface FactProps {
  label: string
  children: React.ReactNode
}

function Fact({ label, children }: FactProps) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold leading-tight tabular-nums">{children}</dd>
    </div>
  )
}

/** A small, muted rank annotation shown beside a fact value. */
function Rank({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 text-xs font-medium text-ink-soft">({children})</span>
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
    </svg>
  )
}
