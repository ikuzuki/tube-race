// Small shared glyphs for the two scored quantities. A roundel for a stop, an
// interchange double-arrow for a line change. Inherit colour via currentColor
// and size via className (default 1em square) so they sit inline with labels.

interface IconProps {
  className?: string
}

/** Tube-roundel motif: a stop / station. */
export function StopIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="3" y="10.25" width="18" height="3.5" fill="currentColor" />
    </svg>
  )
}

/** Two opposing arrows: a line change / interchange. */
export function ChangeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
    >
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </svg>
  )
}
