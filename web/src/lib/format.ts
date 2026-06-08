// Shared display formatting helpers (no engine/DOM state).

/**
 * Display overrides for the handful of stations whose cleaned name would
 * otherwise collide with a genuinely different station of the same base name.
 * London really does have two separate Edgware Road stations (Bakerloo, vs the
 * Circle/District/Hammersmith & City one) and two Bethnal Greens (the Central
 * line tube and the Overground rail station); they do not interchange, so the
 * graph keeps them as distinct nodes. Stripping the qualifier would make them
 * look like accidental duplicates, so for these we keep a short qualifier.
 * Keyed by the raw graph name; every other station uses the plain cleaner.
 */
const DISPLAY_OVERRIDES: Record<string, string> = {
  'Edgware Road (Bakerloo) Underground Station': 'Edgware Road (Bakerloo)',
  'Edgware Road (Circle Line) Underground Station': 'Edgware Road (Circle)',
  'Bethnal Green Rail Station': 'Bethnal Green (Overground)',
}

/**
 * Strip the verbose TfL suffix from a station name for display.
 * "Victoria Underground Station" -> "Victoria", "Acton Central Rail Station"
 * -> "Acton Central", "Custom House DLR" -> "Custom House". Stacked suffixes
 * are stripped iteratively; an internal "Station" (Battersea Power Station) is
 * preserved because only mode-qualified suffixes are removed. A few colliding
 * names (see {@link DISPLAY_OVERRIDES}) keep a disambiguating qualifier.
 */
export function displayName(name: string): string {
  const override = DISPLAY_OVERRIDES[name.trim()]
  if (override) return override
  let out = name.replace(/\s*\([^)]*\)/g, '').trim()
  const suffix = /(?:[\s-]*(?:Underground|Tube|Rail|DLR)\s*Station|\s+(?:Rail|DLR|ELL))$/i
  let prev: string
  do {
    prev = out
    out = out.replace(suffix, '').trim()
  } while (out !== prev)
  return out
}
