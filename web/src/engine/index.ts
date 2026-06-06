// Public API surface for the Tube Race engine — the contract the UI imports.
// The engine stream (Stream B) implements the real bodies across
// graph.ts / dijkstra.ts / daily.ts / game.ts and re-exports them here, keeping
// these exact signatures. The UI (Stream C) imports only from here and from
// ./types, and must never depend on internal engine file layout.

export * from './types'

export { loadGraph, buildAdjacency, stationIndex } from './graph'

export { shortestPath, graphDistanceStops } from './dijkstra'

export { dailyPuzzle } from './daily'

export { initGame, legalMoves, move, compass, isSolved, score, shareGrid } from './game'
