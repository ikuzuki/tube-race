// First-run "how to play" card. Leads with a looping animated mini-demo of
// actual gameplay (fog lifting, two stops ridden, a line change costing +4,
// arrival), followed by three tight rules and an explicit scoring strip:
// score = stops + 4 x changes, lower is better, you are racing the optimal
// route. The animation timeline lives in index.css (demo-* keyframes). The
// primary "Got it" button is the only way out beyond the usual close/escape.

import Modal from './Modal'

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <p className="text-sm text-ink-soft">
        Mind the gap. You&apos;ve been dropped somewhere on the network and need to find your way
        across town.
      </p>

      <Demo />

      <ol className="mt-4 flex flex-col gap-3">
        <Rule icon={<FogIcon />}>
          You start with the fog down: only the stops one hop away are lit. Anywhere you visit
          stays on your map.
        </Rule>
        <Rule icon={<CompassIcon />}>
          The compass points to your destination and shows how far it is. It tells you{' '}
          <em>where</em>, never <em>which line</em>. That&apos;s the puzzle.
        </Rule>
        <Rule icon={<ChangeIcon />}>
          You ride your current line by default. Tap a lit station on another line to change.
        </Rule>
      </ol>

      <div className="mt-4 rounded-xl border border-stone-200 bg-stone/60 px-4 py-3 text-center">
        <p className="text-base font-extrabold tracking-tight text-ink">
          Score = stops + 4 × changes
        </p>
        <p className="mt-1 text-xs leading-snug text-ink-soft">
          Lower is better: you&apos;re racing the best possible route. Changes are expensive, so
          think before switching lines. Come back each day to keep your streak alive.
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl bg-progress px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
      >
        Got it
      </button>
    </Modal>
  )
}

// --- Animated mini-demo ------------------------------------------------------

/** Demo network geometry (viewBox coordinates). */
const A = { x: 35, y: 85 }
const B = { x: 110, y: 85 }
const C = { x: 185, y: 85 }
const D = { x: 285, y: 85 }
const T = { x: 265, y: 30 }

const RED = '#e32017'
const BLUE = '#0098d4'

/**
 * A looping SVG storyboard of one tiny game: ride the red line two stops as the
 * fog lifts, change to the blue line (+4 pops up), arrive at the flagged
 * target. All timing lives in the demo-* keyframes in index.css.
 */
function Demo() {
  return (
    <svg
      viewBox="0 0 320 120"
      className="mt-4 w-full rounded-xl bg-map"
      role="img"
      aria-label="Demo of a run: two stops on one line, a change costing four points, then the target"
    >
      {/* Network edges. C-D and C-T start fogged and reveal as the player nears. */}
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={RED} strokeWidth="4" opacity="0.55" />
      <line
        x1={B.x}
        y1={B.y}
        x2={C.x}
        y2={C.y}
        stroke={RED}
        strokeWidth="4"
        opacity="0.55"
        className="demo-reveal-c"
      />
      <g className="demo-reveal-d" opacity="0.55">
        <line x1={C.x} y1={C.y} x2={D.x} y2={D.y} stroke={RED} strokeWidth="4" />
        <line x1={C.x} y1={C.y} x2={T.x} y2={T.y} stroke={BLUE} strokeWidth="4" />
      </g>

      {/* Ridden trail, drawn in behind the player. */}
      <line
        x1={A.x}
        y1={A.y}
        x2={C.x}
        y2={C.y}
        stroke={RED}
        strokeWidth="5"
        strokeLinecap="round"
        className="demo-trail-red"
      />
      <line
        x1={C.x}
        y1={C.y}
        x2={T.x}
        y2={T.y}
        stroke={BLUE}
        strokeWidth="5"
        strokeLinecap="round"
        className="demo-trail-blue"
      />

      {/* Stations. */}
      <Station x={A.x} y={A.y} />
      <Station x={B.x} y={B.y} />
      <Station x={C.x} y={C.y} className="demo-reveal-c" />
      <Station x={D.x} y={D.y} className="demo-reveal-d" />
      {/* Target: flagged ring, revealed with the rest of the fog. */}
      <g className="demo-reveal-d">
        <circle cx={T.x} cy={T.y} r="8" fill="none" stroke="var(--color-flag)" strokeWidth="2.5" />
        <circle cx={T.x} cy={T.y} r="3" fill="var(--color-flag)" />
      </g>
      {/* Arrival pulse. */}
      <circle
        cx={T.x}
        cy={T.y}
        r="13"
        fill="none"
        stroke="var(--color-progress-ring)"
        strokeWidth="2"
        className="demo-done"
      />

      {/* The player: green dot with a compass needle tracking the target. */}
      <g className="demo-player">
        <circle r="6.5" fill="var(--color-progress)" stroke="#fff" strokeWidth="2" />
        <g className="demo-compass">
          <line x1="0" y1="-9" x2="0" y2="-17" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <path d="M0,-21 L3.5,-15.5 L-3.5,-15.5 Z" fill="var(--color-progress-ring)" />
        </g>
      </g>

      {/* Cost of the line change. */}
      <text
        className="demo-plus4"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fill="var(--color-warn)"
      >
        +4
      </text>
    </svg>
  )
}

function Station({ x, y, className }: { x: number; y: number; className?: string }) {
  return (
    <circle
      cx={x}
      cy={y}
      r="5"
      fill="#fff"
      stroke="var(--color-map-500)"
      strokeWidth="2"
      className={className}
    />
  )
}

// --- Rules -------------------------------------------------------------------

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
