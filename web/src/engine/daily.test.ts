import { describe, expect, it } from 'vitest'
import { buildAdjacency } from './graph'
import { shortestPath } from './dijkstra'
import { dailyPuzzle } from './daily'
import type { TubeGraph } from './types'
import fixture from './__fixtures__/graph.fixture.json'

const graph = fixture as TubeGraph
const adj = buildAdjacency(graph)

describe('dailyPuzzle', () => {
  it('is deterministic: same date => identical puzzle', () => {
    const a = dailyPuzzle(graph, adj, '2026-06-06')
    const b = dailyPuzzle(graph, adj, '2026-06-06')
    expect(a.startId).toBe(b.startId)
    expect(a.targetId).toBe(b.targetId)
    expect(a.par).toEqual(b.par)
    expect(a.date).toBe('2026-06-06')
  })

  it('different dates generally produce different puzzles', () => {
    const dates = ['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10']
    const keys = dates.map((d) => {
      const p = dailyPuzzle(graph, adj, d)
      return `${p.startId}->${p.targetId}`
    })
    const distinct = new Set(keys)
    // Not all five need differ, but they shouldn't all collapse to one.
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('par matches a fresh shortestPath for the chosen pair', () => {
    const p = dailyPuzzle(graph, adj, '2026-06-06')
    const recomputed = shortestPath(adj, p.startId, p.targetId)
    expect(recomputed).not.toBeNull()
    expect(p.par).toEqual(recomputed)
  })

  it('start and target are distinct and the par is reachable', () => {
    for (const d of ['2026-01-01', '2026-03-15', '2026-12-31', '2027-07-04']) {
      const p = dailyPuzzle(graph, adj, d)
      expect(p.startId).not.toBe(p.targetId)
      expect(p.par.stations[0]).toBe(p.startId)
      expect(p.par.stations[p.par.stations.length - 1]).toBe(p.targetId)
      expect(p.par.hops).toBe(p.par.stations.length - 1)
    }
  })

  it('labels tier-selected puzzles with a tier and a greedy gap', () => {
    const p = dailyPuzzle(graph, adj, '2026-06-06')
    expect(['easy', 'medium', 'hard']).toContain(p.tier)
    expect(p.gap).toBeGreaterThanOrEqual(1)
  })

  it('leaves tier/gap unset on band-override puzzles', () => {
    const p = dailyPuzzle(graph, adj, '2026-06-06', { minHops: 2, maxHops: 12, minChanges: 0 })
    expect(p.tier).toBeUndefined()
    expect(p.gap).toBeUndefined()
  })

  it('respects the difficulty band when a qualifying pair exists', () => {
    // The fixture is large enough to contain 6–12 hop, >=1 change pairs.
    const band = { minHops: 6, maxHops: 12, minChanges: 1 }
    for (const d of ['2026-06-06', '2026-06-07', '2026-06-08']) {
      const p = dailyPuzzle(graph, adj, d, band)
      expect(p.par.hops).toBeGreaterThanOrEqual(band.minHops)
      expect(p.par.hops).toBeLessThanOrEqual(band.maxHops)
      expect(p.par.changes).toBeGreaterThanOrEqual(band.minChanges)
    }
  })

  it('honours a custom band', () => {
    const band = { minHops: 2, maxHops: 4, minChanges: 0 }
    const p = dailyPuzzle(graph, adj, '2026-06-06', band)
    expect(p.par.hops).toBeGreaterThanOrEqual(2)
    expect(p.par.hops).toBeLessThanOrEqual(4)
  })

  it('falls back deterministically when no pair can satisfy the band', () => {
    // Impossible band (more changes than the fixture can offer on any route).
    const band = { minHops: 6, maxHops: 12, minChanges: 99 }
    const a = dailyPuzzle(graph, adj, '2026-06-06', band)
    const b = dailyPuzzle(graph, adj, '2026-06-06', band)
    expect(a.startId).toBe(b.startId)
    expect(a.targetId).toBe(b.targetId)
    // Still a real, reachable route.
    expect(shortestPath(adj, a.startId, a.targetId)).toEqual(a.par)
  })
})
