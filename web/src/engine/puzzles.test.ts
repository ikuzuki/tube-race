import { describe, expect, it } from 'vitest'
import { buildAdjacency } from './graph'
import { shortestPath } from './dijkstra'
import { puzzleFromEndpoints, resolveDaily, resolveExpert, type PuzzleIndex } from './puzzles'
import type { TubeGraph } from './types'
import fixture from './__fixtures__/graph.fixture.json'

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)

describe('puzzleFromEndpoints', () => {
  it('rebuilds the optimal route for stored endpoints', () => {
    const p = puzzleFromEndpoints(graph, adj, '2099-01-01', {
      startId: 'brixton',
      targetId: 'kings-cross',
    })
    expect(p).not.toBeNull()
    expect(p!.startId).toBe('brixton')
    expect(p!.targetId).toBe('kings-cross')
    expect(p!.date).toBe('2099-01-01')
    // par matches a fresh shortestPath.
    expect(p!.par).toEqual(shortestPath(adj, 'brixton', 'kings-cross'))
    // gap is derived; tier may be present.
    expect(p!.gap).toBeGreaterThanOrEqual(1)
  })

  it('returns null for endpoints that do not resolve to a route', () => {
    expect(puzzleFromEndpoints(graph, adj, '2099-01-01', { startId: 'nope', targetId: 'nope2' })).toBeNull()
  })
})

describe('resolveDaily / resolveExpert', () => {
  const index: PuzzleIndex = {
    '2099-01-01': {
      daily: { startId: 'brixton', targetId: 'kings-cross' },
      expert: { startId: 'oval', targetId: 'walthamstow-central' },
    },
  }

  it('uses the precomputed endpoints when the date is in the index', () => {
    const daily = resolveDaily(graph, adj, '2099-01-01', index)
    expect([daily.startId, daily.targetId]).toEqual(['brixton', 'kings-cross'])
    const expert = resolveExpert(graph, adj, '2099-01-01', index)
    expect([expert.startId, expert.targetId]).toEqual(['oval', 'walthamstow-central'])
  })

  it('falls back to fresh generation for a date outside the index', () => {
    const p = resolveDaily(graph, adj, '2030-03-03', index)
    expect(p.date).toBe('2030-03-03')
    // A real, reachable puzzle was generated.
    expect(shortestPath(adj, p.startId, p.targetId)).not.toBeNull()
  })

  it('falls back when the index is null', () => {
    const p = resolveDaily(graph, adj, '2099-01-01', null)
    expect(p.date).toBe('2099-01-01')
    expect(shortestPath(adj, p.startId, p.targetId)).not.toBeNull()
  })

  it('falls back when stored endpoints are invalid', () => {
    const bad: PuzzleIndex = {
      '2099-01-01': {
        daily: { startId: 'ghost', targetId: 'phantom' },
        expert: { startId: 'ghost', targetId: 'phantom' },
      },
    }
    const p = resolveDaily(graph, adj, '2099-01-01', bad)
    // Not the bogus endpoints; a generated, reachable pair instead.
    expect(p.startId).not.toBe('ghost')
    expect(shortestPath(adj, p.startId, p.targetId)).not.toBeNull()
  })
})
