// End-of-game result dialog. Calm and celebratory rather than loud: the outcome
// headline, stops and changes against par, an "Optimal!" badge when the run was
// perfect, the current streak, and the share + play-again actions. The share
// button copies the spoiler-free grid to the clipboard. Presentational — state
// arrives as props.

import { useEffect, useState } from 'react'
import Modal from './Modal'

interface ResultCardProps {
  open: boolean
  solved: boolean
  stops: number
  parStops: number
  changes: number
  parChanges: number
  optimal: boolean
  /** Pre-built spoiler-free share text (see lib/share). */
  shareText: string
  streak: number
  onPlayAgain: () => void
  onClose: () => void
}

export default function ResultCard({
  open,
  solved,
  stops,
  parStops,
  changes,
  parChanges,
  optimal,
  shareText,
  streak,
  onPlayAgain,
  onClose,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false)

  // Clear the "Copied!" feedback shortly after it shows, and whenever the dialog
  // re-opens for a fresh result.
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      // Clipboard blocked (insecure context / denied permission): leave the
      // label unchanged rather than claim a copy that didn't happen.
    }
  }

  const headline = solved ? (optimal ? 'Spot on!' : 'You made it!') : 'Mind the gap'

  return (
    <Modal open={open} onClose={onClose} title={headline}>
      {solved && optimal && (
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-progress/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-progress">
          <DotIcon /> Optimal route
        </span>
      )}

      <p className="text-sm text-ink-soft">
        {solved
          ? 'Here is how your run stacked up against the best possible route.'
          : 'No worries — the line was tricky today. Here is the par you were chasing.'}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ResultStat label="Stops" value={stops} par={parStops} overPar={stops > parStops} />
        <ResultStat label="Changes" value={changes} par={parChanges} overPar={changes > parChanges} />
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-stone px-4 py-2.5 text-sm">
        <FlameIcon />
        <span className="font-semibold text-ink">
          {streak === 0 ? 'No streak yet' : `${streak} day streak`}
        </span>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={handleShare}
          className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-progress px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
        >
          {copied ? (
            'Copied!'
          ) : (
            <>
              <ShareIcon /> Share
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-xl border border-stone-200 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
        >
          Play again
        </button>
      </div>
    </Modal>
  )
}

interface ResultStatProps {
  label: string
  value: number
  par: number
  overPar: boolean
}

function ResultStat({ label, value, par, overPar }: ResultStatProps) {
  return (
    <div className="rounded-xl border border-stone-200 bg-paper px-3 py-2.5">
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <p className="mt-0.5 text-lg font-bold leading-none tabular-nums">
        <span className={overPar ? 'text-warn' : 'text-ink'}>{value}</span>
        <span className="text-sm font-semibold text-ink-soft"> / {par} par</span>
      </p>
    </div>
  )
}

function DotIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  )
}

function FlameIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-warn)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3c1 3-1.5 4-1.5 6.5A1.5 1.5 0 0 0 13 11c.5-1 .5-2 .5-2 1.5 1.5 3 3 3 5.5a4.5 4.5 0 1 1-9 0C7.5 11 10 8 12 3Z" />
    </svg>
  )
}
