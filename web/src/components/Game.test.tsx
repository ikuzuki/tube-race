import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import fixture from '../engine/__fixtures__/graph.fixture.json'
import {
  buildAdjacency,
  initGame,
  move,
  shortestPath,
} from '../engine'
import type {
  Adjacency,
  DailyPuzzle,
  GameState,
  TubeGraph,
} from '../engine'
import Game from './Game'

const graph = fixture as TubeGraph

function setup(startId: string, targetId: string) {
  const adj: Adjacency = buildAdjacency(graph)
  const par = shortestPath(adj, startId, targetId)
  if (!par) throw new Error('test setup: unreachable pair')
  const puzzle: DailyPuzzle = { date: '2026-06-06', startId, targetId, par }
  return { adj, puzzle }
}

describe('Game (fog-of-war Navigate)', () => {
  it('renders the destination and aiming info from the provided puzzle', () => {
    const { adj, puzzle } = setup('brixton', 'walthamstow-central')
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)

    // Destination name (Walthamstow Central) appears in the HUD.
    expect(
      screen.getAllByText('Walthamstow Central').length,
    ).toBeGreaterThan(0)
    // Start station label in the header.
    expect(screen.getByText(/from Brixton/i)).toBeInTheDocument()
    // Compass renders a km readout.
    expect(screen.getByText(/km$/)).toBeInTheDocument()
  })

  it('reveals the start and its neighbour, hiding far stations until explored', () => {
    const { adj, puzzle } = setup('brixton', 'walthamstow-central')
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)

    // Brixton (start) is current and revealed.
    expect(screen.getByLabelText('Brixton')).toBeInTheDocument()
    // Stockwell is the one-hop neighbour, exposed as a move button.
    expect(
      screen.getByRole('button', { name: /Move to Stockwell/i }),
    ).toBeInTheDocument()
    // Vauxhall is two hops away and must still be fogged.
    expect(screen.queryByLabelText('Vauxhall')).not.toBeInTheDocument()
  })

  it('advances the current station when a legal neighbour is clicked', () => {
    const { adj, puzzle } = setup('brixton', 'walthamstow-central')
    render(<Game graph={graph} adj={adj} puzzle={puzzle} today="2026-06-06" />)

    // Vauxhall is fogged before moving (two hops from Brixton).
    expect(screen.queryByLabelText(/Vauxhall/i)).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Move to Stockwell/i }),
    )

    // Stockwell is now current; Vauxhall (its neighbour) is freshly revealed and
    // becomes a legal move, so it surfaces as a "Move to Vauxhall" button.
    expect(
      screen.getByRole('button', { name: /Move to Vauxhall/i }),
    ).toBeInTheDocument()
    // Stockwell is no longer a move target — it's where we now stand.
    expect(
      screen.queryByRole('button', { name: /Move to Stockwell/i }),
    ).not.toBeInTheDocument()
  })

  it('offers a line picker when parallel lines connect to a neighbour', () => {
    // Seed the game already standing at Euston. King's Cross is reachable on
    // BOTH victoria and northern, so it must present a line choice.
    const { adj, puzzle } = setup('euston', 'walthamstow-central')
    const seeded: GameState = initGame(puzzle, graph, adj)
    render(
      <Game
        graph={graph}
        adj={adj}
        puzzle={puzzle}
        today="2026-06-06"
        initialState={seeded}
      />,
    )

    // Click the King's Cross node: it should open a picker rather than move.
    fireEvent.click(
      screen.getByRole('button', { name: /Move to King's Cross/i }),
    )

    const picker = screen.getByTestId('line-picker-kings-cross')
    expect(picker).toBeInTheDocument()
    // Both lines are offered.
    expect(
      within(picker).getByLabelText(/Take the Victoria line/i),
    ).toBeInTheDocument()
    expect(
      within(picker).getByLabelText(/Take the Northern line/i),
    ).toBeInTheDocument()
  })

  it('moving onto the target shows the score and a copyable share text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    // Build a solved state directly via the engine: Brixton -> Stockwell.
    const { adj, puzzle } = setup('brixton', 'stockwell')
    let state: GameState = initGame(puzzle, graph, adj)
    state = move(state, { stationId: 'stockwell', line: 'victoria' }, adj)
    expect(state.solved).toBe(true)

    render(
      <Game
        graph={graph}
        adj={adj}
        puzzle={puzzle}
        today="2026-06-06"
        initialState={state}
      />,
    )

    // Result dialog with the win + score appears.
    const dialog = screen.getByRole('dialog', { name: /result/i })
    expect(dialog).toBeInTheDocument()
    // Share grid contains the date and the metro emoji.
    expect(within(dialog).getByText(/Tube Race 2026-06-06/)).toBeInTheDocument()

    // Copy button writes the share grid to the clipboard.
    fireEvent.click(within(dialog).getByRole('button', { name: /Copy result/i }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('Tube Race 2026-06-06')
    expect(copied).toContain('🚇')
  })

  it('restart returns to the start and clears the result panel', () => {
    const { adj, puzzle } = setup('brixton', 'stockwell')
    let state: GameState = initGame(puzzle, graph, adj)
    state = move(state, { stationId: 'stockwell', line: 'victoria' }, adj)

    render(
      <Game
        graph={graph}
        adj={adj}
        puzzle={puzzle}
        today="2026-06-06"
        initialState={state}
      />,
    )

    expect(screen.getByRole('dialog', { name: /result/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Play again/i }))

    // Dialog gone; Stockwell is back to a clickable move from Brixton.
    expect(
      screen.queryByRole('dialog', { name: /result/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Move to Stockwell/i }),
    ).toBeInTheDocument()
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
