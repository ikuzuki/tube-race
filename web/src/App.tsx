// App shell: loads the graph, builds the daily puzzle for today, and hands the
// loaded artefacts to the presentational <Game/>. Today's date is computed HERE
// (the engine never sees Date) and passed in for determinism + the share grid.

import { useEffect, useState } from 'react'
import {
  buildAdjacency,
  dailyPuzzle,
  loadGraph,
} from './engine'
import type { Adjacency, DailyPuzzle, TubeGraph } from './engine'
import Game from './components/Game'

interface Loaded {
  graph: TubeGraph
  adj: Adjacency
  puzzle: DailyPuzzle
  today: string
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const graph = await loadGraph()
        const adj = buildAdjacency(graph)
        const today = todayISO()
        const puzzle = dailyPuzzle(graph, adj, today)
        if (!cancelled) {
          setStatus({ phase: 'ready', data: { graph, adj, puzzle, today } })
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

  const { graph, adj, puzzle, today } = status.data
  const activePuzzle =
    archiveDate && archiveDate !== today ? dailyPuzzle(graph, adj, archiveDate) : puzzle
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Keyed by date so swapping puzzles resets all per-run state. */}
      <Game
        key={activePuzzle.date}
        graph={graph}
        adj={adj}
        puzzle={activePuzzle}
        today={today}
        onSelectDate={setArchiveDate}
      />
    </div>
  )
}
