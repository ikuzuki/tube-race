// Past-puzzles menu: every daily from launch to yesterday (lib/archive
// archiveDates), newest first, rendered as a selectable list with endpoints, a
// difficulty chip and the player's best result. Puzzles are derived
// deterministically from their date on open (cheap, ~10ms each, capped) rather
// than at app start. Selecting an entry swaps the active puzzle via onSelect;
// the daily stays the default landing experience.

import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import type { Adjacency, DailyPuzzle, PuzzleIndex, Tier, TubeGraph } from '../engine'
import { resolveDaily, resolveExpert, stationIndex } from '../engine'
import { archiveDates, expertKey, type ArchiveCompletions } from '../lib/archive'
import { displayName } from '../lib/format'

interface ArchiveModalProps {
  open: boolean
  onClose: () => void
  graph: TubeGraph
  adj: Adjacency
  /** Best results so far, keyed by puzzle date (Expert keyed apart, see lib/archive). */
  completions: ArchiveCompletions
  /** Date of the puzzle currently being played. */
  activeDate: string
  /** Whether the puzzle in play is an Expert variant. */
  activeExpert: boolean
  /** Today's ISO date (the daily puzzle's date). */
  todayISO: string
  /** Precomputed endpoints, so the list reads instantly (null falls back to generation). */
  puzzleIndex?: PuzzleIndex | null
  /** Select a puzzle date and whether to play its Expert variant; null date returns to today. */
  onSelect: (dateISO: string | null, expert: boolean) => void
}

type Mode = 'daily' | 'expert'

const TIER_STYLES: Record<Tier, string> = {
  easy: 'bg-progress text-white',
  medium: 'bg-warn text-ink',
  hard: 'bg-central text-white',
  expert: 'bg-ink text-white',
}

/** "2026-05-18" -> "18 May" (falls back to the raw string if unparseable). */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ArchiveModal({
  open,
  onClose,
  graph,
  adj,
  completions,
  activeDate,
  activeExpert,
  todayISO,
  puzzleIndex = null,
  onSelect,
}: ArchiveModalProps) {
  // Past dates (newest first) recomputed only when the day rolls over.
  const dates = useMemo(() => archiveDates(todayISO), [todayISO])

  // Open on whichever track is in play, but let the toggle switch freely.
  const [mode, setMode] = useState<Mode>(activeExpert ? 'expert' : 'daily')
  useEffect(() => {
    if (open) setMode(activeExpert ? 'expert' : 'daily')
  }, [open, activeExpert])

  // Derive the archived puzzles lazily, per track, caching each once built;
  // they are deterministic per date so a track never needs recomputing.
  const [cache, setCache] = useState<Record<Mode, DailyPuzzle[] | null>>({
    daily: null,
    expert: null,
  })
  useEffect(() => {
    if (!open || cache[mode]) return
    const build = mode === 'expert' ? resolveExpert : resolveDaily
    setCache((c) => ({ ...c, [mode]: dates.map((d) => build(graph, adj, d, puzzleIndex)) }))
  }, [open, mode, cache, dates, graph, adj, puzzleIndex])
  const puzzles = cache[mode]

  const stationsById = stationIndex(graph)
  const name = (id: string): string => displayName(stationsById.get(id)?.name ?? id)
  const expert = mode === 'expert'

  return (
    <Modal open={open} onClose={onClose} title="Past puzzles">
      <p className="text-sm text-ink-soft">
        {expert
          ? 'The Expert variant of each past day: the toughest routes the network can throw at you.'
          : 'Every past daily, newest first. A fresh one joins each day; your best run for each is kept.'}
      </p>

      <ModeToggle mode={mode} onChange={setMode} />

      <ol className="mt-3 flex flex-col gap-1.5">
        {(puzzles ?? []).map((p) => {
          const done = completions[expert ? expertKey(p.date) : p.date]
          const active = p.date === activeDate && expert === activeExpert
          return (
            <li key={p.date}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p.date, expert)
                  onClose()
                }}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition hover:bg-stone ${
                  active ? 'border-progress bg-stone/60' : 'border-stone-200'
                }`}
              >
                <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-ink-soft">
                  {shortDate(p.date)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {name(p.startId)} to {name(p.targetId)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    {p.tier && (
                      <span
                        className={`inline-flex rounded-full px-2 py-px text-[0.6rem] font-bold uppercase tracking-wide ${TIER_STYLES[p.tier]}`}
                      >
                        {p.tier}
                      </span>
                    )}
                    <span className="text-xs text-ink-soft">
                      {done
                        ? done.solved
                          ? `Solved: ${done.score} (best ${done.parScore})`
                          : 'Attempted'
                        : 'Not played'}
                    </span>
                  </span>
                </span>
                {done?.solved && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-progress)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-label="Solved"
                    role="img"
                  >
                    <path d="M4 12l5 5L20 7" />
                  </svg>
                )}
              </button>
            </li>
          )
        })}
      </ol>

      {(activeDate !== todayISO || activeExpert) && (
        <button
          type="button"
          onClick={() => {
            onSelect(null, false)
            onClose()
          }}
          className="mt-4 w-full rounded-xl bg-progress px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress"
        >
          Back to today&apos;s puzzle
        </button>
      )}
    </Modal>
  )
}

/** Daily / Expert segmented toggle for the archive list. */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mt-4 inline-flex rounded-full border border-stone-200 bg-stone p-0.5" role="group" aria-label="Puzzle track">
      <ModeButton active={mode === 'daily'} onClick={() => onChange('daily')}>
        Daily
      </ModeButton>
      <ModeButton active={mode === 'expert'} onClick={() => onChange('expert')}>
        Expert
      </ModeButton>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold transition ${
        active ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
