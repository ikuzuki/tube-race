// Compass dial: a needle pointing toward the target's bearing (0 = north,
// clockwise) plus the straight-line distance. Geography only — it never reveals
// how the network connects.

interface CompassProps {
  bearingDeg: number
  km: number
  size?: number
}

export default function Compass({ bearingDeg, km, size = 92 }: CompassProps) {
  const r = size / 2
  const cx = r
  const cy = r

  // SVG rotation is clockwise from the +x axis; our bearing is clockwise from
  // north (the -y axis / up), so rotating the needle group by `bearingDeg`
  // about the centre points it correctly.
  const distLabel =
    km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Target bearing ${Math.round(bearingDeg)} degrees, ${distLabel} away`}
        className="drop-shadow"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r - 3}
          className="fill-neutral-900 stroke-neutral-700"
          strokeWidth={2}
        />
        {/* Cardinal ticks */}
        {['N', 'E', 'S', 'W'].map((label, i) => {
          const ang = (i * 90 - 90) * (Math.PI / 180)
          const tx = cx + Math.cos(ang) * (r - 13)
          const ty = cy + Math.sin(ang) * (r - 13)
          return (
            <text
              key={label}
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-neutral-500"
              fontSize={9}
            >
              {label}
            </text>
          )
        })}
        {/* Needle */}
        <g transform={`rotate(${bearingDeg} ${cx} ${cy})`}>
          <polygon
            points={`${cx},${cy - (r - 18)} ${cx - 5},${cy} ${cx + 5},${cy}`}
            className="fill-rose-500"
          />
          <polygon
            points={`${cx},${cy + (r - 26)} ${cx - 4},${cy} ${cx + 4},${cy}`}
            className="fill-neutral-500"
          />
          <circle cx={cx} cy={cy} r={3} className="fill-neutral-200" />
        </g>
      </svg>
      <span className="font-mono text-sm font-semibold text-neutral-200 tabular-nums">
        {distLabel}
      </span>
    </div>
  )
}
