// Game shell: composes the chrome (Header, HUD, modals) around the interactive
// PlayfieldMap, and binds the engine via useGameState. App does the async load
// and hands the loaded graph/adjacency/puzzle in, so this stays drivable from a
// fixture in tests. Today's date is passed in for determinism + the share grid.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Adjacency, DailyPuzzle, GameState, TubeGraph } from '../engine'
import { compass, score, stationIndex } from '../engine'
import { useGameState } from '../hooks/useGameState'
import { useStats } from '../hooks/useStats'
import { useOnboarding } from '../hooks/useOnboarding'
import { buildShareText } from '../lib/share'
import { displayName } from '../lib/format'
import Header from './Header'
import Hud from './Hud'
import PlayfieldMap from './PlayfieldMap'
import OnboardingModal from './OnboardingModal'
import ResultCard from './ResultCard'
import StatsModal from './StatsModal'

interface GameProps {
  graph: TubeGraph
  adj: Adjacency
  puzzle: DailyPuzzle
  /** ISO date used for the share grid; defaults to the puzzle's own date. */
  today?: string
  /** Optional seed state, primarily for tests. */
  initialState?: GameState
}

/** "2026-06-06" -> "Sat 6 Jun" (falls back to the raw string if unparseable). */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Game({ graph, adj, puzzle, today, initialState }: GameProps) {
  const { state, legalMoves, play, restart } = useGameState(puzzle, graph, adj, initialState)
  const { stats, recordResult } = useStats()
  const { seen, markSeen } = useOnboarding()

  const dateISO = today ?? puzzle.date
  const stationsById = useMemo(() => stationIndex(graph), [graph])

  const currentLine = state.path.length ? state.path[state.path.length - 1].line : null
  const currentLineName = currentLine
    ? (graph.lines.find((l) => l.id === currentLine)?.name ?? null)
    : null
  const targetName = displayName(stationsById.get(puzzle.targetId)?.name ?? puzzle.targetId)

  const { bearingDeg, km } = useMemo(
    () => compass(graph, state.currentId, puzzle.targetId),
    [graph, state.currentId, puzzle.targetId],
  )

  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)

  // First-run onboarding.
  useEffect(() => {
    if (!seen) setOnboardingOpen(true)
  }, [seen])
  const closeOnboarding = useCallback(() => {
    setOnboardingOpen(false)
    markSeen()
  }, [markSeen])

  // Record the result once per date when solved, then surface the result card.
  const recordedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!state.solved || recordedRef.current === dateISO) return
    recordedRef.current = dateISO
    const sc = score(state)
    recordResult({
      date: dateISO,
      solved: true,
      stopsOverPar: Math.max(0, sc.hopsDelta),
      optimal: sc.optimal,
    })
    setResultOpen(true)
  }, [state, dateISO, recordResult])

  const sc = state.solved ? score(state) : null
  const shareText = sc
    ? buildShareText({
        dateISO,
        solved: true,
        stops: sc.hops,
        parStops: sc.parHops,
        changes: sc.changes,
        parChanges: sc.parChanges,
        streak: stats.curStreak,
      })
    : ''

  const handlePlayAgain = useCallback(() => {
    setResultOpen(false)
    recordedRef.current = null
    restart()
  }, [restart])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stone text-ink">
      <Header
        date={prettyDate(dateISO)}
        onHowToPlay={() => setOnboardingOpen(true)}
        onStats={() => setStatsOpen(true)}
      />

      <main className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <Hud
          targetName={targetName}
          currentLineId={currentLine}
          currentLineName={currentLineName}
          hops={state.path.length}
          parHops={puzzle.par.hops}
          changes={state.changes}
          parChanges={puzzle.par.changes}
          bearingDeg={bearingDeg}
          km={km}
        />

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-map shadow-xl ring-1 ring-black/40">
          <PlayfieldMap
            graph={graph}
            state={state}
            legalMoves={legalMoves}
            currentLine={currentLine}
            targetId={puzzle.targetId}
            stationsById={stationsById}
            onMove={play}
            showOptimal={false}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </main>

      <OnboardingModal open={onboardingOpen} onClose={closeOnboarding} />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} stats={stats} />
      <ResultCard
        open={resultOpen}
        solved={state.solved}
        stops={sc?.hops ?? state.path.length}
        parStops={puzzle.par.hops}
        changes={sc?.changes ?? state.changes}
        parChanges={puzzle.par.changes}
        optimal={sc?.optimal ?? false}
        shareText={shareText}
        streak={stats.curStreak}
        onPlayAgain={handlePlayAgain}
        onClose={() => setResultOpen(false)}
      />
    </div>
  )
}
