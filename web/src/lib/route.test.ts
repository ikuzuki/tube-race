import { describe, expect, it } from 'vitest'
import type { PathResult } from '../engine'
import { journeyLegs, routeLegs, stopsLabel } from './route'

function path(stations: string[], lines: string[]): PathResult {
  return { stations, hops: stations.length - 1, changes: 0, cost: 0, lines }
}

describe('routeLegs', () => {
  it('returns no legs for a zero-hop or trail-less path', () => {
    expect(routeLegs({ stations: ['a'], hops: 0, changes: 0, cost: 0, lines: [] })).toEqual([])
    expect(routeLegs({ stations: ['a', 'b'], hops: 1, changes: 0, cost: 0 })).toEqual([])
  })

  it('keeps a single-line route as one leg', () => {
    const legs = routeLegs(path(['a', 'b', 'c', 'd'], ['central', 'central', 'central']))
    expect(legs).toEqual([{ lineId: 'central', fromId: 'a', toId: 'd', stops: 3 }])
  })

  it('splits at each line change', () => {
    const legs = routeLegs(
      path(['a', 'b', 'c', 'd', 'e'], ['central', 'central', 'northern', 'victoria']),
    )
    expect(legs).toEqual([
      { lineId: 'central', fromId: 'a', toId: 'c', stops: 2 },
      { lineId: 'northern', fromId: 'c', toId: 'd', stops: 1 },
      { lineId: 'victoria', fromId: 'd', toId: 'e', stops: 1 },
    ])
  })
})

describe('journeyLegs', () => {
  it('is empty before the first move', () => {
    expect(journeyLegs('a', [])).toEqual([])
  })

  it('groups the moves taken into per-line legs from the start station', () => {
    const legs = journeyLegs('a', [
      { stationId: 'b', line: 'central' },
      { stationId: 'c', line: 'central' },
      { stationId: 'd', line: 'northern' },
    ])
    expect(legs).toEqual([
      { lineId: 'central', fromId: 'a', toId: 'c', stops: 2 },
      { lineId: 'northern', fromId: 'c', toId: 'd', stops: 1 },
    ])
  })
})

describe('stopsLabel', () => {
  it('singularises one stop', () => {
    expect(stopsLabel(1)).toBe('1 stop')
    expect(stopsLabel(3)).toBe('3 stops')
  })
})
