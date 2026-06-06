// Stats panel: lifetime headline numbers plus a histogram of how far over par
// the player's solved games landed, measured by weighted SCORE (stops +
// 4*changes — see lib/score). Tube-styled bars, wrapped in the shared Modal.
// Presentational — the Stats record arrives as a prop.

import Modal from './Modal'
import { BUCKETS, type Stats } from '../lib/stats'

interface StatsModalProps {
  open: boolean
  onClose: () => void
  stats: Stats
}

export default function StatsModal({ open, onClose, stats }: StatsModalProps) {
  const winPct = stats.played ? Math.round((stats.solved / stats.played) * 100) : 0
  const optimalPct = stats.solved ? Math.round((stats.optimalCount / stats.solved) * 100) : 0
  const maxBucket = Math.max(1, ...BUCKETS.map((b) => stats.distribution[b] ?? 0))

  return (
    <Modal open={open} onClose={onClose} title="Statistics">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Figure value={stats.played} label="Played" />
        <Figure value={`${winPct}%`} label="Win" />
        <Figure value={`${optimalPct}%`} label="Optimal" />
        <Figure value={stats.curStreak} label="Streak" />
        <Figure value={stats.maxStreak} label="Max streak" />
        <Figure value={stats.solved} label="Wins" />
      </div>

      <h3 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
        Score over par
      </h3>
      {stats.solved === 0 ? (
        <p className="text-sm text-ink-soft">
          Solve your first puzzle to start filling this in.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {BUCKETS.map((b) => {
            const count = stats.distribution[b] ?? 0
            const pct = (count / maxBucket) * 100
            return (
              <div key={b} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-soft">
                  {b}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-stone">
                  <div
                    className="flex h-full min-w-[1.25rem] items-center justify-end rounded bg-progress px-1.5 text-[0.65rem] font-bold tabular-nums text-white"
                    style={{ width: `${Math.max(pct, count > 0 ? 12 : 0)}%` }}
                  >
                    {count > 0 ? count : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

interface FigureProps {
  value: number | string
  label: string
}

function Figure({ value, label }: FigureProps) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold leading-none tabular-nums text-ink">{value}</span>
      <span className="mt-1 text-[0.65rem] font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
    </div>
  )
}
