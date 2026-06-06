// Single comparable score for a run. Stops and changes are folded into one
// number so two runs are directly rankable (the V2 split of stops-vs-par AND
// changes-vs-par made "who did best" ambiguous). This is exactly the cost the
// Dijkstra par minimises: 1 per stop, CHANGE_WEIGHT per line change. Lower wins.

export const CHANGE_WEIGHT = 4

/** Weighted score for a route. Lower is better. */
export function points(stops: number, changes: number): number {
  return stops + CHANGE_WEIGHT * changes
}
