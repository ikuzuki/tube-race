// Game shell: composes the chrome (Header, HUD, modals, intro + result cards)
// around the interactive PlayfieldMap, and binds the engine via useGameState.
// App does the async load and hands the loaded graph/adjacency/puzzle in, so this
// stays drivable from a fixture in tests. Today's date is passed in for
// determinism + the share grid.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Adjacency, DailyPuzzle, GameState, Station, TubeGraph } from '../engine'
import { compass, score, stationIndex } from '../engine'
import { useGameState } from '../hooks/useGameState'
import { useStats } from '../hooks/useStats'
import { useArchive } from '../hooks/useArchive'
import { useOnboarding } from '../hooks/useOnboarding'
import { useStationInfo } from '../hooks/useStationInfo'
import type { StationInfo } from '../lib/stationInfo'
import { buildShareText } from '../lib/share'
import { points } from '../lib/score'
import { displayName } from '../lib/format'
import { journeyLegs } from '../lib/route'
import Header from './Header'
import Hud from './Hud'
import JourneyBanner from './JourneyBanner'
import PlayfieldMap from './PlayfieldMap'
import RouteNarration from './RouteNarration'
import OnboardingModal from './OnboardingModal'
import IntroModal from './IntroModal'
import ResultCard from './ResultCard'
import StatsModal from './StatsModal'
import ArchiveModal from './ArchiveModal'

interface GameProps {
  graph: TubeGraph
  adj: Adjacency
  puzzle: DailyPuzzle
  /** Today's ISO date; a puzzle dated differently is an archive replay. */
  today?: string
  /** Swap the active puzzle to a past date (null returns to today's daily). */
  onSelectDate?: (dateISO: string | null) => void
  /** Optional seed state, primarily for tests. */
  initialState?: GameState
}

/** "2026-06-06" -> "Sat 6 Jun" (falls back to the raw string if unparseable). */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Game({ graph, adj, puzzle, today, onSelectDate, initialState }: GameProps) {
  const { state, legalMoves, play, restart } = useGameState(puzzle, graph, adj, initialState)
  const { stats, recordResult } = useStats()
  const { completions, record: recordCompletion } = useArchive()
  const { seen, markSeen } = useOnboarding()
  const { infoMap } = useStationInfo()

  // The puzzle's own date identifies the run (header, share, completion key);
  // lifetime stats and the streak only move on the genuine daily.
  const dateISO = puzzle.date
  const todayISO = today ?? puzzle.date
  const isDaily = dateISO === todayISO
  const stationsById = useMemo(() => stationIndex(graph), [graph])
  const lineNames = useMemo(
    () => new Map(graph.lines.map((l) => [l.id, l.name])),
    [graph],
  )

  const currentLine = state.path.length ? state.path[state.path.length - 1].line : null
  const currentLineName = currentLine
    ? (graph.lines.find((l) => l.id === currentLine)?.name ?? null)
    : null
  const targetName = displayName(stationsById.get(puzzle.targetId)?.name ?? puzzle.targetId)
  const startName = displayName(stationsById.get(puzzle.startId)?.name ?? puzzle.startId)
  const legs = useMemo(() => journeyLegs(state.startId, state.path), [state.startId, state.path])

  const { bearingDeg, km } = useMemo(
    () => compass(graph, state.currentId, puzzle.targetId),
    [graph, state.currentId, puzzle.targetId],
  )

  // Endpoint cards (start + destination) for the intro and result modals.
  const endpoint = useCallback(
    (id: string): { station: Station; info?: StationInfo } | null => {
      const station = stationsById.get(id)
      if (!station) return null
      return { station, info: infoMap[id] }
    },
    [stationsById, infoMap],
  )
  const startCard = endpoint(puzzle.startId)
  const destCard = endpoint(puzzle.targetId)

  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [introOpen, setIntroOpen] = useState(() => seen && !state.solved)
  const [statsOpen, setStatsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [showOptimal, setShowOptimal] = useState(false)

  // First-run onboarding, then the daily intro card.
  useEffect(() => {
    if (!seen) setOnboardingOpen(true)
  }, [seen])
  const closeOnboarding = useCallback(() => {
    setOnboardingOpen(false)
    markSeen()
    if (!state.solved) setIntroOpen(true)
  }, [markSeen, state.solved])

  // Record the result once per date when solved, then surface the result card.
  // Archive completions are kept for every run; lifetime stats and the streak
  // only when this is the genuine daily.
  const recordedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!state.solved || recordedRef.current === dateISO) return
    recordedRef.current = dateISO
    const sc = score(state)
    const scoreOverPar = Math.max(
      0,
      points(sc.hops, sc.changes) - points(sc.parHops, sc.parChanges),
    )
    if (isDaily) {
      recordResult({ date: dateISO, solved: true, scoreOverPar, optimal: sc.optimal })
    }
    recordCompletion(dateISO, {
      solved: true,
      score: points(sc.hops, sc.changes),
      parScore: points(sc.parHops, sc.parChanges),
    })
    setIntroOpen(false)
    setResultOpen(true)
  }, [state, dateISO, isDaily, recordResult, recordCompletion])

  const sc = state.solved ? score(state) : null
  const playerScore = sc ? points(sc.hops, sc.changes) : points(state.path.length, state.changes)
  const parScore = points(puzzle.par.hops, puzzle.par.changes)
  const shareText = sc
    ? buildShareText({
        dateISO,
        solved: true,
        score: points(sc.hops, sc.changes),
        parScore,
        stops: sc.hops,
        parStops: sc.parHops,
        changes: sc.changes,
        parChanges: sc.parChanges,
        streak: stats.curStreak,
      })
    : ''

  const handlePlayAgain = useCallback(() => {
    setResultOpen(false)
    setShowOptimal(false)
    recordedRef.current = null
    restart()
  }, [restart])

  const handleShowOptimal = useCallback(() => {
    setShowOptimal(true)
    setResultOpen(false)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-stone text-ink">
      <Header
        date={prettyDate(dateISO)}
        subtitle={isDaily ? undefined : 'Past puzzle'}
        onHowToPlay={() => setOnboardingOpen(true)}
        onArchive={() => setArchiveOpen(true)}
        onStats={() => setStatsOpen(true)}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 sm:p-4 lg:px-6">
        <JourneyBanner
          startName={startName}
          targetName={targetName}
          legs={legs}
          lineNames={lineNames}
          stationsById={stationsById}
          solved={state.solved}
        />

        <Hud
          currentLineId={currentLine}
          currentLineName={currentLineName}
          hops={state.path.length}
          parHops={puzzle.par.hops}
          changes={state.changes}
          parChanges={puzzle.par.changes}
          bearingDeg={bearingDeg}
          km={km}
        />

        <div className="relative h-[62vh] max-h-[640px] min-h-[380px] w-full overflow-hidden rounded-2xl bg-map shadow-xl ring-1 ring-black/40">
          <PlayfieldMap
            graph={graph}
            state={state}
            legalMoves={legalMoves}
            currentLine={currentLine}
            targetId={puzzle.targetId}
            stationsById={stationsById}
            onMove={play}
            showOptimal={showOptimal}
            className="absolute inset-0 h-full w-full"
          />

          {showOptimal && (
            <div className="absolute left-3 top-3 z-20 max-h-[calc(100%-1.5rem)] w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-stone-200 bg-paper/95 p-3 shadow-lg backdrop-blur">
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">
                Best route
              </p>
              <RouteNarration
                path={puzzle.par}
                stationsById={stationsById}
                lineNames={lineNames}
              />
            </div>
          )}
        </div>
      </main>

      {/* When the result card is dismissed (e.g. to view the best route), keep a
          way back to it and to a fresh game. */}
      {state.solved && !resultOpen && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center gap-2">
          <button
            onClick={() => setResultOpen(true)}
            className="rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-1 ring-black/10 transition hover:bg-stone"
          >
            View result
          </button>
          <button
            onClick={handlePlayAgain}
            className="rounded-full bg-progress px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
          >
            Play again
          </button>
        </div>
      )}

      <OnboardingModal open={onboardingOpen} onClose={closeOnboarding} />
      {startCard && destCard && (
        <IntroModal
          open={introOpen}
          onClose={() => setIntroOpen(false)}
          start={startCard}
          destination={destCard}
          title={isDaily ? "Today's journey" : 'Journey from the archive'}
        />
      )}
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} stats={stats} />
      <ArchiveModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        graph={graph}
        adj={adj}
        completions={completions}
        activeDate={dateISO}
        todayISO={todayISO}
        onSelect={(d) => onSelectDate?.(d)}
      />
      <ResultCard
        open={resultOpen}
        solved={state.solved}
        score={playerScore}
        parScore={parScore}
        stops={sc?.hops ?? state.path.length}
        parStops={puzzle.par.hops}
        changes={sc?.changes ?? state.changes}
        parChanges={puzzle.par.changes}
        optimal={sc?.optimal ?? false}
        shareText={shareText}
        streak={stats.curStreak}
        start={startCard ?? undefined}
        destination={destCard ?? undefined}
        onShowOptimal={handleShowOptimal}
        onPlayAgain={handlePlayAgain}
        onClose={() => setResultOpen(false)}
      />
    </div>
  )
}
