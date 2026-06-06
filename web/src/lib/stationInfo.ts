// Station trivia/stats shown on the pre- and post-game cards. Produced at build
// time by the Python pipeline (pipeline/.../enrich) from Wikidata + Wikipedia and
// keyed by the SAME station id as graph.json. All fields are best-effort: the UI
// shows only what exists. Ranks are 1-based across the whole network among
// stations that have that stat.

export interface StationInfo {
  name: string
  /** Year the station opened. */
  openedYear?: number
  /** 1 = oldest on the network. */
  openedRank?: number
  /** Approx. daily entries + exits. */
  dailyTraffic?: number
  /** 1 = busiest on the network. */
  dailyTrafficRank?: number
  /** One punchy, sourced sentence. */
  funFact?: string
  /** Link to the Wikipedia article. */
  wikiUrl?: string
}

export type StationInfoMap = Record<string, StationInfo>

export interface StationInfoFile {
  version: string
  generatedAt: string
  stations: StationInfoMap
  counts?: { total: number; withOpened: number; withTraffic: number }
}

const EMPTY: StationInfoFile = { version: '0', generatedAt: '', stations: {} }

/**
 * Fetch the station-info artefact. Degrades to an empty map on any failure so
 * the game is fully playable without it.
 */
export async function loadStationInfo(url = '/data/stations-info.json'): Promise<StationInfoFile> {
  try {
    const res = await fetch(url)
    if (!res.ok) return EMPTY
    return (await res.json()) as StationInfoFile
  } catch {
    return EMPTY
  }
}
