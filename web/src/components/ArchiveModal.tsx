// Past-puzzles menu: every daily from launch to yesterday (lib/archive
// archiveDates), newest first, rendered as a selectable list with endpoints, a
// difficulty chip and the player's best result. Puzzles are derived
// deterministically from their date on open (cheap, ~10ms each, capped) rather
// than at app start. Selecting an entry swaps the active puzzle via onSelect;
// the daily stays the default landing experience.

import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import type { Adjacency, DailyPuzzle, Tier, TubeGraph } from '../engine'
import { dailyPuzzle, stationIndex } from '../engine'
import { archiveDates, type ArchiveCompletions } from '../lib/archive'
import { displayName } from '../lib/format'

interface ArchiveModalProps {
  open: boolean
  onClose: () => void
  graph: TubeGraph
  adj: Adjacency
  /** Best results so far, keyed by puzzle date. */
  completions: ArchiveCompletions
  /** Date of the puzzle currently being played. */
  activeDate: string
  /** Today's ISO date (the daily puzzle's date). */
  todayISO: string
  /** Select a puzzle date to play; null returns to today's daily. */
  onSelect: (dateISO: string | null) => void
}

const TIER_STYLES: Record<Tier, string> = {
  easy: 'bg-progress text-white',
  medium: 'bg-warn text-ink',
  hard: 'bg-central text-white',
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
  todayISO,
  onSelect,
}: ArchiveModalProps) {
  // Past dates (newest first) recomputed only when the day rolls over.
  const dates = useMemo(() => archiveDates(todayISO), [todayISO])

  // Derive the archived puzzles lazily on first open; they are deterministic
  // per date so this never needs recomputing.
  const [puzzles, setPuzzles] = useState<DailyPuzzle[] | null>(null)
  useEffect(() => {
    if (!open || puzzles) return
    setPuzzles(dates.map((d) => dailyPuzzle(graph, adj, d)))
  }, [open, puzzles, dates, graph, adj])

  const stationsById = stationIndex(graph)
  const name = (id: string): string => displayName(stationsById.get(id)?.name ?? id)

  return (
    <Modal open={open} onClose={onClose} title="Past puzzles">
      <p className="text-sm text-ink-soft">
        Every past daily, newest first. A fresh one joins each day; your best run for each is kept.
      </p>

      <ol className="mt-4 flex flex-col gap-1.5">
        {(puzzles ?? []).map((p) => {
          const done = completions[p.date]
          const active = p.date === activeDate
          return (
            <li key={p.date}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p.date)
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

      {activeDate !== todayISO && (
        <button
          type="button"
          onClick={() => {
            onSelect(null)
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
