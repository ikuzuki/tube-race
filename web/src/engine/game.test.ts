import { describe, expect, it } from 'vitest'
import { buildAdjacency } from './graph'
import { shortestPath } from './dijkstra'
import {
  compass,
  initGame,
  isSolved,
  legalMoves,
  move,
  score,
  shareGrid,
} from './game'
import type { DailyPuzzle, Edge, GameState, TubeGraph } from './types'

function graphFromEdges(edges: Edge[], coords: Record<string, [number, number]> = {}): TubeGraph {
  const ids = new Set<string>()
  for (const e of edges) {
    ids.add(e.from)
    ids.add(e.to)
  }
  return {
    version: '1.0',
    generatedAt: '2026-01-01',
    lines: [],
    stations: [...ids].map((id) => {
      const [lat, lon] = coords[id] ?? [0, 0]
      return { id, name: id, lat, lon, lines: [] }
    }),
    edges,
  }
}

/** A small linear graph a-b-c-d on L1, plus a branch b-e on L2. */
function fixtureGame(): { graph: TubeGraph; adj: ReturnType<typeof buildAdjacency> } {
  const graph = graphFromEdges([
    { from: 'a', to: 'b', line: 'L1' },
    { from: 'b', to: 'c', line: 'L1' },
    { from: 'c', to: 'd', line: 'L1' },
    { from: 'b', to: 'e', line: 'L2' },
  ])
  return { graph, adj: buildAdjacency(graph) }
}

function puzzleFor(
  adj: ReturnType<typeof buildAdjacency>,
  startId: string,
  targetId: string,
): DailyPuzzle {
  const par = shortestPath(adj, startId, targetId)
  if (!par) throw new Error('test setup: unreachable pair')
  return { date: '2026-06-06', startId, targetId, par }
}

describe('initGame', () => {
  it('starts at the start station with start + neighbours revealed', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    expect(state.currentId).toBe('a')
    expect(state.startId).toBe('a')
    expect(state.path).toEqual([])
    expect(state.changes).toBe(0)
    expect(state.solved).toBe(false)
    // a's only neighbour is b.
    expect([...state.revealed].sort()).toEqual(['a', 'b'])
  })

  it('marks solved immediately if start === target', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'a', 'a'), graph, adj)
    expect(state.solved).toBe(true)
  })
})

describe('legalMoves', () => {
  it('returns the current station neighbours, one per (station, line)', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'b', 'd'), graph, adj)
    const moves = legalMoves(state, adj).map((m) => `${m.stationId}:${m.line}`).sort()
    expect(moves).toEqual(['a:L1', 'c:L1', 'e:L2'])
  })

  it('returns a defensive copy (mutating it does not change adjacency)', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'b', 'd'), graph, adj)
    const moves = legalMoves(state, adj)
    moves.pop()
    expect(legalMoves(state, adj).length).toBe(3)
  })
})

describe('move', () => {
  it('rejects an illegal move (not a neighbour)', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    expect(() => move(state, { stationId: 'd', line: 'L1' }, adj)).toThrow(/illegal/)
  })

  it('rejects a move on the wrong line (parallel-edge discipline)', () => {
    // b-e exists only on L2, not L1.
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'b', 'd'), graph, adj)
    expect(() => move(state, { stationId: 'e', line: 'L1' }, adj)).toThrow(/illegal/)
  })

  it('advances current, appends to path, and grows the reveal set', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    const after = move(state, { stationId: 'b', line: 'L1' }, adj)
    expect(after.currentId).toBe('b')
    expect(after.path).toEqual([{ stationId: 'b', line: 'L1' }])
    // b reveals a, b, c, e.
    expect([...after.revealed].sort()).toEqual(['a', 'b', 'c', 'e'])
  })

  it('does not count the first move as a change', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    const after = move(state, { stationId: 'b', line: 'L1' }, adj)
    expect(after.changes).toBe(0)
  })

  it('increments changes only when the line switches', () => {
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'e'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj) // first move, no change
    expect(state.changes).toBe(0)
    state = move(state, { stationId: 'e', line: 'L2' }, adj) // L1 -> L2, change
    expect(state.changes).toBe(1)
  })

  it('does not increment changes when staying on the same line', () => {
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj)
    state = move(state, { stationId: 'c', line: 'L1' }, adj)
    state = move(state, { stationId: 'd', line: 'L1' }, adj)
    expect(state.changes).toBe(0)
  })

  it('sets solved when the target is reached', () => {
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'b'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj)
    expect(state.solved).toBe(true)
    expect(isSolved(state)).toBe(true)
  })

  it('is pure: the original state is untouched', () => {
    const { graph, adj } = fixtureGame()
    const state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    const revealedSnapshot = [...state.revealed].sort()
    const pathSnapshot = [...state.path]

    move(state, { stationId: 'b', line: 'L1' }, adj)

    expect(state.currentId).toBe('a')
    expect([...state.revealed].sort()).toEqual(revealedSnapshot)
    expect(state.path).toEqual(pathSnapshot)
    expect(state.changes).toBe(0)
    expect(state.solved).toBe(false)
  })
})

describe('compass', () => {
  it('gives ~0 degrees for a due-north target', () => {
    const graph = graphFromEdges([{ from: 's', to: 'n', line: 'L1' }], {
      s: [0, 0],
      n: [1, 0], // same lon, higher lat => due north
    })
    const c = compass(graph, 's', 'n')
    expect(c.bearingDeg).toBeCloseTo(0, 1)
    // ~1 degree of latitude ≈ 111.19 km.
    expect(c.km).toBeCloseTo(111.19, 0)
  })

  it('gives ~90 degrees for a due-east target', () => {
    const graph = graphFromEdges([{ from: 'w', to: 'e', line: 'L1' }], {
      w: [0, 0],
      e: [0, 1], // same lat (equator), higher lon => due east
    })
    const c = compass(graph, 'w', 'e')
    expect(c.bearingDeg).toBeCloseTo(90, 1)
    expect(c.km).toBeCloseTo(111.19, 0)
  })

  it('gives ~180 degrees for a due-south target and bearing stays in [0,360)', () => {
    const graph = graphFromEdges([{ from: 'n', to: 's', line: 'L1' }], {
      n: [1, 0],
      s: [0, 0],
    })
    const c = compass(graph, 'n', 's')
    expect(c.bearingDeg).toBeCloseTo(180, 1)
    expect(c.bearingDeg).toBeGreaterThanOrEqual(0)
    expect(c.bearingDeg).toBeLessThan(360)
  })

  it('matches a known real-world distance (Euston to King\'s Cross ~0.9 km)', () => {
    const graph = graphFromEdges([{ from: 'euston', to: 'kings-cross', line: 'victoria' }], {
      euston: [51.5282, -0.1337],
      'kings-cross': [51.5308, -0.1238],
    })
    const c = compass(graph, 'euston', 'kings-cross')
    expect(c.km).toBeGreaterThan(0.5)
    expect(c.km).toBeLessThan(1.3)
  })
})

describe('score', () => {
  it('reports optimal when the player matches par', () => {
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj)
    state = move(state, { stationId: 'c', line: 'L1' }, adj)
    state = move(state, { stationId: 'd', line: 'L1' }, adj)
    const s = score(state)
    expect(s.hops).toBe(3)
    expect(s.changes).toBe(0)
    expect(s.parHops).toBe(3)
    expect(s.parChanges).toBe(0)
    expect(s.hopsDelta).toBe(0)
    expect(s.changesDelta).toBe(0)
    expect(s.optimal).toBe(true)
  })

  it('reports non-optimal and positive deltas when over par', () => {
    // Par a->c is 2 hops 0 changes (cost 2). Player detours a-b-e-b-c:
    // L1, L2 (change), L2... but e-b is L2 then b-c is L1 (change). 4 hops 2 changes.
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'c'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj)
    state = move(state, { stationId: 'e', line: 'L2' }, adj) // change 1
    state = move(state, { stationId: 'b', line: 'L2' }, adj) // same line
    state = move(state, { stationId: 'c', line: 'L1' }, adj) // change 2
    const s = score(state)
    expect(s.hops).toBe(4)
    expect(s.changes).toBe(2)
    expect(s.parHops).toBe(2)
    expect(s.parChanges).toBe(0)
    expect(s.hopsDelta).toBe(2)
    expect(s.changesDelta).toBe(2)
    expect(s.optimal).toBe(false) // 4 + 2*4 = 12 > par cost 2
  })
})

describe('shareGrid', () => {
  function solvedState(): GameState {
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj)
    state = move(state, { stationId: 'c', line: 'L1' }, adj)
    state = move(state, { stationId: 'd', line: 'L1' }, adj)
    return state
  }

  it('includes the date, a result line and an emoji trail', () => {
    const grid = shareGrid(solvedState(), '2026-06-06')
    const lines = grid.split('\n')
    expect(lines.length).toBe(3)
    expect(lines[0]).toContain('2026-06-06')
    expect(lines[1].toLowerCase()).toContain('solved')
    expect(lines[1]).toContain('par')
    // Trail contains emoji and a finish flag for a solved game.
    expect(lines[2]).toContain('🏁')
    expect(lines[2]).toContain('🚇')
  })

  it('leaks no station names', () => {
    const grid = shareGrid(solvedState(), '2026-06-06')
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      // station ids are single letters; ensure they are absent as standalone tokens
      expect(grid.split(/\s+/)).not.toContain(name)
    }
    expect(grid).not.toMatch(/Brixton|Euston|Victoria/)
  })

  it('shows a gave-up marker for an unsolved game', () => {
    const { graph, adj } = fixtureGame()
    let state = initGame(puzzleFor(adj, 'a', 'd'), graph, adj)
    state = move(state, { stationId: 'b', line: 'L1' }, adj)
    const grid = shareGrid(state, '2026-06-06')
    expect(grid.toLowerCase()).toContain('gave up')
    expect(grid).toContain('🟥')
  })
})
