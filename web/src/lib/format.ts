// Shared display formatting helpers (no engine/DOM state).

/**
 * Strip the verbose TfL suffix from a station name for display.
 * "Victoria Underground Station" -> "Victoria", "Euston Station" -> "Euston".
 */
export function displayName(name: string): string {
  return name
    .replace(/\s+Underground Station$/i, '')
    .replace(/\s+Station$/i, '')
    .trim()
}
