// Win panel. Shows the score against par and the spoiler-free share grid with a
// copy button, plus a restart. Rendered as an overlay over the map.

import { useState } from 'react'
import type { GameState } from '../engine'
import { score, shareGrid } from '../engine'

interface ResultPanelProps {
  state: GameState
  dateISO: string
  targetName: string
  onRestart: () => void
}

export default function ResultPanel({
  state,
  dateISO,
  targetName,
  onRestart,
}: ResultPanelProps) {
  const s = score(state)
  const grid = shareGrid(state, dateISO)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(grid)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Result"
    >
      <div className="w-[min(28rem,90%)] rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <div className="mb-1 text-center text-3xl">
          {s.optimal ? '🏆' : '🏁'}
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-emerald-300">
          {s.optimal ? 'Optimal route!' : 'You made it!'}
        </h2>
        <p className="mt-1 text-center text-sm text-neutral-400">
          Reached {targetName}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-neutral-800/60 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Stops
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums">
              {s.hops}
              <span className="text-neutral-600"> / {s.parHops}</span>
            </div>
            <div className="text-xs text-neutral-500">
              {s.hopsDelta === 0
                ? 'matched par'
                : `${s.hopsDelta > 0 ? '+' : ''}${s.hopsDelta} vs par`}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-800/60 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Changes
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums">
              {s.changes}
              <span className="text-neutral-600"> / {s.parChanges}</span>
            </div>
            <div className="text-xs text-neutral-500">
              {s.changesDelta === 0
                ? 'matched par'
                : `${s.changesDelta > 0 ? '+' : ''}${s.changesDelta} vs par`}
            </div>
          </div>
        </div>

        <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 text-center font-mono text-sm leading-relaxed text-neutral-200">
          {grid}
        </pre>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={copy}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-neutral-950 transition hover:bg-emerald-400"
          >
            {copied ? 'Copied!' : 'Copy result'}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 rounded-lg border border-neutral-600 px-4 py-2 font-semibold text-neutral-200 transition hover:bg-neutral-800"
          >
            Play again
          </button>
        </div>
      </div>
    </div>
  )
}
