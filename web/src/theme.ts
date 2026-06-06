// Shared UI theme helpers. The canonical TfL line palette lives here for any UI
// that needs a line colour outside the graph data (e.g. the current-line badge).
// Surfaces and semantic colours are Tailwind tokens defined in index.css.

export const LINE_COLOURS: Record<string, string> = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith-city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#1C1C1C',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo-city': '#95CDBA',
  elizabeth: '#6950A1',
  overground: '#EE7C0E',
  dlr: '#00A4A7',
}

/** Line colour for a line id, falling back to a neutral grey. */
export function lineColour(lineId: string, fallback = '#9aa3af'): string {
  return LINE_COLOURS[lineId] ?? fallback
}

/** Readable text colour (black/white) for a given line background. */
export function lineTextColour(lineId: string): string {
  // Yellow-ish lines need dark text; everything else reads on white.
  const dark = new Set(['circle', 'waterloo-city', 'hammersmith-city'])
  return dark.has(lineId) ? '#11151c' : '#ffffff'
}
