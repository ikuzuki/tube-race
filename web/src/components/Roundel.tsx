// The London Underground roundel motif — the brand anchor for the app chrome.
// Decorative by default; pass a `label` to render text in the bar (e.g. a station
// or line name) the way real roundels do.

interface RoundelProps {
  size?: number
  /** Optional text shown across the central bar. */
  label?: string
  /** Ring colour. Defaults to Central-line red. */
  ringColour?: string
  /** Bar colour. Defaults to Piccadilly-ish navy. */
  barColour?: string
  className?: string
}

export default function Roundel({
  size = 28,
  label,
  ringColour = '#E32017',
  barColour = '#1c3f94',
  className,
}: RoundelProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ? `${label} roundel` : 'Underground roundel'}
      className={className}
    >
      <circle cx="50" cy="50" r="30" fill="none" stroke={ringColour} strokeWidth="12" />
      <rect x="6" y="42" width="88" height="16" fill={barColour} />
      {label && (
        <text
          x="50"
          y="51"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="14"
          fontWeight="700"
          fontFamily="var(--font-display)"
        >
          {label}
        </text>
      )}
    </svg>
  )
}
