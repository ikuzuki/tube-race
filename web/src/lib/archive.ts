// The past-puzzles archive: a curated list of dates whose deterministic daily
// puzzles (engine/daily.ts) are known to be good, plus the pure logic for
// tracking per-puzzle completion. The dates were hand-picked from generator
// output for recognisable endpoints and satisfying routes, and deliberately
// span the difficulty tiers. localStorage wiring lives in hooks/useArchive.ts.

/**
 * Curated archive dates, oldest first. Each yields a stable puzzle via
 * `dailyPuzzle(graph, adj, dateISO)`. Mix at curation time: three easy, five
 * medium, two hard. More can be appended later; keep the list chronological.
 */
export const ARCHIVE_DATES: readonly string[] = [
  '2026-04-22', // hard:   Notting Hill Gate -> Tooting Broadway
  '2026-04-24', // medium: Clapham Junction -> Marylebone
  '2026-04-26', // easy:   Battersea Power Station -> Piccadilly Circus
  '2026-05-05', // easy:   Tottenham Court Road -> Canning Town
  '2026-05-18', // hard:   Monument -> Gallions Reach
  '2026-05-21', // medium: Pimlico -> Surrey Quays
  '2026-05-22', // medium: Moorgate -> Northfields
  '2026-05-23', // medium: Queen's Park -> St. James's Park
  '2026-05-27', // medium: Greenwich -> Barbican
  '2026-06-02', // easy:   Clapham Common -> Green Park
]

/** Best result recorded for one archived puzzle. */
export interface ArchiveCompletion {
  solved: boolean
  /** Player's weighted score (stops + 4*changes). */
  score: number
  /** The optimal route's score, for "score / par" display. */
  parScore: number
}

/** Completion map keyed by puzzle date. */
export type ArchiveCompletions = Record<string, ArchiveCompletion>

/**
 * Fold a finished run into the completion map, keeping the BEST result per
 * date (a solve always beats a non-solve; lower score beats higher). Pure:
 * returns the input unchanged when the new result is not an improvement.
 */
export function recordCompletion(
  map: ArchiveCompletions,
  dateISO: string,
  completion: ArchiveCompletion,
): ArchiveCompletions {
  const prev = map[dateISO]
  if (prev) {
    if (prev.solved && !completion.solved) return map
    if (prev.solved === completion.solved && prev.score <= completion.score) return map
  }
  return { ...map, [dateISO]: completion }
}
