import { describe, expect, it } from 'vitest'
import { buildAdjacency } from './graph'
import { graphDistanceStops, shortestPath } from './dijkstra'
import type { Adjacency, Edge, Neighbour, TubeGraph } from './types'

/** Build a minimal graph from a list of edges; stations inferred from endpoints. */
function graphFromEdges(edges: Edge[]): TubeGraph {
  const ids = new Set<string>()
  for (const e of edges) {
    ids.add(e.from)
    ids.add(e.to)
  }
  return {
    version: '1.0',
    generatedAt: '2026-01-01',
    lines: [],
    stations: [...ids].map((id) => ({ id, name: id, lat: 0, lon: 0, lines: [] })),
    edges,
  }
}

/** Build adjacency directly (bypasses TubeGraph) for pure unit cases. */
function adjFrom(pairs: Array<[string, Neighbour[]]>): Adjacency {
  return new Map(pairs)
}

describe('shortestPath', () => {
  it('finds the obvious single-line path with correct hops/changes/cost', () => {
    // A-B-C-D all on line1.
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'line1' },
      { from: 'b', to: 'c', line: 'line1' },
      { from: 'c', to: 'd', line: 'line1' },
    ])
    const adj = buildAdjacency(g)
    const path = shortestPath(adj, 'a', 'd')
    expect(path).not.toBeNull()
    expect(path?.stations).toEqual(['a', 'b', 'c', 'd'])
    expect(path?.hops).toBe(3)
    expect(path?.changes).toBe(0)
    expect(path?.cost).toBe(3)
  })

  it('counts a single line change correctly', () => {
    // a -line1-> b -line2-> c. One change.
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'line1' },
      { from: 'b', to: 'c', line: 'line2' },
    ])
    const adj = buildAdjacency(g)
    const path = shortestPath(adj, 'a', 'c')
    expect(path?.hops).toBe(2)
    expect(path?.changes).toBe(1)
    expect(path?.cost).toBe(2 + 4) // default penalty 4
  })

  it('the first hop is never a change regardless of starting line', () => {
    const g = graphFromEdges([{ from: 'a', to: 'b', line: 'line1' }])
    const adj = buildAdjacency(g)
    const path = shortestPath(adj, 'a', 'b')
    expect(path?.changes).toBe(0)
    expect(path?.cost).toBe(1)
  })

  it('prefers a longer same-line route over a shorter route with a change', () => {
    // Short route: a -L1-> b -L2-> d  => 2 hops, 1 change, cost 2+4 = 6.
    // Long route:  a -L1-> x -L1-> y -L1-> d => 3 hops, 0 changes, cost 3.
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'L1' },
      { from: 'b', to: 'd', line: 'L2' },
      { from: 'a', to: 'x', line: 'L1' },
      { from: 'x', to: 'y', line: 'L1' },
      { from: 'y', to: 'd', line: 'L1' },
    ])
    const adj = buildAdjacency(g)
    const path = shortestPath(adj, 'a', 'd')
    expect(path?.stations).toEqual(['a', 'x', 'y', 'd'])
    expect(path?.hops).toBe(3)
    expect(path?.changes).toBe(0)
    expect(path?.cost).toBe(3)
  })

  it('takes the shorter route with a change when the penalty is low enough', () => {
    // Same graph as above, but penalty 0 => fewest hops wins (2 hops via change).
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'L1' },
      { from: 'b', to: 'd', line: 'L2' },
      { from: 'a', to: 'x', line: 'L1' },
      { from: 'x', to: 'y', line: 'L1' },
      { from: 'y', to: 'd', line: 'L1' },
    ])
    const adj = buildAdjacency(g)
    const path = shortestPath(adj, 'a', 'd', { changePenalty: 0 })
    expect(path?.hops).toBe(2)
    expect(path?.changes).toBe(1)
    expect(path?.cost).toBe(2)
    expect(path?.stations).toEqual(['a', 'b', 'd'])
  })

  it('respects the arriving line: parallel edges let you avoid a change', () => {
    // a-b on L1; b-c on BOTH L1 and L2. Arriving on L1 then continuing on L1
    // costs 0 changes; the engine must pick the L1 parallel edge.
    const adj = adjFrom([
      ['a', [{ stationId: 'b', line: 'L1' }]],
      [
        'b',
        [
          { stationId: 'a', line: 'L1' },
          { stationId: 'c', line: 'L1' },
          { stationId: 'c', line: 'L2' },
        ],
      ],
      [
        'c',
        [
          { stationId: 'b', line: 'L1' },
          { stationId: 'b', line: 'L2' },
        ],
      ],
    ])
    const path = shortestPath(adj, 'a', 'c')
    expect(path?.hops).toBe(2)
    expect(path?.changes).toBe(0)
    expect(path?.cost).toBe(2)
  })

  it('returns a zero-length path when start === target', () => {
    const g = graphFromEdges([{ from: 'a', to: 'b', line: 'L1' }])
    const adj = buildAdjacency(g)
    const path = shortestPath(adj, 'a', 'a')
    expect(path).toEqual({ stations: ['a'], hops: 0, changes: 0, cost: 0 })
  })

  it('returns null for an unreachable target', () => {
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'L1' },
      { from: 'c', to: 'd', line: 'L2' }, // disconnected component
    ])
    const adj = buildAdjacency(g)
    expect(shortestPath(adj, 'a', 'd')).toBeNull()
  })

  it('returns null when an endpoint is unknown', () => {
    const g = graphFromEdges([{ from: 'a', to: 'b', line: 'L1' }])
    const adj = buildAdjacency(g)
    expect(shortestPath(adj, 'a', 'nope')).toBeNull()
    expect(shortestPath(adj, 'nope', 'b')).toBeNull()
  })
})

describe('graphDistanceStops', () => {
  it('returns the BFS hop count ignoring line changes', () => {
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'L1' },
      { from: 'b', to: 'c', line: 'L2' },
      { from: 'c', to: 'd', line: 'L3' },
    ])
    const adj = buildAdjacency(g)
    expect(graphDistanceStops(adj, 'a', 'd')).toBe(3)
    expect(graphDistanceStops(adj, 'a', 'a')).toBe(0)
    expect(graphDistanceStops(adj, 'b', 'd')).toBe(2)
  })

  it('finds the shortest of multiple routes', () => {
    // a-b-d (2 hops) vs a-x-y-d (3 hops): BFS picks 2.
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'L1' },
      { from: 'b', to: 'd', line: 'L1' },
      { from: 'a', to: 'x', line: 'L1' },
      { from: 'x', to: 'y', line: 'L1' },
      { from: 'y', to: 'd', line: 'L1' },
    ])
    const adj = buildAdjacency(g)
    expect(graphDistanceStops(adj, 'a', 'd')).toBe(2)
  })

  it('returns Infinity when unreachable or unknown', () => {
    const g = graphFromEdges([
      { from: 'a', to: 'b', line: 'L1' },
      { from: 'c', to: 'd', line: 'L2' },
    ])
    const adj = buildAdjacency(g)
    expect(graphDistanceStops(adj, 'a', 'd')).toBe(Infinity)
    expect(graphDistanceStops(adj, 'a', 'nope')).toBe(Infinity)
  })
})
