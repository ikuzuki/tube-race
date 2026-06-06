// Presentational game shell. Receives an already-loaded graph/adjacency/puzzle
// (App does the async loading) so tests can drive it from the committed fixture
// without any network. Owns no data fetching — only composition + the
// React-bound game state via useGameState.

import { useMemo } from 'react'
import type { Adjacency, DailyPuzzle, GameState, TubeGraph } from '../engine'
import { compass, stationIndex } from '../engine'
import { useGameState } from '../hooks/useGameState'
import { displayName } from '../lib/projection'
import Hud from './Hud'
import TubeMap from './TubeMap'
import ResultPanel from './ResultPanel'

interface GameProps {
  graph: TubeGraph
  adj: Adjacency
  puzzle: DailyPuzzle
  /** ISO date used for the share grid; defaults to the puzzle's own date. */
  today?: string
  /** Optional seed state, primarily for tests. */
  initialState?: GameState
}

export default function Game({
  graph,
  adj,
  puzzle,
  today,
  initialState,
}: GameProps) {
  const { state, play, restart } = useGameState(puzzle, graph, adj, initialState)
  const dateISO = today ?? puzzle.date

  const index = useMemo(() => stationIndex(graph), [graph])
  const targetName = displayName(
    index.get(puzzle.targetId)?.name ?? puzzle.targetId,
  )
  const startName = displayName(index.get(puzzle.startId)?.name ?? puzzle.startId)

  const { bearingDeg, km } = useMemo(
    () => compass(graph, state.currentId, puzzle.targetId),
    [graph, state.currentId, puzzle.targetId],
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
          Tube Race
        </h1>
        <span className="font-mono text-xs text-neutral-500">
          {dateISO} · from {startName}
        </span>
      </header>

      <Hud
        targetName={targetName}
        hops={state.path.length}
        parHops={puzzle.par.hops}
        changes={state.changes}
        parChanges={puzzle.par.changes}
        bearingDeg={bearingDeg}
        km={km}
      />

      <div className="relative">
        <TubeMap graph={graph} adj={adj} state={state} onMove={play} />
        {state.solved && (
          <ResultPanel
            state={state}
            dateISO={dateISO}
            targetName={targetName}
            onRestart={restart}
          />
        )}
      </div>

      <p className="text-center text-xs text-neutral-600">
        Only your surroundings are lit. Follow the compass to {targetName}; the
        network uncovers as you explore. Tap a glowing station to move.
      </p>
    </div>
  )
}
