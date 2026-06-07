// Shared display formatting helpers (no engine/DOM state).

/**
 * Strip the verbose TfL suffix from a station name for display.
 * "Victoria Underground Station" -> "Victoria", "Acton Central Rail Station"
 * -> "Acton Central", "Custom House DLR" -> "Custom House". Stacked suffixes
 * are stripped iteratively; an internal "Station" (Battersea Power Station) is
 * preserved because only mode-qualified suffixes are removed.
 */
export function displayName(name: string): string {
  let out = name.replace(/\s*\([^)]*\)/g, '').trim()
  const suffix = /(?:[\s-]*(?:Underground|Tube|Rail|DLR)\s*Station|\s+(?:Rail|DLR|ELL))$/i
  let prev: string
  do {
    prev = out
    out = out.replace(suffix, '').trim()
  } while (out !== prev)
  return out
}
