import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { buildAdjacency, dailyPuzzle, initGame, legalMoves, move } from '../engine'
import type { GameState, TubeGraph } from '../engine'
import { displayName } from '../lib/format'
import fixture from '../engine/__fixtures__/graph.fixture.json'
import Game from './Game'

// The map has its own tests and needs layout/ResizeObserver; stub it so these
// tests focus on the shell wiring (chrome, modals, stats recording).
vi.mock('./PlayfieldMap', () => ({ default: () => <div data-testid="playfield" /> }))

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)
const puzzle = dailyPuzzle(graph, adj, '2026-06-06')

/** Replay the optimal route to reach a solved state for the result-card test. */
function solvedState(): GameState {
  let s = initGame(puzzle, graph, adj)
  for (let i = 1; i < puzzle.par.stations.length; i++) {
    const target = puzzle.par.stations[i]
    const nb = legalMoves(s, adj).find((m) => m.stationId === target)
    if (!nb) throw new Error(`no legal move to ${target}`)
    s = move(s, nb, adj)
  }
  return s
}

describe('Game shell', () => {
  beforeEach(() => localStorage.clear())

  it('shows the how-to-play card on first run and the destination', () => {
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)
    expect(screen.getByText(/how to play/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByText(/how to play/i)).not.toBeInTheDocument()

    const targetName = displayName(
      graph.stations.find((s) => s.id === puzzle.targetId)!.name,
    )
    expect(screen.getAllByText(targetName).length).toBeGreaterThan(0)
  })

  it('surfaces the result card and records stats when solved', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    render(
      <Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" initialState={solvedState()} />,
    )

    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()

    const raw = localStorage.getItem('tube-race:stats:v1')
    expect(raw).toBeTruthy()
    const stats = JSON.parse(raw as string)
    expect(stats.played).toBe(1)
    expect(stats.solved).toBe(1)
    expect(stats.curStreak).toBe(1)
  })
})
