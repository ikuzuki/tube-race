// React binding around the pure engine. Holds the current GameState and exposes
// move/restart. Keeps all React state here so map/HUD components can stay
// presentational and the engine stays React-free.

import { useCallback, useMemo, useState } from 'react'
import {
  initGame,
  legalMoves as engineLegalMoves,
  move as engineMove,
} from '../engine'
import type {
  Adjacency,
  DailyPuzzle,
  GameState,
  Neighbour,
  TubeGraph,
} from '../engine'

export interface UseGameState {
  state: GameState
  /** Adjacent stations selectable right now (one per (station, line)). */
  legalMoves: Neighbour[]
  /** Apply a legal move. No-op-safe: illegal moves are ignored, not thrown. */
  play: (to: Neighbour) => void
  /** Re-initialise the same puzzle from the start. */
  restart: () => void
}

export function useGameState(
  puzzle: DailyPuzzle,
  graph: TubeGraph,
  adj: Adjacency,
  initialState?: GameState,
): UseGameState {
  const [state, setState] = useState<GameState>(
    () => initialState ?? initGame(puzzle, graph, adj),
  )

  const play = useCallback(
    (to: Neighbour) => {
      setState((prev) => {
        if (prev.solved) return prev
        try {
          return engineMove(prev, to, adj)
        } catch {
          // Defensive: a stale click on a no-longer-legal move shouldn't crash.
          return prev
        }
      })
    },
    [adj],
  )

  const restart = useCallback(() => {
    setState(initGame(puzzle, graph, adj))
  }, [puzzle, graph, adj])

  const legalMoves = useMemo(
    () => engineLegalMoves(state, adj),
    [state, adj],
  )

  return { state, legalMoves, play, restart }
}
