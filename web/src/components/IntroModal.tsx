// Pre-game "Today's journey" card. A short, spoiler-free intro — start and
// destination are meant to be known — showing both stations' trivia cards and a
// primary "Start" button. Wrapped in the shared Modal. Presentational; the
// loaded station info arrives as props.

import Modal from './Modal'
import StationInfoCard from './StationInfoCard'
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
}

export default function IntroModal({ open, onClose, start, destination }: IntroModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Today's journey">
      <p className="text-sm text-ink-soft">
        Get from your start to today&apos;s destination in as few stops and changes as you can.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <StationInfoCard roleLabel="Start" station={start.station} info={start.info} />
        <StationInfoCard
          roleLabel="Destination"
          station={destination.station}
          info={destination.info}
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-xl bg-progress px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
      >
        Start
      </button>
    </Modal>
  )
}
