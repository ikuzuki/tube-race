// App chrome header: the Portland-stone bar carrying the roundel brand, the
// "Tube Race" wordmark and today's date, with icon buttons for the how-to-play
// card and the stats panel. Presentational — all actions come in as props.

import Roundel from './Roundel'
import { SummitIcon } from './icons'

interface HeaderProps {
  /** Display date, e.g. "2026-06-06" or a prettier formatted string. */
  date: string
  /** Extra context under the wordmark, e.g. "Past puzzle". */
  subtitle?: string
  onHowToPlay: () => void
  onArchive: () => void
  onStats: () => void
  /** Toggle the day's Expert challenge on/off. */
  onExpert: () => void
  /** Whether the Expert challenge is currently active (highlights the button). */
  expertActive: boolean
}

export default function Header({
  date,
  subtitle,
  onHowToPlay,
  onArchive,
  onStats,
  onExpert,
  expertActive,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-paper px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Roundel size={30} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-display text-lg font-extrabold tracking-tight text-ink">
            Tube Race
          </span>
          <span className="truncate text-xs font-medium text-ink-soft">
            {date}
            {subtitle ? ` · ${subtitle}` : ''}
          </span>
        </div>
      </div>

      <nav className="flex items-center gap-1">
        <IconButton label="How to play" onClick={onHowToPlay}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3.5" />
            <path d="M12 17.5h.01" />
          </svg>
        </IconButton>

        <IconButton
          label={expertActive ? 'Back to the daily' : 'Expert challenge'}
          onClick={onExpert}
          active={expertActive}
        >
          <SummitIcon className="text-[20px]" />
        </IconButton>

        <IconButton label="Past puzzles" onClick={onArchive}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </svg>
        </IconButton>

        <IconButton label="Stats" onClick={onStats}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="6" y1="20" x2="6" y2="13" />
            <line x1="12" y1="20" x2="12" y2="7" />
            <line x1="18" y1="20" x2="18" y2="10" />
          </svg>
        </IconButton>
      </nav>
    </header>
  )
}

interface IconButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
  /** Render in the active (selected) state. */
  active?: boolean
}

function IconButton({ label, onClick, children, active = false }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-progress ${
        active
          ? 'bg-progress/15 text-progress'
          : 'text-ink-soft hover:bg-stone hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
