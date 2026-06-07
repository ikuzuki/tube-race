import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { buildAdjacency, dailyPuzzle, initGame } from '../engine'
import type { TubeGraph } from '../engine'
import fixture from '../engine/__fixtures__/graph.fixture.json'
import { useGameState } from './useGameState'

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)
const puzzle = dailyPuzzle(graph, adj, '2026-06-07')

describe('useGameState legalMoves', () => {
  it('offers moves while the run is live', () => {
    const { result } = renderHook(() => useGameState(puzzle, graph, adj))
    expect(result.current.legalMoves.length).toBeGreaterThan(0)
  })

  it('offers no moves once solved (the win is terminal)', () => {
    const solved = { ...initGame(puzzle, graph, adj), solved: true }
    const { result } = renderHook(() => useGameState(puzzle, graph, adj, solved))
    expect(result.current.legalMoves).toEqual([])
  })
})
