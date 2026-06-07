// Playfield map — the tube graph rendered as an overlay on a clean CARTO Positron
// street map (metro-memory style) via MapLibre GL. Replaces the V2 SVG canvas:
// MapLibre owns projection, pan/zoom and the follow-camera, so this component is
// purely presentational — it consumes `state`, draws GeoJSON overlays, and calls
// `onMove` when the player taps a legal station. All testable geometry lives in
// `lib/mapgeo.ts`; this file is the (WebGL, un-jsdom-able) glue.

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, {
  type LngLatLike,
  type GeoJSONSource,
  type LineLayerSpecification,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from 'maplibre-gl'
import type { GameState, Neighbour, Station, TubeGraph } from '../engine'
import { displayName } from '../lib/format'
import {
  lineColourOf,
  moveTargets,
  optimalRouteGeoJSON,
  revealedEdgesGeoJSON,
  stationLngLat,
  stationsGeoJSON,
  travelledPathGeoJSON,
  type ClassifiedMove,
} from '../lib/mapgeo'

export interface PlayfieldMapProps {
  graph: TubeGraph
  state: GameState
  legalMoves: Neighbour[]
  /** Line the player arrived on (null at the start). */
  currentLine: string | null
  targetId: string
  stationsById: Map<string, Station>
  onMove: (to: Neighbour) => void
  /** When true, also draw the optimal route (state.puzzle.par.stations). */
  showOptimal?: boolean
  className?: string
}

// --- Map constants ----------------------------------------------------------

const LONDON_CENTRE: LngLatLike = [-0.118, 51.51]
const INITIAL_ZOOM = 12
/** Ceiling for the follow-cam zoom: it never zooms in past this. */
const FOLLOW_ZOOM = 12.5
/** Wider ceiling for the opening frame, before any move has been made, so the
 *  player sees a hint of the surrounding area instead of a blank basemap. */
const COLD_START_ZOOM = 11.8
const FOLLOW_MS = 600
/** Screen padding (px) kept around the current station + its legal moves. */
const FOLLOW_PADDING = 64

/** CARTO Positron raster basemap — keyless, clean and light. */
const POSITRON_STYLE: StyleSpecification = {
  version: 8,
  // Glyphs so our own symbol-layer labels render over the raster basemap.
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
}

// Source + layer ids.
const SRC_EDGES = 'tr-edges'
const SRC_PATH = 'tr-path'
const SRC_OPTIMAL = 'tr-optimal'
const SRC_STATIONS = 'tr-stations'

const LYR_EDGES = 'tr-edges-line'
const LYR_EDGES_DASH = 'tr-edges-line-dash' // Overground edges, dashed texture
const LYR_PATH = 'tr-path-line'
const LYR_PATH_DASH = 'tr-path-line-dash' // Overground hops of the ridden path
const LYR_OPTIMAL = 'tr-optimal-line'
const LYR_STATION_DOT = 'tr-station-dot'
const LYR_STATION_RING = 'tr-station-ring'
const LYR_LABELS_FIXED = 'tr-labels-fixed' // current + target, always on
const LYR_LABELS_HOVER = 'tr-labels-hover' // hovered station only

const EMPTY_FC = { type: 'FeatureCollection', features: [] } as const

// --- Marker colours (read on a light Positron background) -------------------

const COLOUR_CURRENT = '#1ea672' // progress green ("you are here")
const COLOUR_START = '#11151c' // ink — clear, recognisable origin
const COLOUR_TARGET = '#e11d48' // strong rose flag
const COLOUR_OPTIMAL = '#d4a017' // gold

export default function PlayfieldMap({
  graph,
  state,
  legalMoves,
  currentLine,
  targetId,
  stationsById,
  onMove,
  showOptimal = false,
  className,
}: PlayfieldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [ready, setReady] = useState(false)

  // Keep the freshest props reachable from the long-lived click handler without
  // re-binding it on every render (MapLibre event handlers are imperative).
  const movesRef = useRef<{
    graph: TubeGraph
    legalMoves: Neighbour[]
    currentLine: string | null
    stationsById: Map<string, Station>
    onMove: (to: Neighbour) => void
  }>({ graph, legalMoves, currentLine, stationsById, onMove })
  movesRef.current = { graph, legalMoves, currentLine, stationsById, onMove }

  // Resolve a tapped neighbour: continuation taps fire immediately; switch-only
  // and multi-line taps open a small confirm/picker popup so a line change is
  // always deliberate, never accidental.
  const handleStationTap = useCallback((stationId: string, lngLat: LngLatLike) => {
    const map = mapRef.current
    const { graph: g, legalMoves: lm, currentLine: cl, onMove: emit } = movesRef.current
    const targets = moveTargets(g, lm, cl)
    const target = targets.find((t) => t.stationId === stationId)
    if (!target || target.options.length === 0) return

    popupRef.current?.remove()

    const continuation = target.options.find((o) => o.continuation)
    const singleOption = target.options.length === 1

    // The bright default: a single continuation hop — no friction.
    if (singleOption && continuation) {
      emit({ stationId: continuation.stationId, line: continuation.line })
      return
    }

    // Otherwise present a choice (line picker) or a confirm (switch-only).
    if (!map) return
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 14,
      className: 'tr-popup',
    })
    const root = document.createElement('div')
    root.className = 'flex flex-col gap-1.5 p-1'
    const heading = document.createElement('div')
    heading.className = 'text-xs font-semibold text-ink'
    const stationName = displayName(
      movesRef.current.stationsById.get(stationId)?.name ?? stationId,
    )
    heading.textContent = singleOption ? `Change to reach ${stationName}?` : `Board for ${stationName}`
    root.appendChild(heading)

    for (const opt of target.options) {
      root.appendChild(makeMoveButton(g, opt, () => {
        emit({ stationId: opt.stationId, line: opt.line })
        popup.remove()
      }))
    }

    popup.setLngLat(lngLat).setDOMContent(root).addTo(map)
    popupRef.current = popup
  }, [])

  // --- Map lifecycle: create once, tear down on unmount. ---
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: POSITRON_STYLE,
      center: LONDON_CENTRE,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) {
      // Dev-only handle so browser-driven tests can project coordinates.
      ;(window as unknown as Record<string, unknown>).__trMap = map
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      // Overlay sources (populated by the data effect below).
      for (const id of [SRC_EDGES, SRC_PATH, SRC_OPTIMAL, SRC_STATIONS]) {
        map.addSource(id, { type: 'geojson', data: EMPTY_FC })
      }

      // Revealed network edges, coloured per line. Co-located lines fan out as
      // parallel strokes via the precomputed offsetIdx (see mapgeo), so a
      // segment shared by, say, Circle and District shows BOTH colours and the
      // player's current line always reads as continuing. Overground lines are
      // drawn by a dashed twin layer (line-dasharray is not data-drivable), so
      // each layer filters to its half of the source.
      const edgePaint: LineLayerSpecification['paint'] = {
        'line-color': ['get', 'colour'],
        'line-width': 3,
        'line-opacity': 0.55,
        'line-offset': ['*', ['get', 'offsetIdx'], 6],
      }
      map.addLayer({
        id: LYR_EDGES,
        type: 'line',
        source: SRC_EDGES,
        filter: ['!=', ['get', 'dashed'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { ...edgePaint },
      })
      map.addLayer({
        id: LYR_EDGES_DASH,
        type: 'line',
        source: SRC_EDGES,
        filter: ['==', ['get', 'dashed'], true],
        // Butt caps keep the dash rhythm crisp; round caps would blob them.
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { ...edgePaint, 'line-dasharray': [2.2, 1.6] },
      })

      // Optimal/par route (post-game): dashed gold, above edges, below path.
      map.addLayer({
        id: LYR_OPTIMAL,
        type: 'line',
        source: SRC_OPTIMAL,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOUR_OPTIMAL,
          'line-width': 4,
          'line-dasharray': [1.5, 1.2],
          'line-opacity': 0.95,
        },
      })

      // The travelled path — thicker + brighter than the revealed edges, with
      // the same dashed twin for Overground hops.
      const pathPaint: LineLayerSpecification['paint'] = {
        'line-color': ['get', 'colour'],
        'line-width': 6,
        'line-opacity': 0.95,
      }
      map.addLayer({
        id: LYR_PATH,
        type: 'line',
        source: SRC_PATH,
        filter: ['!=', ['get', 'dashed'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { ...pathPaint },
      })
      map.addLayer({
        id: LYR_PATH_DASH,
        type: 'line',
        source: SRC_PATH,
        filter: ['==', ['get', 'dashed'], true],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { ...pathPaint, 'line-dasharray': [1.6, 0.9] },
      })

      // Station outer ring — emphasis for current/target/start/legal.
      map.addLayer({
        id: LYR_STATION_RING,
        type: 'circle',
        source: SRC_STATIONS,
        paint: {
          'circle-radius': [
            'match',
            ['get', 'kind'],
            'current', 13,
            'target', 12,
            'start', 11,
            'legal', 11,
            7,
          ],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': [
            'match',
            ['get', 'kind'],
            'current', 3.5,
            'target', 3,
            'start', 3,
            ['case', ['==', ['get', 'moveClass'], 'continue'], 3, 1.5],
          ],
          'circle-stroke-color': [
            'match',
            ['get', 'kind'],
            'current', COLOUR_CURRENT,
            'target', COLOUR_TARGET,
            'start', COLOUR_START,
            // Legal/visited rings tint by line continuation vs switch.
            ['case', ['==', ['get', 'moveClass'], 'continue'], COLOUR_CURRENT, '#9aa3af'],
          ],
          // The just-left station reads dimmest (backtracking is legal but
          // discouraged); switch moves muted; continuations bold.
          'circle-stroke-opacity': [
            'case',
            ['==', ['get', 'prev'], true],
            0.35,
            ['==', ['get', 'moveClass'], 'switch'],
            0.6,
            1,
          ],
        },
      })

      // Station inner dot.
      map.addLayer({
        id: LYR_STATION_DOT,
        type: 'circle',
        source: SRC_STATIONS,
        paint: {
          'circle-radius': [
            'match',
            ['get', 'kind'],
            'current', 6,
            'target', 5.5,
            'start', 5,
            'legal', 5,
            4,
          ],
          'circle-color': [
            'match',
            ['get', 'kind'],
            'current', COLOUR_CURRENT,
            'target', COLOUR_TARGET,
            'start', COLOUR_START,
            'legal', ['case', ['==', ['get', 'moveClass'], 'continue'], '#ffffff', '#f1f3f5'],
            '#ffffff',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          // Dim the just-left station's dot along with its ring.
          'circle-opacity': ['case', ['==', ['get', 'prev'], true], 0.45, 1],
          'circle-stroke-opacity': ['case', ['==', ['get', 'prev'], true], 0.45, 1],
        },
      })

      // Always-on labels for current + target so orientation never disappears.
      map.addLayer({
        id: LYR_LABELS_FIXED,
        type: 'symbol',
        source: SRC_STATIONS,
        filter: ['in', ['get', 'kind'], ['literal', ['current', 'target']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-font': ['Open Sans Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#11151c',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })

      // Hover label — driven by a feature-state filter set on mousemove. Avoids
      // clutter as the revealed set grows (fixes the V2 "sometimes labels" issue).
      map.addLayer({
        id: LYR_LABELS_HOVER,
        type: 'symbol',
        source: SRC_STATIONS,
        filter: ['==', ['get', 'id'], ''],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-font': ['Open Sans Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#11151c',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })

      // Interactions: hit-test the two station circle layers.
      const hitLayers = [LYR_STATION_DOT, LYR_STATION_RING]

      // General click with a generous hit box so the small dots are easy to tap
      // — a layer-scoped click only fires on a pixel-perfect hit, which felt
      // unresponsive. Pick the nearest LEGAL station within the box. The 22px
      // half-width gives a ~44px effective target, matching the touch guideline.
      map.on('click', (e) => {
        const r = 22
        const feats = map.queryRenderedFeatures(
          [
            [e.point.x - r, e.point.y - r],
            [e.point.x + r, e.point.y + r],
          ],
          { layers: hitLayers },
        )
        let best: MapGeoJSONFeature | undefined
        let bestD = Infinity
        for (const f of feats) {
          if (!f.properties?.legal || f.geometry.type !== 'Point') continue
          const [lng, lat] = f.geometry.coordinates as [number, number]
          const p = map.project([lng, lat])
          const d = (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2
          if (d < bestD) {
            bestD = d
            best = f
          }
        }
        if (best && best.geometry.type === 'Point') {
          const [lng, lat] = best.geometry.coordinates as [number, number]
          handleStationTap(String(best.properties?.id ?? ''), [lng, lat])
        }
      })

      map.on('mousemove', (e) => {
        const feats = map.queryRenderedFeatures(e.point, { layers: hitLayers })
        const f = feats[0]
        const id = f ? String(f.properties?.id ?? '') : ''
        const legal = Boolean(f?.properties?.legal)
        map.getCanvas().style.cursor = legal ? 'pointer' : ''
        // Show the hover label for whatever station is under the cursor.
        map.setFilter(LYR_LABELS_HOVER, ['==', ['get', 'id'], id])
      })
      map.on('mouseout', () => {
        map.getCanvas().style.cursor = ''
        map.setFilter(LYR_LABELS_HOVER, ['==', ['get', 'id'], ''])
      })

      setReady(true)
    })

    // Keep the canvas sized to its container.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
    // Created once; deliberately not re-running on prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleStationTap])

  // --- Data: push fresh GeoJSON whenever game state changes. ---
  const overlay = useMemo(
    () => ({
      edges: revealedEdgesGeoJSON(graph, state, stationsById),
      path: travelledPathGeoJSON(graph, state, stationsById),
      stations: stationsGeoJSON(graph, state, stationsById, legalMoves, currentLine, targetId),
      optimal: showOptimal ? optimalRouteGeoJSON(state, stationsById) : EMPTY_FC,
    }),
    [graph, state, stationsById, legalMoves, currentLine, targetId, showOptimal],
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource(SRC_EDGES) as GeoJSONSource | undefined)?.setData(overlay.edges)
    ;(map.getSource(SRC_PATH) as GeoJSONSource | undefined)?.setData(overlay.path)
    ;(map.getSource(SRC_STATIONS) as GeoJSONSource | undefined)?.setData(overlay.stations)
    ;(map.getSource(SRC_OPTIMAL) as GeoJSONSource | undefined)?.setData(overlay.optimal)
  }, [overlay, ready])

  // --- Follow-camera: keep the current station AND every legal next move on
  // screen (long Elizabeth/Overground hops would otherwise land off-screen at
  // a fixed zoom), without ever zooming in past FOLLOW_ZOOM. Before the first
  // move the frame is allowed wider (COLD_START_ZOOM) so launch shows some
  // surrounding city rather than one station on a blank basemap; it tightens
  // to the normal follow-cam as soon as the player moves. ---
  const flyToPlayfield = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const centre = stationLngLat(stationsById, state.currentId)
    if (!centre) return
    const bounds = new maplibregl.LngLatBounds(centre, centre)
    for (const nb of legalMoves) {
      const pos = stationLngLat(stationsById, nb.stationId)
      if (pos) bounds.extend(pos)
    }
    const maxZoom = state.path.length === 0 ? COLD_START_ZOOM : FOLLOW_ZOOM
    try {
      map.fitBounds(bounds, {
        padding: FOLLOW_PADDING,
        maxZoom,
        duration: FOLLOW_MS,
      })
    } catch {
      // Degenerate container (padding exceeds canvas): fall back to a plain ease.
      map.easeTo({ center: centre, zoom: maxZoom, duration: FOLLOW_MS })
    }
  }, [stationsById, state.currentId, state.path.length, legalMoves])

  useEffect(() => {
    if (!ready) return
    flyToPlayfield()
    // Deliberately keyed on the station, not flyToPlayfield identity: the camera
    // should move when the player does, not on every legalMoves re-derivation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentId, ready])

  const recenter = flyToPlayfield

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={recenter}
        aria-label="Recentre on me"
        title="Recentre on me"
        className="absolute bottom-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-paper text-ink shadow-lg ring-1 ring-black/10 transition hover:bg-stone"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </div>
  )
}

/** A line-coloured button for the move popup (picker / switch confirm). */
function makeMoveButton(
  graph: TubeGraph,
  option: ClassifiedMove,
  onClick: () => void,
): HTMLButtonElement {
  const colour = lineColourOf(graph, option.line)
  const lineName = graph.lines.find((l) => l.id === option.line)?.name ?? option.line
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className =
    'flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs font-medium text-ink hover:bg-stone'
  const swatch = document.createElement('span')
  swatch.className = 'inline-block h-3 w-3 shrink-0 rounded-full'
  swatch.style.backgroundColor = colour
  btn.appendChild(swatch)
  const label = document.createElement('span')
  label.textContent = option.continuation ? `${lineName} (stay)` : `${lineName} (change)`
  btn.appendChild(label)
  btn.addEventListener('click', onClick)
  return btn
}
