import { describe, expect, it } from 'vitest'
import * as engine from './index'

// Smoke test: the public barrel must export every contract function and the
// pipeline must run end-to-end through it (no stub Errors remaining).
describe('engine public API', () => {
  it('exports every contract function', () => {
    const names = [
      'loadGraph',
      'buildAdjacency',
      'stationIndex',
      'shortestPath',
      'graphDistanceStops',
      'dailyPuzzle',
      'initGame',
      'legalMoves',
      'move',
      'compass',
      'isSolved',
      'score',
      'shareGrid',
    ] as const
    for (const name of names) {
      expect(typeof engine[name], name).toBe('function')
    }
  })

  it('runs a full game loop through the public API', async () => {
    const graph: engine.TubeGraph = {
      version: '1.0',
      generatedAt: '2026-01-01',
      lines: [{ id: 'L1', name: 'L1', colour: '#000' }],
      stations: [
        { id: 'a', name: 'A', lat: 0, lon: 0, lines: ['L1'] },
        { id: 'b', name: 'B', lat: 0.1, lon: 0, lines: ['L1'] },
        { id: 'c', name: 'C', lat: 0.2, lon: 0, lines: ['L1'] },
      ],
      edges: [
        { from: 'a', to: 'b', line: 'L1' },
        { from: 'b', to: 'c', line: 'L1' },
      ],
    }
    const adj = engine.buildAdjacency(graph)
    const puzzle = engine.dailyPuzzle(graph, adj, '2026-06-06', {
      minHops: 1,
      maxHops: 5,
      minChanges: 0,
    })
    let state = engine.initGame(puzzle, graph, adj)
    while (!engine.isSolved(state)) {
      const next = engine.legalMoves(state, adj).find((n) => {
        const sp = engine.shortestPath(adj, n.stationId, puzzle.targetId)
        const cur = engine.shortestPath(adj, state.currentId, puzzle.targetId)
        return sp !== null && cur !== null && sp.hops < cur.hops
      })
      expect(next).toBeDefined()
      state = engine.move(state, next!, adj)
    }
    const s = engine.score(state)
    expect(s.hops).toBeGreaterThan(0)
    const grid = engine.shareGrid(state, '2026-06-06')
    expect(grid).toContain('2026-06-06')
  })
})
