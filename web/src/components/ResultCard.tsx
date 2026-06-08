// End-of-game result dialog. Calm and celebratory rather than loud: the outcome
// headline, the weighted SCORE against par as the hero number (score =
// stops + 4*changes, the single comparable metric — see lib/score) with a
// self-explanatory "% optimal", stops/changes as supporting stats, the current
// streak, and the share + show-best-route + play-again actions. On a solved
// run the score counts up and a confetti burst fires (stronger when optimal),
// both suppressed under prefers-reduced-motion. The card condenses to fit a
// desktop viewport without an inner scrollbar. Presentational beyond the
// count-up tween; state arrives as props.

import { useEffect, useState } from 'react'
import Modal from './Modal'
import StationInfoCard from './StationInfoCard'
import Confetti from './Confetti'
import { ChangeIcon, StopIcon } from './icons'
import type { Station } from '../engine'
import type { StationInfo } from '../lib/stationInfo'
import { starRating } from '../lib/share'
import { formatCountdown, msToNextUtcMidnight } from '../lib/countdown'
import { AMBER_LIMIT, deltaTone, type Tone } from '../lib/score'

/** Green / amber / red text for a good / warn / bad tone. */
function toneText(tone: Tone): string {
  return tone === 'good' ? 'text-progress' : tone === 'warn' ? 'text-warn' : 'text-danger'
}

/** True when the user has asked for reduced motion (or matchMedia is absent). */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Tween an integer from 0 to `target` over `durationMs` with a cubic ease-out,
 * once, when `enabled`. When disabled (reduced motion, or an unsolved run) it
 * returns the final value immediately. Deps are stable across re-renders, so it
 * fires once per mount (i.e. once per result-card open).
 */
function useCountUp(target: number, enabled: boolean, durationMs = 520): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }
    let raf = 0
    let start: number | null = null
    const step = (t: number): void => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else setValue(target)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, enabled, durationMs])
  return value
}

interface Endpoint {
  station: Station
  info?: StationInfo
}

interface ResultCardProps {
  open: boolean
  solved: boolean
  /** Weighted score for the run = stops + 4*changes. The hero number. */
  score: number
  /** Weighted score of the optimal route (par). */
  parScore: number
  stops: number
  parStops: number
  changes: number
  parChanges: number
  optimal: boolean
  /** Hints taken this run (each added to the score); shown as a small note. */
  hintsUsed?: number
  /** Pre-built spoiler-free share text (see lib/share). */
  shareText: string
  streak: number
  /** Optional day's start station + trivia. */
  start?: Endpoint
  /** Optional day's destination station + trivia. */
  destination?: Endpoint
  /** Reveal the optimal route on the map. Omit to hide the button. */
  onShowOptimal?: () => void
  /**
   * Restart the same puzzle. Omit to hide the button: the genuine daily is one
   * attempt per day (the streak's integrity), so only archive replays get it.
   */
  onPlayAgain?: () => void
  onClose: () => void
}

export default function ResultCard({
  open,
  solved,
  score,
  parScore,
  stops,
  parStops,
  changes,
  parChanges,
  optimal,
  hintsUsed = 0,
  shareText,
  streak,
  start,
  destination,
  onShowOptimal,
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

  // Tick a "next puzzle in" countdown to the next UTC midnight while open.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  const handleShare = async () => {
    // Prefer the native share sheet (mobile especially); fall back to copying.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
        return
      } catch {
        // User dismissed the sheet, or share failed: fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      // Clipboard blocked (insecure context / denied permission): leave the
      // label unchanged rather than claim a copy that didn't happen.
    }
  }

  const headline = solved ? (optimal ? 'Spot on!' : 'You made it!') : 'Mind the gap'
  const stars = starRating(score, parScore, solved)
  const animate = open && solved && !prefersReducedMotion()
  const displayScore = useCountUp(score, animate)

  return (
    <Modal open={open} onClose={onClose} title={headline} size="wide">
      {animate && <Confetti count={optimal ? 90 : 40} />}

      <p className="text-sm text-ink-soft">
        {solved
          ? 'Here is how your run stacked up against the best possible route.'
          : 'No worries, the line was tricky today. Here is the best route you were chasing.'}
      </p>

      <StarRow stars={stars} animate={animate} />

      {hintsUsed > 0 && (
        <p className="mt-1 text-center text-xs text-ink-soft">
          Includes +{hintsUsed * 3} for {hintsUsed} {hintsUsed === 1 ? 'hint' : 'hints'}
        </p>
      )}

      <ScoreBlock
        score={score}
        displayScore={displayScore}
        parScore={parScore}
        stops={stops}
        parStops={parStops}
        changes={changes}
        parChanges={parChanges}
        solved={solved}
      />

      <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-stone px-4 py-2 text-sm">
        <FlameIcon />
        <span className="font-semibold text-ink">
          {streak === 0 ? 'No streak yet' : `${streak} day streak`}
        </span>
      </div>

      {(start || destination) && (
        // Two-up once the container (not the viewport) is wide enough, so the
        // cards sit side by side inside the wide modal yet stack on a phone.
        <div className="mt-2.5 @container">
          <div className="grid gap-2.5 @md:grid-cols-2">
            {start && (
              <StationInfoCard roleLabel="Start" station={start.station} info={start.info} />
            )}
            {destination && (
              <StationInfoCard
                roleLabel="Destination"
                station={destination.station}
                info={destination.info}
              />
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
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
        {onPlayAgain && (
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 rounded-xl border border-stone-200 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
          >
            Play again
          </button>
        )}
      </div>

      {onShowOptimal && (
        <button
          type="button"
          onClick={onShowOptimal}
          className="mt-2 w-full rounded-xl border border-stone-200 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
        >
          Show best route
        </button>
      )}

      {/* Time to the next daily, which rolls over at UTC midnight (see lib/countdown). */}
      <p className="mt-3 text-center text-xs text-ink-soft">
        Next puzzle in{' '}
        <span className="font-semibold tabular-nums text-ink">
          {formatCountdown(msToNextUtcMidnight(new Date(nowMs)))}
        </span>
      </p>
    </Modal>
  )
}

/**
 * The friendly headline: a 0-3 star rating, filled gold and empty grey. When
 * `animate` is set, the earned stars slam in one-by-one (Clash-of-Clans style);
 * the empty ones just sit there. Reduced motion is handled in CSS.
 */
function StarRow({ stars, animate }: { stars: number; animate: boolean }) {
  return (
    <div
      className="mt-3 flex justify-center gap-2 text-4xl leading-none"
      role="img"
      aria-label={`${stars} of 3 stars`}
    >
      {[0, 1, 2].map((i) => {
        const earned = i < stars
        return (
          <span
            key={i}
            className={`${earned ? 'text-flag' : 'text-stone-200'} ${
              earned && animate ? 'star-pop' : ''
            }`}
            // Stagger each earned star's slam-in.
            style={earned && animate ? { animationDelay: `${0.15 + i * 0.22}s` } : undefined}
            aria-hidden="true"
          >
            {earned ? '★' : '☆'}
          </span>
        )
      })}
    </div>
  )
}

interface ScoreBlockProps {
  /** Final weighted score (used for tone, aria, and the % optimal). */
  score: number
  /** Score to display now: the count-up value, or the final score at rest. */
  displayScore: number
  parScore: number
  stops: number
  parStops: number
  changes: number
  parChanges: number
  solved: boolean
}

/**
 * The hero metric: the weighted score, large and green/amber/red against par,
 * with a self-explanatory "% optimal" beside it and stops/changes as small
 * supporting stats beneath. Score is the thing that matters; the breakdown is
 * secondary. `displayScore` is the (possibly mid-tween) number to render.
 */
function ScoreBlock({
  score,
  displayScore,
  parScore,
  stops,
  parStops,
  changes,
  parChanges,
  solved,
}: ScoreBlockProps) {
  // A given-up run is a loss: the numbers read red regardless of how few stops
  // or changes were made, since the destination was never reached.
  const scoreTone: Tone = solved ? deltaTone(score, parScore, AMBER_LIMIT.score(parScore)) : 'bad'
  return (
    <div
      className="mt-3 rounded-xl border border-stone-200 bg-paper px-4 py-3 text-center"
      aria-label={`Score ${score}, best possible ${parScore}`}
    >
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">
        Score
      </span>
      <p className="mt-1 leading-none tabular-nums">
        <span className={`text-6xl font-extrabold ${toneText(scoreTone)}`}>{displayScore}</span>
        <span className="ml-2 text-lg font-semibold text-ink-soft">/ {parScore} best</span>
      </p>

      <div className="mt-2.5 flex items-center justify-center gap-5 border-t border-stone-200 pt-2.5 text-sm">
        <MiniStat
          icon={<StopIcon />}
          label="stops"
          value={stops}
          best={parStops}
          amber={AMBER_LIMIT.stops}
          solved={solved}
        />
        <MiniStat
          icon={<ChangeIcon />}
          label="changes"
          value={changes}
          best={parChanges}
          amber={AMBER_LIMIT.changes}
          solved={solved}
        />
      </div>
    </div>
  )
}

interface MiniStatProps {
  icon: React.ReactNode
  label: string
  value: number
  best: number
  amber: number
  /** When false (gave up), the value reads red regardless of how low it is. */
  solved: boolean
}

/** A small supporting stat: icon, green/amber/red value, and its best. */
function MiniStat({ icon, label, value, best, amber, solved }: MiniStatProps) {
  const tone: Tone = solved ? deltaTone(value, best, amber) : 'bad'
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="self-center text-base leading-none text-ink-soft" aria-hidden="true">
        {icon}
      </span>
      <span className={`font-bold tabular-nums ${toneText(tone)}`}>{value}</span>
      <span className="text-ink-soft">/ {best}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
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
