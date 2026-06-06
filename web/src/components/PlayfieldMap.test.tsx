import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import PlayfieldMap from './PlayfieldMap'
import {
  buildAdjacency,
  stationIndex,
  legalMoves as engineLegalMoves,
  initGame,
  shortestPath,
} from '../engine'
import type {
  Adjacency,
  DailyPuzzle,
  GameState,
  Neighbour,
  Station,
  TubeGraph,
} from '../engine'
import fixture from '../engine/__fixtures__/graph.fixture.json'

const graph = fixture as unknown as TubeGraph
const adj: Adjacency = buildAdjacency(graph)
const index: Map<string, Station> = stationIndex(graph)

const START = 'brixton'
const TARGET = 'walthamstow-central'

function makePuzzle(): DailyPuzzle {
  const par = shortestPath(adj, START, TARGET)
  if (!par) throw new Error('fixture should be connected')
  return { date: '2026-06-06', startId: START, targetId: TARGET, par }
}

function currentLineOf(state: GameState): string | null {
  return state.path.at(-1)?.line ?? null
}

// jsdom lacks ResizeObserver; useAspect guards for it, but stub a no-op so the
// effect path is exercised without throwing.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver
  }
})

afterEach(() => cleanup())

function renderMap(state: GameState, onMove = vi.fn()) {
  const legal = engineLegalMoves(state, adj)
  const utils = render(
    <PlayfieldMap
      graph={graph}
      adj={adj}
      state={state}
      legalMoves={legal}
      currentLine={currentLineOf(state)}
      targetId={TARGET}
      stationsById={index}
      onMove={onMove}
    />,
  )
  return { ...utils, onMove, legal }
}

describe('PlayfieldMap (render smoke)', () => {
  it('renders the map svg and only the revealed stations are labelled relevantly', () => {
    const state = initGame(makePuzzle(), graph, adj)
    renderMap(state)

    // The map root renders.
    expect(screen.getByRole('img', { name: /tube map/i })).toBeInTheDocument()

    // At the start (currentLine null), the start's neighbours are continuation
    // moves => rendered as clickable "Move to …" buttons. Brixton's only
    // neighbour is Stockwell.
    expect(
      screen.getByRole('button', { name: /move to stockwell/i }),
    ).toBeInTheDocument()
  })

  it('fires onMove with the continuation neighbour when a default move is tapped', () => {
    const state = initGame(makePuzzle(), graph, adj)
    const { onMove } = renderMap(state)

    fireEvent.click(screen.getByRole('button', { name: /move to stockwell/i }))

    expect(onMove).toHaveBeenCalledTimes(1)
    const arg = onMove.mock.calls[0][0] as Neighbour
    expect(arg.stationId).toBe('stockwell')
    expect(arg.line).toBe('victoria')
  })

  it('does not render moves for stations outside the revealed fog', () => {
    const state = initGame(makePuzzle(), graph, adj)
    renderMap(state)
    // Walthamstow (the far target) is not revealed at the start: no move button.
    expect(
      screen.queryByRole('button', { name: /move to walthamstow/i }),
    ).not.toBeInTheDocument()
  })

  it('treats a line change as a deliberate, confirm-first switch', () => {
    // Walk one hop on the Victoria line to Stockwell so currentLine = victoria.
    // Stockwell also sits on the Northern line (-> Oval), a SWITCH move.
    const start = initGame(makePuzzle(), graph, adj)
    const atStockwell: GameState = {
      ...start,
      currentId: 'stockwell',
      path: [{ stationId: 'stockwell', line: 'victoria' }],
      revealed: new Set([...start.revealed, 'stockwell', 'vauxhall', 'oval']),
    }
    const { onMove } = renderMap(atStockwell)

    // The Northern-line neighbour is exposed as a "Change line" affordance,
    // NOT a one-tap "Move to" button.
    const switchNode = screen.getByRole('button', { name: /change line to reach oval/i })
    expect(switchNode).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /move to oval/i }),
    ).not.toBeInTheDocument()

    // Tapping it must NOT immediately move — it arms a confirm chip first.
    fireEvent.click(switchNode)
    expect(onMove).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: /^switch$/i })
    expect(confirm).toBeInTheDocument()

    // Confirming commits the move on the Northern line.
    fireEvent.click(confirm)
    expect(onMove).toHaveBeenCalledTimes(1)
    const arg = onMove.mock.calls[0][0] as Neighbour
    expect(arg.stationId).toBe('oval')
    expect(arg.line).toBe('northern')
  })

  it('still offers the continuation move alongside a switch at an interchange', () => {
    const start = initGame(makePuzzle(), graph, adj)
    const atStockwell: GameState = {
      ...start,
      currentId: 'stockwell',
      path: [{ stationId: 'stockwell', line: 'victoria' }],
      revealed: new Set([...start.revealed, 'stockwell', 'vauxhall', 'oval']),
    }
    renderMap(atStockwell)
    // Vauxhall continues the Victoria line => one-tap default.
    expect(
      screen.getByRole('button', { name: /move to vauxhall/i }),
    ).toBeInTheDocument()
  })
})
