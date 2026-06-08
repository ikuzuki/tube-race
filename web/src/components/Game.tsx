// Game shell: composes the chrome (Header, HUD, modals, intro + result cards)
// around the interactive PlayfieldMap, and binds the engine via useGameState.
// App does the async load and hands the loaded graph/adjacency/puzzle in, so this
// stays drivable from a fixture in tests. Today's date is passed in for
// determinism + the share grid.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Adjacency, DailyPuzzle, GameState, Neighbour, Station, TubeGraph } from '../engine'
import { compass, score, shortestPath, stationIndex } from '../engine'
import { useGameState } from '../hooks/useGameState'
import { useStats } from '../hooks/useStats'
import { useArchive } from '../hooks/useArchive'
import { expertKey } from '../lib/archive'
import { useOnboarding } from '../hooks/useOnboarding'
import { useStationInfo } from '../hooks/useStationInfo'
import type { StationInfo } from '../lib/stationInfo'
import { buildShareText } from '../lib/share'
import { points } from '../lib/score'
import { displayName } from '../lib/format'
import { journeyLegs } from '../lib/route'
import { HintIcon, GiveUpIcon } from './icons'
import Header from './Header'
import StatusBar from './StatusBar'
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
  /**
   * Swap the active puzzle to a past date, optionally its Expert variant (null
   * date returns to today's ordinary daily).
   */
  onSelectDate?: (dateISO: string | null, expert?: boolean) => void
  /** True when this puzzle is the day's Expert challenge (off the daily streak). */
  isExpert?: boolean
  /** Toggle the Expert challenge on/off (returns to the ordinary daily). */
  onToggleExpert?: () => void
  /** Optional seed state, primarily for tests. */
  initialState?: GameState
}

/** Score added per hint taken. A hint reveals the optimal next hop. */
const HINT_COST = 3

/** "2026-06-06" -> "Sat 6 Jun" (falls back to the raw string if unparseable). */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Game({
  graph,
  adj,
  puzzle,
  today,
  onSelectDate,
  isExpert = false,
  onToggleExpert,
  initialState,
}: GameProps) {
  const { state, legalMoves, play, restart } = useGameState(puzzle, graph, adj, initialState)
  const { stats, recordResult } = useStats()
  const { completions, record: recordCompletion } = useArchive()
  const { seen, markSeen } = useOnboarding()
  const { infoMap } = useStationInfo()

  // The puzzle's own date identifies the run (header, share, completion key);
  // lifetime stats and the streak only move on the genuine daily.
  const dateISO = puzzle.date
  const todayISO = today ?? puzzle.date
  const isToday = dateISO === todayISO
  // Only the ordinary daily feeds the streak and is one-attempt. The Expert
  // challenge shares today's date but runs on its own track; archive replays
  // are past dates.
  const isStreakDaily = isToday && !isExpert
  // Completions are kept per puzzle: the Expert track is keyed apart so it does
  // not collide with the day's ordinary daily.
  const completionKey = isExpert ? expertKey(dateISO) : dateISO
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
  // Hints taken (each adds HINT_COST to the score) and the station the current
  // hint points at (cleared on the next move). The player conceded if gaveUp.
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintStationId, setHintStationId] = useState<string | null>(null)
  const [gaveUp, setGaveUp] = useState(false)

  // A hint highlights the optimal next hop until the player moves; clear it
  // whenever the current station changes (a move taken, or a restart).
  useEffect(() => {
    setHintStationId(null)
  }, [state.currentId])

  const hintCost = hintsUsed * HINT_COST
  // The run is over once solved or conceded; moves and controls lock then.
  const runOver = state.solved || gaveUp

  // First run shows only the onboarding, then drops straight into play; the
  // status bar already names the start and destination, so the separate intro
  // card (kept for returning players via its initial state) would just repeat
  // it and add a second dismissal.
  useEffect(() => {
    if (!seen) setOnboardingOpen(true)
  }, [seen])
  const closeOnboarding = useCallback(() => {
    setOnboardingOpen(false)
    markSeen()
  }, [markSeen])

  // Record the result once per date when solved, then surface the result card.
  // Archive completions are kept for every run; lifetime stats and the streak
  // only when this is the genuine daily.
  const parScore = points(puzzle.par.hops, puzzle.par.changes)
  // The player's score includes the hint surcharge, so it feeds the headline,
  // the stars, the share and the recorded completion alike.
  const finalScore = points(state.path.length, state.changes) + hintCost
  // Optimal (3 stars) requires matching par with no hints, since each hint
  // pushes the score over par.
  const isOptimalRun = state.solved && finalScore <= parScore

  const recordedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!state.solved || recordedRef.current === completionKey) return
    recordedRef.current = completionKey
    const sc = score(state)
    const solvedScore = points(sc.hops, sc.changes) + hintCost
    const scoreOverPar = Math.max(0, solvedScore - parScore)
    if (isStreakDaily) {
      recordResult({ date: dateISO, solved: true, scoreOverPar, optimal: scoreOverPar === 0 })
    }
    recordCompletion(completionKey, { solved: true, score: solvedScore, parScore })
    setIntroOpen(false)
    setResultOpen(true)
  }, [state, dateISO, completionKey, isStreakDaily, hintCost, parScore, recordResult, recordCompletion])

  const shareText = runOver
    ? buildShareText({
        dateISO,
        solved: state.solved,
        score: finalScore,
        parScore,
        stops: state.path.length,
        parStops: puzzle.par.hops,
        changes: state.changes,
        parChanges: puzzle.par.changes,
        streak: stats.curStreak,
      })
    : ''

  const handlePlayAgain = useCallback(() => {
    setResultOpen(false)
    setShowOptimal(false)
    setHintsUsed(0)
    setHintStationId(null)
    setGaveUp(false)
    recordedRef.current = null
    restart()
  }, [restart])

  const handleShowOptimal = useCallback(() => {
    setShowOptimal(true)
    setResultOpen(false)
  }, [])

  // Reveal the optimal next hop and charge a hint; one hint per position (it
  // clears on the next move), so pressing again while one shows is a no-op.
  const handleHint = useCallback(() => {
    if (runOver || hintStationId) return
    const best = shortestPath(adj, state.currentId, puzzle.targetId)
    const next = best?.stations[1]
    if (!next) return
    setHintStationId(next)
    setHintsUsed((n) => n + 1)
  }, [runOver, hintStationId, adj, state.currentId, puzzle.targetId])

  // Concede: record a played-but-unsolved result (resets the streak on the
  // daily) and open the result card with the best route on offer.
  const handleGiveUp = useCallback(() => {
    if (runOver) return
    setGaveUp(true)
    if (isStreakDaily) {
      recordResult({ date: dateISO, solved: false, scoreOverPar: 0, optimal: false })
    }
    recordCompletion(completionKey, { solved: false, score: finalScore, parScore })
    setShowOptimal(false)
    setIntroOpen(false)
    setResultOpen(true)
  }, [
    runOver,
    isStreakDaily,
    dateISO,
    completionKey,
    finalScore,
    parScore,
    recordResult,
    recordCompletion,
  ])

  const playMove = useCallback(
    (to: Neighbour) => {
      if (runOver) return
      play(to)
    },
    [runOver, play],
  )

  return (
    <div className="flex min-h-screen flex-col bg-stone text-ink">
      <Header
        date={prettyDate(dateISO)}
        subtitle={
          isExpert
            ? isToday
              ? 'Expert challenge'
              : 'Past Expert challenge'
            : isToday
              ? undefined
              : 'Past puzzle'
        }
        onHowToPlay={() => setOnboardingOpen(true)}
        onArchive={() => setArchiveOpen(true)}
        onStats={() => setStatsOpen(true)}
        onExpert={() => onToggleExpert?.()}
        expertActive={isExpert}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 p-3 sm:p-4 lg:px-6">
        <StatusBar
          startName={startName}
          targetName={targetName}
          legs={legs}
          lineNames={lineNames}
          stationsById={stationsById}
          solved={state.solved}
          currentLineId={currentLine}
          currentLineName={currentLineName}
          hops={state.path.length}
          parHops={puzzle.par.hops}
          changes={state.changes}
          parChanges={puzzle.par.changes}
          hintCost={hintCost}
          bearingDeg={bearingDeg}
          km={km}
        />

        {/* The map takes whatever the chrome leaves: flex-fill rather than a
            fixed vh slice, so a slimmer status bar directly buys map height. */}
        <div className="relative max-h-[640px] min-h-[380px] w-full flex-1 overflow-hidden rounded-2xl bg-map shadow-xl ring-1 ring-black/40">
          <PlayfieldMap
            graph={graph}
            state={state}
            legalMoves={legalMoves}
            currentLine={currentLine}
            targetId={puzzle.targetId}
            stationsById={stationsById}
            onMove={playMove}
            showOptimal={showOptimal}
            hintStationId={hintStationId}
            className="absolute inset-0 h-full w-full"
          />

          {/* Hint + give-up controls, live only during an active run. */}
          {!runOver && (
            <div className="absolute left-3 top-3 z-20 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleHint}
                disabled={hintStationId !== null}
                title={`Hint (+${HINT_COST})`}
                className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm font-semibold text-ink shadow-lg ring-1 ring-black/10 transition hover:bg-stone disabled:opacity-50"
              >
                <HintIcon className="text-base" />
                Hint
                <span className="text-xs font-bold text-warn">+{HINT_COST}</span>
              </button>
              <button
                type="button"
                onClick={handleGiveUp}
                title="Give up and show the best route"
                className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm font-semibold text-ink-soft shadow-lg ring-1 ring-black/10 transition hover:bg-stone"
              >
                <GiveUpIcon className="text-base" />
                Give up
              </button>
            </div>
          )}

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
          way back to it; archive replays also get a fresh-game shortcut. The
          genuine daily is one attempt per day, so it never offers a replay. */}
      {runOver && !resultOpen && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center gap-2">
          <button
            onClick={() => setResultOpen(true)}
            className="rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-1 ring-black/10 transition hover:bg-stone"
          >
            View result
          </button>
          {!isStreakDaily && (
            <button
              onClick={handlePlayAgain}
              className="rounded-full bg-progress px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
            >
              Play again
            </button>
          )}
        </div>
      )}

      {/* Mid-run restart for archive replays only: retry the past puzzle from
          scratch (the best result per date is kept, so an improved retry counts). */}
      {!isStreakDaily && !runOver && state.path.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center">
          <button
            onClick={handlePlayAgain}
            className="flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-1 ring-black/10 transition hover:bg-stone"
          >
            <RestartIcon />
            Start again
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
          title={
            isExpert
              ? 'Expert challenge'
              : isToday
                ? "Today's journey"
                : 'Journey from the archive'
          }
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
        activeExpert={isExpert}
        todayISO={todayISO}
        onSelect={(d, asExpert) => onSelectDate?.(d, asExpert)}
      />
      <ResultCard
        open={resultOpen}
        solved={state.solved}
        score={finalScore}
        parScore={parScore}
        stops={state.path.length}
        parStops={puzzle.par.hops}
        changes={state.changes}
        parChanges={puzzle.par.changes}
        optimal={isOptimalRun}
        hintsUsed={hintsUsed}
        shareText={shareText}
        streak={stats.curStreak}
        start={startCard ?? undefined}
        destination={destCard ?? undefined}
        onShowOptimal={handleShowOptimal}
        onPlayAgain={isStreakDaily ? undefined : handlePlayAgain}
        onClose={() => setResultOpen(false)}
      />
    </div>
  )
}

function RestartIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}
