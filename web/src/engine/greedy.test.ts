import { describe, expect, it } from 'vitest'
import { buildAdjacency } from './graph'
import { shortestPath } from './dijkstra'
import { greedyGap, greedyPath } from './greedy'
import type { TubeGraph } from './types'
import fixture from './__fixtures__/graph.fixture.json'

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)

describe('greedyPath', () => {
  it('rides a single line when the compass agrees with the route', () => {
    // Brixton -> King's Cross is straight up the Victoria line; every hop
    // reduces straight-line distance, so greedy should match the optimal.
    const greedy = greedyPath(graph, adj, 'brixton', 'kings-cross')
    const par = shortestPath(adj, 'brixton', 'kings-cross')
    expect(greedy).not.toBeNull()
    expect(greedy!.hops).toBe(9)
    expect(greedy!.changes).toBe(0)
    expect(greedy!.cost).toBe(par!.cost)
    expect(greedyGap(par!, greedy)).toBe(1)
  })

  it('is led astray when the bearing points up the wrong line', () => {
    // Brixton -> Goodge Street: the compass keeps pointing up the Victoria
    // line, but changing to the Northern at Stockwell is cheaper. Greedy rides
    // to Warren Street and drops down (8 hops + 1 change = 12) versus the
    // optimal 7 hops + 1 change = 11.
    const par = shortestPath(adj, 'brixton', 'goodge-street')
    const greedy = greedyPath(graph, adj, 'brixton', 'goodge-street')
    expect(par!.cost).toBe(11)
    expect(greedy).not.toBeNull()
    expect(greedy!.cost).toBe(12)
    const gap = greedyGap(par!, greedy)
    expect(gap).toBeCloseTo(12 / 11, 5)
    expect(gap).toBeGreaterThan(1)
  })

  it('is deterministic', () => {
    const a = greedyPath(graph, adj, 'brixton', 'goodge-street')
    const b = greedyPath(graph, adj, 'brixton', 'goodge-street')
    expect(a).toEqual(b)
  })

  it('records the line ridden for each hop', () => {
    const greedy = greedyPath(graph, adj, 'brixton', 'goodge-street')
    expect(greedy!.lines).toHaveLength(greedy!.hops)
    expect(greedy!.lines![0]).toBe('victoria')
    expect(greedy!.lines![greedy!.hops - 1]).toBe('northern')
  })

  it('returns a zero-cost path when start equals target', () => {
    const greedy = greedyPath(graph, adj, 'brixton', 'brixton')
    expect(greedy).toEqual({ stations: ['brixton'], hops: 0, changes: 0, cost: 0, lines: [] })
  })

  it('gives up at the step cap', () => {
    expect(greedyPath(graph, adj, 'brixton', 'walthamstow-central', { maxSteps: 3 })).toBeNull()
  })

  it('returns null for unknown stations', () => {
    expect(greedyPath(graph, adj, 'nowhere', 'brixton')).toBeNull()
    expect(greedyPath(graph, adj, 'brixton', 'nowhere')).toBeNull()
  })
})

describe('greedyGap', () => {
  const par = { stations: ['a', 'b'], hops: 1, changes: 0, cost: 1 }

  it('is Infinity when greedy never arrives', () => {
    expect(greedyGap(par, null)).toBe(Infinity)
  })

  it('is the cost ratio when greedy arrives', () => {
    expect(greedyGap(par, { stations: ['a', 'c', 'b'], hops: 2, changes: 0, cost: 2 })).toBe(2)
  })

  it('treats a degenerate zero-cost par as gap 1', () => {
    expect(greedyGap({ stations: ['a'], hops: 0, changes: 0, cost: 0 }, null)).toBe(1)
  })
})
