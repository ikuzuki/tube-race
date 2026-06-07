// Pre-game "Today's journey" card. Deliberately spoiler-free: it shows only the
// start and destination NAMES and the goal — no stats, no lines, no Wikipedia
// link — so it can't be used to work out the route. The full station trivia is a
// post-game reveal on the result card. Wrapped in the shared Modal.

import Modal from './Modal'
import { displayName } from '../lib/format'
import type { Station } from '../engine'
import type { StationInfo } from '../lib/stationInfo'

interface Endpoint {
  station: Station
  info?: StationInfo
}

interface IntroModalProps {
  open: boolean
  onClose: () => void
  start: Endpoint
  destination: Endpoint
  /** Card title; defaults to the daily framing. */
  title?: string
}

export default function IntroModal({
  open,
  onClose,
  start,
  destination,
  title = "Today's journey",
}: IntroModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-ink-soft">
        Find your way from your start to the destination in as few stops and changes as you can.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone/60 px-4 py-4">
        <Leg label="Start" name={displayName(start.station.name)} tone="text-progress" />
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-ink-soft"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <Leg label="Destination" name={displayName(destination.station.name)} tone="text-warn" />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl bg-progress px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
      >
        Start
      </button>
    </Modal>
  )
}

function Leg({ label, name, tone }: { label: string; name: string; tone: string }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className={`text-[0.65rem] font-semibold uppercase tracking-wider ${tone}`}>{label}</p>
      <p className="truncate text-base font-bold text-ink" title={name}>
        {name}
      </p>
    </div>
  )
}
