// App shell: loads the graph, builds the daily puzzle for today, and hands the
// loaded artefacts to the presentational <Game/>. Today's date is computed HERE
// (the engine never sees Date) and passed in for determinism + the share grid.

import { useEffect, useState } from 'react'
import {
  buildAdjacency,
  loadGraph,
  loadPuzzles,
  resolveDaily,
  resolveExpert,
} from './engine'
import type { Adjacency, PuzzleIndex, TubeGraph } from './engine'
import Game from './components/Game'

interface Loaded {
  graph: TubeGraph
  adj: Adjacency
  today: string
  /** Precomputed endpoints, or null when the file is unavailable. */
  puzzleIndex: PuzzleIndex | null
}

type Status =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: Loaded }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center text-neutral-100">
      {children}
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' })
  // Non-null while replaying a past puzzle from the archive menu.
  const [archiveDate, setArchiveDate] = useState<string | null>(null)
  // True while playing the Expert track. Composes with archiveDate: an archive
  // date + expert is the Expert variant of that past day; expert with no
  // archive date is today's Expert challenge.
  const [expert, setExpert] = useState(false)

  // The archive menu picks a date and whether to play its Expert variant; a
  // null date returns to today's ordinary daily.
  const selectDate = (d: string | null, asExpert = false) => {
    setArchiveDate(d)
    setExpert(asExpert)
  }
  // The header toggle flips today's Expert challenge, returning to today.
  const toggleExpert = () => {
    setArchiveDate(null)
    setExpert((e) => !e)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const graph = await loadGraph()
        const adj = buildAdjacency(graph)
        const today = todayISO()
        // The endpoints index is optional: if it fails to load, every lookup
        // falls back to on-the-fly generation.
        const puzzleIndex = await loadPuzzles()
        if (!cancelled) {
          setStatus({ phase: 'ready', data: { graph, adj, today, puzzleIndex } })
        }
      } catch (err) {
        if (!cancelled) {
          setStatus({
            phase: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (status.phase === 'loading') {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-400" />
          <p className="text-sm text-neutral-400">Loading the network…</p>
        </div>
      </Centered>
    )
  }

  if (status.phase === 'error') {
    return (
      <Centered>
        <div className="max-w-md">
          <p className="text-lg font-semibold text-rose-400">
            Couldn’t load the map
          </p>
          <p className="mt-2 text-sm text-neutral-400">{status.message}</p>
        </div>
      </Centered>
    )
  }

  const { graph, adj, today, puzzleIndex } = status.data
  // The date in play: a chosen past date, else today.
  const activeDate = archiveDate && archiveDate !== today ? archiveDate : today
  const activePuzzle = expert
    ? resolveExpert(graph, adj, activeDate, puzzleIndex)
    : resolveDaily(graph, adj, activeDate, puzzleIndex)
  // Expert shares the day's date, so key it apart to force a fresh game on toggle.
  const gameKey = expert ? `${activePuzzle.date}:expert` : activePuzzle.date
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Keyed so swapping puzzles (date or Expert track) resets per-run state. */}
      <Game
        key={gameKey}
        graph={graph}
        adj={adj}
        puzzle={activePuzzle}
        today={today}
        puzzleIndex={puzzleIndex}
        onSelectDate={selectDate}
        isExpert={expert}
        onToggleExpert={toggleExpert}
      />
    </div>
  )
}
