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
    expect(screen.getByText(/mind the gap/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByText(/mind the gap/i)).not.toBeInTheDocument()

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

  it('never offers a replay on the solved daily (one attempt per day)', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    render(
      <Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" initialState={solvedState()} />,
    )
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument()
  })

  it('offers Play again on a solved archive replay', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    // The puzzle's own date is in the past relative to today -> archive replay.
    render(
      <Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-07" initialState={solvedState()} />,
    )
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument()
  })

  it('offers a mid-run Start again only on archive replays', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    // One move into the run, unsolved.
    let s = initGame(puzzle, graph, adj)
    s = move(s, legalMoves(s, adj)[0], adj)
    const { unmount } = render(
      <Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-07" initialState={s} />,
    )
    expect(screen.getByRole('button', { name: /start again/i })).toBeInTheDocument()
    unmount()

    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" initialState={s} />)
    expect(screen.queryByRole('button', { name: /start again/i })).not.toBeInTheDocument()
  })

  it('shows hint and give-up controls during a run', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)
    expect(screen.getByRole('button', { name: /hint/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /give up/i })).toBeInTheDocument()
  })

  it('a hint adds 3 to the score and disables the hint button until a move', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)
    // Turn zero: score 0.
    expect(screen.getByLabelText(/Score 0, best possible/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /hint/i }))
    // +3 for one hint.
    expect(screen.getByLabelText(/Score 3, best possible/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hint/i })).toBeDisabled()
  })

  it('give up records a played-but-unsolved result and offers the best route', () => {
    localStorage.setItem('tube-race:onboarded:v1', '1')
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)
    fireEvent.click(screen.getByRole('button', { name: /give up/i }))

    // The unsolved result card appears with the best-route action.
    expect(screen.getByRole('button', { name: /show best route/i })).toBeInTheDocument()
    // Stats recorded the day as played, unsolved, streak reset to 0.
    const stats = JSON.parse(localStorage.getItem('tube-race:stats:v1') as string)
    expect(stats.played).toBe(1)
    expect(stats.solved).toBe(0)
    expect(stats.curStreak).toBe(0)
    // The archive completion is recorded as not solved.
    const archive = JSON.parse(localStorage.getItem('tube-race:archive:v1') as string)
    expect(archive['2026-06-06'].solved).toBe(false)
  })
})
