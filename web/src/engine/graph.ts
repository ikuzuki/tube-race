// Graph loading and indexing.
//
// Pure TypeScript. loadGraph touches fetch (a Web/Node platform API, not the
// DOM); everything else operates on the in-memory graph.

import type { Adjacency, Neighbour, Station, TubeGraph } from './types'

/** Fetch and parse the graph artefact from a static URL. */
export async function loadGraph(url = '/data/graph.json'): Promise<TubeGraph> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`loadGraph: failed to fetch ${url} (${res.status} ${res.statusText})`)
  }
  return (await res.json()) as TubeGraph
}

/**
 * Build a bidirectional adjacency list keyed by station id.
 *
 * Each undirected edge {from, to, line} contributes a Neighbour to BOTH
 * endpoints. Parallel edges between the same pair on different lines are
 * preserved as distinct Neighbour entries (e.g. Euston–King's Cross exists on
 * both victoria and northern, yielding two neighbours each way). Every station
 * in the graph gets an entry, even if it has no edges.
 */
export function buildAdjacency(graph: TubeGraph): Adjacency {
  const adj: Adjacency = new Map<string, Neighbour[]>()

  // Seed every known station so isolated nodes still resolve to [].
  for (const station of graph.stations) {
    if (!adj.has(station.id)) adj.set(station.id, [])
  }

  const push = (fromId: string, neighbour: Neighbour): void => {
    const list = adj.get(fromId)
    if (list) {
      list.push(neighbour)
    } else {
      adj.set(fromId, [neighbour])
    }
  }

  for (const edge of graph.edges) {
    push(edge.from, { stationId: edge.to, line: edge.line })
    push(edge.to, { stationId: edge.from, line: edge.line })
  }

  return adj
}

/** Index stations by id for O(1) lookup. */
export function stationIndex(graph: TubeGraph): Map<string, Station> {
  const index = new Map<string, Station>()
  for (const station of graph.stations) {
    index.set(station.id, station)
  }
  return index
}
