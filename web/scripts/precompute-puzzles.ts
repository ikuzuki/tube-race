// Precompute the daily + Expert puzzle ENDPOINTS for every date from the launch
// date to a ~2-year horizon, and write them to web/public/data/puzzles.json.
//
// Puzzle selection (searching random endpoint pairs for one that fits the day's
// difficulty band) is deterministic per date but slow in the browser, Expert
// especially. Running it once here and shipping just the endpoints keeps the
// archive instant; the app recomputes the cheap `par` from the endpoints, so
// the file stays tiny and par never goes stale against the graph.
//
// Regenerate this (like graph.json / stations-info.json) whenever the puzzle
// generator or the graph changes:  npm run precompute
//
// Run with:  npx tsx scripts/precompute-puzzles.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildAdjacency, dailyExpert, dailyPuzzle } from '../src/engine/index.ts'
import type { TubeGraph } from '../src/engine/index.ts'
import { LAUNCH_DATE } from '../src/lib/archive.ts'
import type { PuzzleIndex } from '../src/engine/index.ts'

/** How far ahead of the launch date to precompute (about two years). */
const HORIZON_DAYS = 730

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '../public/data')
const graphPath = resolve(dataDir, 'graph.json')
const outPath = resolve(dataDir, 'puzzles.json')

function isoDaysFrom(startISO: string, offset: number): string {
  const d = new Date(`${startISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

function main(): void {
  const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as TubeGraph
  const adj = buildAdjacency(graph)

  const index: PuzzleIndex = {}
  const started = Date.now()
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const date = isoDaysFrom(LAUNCH_DATE, i)
    const daily = dailyPuzzle(graph, adj, date)
    const expert = dailyExpert(graph, adj, date)
    index[date] = {
      daily: { startId: daily.startId, targetId: daily.targetId },
      expert: { startId: expert.startId, targetId: expert.targetId },
    }
  }

  // Stable key order (chronological) keeps the diff readable across regens.
  const ordered: PuzzleIndex = {}
  for (const date of Object.keys(index).sort()) ordered[date] = index[date]
  writeFileSync(outPath, JSON.stringify(ordered) + '\n')

  const dates = Object.keys(ordered)
  console.log(
    `Wrote ${outPath}: ${dates.length} dates (${dates[0]}..${dates[dates.length - 1]}) ` +
      `in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
  )
}

main()
