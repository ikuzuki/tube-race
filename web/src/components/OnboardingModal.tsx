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
    <Modal open={open} onClose={onClose} title="Mind the gap">
      <p className="text-sm text-ink-soft">
        You&apos;re given a start and a destination and have to find your way across town, in as few
        stops and line changes as you can.
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

      <div className="mt-4 rounded-xl border border-stone-200 bg-stone/60 px-4 py-3">
        <div className="flex items-center justify-center gap-6">
          <ScorePill colour="text-progress" amount="+1" label="each stop" />
          <ScorePill colour="text-warn" amount="+4" label="each change" />
        </div>
        <p className="mt-2 text-center text-xs leading-snug text-ink-soft">
          Your score adds up as you travel and lower is better: you&apos;re racing the best possible
          route, so changes are expensive. Come back each day to keep your streak alive.
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

/** Demo network geometry (viewBox coordinates). Stations sit on one row; the
 *  target sits up-right, reached by changing lines at Oxford Circus. */
const A = { x: 48, y: 80 } // Marble Arch
const B = { x: 123, y: 80 } // Bond Street
const C = { x: 198, y: 80 } // Oxford Circus (interchange)
const D = { x: 288, y: 80 } // Tottenham Court Road (a fogged decoy)
const T = { x: 273, y: 30 } // Green Park (the target)

const RED = '#e32017' // Central
const BLUE = '#0098d4' // Victoria

/**
 * A looping SVG storyboard of one tiny real run on a light map: ride the Central
 * line from Marble Arch two stops to Oxford Circus (a +1 pops up at each stop)
 * as the fog lifts, change to the Victoria line (+4), and arrive at Green Park.
 * All timing lives in the demo-* keyframes in index.css.
 */
function Demo() {
  return (
    <svg
      viewBox="0 0 330 108"
      className="mt-4 w-full rounded-xl border border-stone-200 bg-stone"
      role="img"
      aria-label="Demo of a run from Marble Arch to Green Park: two stops on the Central line scoring one each, a change to the Victoria line scoring four, then the target"
    >
      {/* Network edges. B-C, C-D and C-T start fogged and reveal as you near them. */}
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={RED} strokeWidth="4" opacity="0.5" />
      <line
        x1={B.x}
        y1={B.y}
        x2={C.x}
        y2={C.y}
        stroke={RED}
        strokeWidth="4"
        opacity="0.5"
        className="demo-reveal-c"
      />
      <g className="demo-reveal-d" opacity="0.5">
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

      {/* Stations + real names. */}
      <Station x={A.x} y={A.y} />
      <Label x={A.x} y={A.y}>Marble Arch</Label>
      <Station x={B.x} y={B.y} />
      <Label x={B.x} y={B.y}>Bond Street</Label>
      <g className="demo-reveal-c">
        <Station x={C.x} y={C.y} />
        <Label x={C.x} y={C.y}>Oxford Circus</Label>
      </g>
      <Station x={D.x} y={D.y} className="demo-reveal-d" />

      {/* Target: flagged ring + name, revealed with the rest of the fog. */}
      <g className="demo-reveal-d">
        <circle cx={T.x} cy={T.y} r="8" fill="none" stroke="var(--color-flag)" strokeWidth="2.5" />
        <circle cx={T.x} cy={T.y} r="3" fill="var(--color-flag)" />
        <text x={T.x} y={T.y - 13} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-ink)">
          Green Park
        </text>
      </g>
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

      {/* +1 per stop ridden; +4 for the line change. */}
      <Plus className="demo-plus1-b" colour="var(--color-progress)">+1</Plus>
      <Plus className="demo-plus1-c" colour="var(--color-progress)">+1</Plus>
      <Plus className="demo-plus4" colour="var(--color-warn)">+4</Plus>
      <Plus className="demo-plus1-t" colour="var(--color-progress)">+1</Plus>
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

function Label({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <text x={x} y={y + 16} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="var(--color-ink)">
      {children}
    </text>
  )
}

/** A score popup; its position and timing come from the className keyframe. */
function Plus({
  className,
  colour,
  children,
}: {
  className: string
  colour: string
  children: React.ReactNode
}) {
  return (
    <text className={className} textAnchor="middle" fontSize="12" fontWeight="800" fill={colour}>
      {children}
    </text>
  )
}

function ScorePill({ colour, amount, label }: { colour: string; amount: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-xl font-extrabold tabular-nums ${colour}`}>{amount}</span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </span>
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
