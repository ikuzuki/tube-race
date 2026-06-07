// First-run "how to play" card. A short, friendly, tube-flavoured rundown of the
// rules with small visual cues, wrapped in the shared Modal. The primary
// "Got it" button is the only way out beyond the usual close/escape.

import Modal from './Modal'

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <p className="text-sm text-ink-soft">
        Mind the gap. You&apos;ve been dropped somewhere on the Underground and need to find your way
        across town.
      </p>

      <ol className="mt-4 flex flex-col gap-3.5">
        <Rule icon={<FogIcon />}>
          You start at a station with the fog down: only the stops one hop away are lit. Anywhere
          you visit stays on your map.
        </Rule>
        <Rule icon={<CompassIcon />}>
          The compass points to your destination and shows how far it is. It tells you{' '}
          <em>where</em>, never <em>which line</em>. That&apos;s the puzzle.
        </Rule>
        <Rule icon={<ChangeIcon />}>
          You ride your current line by default. Tap a lit station on another line to change, but
          each change counts against you.
        </Rule>
        <Rule icon={<FlagIcon />}>
          Reach the destination in as few stops and changes as you can. Come back each day to keep
          your streak alive.
        </Rule>
      </ol>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-xl bg-progress px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
      >
        Got it
      </button>
    </Modal>
  )
}

interface RuleProps {
  icon: React.ReactNode
  children: React.ReactNode
}

function Rule({ icon, children }: RuleProps) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone text-ink-soft">
        {icon}
      </span>
      <span className="text-sm leading-snug text-ink">{children}</span>
    </li>
  )
}

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function FogIcon() {
  return (
    <svg {...svgProps}>
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="5" y1="13" x2="19" y2="13" />
      <line x1="7" y1="17" x2="17" y2="17" />
    </svg>
  )
}

function CompassIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5" />
    </svg>
  )
}

function ChangeIcon() {
  return (
    <svg {...svgProps}>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg {...svgProps}>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 3.5L17 11H5" />
    </svg>
  )
}
