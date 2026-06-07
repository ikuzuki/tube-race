// Pure geometry/GeoJSON helpers for the MapLibre Playfield map. No MapLibre, no
// DOM — everything here is data-in/data-out so it can be unit-tested in isolation
// and the React component just feeds the output to `source.setData(...)`.
//
// Coordinate convention throughout is GeoJSON order: [lon, lat].

import type { GameState, Neighbour, Station, TubeGraph } from '../engine'
import { isOverground, lineColour } from '../theme'
import { displayName } from './format'

// --- Minimal GeoJSON shapes -------------------------------------------------
// We only emit what MapLibre needs; typing them locally keeps the module free of
// any @types/geojson dependency and documents exactly what `setData` receives.

export type Position = [number, number]

export interface PointFeature<P> {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: Position }
  properties: P
}

export interface LineFeature<P> {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: Position[] }
  properties: P
}

export interface FeatureCollection<F> {
  type: 'FeatureCollection'
  features: F[]
}

/** Role a revealed station plays this turn — drives its marker style. */
export type StationKind = 'start' | 'current' | 'target' | 'legal' | 'visited'

export interface StationProps {
  id: string
  name: string
  kind: StationKind
  /** True when this station is a legal next move (any line). */
  legal: boolean
  /**
   * For a legal station: 'continue' if at least one edge to it stays on the
   * current line (the bright default), 'switch' if every edge to it is a line
   * change. Undefined for non-legal stations.
   */
  moveClass?: 'continue' | 'switch'
  /**
   * True for the station the player just left. Backtracking stays legal but
   * costs a stop, so the marker is dimmed to read as a deliberate choice
   * rather than an inviting next move.
   */
  prev?: boolean
}

export interface EdgeProps {
  line: string
  colour: string
  /**
   * Signed parallel-offset index for co-located lines on the same station
   * pair: 0 when the segment carries one line, otherwise centred around 0
   * (e.g. -0.5/+0.5 for two lines). The layer multiplies it into pixels so
   * shared segments render as TfL-style side-by-side strokes.
   */
  offsetIdx: number
  /** True for Overground lines, which render with a dashed stroke. */
  dashed: boolean
}

/** A neighbour annotated with whether taking it keeps the player on their line. */
export interface ClassifiedMove extends Neighbour {
  /** True when `line === currentLine`, or always at the start (currentLine null). */
  continuation: boolean
  /** Line colour for the affordance. */
  colour: string
}

export interface ClassifiedMoves {
  /** Bright, single-tap default moves (stay on the current line). */
  continuations: ClassifiedMove[]
  /** Muted, deliberate moves (change line). Empty at the start. */
  switches: ClassifiedMove[]
}

/** A legal destination station and the lines that reach it from `current`. */
export interface MoveTarget {
  stationId: string
  /** One option per line that reaches this station (parallel edges). */
  options: ClassifiedMove[]
  /** True if any option keeps the player on the current line. */
  hasContinuation: boolean
}

// --- Colours ----------------------------------------------------------------

/**
 * Colour for a line id, preferring the graph's own palette (authoritative,
 * matches the data) and falling back to the shared theme palette, then grey.
 */
export function lineColourOf(graph: TubeGraph, lineId: string): string {
  const fromGraph = graph.lines.find((l) => l.id === lineId)?.colour
  return fromGraph ?? lineColour(lineId)
}

// --- Move classification ----------------------------------------------------

/**
 * Split legal moves into continuations (stay on `currentLine`) and switches
 * (change line). When `currentLine` is null (the start of a run, no line ridden
 * yet) every move is a continuation — there is nothing to stay on, so the first
 * hop is never a "change".
 */
export function classifyLegalMoves(
  graph: TubeGraph,
  legalMoves: Neighbour[],
  currentLine: string | null,
): ClassifiedMoves {
  const continuations: ClassifiedMove[] = []
  const switches: ClassifiedMove[] = []
  for (const mv of legalMoves) {
    const continuation = currentLine === null || mv.line === currentLine
    const classified: ClassifiedMove = {
      ...mv,
      continuation,
      colour: lineColourOf(graph, mv.line),
    }
    if (continuation) continuations.push(classified)
    else switches.push(classified)
  }
  return { continuations, switches }
}

/**
 * Group legal moves by destination station so the UI can offer a line picker
 * when two lines reach the same neighbour. A target is a "continuation target"
 * if any of its line options keeps the player on the current line.
 *
 * Order is preserved by first appearance of each destination in `legalMoves`.
 */
export function moveTargets(
  graph: TubeGraph,
  legalMoves: Neighbour[],
  currentLine: string | null,
): MoveTarget[] {
  const byStation = new Map<string, MoveTarget>()
  const order: string[] = []
  for (const mv of legalMoves) {
    const continuation = currentLine === null || mv.line === currentLine
    const option: ClassifiedMove = {
      ...mv,
      continuation,
      colour: lineColourOf(graph, mv.line),
    }
    let target = byStation.get(mv.stationId)
    if (!target) {
      target = { stationId: mv.stationId, options: [], hasContinuation: false }
      byStation.set(mv.stationId, target)
      order.push(mv.stationId)
    }
    target.options.push(option)
    if (continuation) target.hasContinuation = true
  }
  return order.map((id) => byStation.get(id)!)
}

// --- Station GeoJSON --------------------------------------------------------

/**
 * Decide the rendering role for a revealed station. Precedence (highest first):
 * current > target > start > legal-next-move > visited. Current beats target so
 * the "you are here" emphasis always wins, even standing on the destination
 * tile mid-run; the solved state is conveyed elsewhere.
 */
function stationKind(
  id: string,
  state: GameState,
  targetId: string,
  legalIds: Set<string>,
  visitedIds: Set<string>,
): StationKind {
  if (id === state.currentId) return 'current'
  if (id === targetId) return 'target'
  if (id === state.startId) return 'start'
  if (legalIds.has(id)) return 'legal'
  void visitedIds
  return 'visited'
}

/**
 * One Point feature per revealed station. Fog rule: a station that has never
 * been revealed is omitted entirely — except the `target`, which is always
 * included so the destination is visible as a goal from the start.
 */
export function stationsGeoJSON(
  graph: TubeGraph,
  state: GameState,
  stationsById: Map<string, Station>,
  legalMoves: Neighbour[],
  currentLine: string | null,
  targetId: string,
): FeatureCollection<PointFeature<StationProps>> {
  const legalIds = new Set(legalMoves.map((m) => m.stationId))
  const visited = new Set<string>([state.startId, ...state.path.map((m) => m.stationId)])
  const targets = moveTargets(graph, legalMoves, currentLine)
  const moveClassById = new Map<string, 'continue' | 'switch'>()
  for (const t of targets) {
    moveClassById.set(t.stationId, t.hasContinuation ? 'continue' : 'switch')
  }

  const ids = new Set<string>(state.revealed)
  ids.add(targetId)

  // The station the player just left: the second-to-last path entry, or the
  // start right after the first move. Null before any move.
  const prevId =
    state.path.length >= 2
      ? state.path[state.path.length - 2].stationId
      : state.path.length === 1
        ? state.startId
        : null

  const features: PointFeature<StationProps>[] = []
  for (const id of ids) {
    const station = stationsById.get(id)
    if (!station) continue
    const kind = stationKind(id, state, targetId, legalIds, visited)
    const legal = legalIds.has(id)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
      properties: {
        id,
        name: displayName(station.name),
        kind,
        legal,
        ...(legal ? { moveClass: moveClassById.get(id) } : {}),
        ...(id === prevId ? { prev: true } : {}),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

// --- Edge GeoJSON -----------------------------------------------------------

/**
 * One LineString per (station pair, line) whose BOTH endpoints are revealed
 * (fog rule: never draw an edge into the unknown). Coloured by line and
 * de-duplicated per undirected pair. Where several lines share a pair (Circle
 * and District through Westminster, say), each gets a distinct `offsetIdx`
 * centred around 0 so the map can fan them out as parallel strokes — the
 * player's current line is then always visibly present on a shared segment.
 * Coordinates run lo-id -> hi-id so every co-located feature offsets to a
 * consistent side regardless of how the source edge was oriented.
 */
export function revealedEdgesGeoJSON(
  graph: TubeGraph,
  state: GameState,
  stationsById: Map<string, Station>,
): FeatureCollection<LineFeature<EdgeProps>> {
  // Group revealed edges by undirected station pair, collecting their lines.
  const byPair = new Map<string, { a: Station; b: Station; lines: string[] }>()
  const pairOrder: string[] = []
  for (const edge of graph.edges) {
    if (!state.revealed.has(edge.from) || !state.revealed.has(edge.to)) continue
    const lo = edge.from < edge.to ? edge.from : edge.to
    const hi = edge.from < edge.to ? edge.to : edge.from
    const a = stationsById.get(lo)
    const b = stationsById.get(hi)
    if (!a || !b) continue
    const key = `${lo}|${hi}`
    let entry = byPair.get(key)
    if (!entry) {
      entry = { a, b, lines: [] }
      byPair.set(key, entry)
      pairOrder.push(key)
    }
    if (!entry.lines.includes(edge.line)) entry.lines.push(edge.line)
  }

  const features: LineFeature<EdgeProps>[] = []
  for (const key of pairOrder) {
    const { a, b, lines } = byPair.get(key)!
    // Alphabetical order keeps each line on a stable side of the corridor.
    const sorted = [...lines].sort()
    sorted.forEach((line, i) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
        },
        properties: {
          line,
          colour: lineColourOf(graph, line),
          offsetIdx: i - (sorted.length - 1) / 2,
          dashed: isOverground(line),
        },
      })
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * The route the player has actually travelled (start -> ...path), as one
 * LineString segment per hop coloured by the line used for that hop. Drawn on
 * top of the revealed-edge layer, thicker/brighter, so progress reads clearly.
 * Returns an empty collection before the first move.
 */
export function travelledPathGeoJSON(
  graph: TubeGraph,
  state: GameState,
  stationsById: Map<string, Station>,
): FeatureCollection<LineFeature<EdgeProps>> {
  const features: LineFeature<EdgeProps>[] = []
  let prevId = state.startId
  for (const mv of state.path) {
    const a = stationsById.get(prevId)
    const b = stationsById.get(mv.stationId)
    if (a && b) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
        },
        properties: {
          line: mv.line,
          colour: lineColourOf(graph, mv.line),
          offsetIdx: 0,
          dashed: isOverground(mv.line),
        },
      })
    }
    prevId = mv.stationId
  }
  return { type: 'FeatureCollection', features }
}

/**
 * The optimal (par) route as a single LineString through `state.puzzle.par.stations`,
 * for the post-game reveal. Unknown ids are skipped. Returns an empty collection
 * if fewer than two points resolve.
 */
export function optimalRouteGeoJSON(
  state: GameState,
  stationsById: Map<string, Station>,
): FeatureCollection<LineFeature<{ kind: 'optimal' }>> {
  const coords: Position[] = []
  for (const id of state.puzzle.par.stations) {
    const s = stationsById.get(id)
    if (s) coords.push([s.lon, s.lat])
  }
  if (coords.length < 2) {
    return { type: 'FeatureCollection', features: [] }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { kind: 'optimal' },
      },
    ],
  }
}

// --- Camera framing ---------------------------------------------------------

/** Lon/lat of a station id, or null if unknown. GeoJSON [lon, lat] order. */
export function stationLngLat(
  stationsById: Map<string, Station>,
  id: string,
): Position | null {
  const s = stationsById.get(id)
  return s ? [s.lon, s.lat] : null
}
