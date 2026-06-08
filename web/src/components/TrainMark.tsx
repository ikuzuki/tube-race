// The Tube Race brand mark: a stylised tube-train front (two cab windows and a
// round headlight) on a dark rounded badge, in the app palette. Original
// geometry, deliberately NOT the Underground roundel, so the app carries no TfL
// brand IP. Kept in sync with web/public/favicon.svg.

interface TrainMarkProps {
  size?: number
  className?: string
}

export default function TrainMark({ size = 30, className }: TrainMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Tube Race"
      className={className}
    >
      <rect width="100" height="100" rx="20" fill="#0b0e13" />
      {/* carriage front */}
      <rect x="27" y="18" width="46" height="60" rx="15" fill="#1ea672" />
      {/* two cab windows */}
      <rect x="33" y="30" width="14" height="14" rx="4" fill="#0b0e13" />
      <rect x="53" y="30" width="14" height="14" rx="4" fill="#0b0e13" />
      {/* round headlight */}
      <circle cx="50" cy="62" r="7" fill="#0b0e13" />
    </svg>
  )
}
