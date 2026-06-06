// React binding for the station-info artefact. Owns the async load so the
// components that render station cards stay presentational. Degrades to an empty
// map on any failure (loadStationInfo never rejects), so the game is fully
// playable without the trivia.

import { useEffect, useState } from 'react'
import { loadStationInfo, type StationInfoMap } from '../lib/stationInfo'

export interface UseStationInfo {
  infoMap: StationInfoMap
  loading: boolean
}

export function useStationInfo(): UseStationInfo {
  const [infoMap, setInfoMap] = useState<StationInfoMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadStationInfo().then((file) => {
      if (!active) return
      setInfoMap(file.stations)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return { infoMap, loading }
}
