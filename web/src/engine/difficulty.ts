// Difficulty tiers built on the greedy gap (see greedy.ts), plus the
// deterministic date -> tier rotation the daily puzzle uses. Hop count is only
// a guardrail; what makes a puzzle hard is the compass misleading, which the
// greedy gap measures directly. Pure TypeScript.

import type { PathResult } from './types'
import { seededRng } from './rng'

export type Tier = 'easy' | 'medium' | 'hard' | 'expert'

export interface TierSpec {
  /** Hop guardrails: below is trivial, above is tedious rather than hard. */
  minHops: number
  maxHops: number
  /** Minimum line changes on the optimal route. */
  minChanges: number
  /** Greedy-gap band (inclusive). See greedy.ts greedyGap. */
  minGap: number
  maxGap: number
}

/**
 * Tier definitions. Easy: the compass mostly works. Medium: a real decision or
 * two. Hard: the bearing actively misleads (including greedy never arriving,
 * gap = Infinity). Bands overlap at the boundaries; selection targets exactly
 * one tier per day so the overlap is harmless.
 */
export const TIER_SPECS: Record<Tier, TierSpec> = {
  easy: { minHops: 5, maxHops: 9, minChanges: 1, minGap: 1.0, maxGap: 1.15 },
  medium: { minHops: 8, maxHops: 13, minChanges: 2, minGap: 1.15, maxGap: 1.4 },
  hard: { minHops: 10, maxHops: 16, minChanges: 2, minGap: 1.4, maxGap: Infinity },
  // Expert sits above the daily rotation: 3+ interchanges (the compass cannot
  // shortcut multi-line routing) and a gap of 2+ (the naive route is at least
  // twice the optimal). Reached only via the Daily Expert track, never the
  // ordinary daily, so the daily stays accessible.
  expert: { minHops: 12, maxHops: 20, minChanges: 3, minGap: 2.0, maxGap: Infinity },
}

/** Does an optimal route plus its greedy gap fall inside a tier's band? */
export function matchesTier(par: PathResult, gap: number, tier: Tier): boolean {
  const s = TIER_SPECS[tier]
  return (
    par.hops >= s.minHops &&
    par.hops <= s.maxHops &&
    par.changes >= s.minChanges &&
    gap >= s.minGap &&
    gap <= s.maxGap
  )
}

/**
 * Classify a puzzle into the gentlest tier it satisfies, or null when it fits
 * none (e.g. a no-change route, or one shorter than every tier's floor).
 */
export function classifyDifficulty(par: PathResult, gap: number): Tier | null {
  for (const tier of ['easy', 'medium', 'hard', 'expert'] as const) {
    if (matchesTier(par, gap, tier)) return tier
  }
  return null
}

/**
 * How far a candidate is from a tier's band, for deterministic fallback ranking
 * (0 = qualifies). Hops count 1 per hop outside the guardrails, change
 * shortfalls 1 each, and gap distance is scaled up so an in-band hop count
 * never outweighs a badly off-band gap.
 */
export function tierPenalty(par: PathResult, gap: number, tier: Tier): number {
  const s = TIER_SPECS[tier]
  let p = 0
  if (par.hops < s.minHops) p += s.minHops - par.hops
  else if (par.hops > s.maxHops) p += par.hops - s.maxHops
  if (par.changes < s.minChanges) p += s.minChanges - par.changes
  if (gap < s.minGap) p += (s.minGap - gap) * 10
  else if (gap > s.maxGap) p += Number.isFinite(gap) ? (gap - s.maxGap) * 10 : 100
  return p
}

/**
 * Deterministic tier rotation for a date. Leans accessible: roughly 40% easy,
 * 45% medium, 15% hard. Seeded separately from the endpoint draw so the two
 * choices do not correlate.
 */
export function tierForDate(dateISO: string): Tier {
  const r = seededRng(`${dateISO}:tier`)()
  if (r < 0.4) return 'easy'
  if (r < 0.85) return 'medium'
  return 'hard'
}
