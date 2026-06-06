import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAdjacency, loadGraph, stationIndex } from './graph'
import type { Neighbour, TubeGraph } from './types'
import fixture from './__fixtures__/graph.fixture.json'

const graph = fixture as TubeGraph

/** Find all neighbour entries from `a` that point to `b` (any line). */
function neighboursBetween(
  adj: ReturnType<typeof buildAdjacency>,
  a: string,
  b: string,
): Neighbour[] {
  return (adj.get(a) ?? []).filter((nb) => nb.stationId === b)
}

describe('buildAdjacency', () => {
  it('is bidirectional: every edge appears from both endpoints', () => {
    const adj = buildAdjacency(graph)
    for (const edge of graph.edges) {
      const fwd = neighboursBetween(adj, edge.from, edge.to).some((n) => n.line === edge.line)
      const rev = neighboursBetween(adj, edge.to, edge.from).some((n) => n.line === edge.line)
      expect(fwd, `${edge.from}->${edge.to} on ${edge.line}`).toBe(true)
      expect(rev, `${edge.to}->${edge.from} on ${edge.line}`).toBe(true)
    }
  })

  it('preserves parallel edges (same pair, different line) as distinct entries', () => {
    const adj = buildAdjacency(graph)

    // Euston–King's Cross runs on both victoria and northern in the fixture.
    const eustonToKx = neighboursBetween(adj, 'euston', 'kings-cross')
    const lines = eustonToKx.map((n) => n.line).sort()
    expect(lines).toEqual(['northern', 'victoria'])

    // Warren Street–Euston likewise.
    const warrenToEuston = neighboursBetween(adj, 'warren-street', 'euston')
    expect(warrenToEuston.map((n) => n.line).sort()).toEqual(['northern', 'victoria'])
  })

  it('total neighbour entries equal twice the edge count', () => {
    const adj = buildAdjacency(graph)
    let total = 0
    for (const list of adj.values()) total += list.length
    expect(total).toBe(graph.edges.length * 2)
  })

  it('includes isolated stations with an empty neighbour list', () => {
    const synthetic: TubeGraph = {
      version: '1.0',
      generatedAt: '2026-01-01',
      lines: [{ id: 'l1', name: 'L1', colour: '#000' }],
      stations: [
        { id: 'a', name: 'A', lat: 0, lon: 0, lines: ['l1'] },
        { id: 'island', name: 'Island', lat: 1, lon: 1, lines: ['l1'] },
      ],
      edges: [],
    }
    const adj = buildAdjacency(synthetic)
    expect(adj.has('island')).toBe(true)
    expect(adj.get('island')).toEqual([])
  })
})

describe('stationIndex', () => {
  it('indexes every station by id', () => {
    const index = stationIndex(graph)
    expect(index.size).toBe(graph.stations.length)
    expect(index.get('victoria-stn')?.name).toBe('Victoria')
    expect(index.get('euston')?.lat).toBeCloseTo(51.5282, 4)
  })
})

describe('loadGraph', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and parses the graph JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => graph,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadGraph('/data/graph.json')
    expect(fetchMock).toHaveBeenCalledWith('/data/graph.json')
    expect(result.stations.length).toBe(graph.stations.length)
  })

  it('defaults the url to /data/graph.json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => graph,
    })
    vi.stubGlobal('fetch', fetchMock)

    await loadGraph()
    expect(fetchMock).toHaveBeenCalledWith('/data/graph.json')
  })

  it('throws on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadGraph('/missing.json')).rejects.toThrow(/404/)
  })
})
