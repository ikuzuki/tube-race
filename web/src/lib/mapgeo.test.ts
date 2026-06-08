import { describe, expect, it } from 'vitest'
import type { GameState, Neighbour, Station, TubeGraph } from '../engine'
import {
  classifyLegalMoves,
  currentOptionEdgesGeoJSON,
  lineColourOf,
  moveTargets,
  optimalRouteGeoJSON,
  optimalStopsGeoJSON,
  revealedEdgesGeoJSON,
  routeStopsGeoJSON,
  stationLngLat,
  stationsGeoJSON,
  travelledPathGeoJSON,
} from './mapgeo'

// A tiny graph mirroring the engine fixture shape: Victoria (blue) and Northern
// (black) crossing at Warren Street / Euston / King's Cross.
const GRAPH: TubeGraph = {
  version: '1.0',
  generatedAt: '2026-06-06',
  lines: [
    { id: 'victoria', name: 'Victoria', colour: '#0098D4' },
    { id: 'northern', name: 'Northern', colour: '#000000' },
  ],
  stations: [
    { id: 'oxford-circus', name: 'Oxford Circus', lat: 51.5152, lon: -0.1418, lines: ['victoria'] },
    {
      id: 'warren-street',
      name: 'Warren Street',
      lat: 51.5247,
      lon: -0.1384,
      lines: ['victoria', 'northern'],
    },
    { id: 'euston', name: 'Euston', lat: 51.5282, lon: -0.1337, lines: ['victoria', 'northern'] },
    {
      id: 'kings-cross',
      name: "King's Cross St. Pancras",
      lat: 51.5308,
      lon: -0.1238,
      lines: ['victoria', 'northern'],
    },
    { id: 'goodge-street', name: 'Goodge Street', lat: 51.5205, lon: -0.1347, lines: ['northern'] },
  ],
  edges: [
    { from: 'oxford-circus', to: 'warren-street', line: 'victoria' },
    { from: 'warren-street', to: 'euston', line: 'victoria' },
    { from: 'euston', to: 'kings-cross', line: 'victoria' },
    { from: 'goodge-street', to: 'warren-street', line: 'northern' },
    { from: 'warren-street', to: 'euston', line: 'northern' },
    { from: 'euston', to: 'kings-cross', line: 'northern' },
  ],
}

const STATIONS_BY_ID = new Map<string, Station>(GRAPH.stations.map((s) => [s.id, s]))

function makeState(over: Partial<GameState> = {}): GameState {
  const base: GameState = {
    puzzle: {
      date: '2026-06-06',
      startId: 'oxford-circus',
      targetId: 'kings-cross',
      par: {
        stations: ['oxford-circus', 'warren-street', 'euston', 'kings-cross'],
        hops: 3,
        changes: 0,
        cost: 3,
      },
    },
    startId: 'oxford-circus',
    currentId: 'oxford-circus',
    path: [],
    revealed: new Set<string>(['oxford-circus', 'warren-street']),
    changes: 0,
    solved: false,
  }
  return { ...base, ...over }
}

describe('lineColourOf', () => {
  it('prefers the graph palette over the theme fallback', () => {
    expect(lineColourOf(GRAPH, 'victoria')).toBe('#0098D4')
  })

  it('falls back to a colour for an unknown line (never throws)', () => {
    expect(typeof lineColourOf(GRAPH, 'not-a-line')).toBe('string')
  })
})

describe('classifyLegalMoves', () => {
  const moves: Neighbour[] = [
    { stationId: 'warren-street', line: 'victoria' },
    { stationId: 'oxford-circus', line: 'victoria' },
    { stationId: 'goodge-street', line: 'northern' },
  ]

  it('treats every move as a continuation when currentLine is null (start)', () => {
    const { continuations, switches } = classifyLegalMoves(GRAPH, moves, null)
    expect(continuations).toHaveLength(3)
    expect(switches).toHaveLength(0)
    expect(continuations.every((m) => m.continuation)).toBe(true)
  })

  it('splits same-line continuations from line switches', () => {
    const { continuations, switches } = classifyLegalMoves(GRAPH, moves, 'victoria')
    expect(continuations.map((m) => m.stationId).sort()).toEqual(['oxford-circus', 'warren-street'])
    expect(switches.map((m) => m.stationId)).toEqual(['goodge-street'])
    expect(switches[0].continuation).toBe(false)
  })

  it('annotates each move with its line colour', () => {
    const { switches } = classifyLegalMoves(GRAPH, moves, 'victoria')
    expect(switches[0].colour).toBe('#000000')
  })

  it('returns empty arrays for no legal moves', () => {
    const { continuations, switches } = classifyLegalMoves(GRAPH, [], 'victoria')
    expect(continuations).toEqual([])
    expect(switches).toEqual([])
  })
})

describe('moveTargets', () => {
  it('groups parallel lines reaching the same station into one target', () => {
    // At Warren Street both Victoria and Northern reach Euston.
    const moves: Neighbour[] = [
      { stationId: 'euston', line: 'victoria' },
      { stationId: 'euston', line: 'northern' },
      { stationId: 'oxford-circus', line: 'victoria' },
    ]
    const targets = moveTargets(GRAPH, moves, 'victoria')
    expect(targets.map((t) => t.stationId)).toEqual(['euston', 'oxford-circus'])
    const euston = targets[0]
    expect(euston.options).toHaveLength(2)
    expect(euston.options.map((o) => o.line).sort()).toEqual(['northern', 'victoria'])
  })

  it('flags a target as a continuation when any option stays on the line', () => {
    const moves: Neighbour[] = [
      { stationId: 'euston', line: 'victoria' }, // continuation
      { stationId: 'euston', line: 'northern' }, // switch
    ]
    const [euston] = moveTargets(GRAPH, moves, 'victoria')
    expect(euston.hasContinuation).toBe(true)
  })

  it('flags a switch-only target when every option changes line', () => {
    const moves: Neighbour[] = [{ stationId: 'goodge-street', line: 'northern' }]
    const [goodge] = moveTargets(GRAPH, moves, 'victoria')
    expect(goodge.hasContinuation).toBe(false)
  })
})

describe('stationsGeoJSON — minimal map', () => {
  it('emits only the current station, the legal moves and the target', () => {
    // Player at warren-street; one legal move to euston. Past/other stations
    // (oxford-circus visited, goodge-street unrelated) are NOT drawn.
    const state = makeState({
      currentId: 'warren-street',
      path: [{ stationId: 'warren-street', line: 'victoria' }],
    })
    const legal: Neighbour[] = [{ stationId: 'euston', line: 'victoria' }]
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, legal, 'victoria', 'kings-cross')
    const ids = fc.features.map((f) => f.properties.id).sort()
    expect(ids).toEqual(['euston', 'kings-cross', 'warren-street'])
    expect(ids).not.toContain('oxford-circus') // the visited start is dropped
  })

  it('always shows the target even when far away and unrevealed', () => {
    const state = makeState()
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, [], null, 'kings-cross')
    const byId = new Map(fc.features.map((f) => [f.properties.id, f.properties.kind]))
    expect(byId.get('kings-cross')).toBe('target')
  })

  it('marks the current station, with current winning over target at turn zero', () => {
    const state = makeState() // current === start === oxford-circus
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, [], null, 'kings-cross')
    const oxford = fc.features.find((f) => f.properties.id === 'oxford-circus')
    expect(oxford?.properties.kind).toBe('current')
  })

  it('tags legal moves with continue vs switch moveClass', () => {
    const state = makeState({
      currentId: 'warren-street',
      path: [{ stationId: 'warren-street', line: 'victoria' }],
    })
    const legal: Neighbour[] = [
      { stationId: 'euston', line: 'victoria' }, // continue
      { stationId: 'goodge-street', line: 'northern' }, // switch
    ]
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, legal, 'victoria', 'kings-cross')
    const byId = new Map(fc.features.map((f) => [f.properties.id, f.properties]))
    expect(byId.get('euston')?.kind).toBe('legal')
    expect(byId.get('euston')?.moveClass).toBe('continue')
    expect(byId.get('goodge-street')?.moveClass).toBe('switch')
    // The current station carries no moveClass.
    expect(byId.get('warren-street')?.moveClass).toBeUndefined()
  })

  it('flags a legal backtrack to the just-left station as prev', () => {
    // current oxford-circus, just came from warren-street, which is a legal move back.
    const state = makeState({
      currentId: 'oxford-circus',
      path: [{ stationId: 'oxford-circus', line: 'victoria' }],
      startId: 'warren-street',
    })
    const legal: Neighbour[] = [{ stationId: 'warren-street', line: 'victoria' }]
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, legal, 'victoria', 'kings-cross')
    const byId = new Map(fc.features.map((f) => [f.properties.id, f.properties]))
    expect(byId.get('warren-street')?.prev).toBe(true)
  })

  it('flags the hinted legal move with hint', () => {
    const state = makeState({
      currentId: 'warren-street',
      path: [{ stationId: 'warren-street', line: 'victoria' }],
    })
    const legal: Neighbour[] = [
      { stationId: 'euston', line: 'victoria' },
      { stationId: 'goodge-street', line: 'northern' },
    ]
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, legal, 'victoria', 'kings-cross', 'euston')
    const byId = new Map(fc.features.map((f) => [f.properties.id, f.properties]))
    expect(byId.get('euston')?.hint).toBe(true)
    expect(byId.get('goodge-street')?.hint).toBeUndefined()
  })

  it('emits [lon, lat] order', () => {
    const state = makeState()
    const fc = stationsGeoJSON(GRAPH, state, STATIONS_BY_ID, [], null, 'oxford-circus')
    const oxford = fc.features.find((f) => f.properties.id === 'oxford-circus')
    expect(oxford?.geometry.coordinates).toEqual([-0.1418, 51.5152])
  })
})

describe('currentOptionEdgesGeoJSON', () => {
  it('draws a line-coloured segment from the current station to each legal move', () => {
    const state = makeState({ currentId: 'warren-street' })
    const legal: Neighbour[] = [
      { stationId: 'euston', line: 'victoria' },
      { stationId: 'oxford-circus', line: 'victoria' },
    ]
    const fc = currentOptionEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID, legal)
    expect(fc.features).toHaveLength(2)
    // Each segment starts at the current station.
    for (const f of fc.features) {
      expect(f.geometry.coordinates[0]).toEqual([-0.1384, 51.5247]) // warren-street
      expect(f.properties.colour).toBe('#0098D4') // victoria
    }
  })

  it('fans parallel lines to the same neighbour onto distinct offsets', () => {
    const state = makeState({ currentId: 'warren-street' })
    const legal: Neighbour[] = [
      { stationId: 'euston', line: 'victoria' },
      { stationId: 'euston', line: 'northern' },
    ]
    const fc = currentOptionEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID, legal)
    const offsets = fc.features.map((f) => f.properties.offsetIdx).sort()
    expect(offsets).toEqual([-0.5, 0.5])
  })

  it('is empty when there are no legal moves', () => {
    const fc = currentOptionEdgesGeoJSON(GRAPH, makeState(), STATIONS_BY_ID, [])
    expect(fc.features).toHaveLength(0)
  })
})

describe('revealedEdgesGeoJSON — fog', () => {
  it('draws an edge only when both endpoints are revealed', () => {
    // euston not revealed -> warren-street..euston is hidden.
    const state = makeState({ revealed: new Set(['oxford-circus', 'warren-street']) })
    const fc = revealedEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID)
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties.line).toBe('victoria')
    expect(fc.features[0].geometry.coordinates).toEqual([
      [-0.1418, 51.5152],
      [-0.1384, 51.5247],
    ])
  })

  it('colours edges by line', () => {
    const state = makeState({
      revealed: new Set(['warren-street', 'euston', 'goodge-street']),
    })
    const fc = revealedEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID)
    const colours = new Set(fc.features.map((f) => f.properties.colour))
    expect(colours.has('#0098D4')).toBe(true) // victoria
    expect(colours.has('#000000')).toBe(true) // northern
  })

  it('keeps parallel lines between the same pair as separate features', () => {
    // warren-street..euston exists on BOTH victoria and northern.
    const state = makeState({ revealed: new Set(['warren-street', 'euston']) })
    const fc = revealedEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID)
    expect(fc.features).toHaveLength(2)
    expect(fc.features.map((f) => f.properties.line).sort()).toEqual(['northern', 'victoria'])
  })

  it('fans co-located lines out with offsets centred around zero', () => {
    const state = makeState({ revealed: new Set(['warren-street', 'euston']) })
    const fc = revealedEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID)
    const byLine = new Map(fc.features.map((f) => [f.properties.line, f.properties.offsetIdx]))
    // Alphabetical: northern takes the first slot, victoria the second.
    expect(byLine.get('northern')).toBe(-0.5)
    expect(byLine.get('victoria')).toBe(0.5)
    // Both features share identical lo->hi coordinates so the offsets land on
    // consistent opposite sides.
    expect(fc.features[0].geometry.coordinates).toEqual(fc.features[1].geometry.coordinates)
  })

  it('gives a single-line segment a zero offset', () => {
    const state = makeState({ revealed: new Set(['oxford-circus', 'warren-street']) })
    const fc = revealedEdgesGeoJSON(GRAPH, state, STATIONS_BY_ID)
    expect(fc.features[0].properties.offsetIdx).toBe(0)
  })

  it('flags Overground edges as dashed and tube edges as solid', () => {
    const og: TubeGraph = {
      ...GRAPH,
      lines: [...GRAPH.lines, { id: 'mildmay', name: 'Mildmay', colour: '#437EC1' }],
      edges: [...GRAPH.edges, { from: 'oxford-circus', to: 'goodge-street', line: 'mildmay' }],
    }
    const state = makeState({ revealed: new Set(['oxford-circus', 'goodge-street']) })
    const fc = revealedEdgesGeoJSON(og, state, STATIONS_BY_ID)
    const mildmay = fc.features.find((f) => f.properties.line === 'mildmay')
    expect(mildmay?.properties.dashed).toBe(true)
    const victoria = revealedEdgesGeoJSON(
      og,
      makeState({ revealed: new Set(['oxford-circus', 'warren-street']) }),
      STATIONS_BY_ID,
    ).features[0]
    expect(victoria.properties.dashed).toBe(false)
  })
})

describe('travelledPathGeoJSON', () => {
  it('is empty before the first move', () => {
    const fc = travelledPathGeoJSON(GRAPH, makeState(), STATIONS_BY_ID)
    expect(fc.features).toHaveLength(0)
  })

  it('emits one segment per hop, coloured by the hop line', () => {
    const state = makeState({
      currentId: 'euston',
      path: [
        { stationId: 'warren-street', line: 'victoria' },
        { stationId: 'euston', line: 'victoria' },
      ],
      revealed: new Set(['oxford-circus', 'warren-street', 'euston']),
    })
    const fc = travelledPathGeoJSON(GRAPH, state, STATIONS_BY_ID)
    expect(fc.features).toHaveLength(2)
    // First segment runs start -> first hop.
    expect(fc.features[0].geometry.coordinates[0]).toEqual([-0.1418, 51.5152])
    expect(fc.features[0].properties.colour).toBe('#0098D4')
  })
})

describe('routeStopsGeoJSON', () => {
  it('emits a dot for the start and every stop ridden', () => {
    const state = makeState({
      currentId: 'euston',
      path: [
        { stationId: 'warren-street', line: 'victoria' },
        { stationId: 'euston', line: 'victoria' },
      ],
    })
    const fc = routeStopsGeoJSON(state, STATIONS_BY_ID)
    expect(fc.features.map((f) => f.properties.id)).toEqual([
      'oxford-circus', // start
      'warren-street',
      'euston',
    ])
  })

  it('is just the start before any move', () => {
    const fc = routeStopsGeoJSON(makeState(), STATIONS_BY_ID)
    expect(fc.features.map((f) => f.properties.id)).toEqual(['oxford-circus'])
  })
})

describe('optimalStopsGeoJSON', () => {
  it('emits a dot for each station on the par route', () => {
    const fc = optimalStopsGeoJSON(makeState(), STATIONS_BY_ID)
    // par.stations in the fixture state is the 4-stop Victoria run.
    expect(fc.features).toHaveLength(4)
    expect(fc.features.every((f) => f.properties.kind === 'optimal')).toBe(true)
  })
})

describe('optimalRouteGeoJSON', () => {
  it('joins the par stations into a single LineString', () => {
    const fc = optimalRouteGeoJSON(makeState(), STATIONS_BY_ID)
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.coordinates).toHaveLength(4)
    expect(fc.features[0].properties.kind).toBe('optimal')
  })

  it('is empty when fewer than two par stations resolve', () => {
    const state = makeState()
    state.puzzle.par.stations = ['ghost-a', 'ghost-b'] // unknown ids
    const fc = optimalRouteGeoJSON(state, STATIONS_BY_ID)
    expect(fc.features).toHaveLength(0)
  })
})

describe('stationLngLat', () => {
  it('returns [lon, lat] for a known station', () => {
    expect(stationLngLat(STATIONS_BY_ID, 'oxford-circus')).toEqual([-0.1418, 51.5152])
  })

  it('returns null for an unknown station', () => {
    expect(stationLngLat(STATIONS_BY_ID, 'nope')).toBeNull()
  })
})
