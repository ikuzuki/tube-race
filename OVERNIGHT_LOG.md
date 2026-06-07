# Overnight log, 7 June 2026

Everything below landed on `feat/expand-network` (now pushed, draft PR
[#3](https://github.com/ikuzuki/tube-race/pull/3)). Final status: pipeline 150
tests green, ruff and mypy clean; web 202 tests green, `tsc` clean, `vite build`
clean; live Playwright playthroughs at desktop and mobile widths with zero
console errors. Nothing was merged to `main`.

## What was built

**Journey banner** (`JourneyBanner.tsx`, `journeyLegs` in `lib/route.ts`). The
top of the page now carries a persistent Start and Destination hero with a
line-coloured ribbon between them: one segment per leg ridden (18px per stop),
interchange markers at each change, a pulsing you-are-here dot, and a dashed
tail to a hollow destination roundel that fills on arrival. Long runs scroll
horizontally and stay pinned to the newest leg; on narrow screens the ribbon
wraps onto its own row. The destination block moved here out of the HUD, which
now leads with the score.

**Greedy-gap difficulty** (`engine/greedy.ts`, `engine/difficulty.ts`,
`engine/landmarks.ts`, rewritten `engine/daily.ts`). A deterministic greedy
solver mimics a compass-led player (closest-to-target move, prefers staying on
its line, avoids revisits, gives up at a step cap). The ratio of its weighted
cost to the optimal route's is the greedy gap; `Infinity` (greedy never
arrives) marks the compass actively misleading. Tiers: easy 5-9 hops / one
change / gap up to 1.15, medium 8-13 / two changes / 1.15-1.4, hard 10-16 /
two changes / 1.4 and up. The date seeds both the tier draw (40/45/15) and the
endpoint draw, which is 65% biased towards a 130-name landmark pool. Calibrated
against the real graph: 60 consecutive days selected in-band with zero
fallbacks, about 7ms per day. The legacy band parameter still works for tests.
Note this changes which puzzle a given date produces, deliberately.

**Past-puzzles archive** (`lib/archive.ts`, `hooks/useArchive.ts`,
`ArchiveModal.tsx`, header calendar button). Ten curated dates (three easy,
five medium, two hard, all recognisable endpoints, hand-picked from generator
output) listed with endpoints, tier chip and your best result. Selecting one
swaps the puzzle (the `Game` remounts keyed by date); archive solves record a
best-kept completion in `tube-race:archive:v1` but never touch lifetime stats
or the streak, verified live. The daily remains the landing experience.

**Onboarding** (`OnboardingModal.tsx`, `demo-*` keyframes in `index.css`). A
looping 9-second SVG storyboard of an actual run: fog lifting as the player
rides two stops, a +4 flashing at the line change, arrival pulse on the
target, compass needle tracking throughout. Below it, three tightened rules
and an explicit scoring strip: score = stops + 4 × changes, lower is better,
you are racing the best possible route. Honours `prefers-reduced-motion`
(static finished-journey frame). Still first-run-only.

**Share squares** (`lib/share.ts`). Fixed three-point bands, as suggested:
optimal is five green, then one green drops per three points over best; every
solve keeps one amber cell so it never reads as the all-grey DNF row. The rule
is spelled out on the result card under the actions.

**Data gaps** (`pipeline/tube_pipeline/curated_stats.py`, `apply_curated_stats`
in `enrich.py`, new `apply-stats` CLI command). Fill-only override maps for 83
opening years and 145 daily-traffic figures (keyed by cleaned name, mirroring
`curated_facts.py`), plus four unconditional year corrections for bad Wikidata
claims found during verification (Poplar and West India Quay 1987, Woolwich
Arsenal DLR 2009, Dalston Kingsland 1983). Both ranks are recomputed over the
full population in the pipeline; `stations-info.json` is regenerated at
420/420 openedYear and 420/420 dailyTraffic, rank sequences verified 1..420
with no gaps. Years are sourced from railway history; traffic figures are
deliberately round, informed estimates (as authorised), sense-checked against
TfL/ORR orders of magnitude.

**Follow-camera** (`PlayfieldMap.tsx`). Playtesting caught real moves landing
off-screen: at the old fixed follow zoom a long Elizabeth-line hop (Stratford
to Liverpool Street) was simply not visible. The camera now fits the current
station plus every legal move with padding, capped at the old zoom so it never
zooms in further. Also added a dev-only `window.__trMap` handle (guarded by
`import.meta.env.DEV`) so browser-driven tests can project coordinates.

**Small fixes.** The intro card says "Journey from the archive" when replaying
(it claimed "Today's journey"); the header shows "Past puzzle" next to the
date during a replay.

## How it was verified

Beyond the unit suites, full Playwright playthroughs: fresh-profile onboarding
(animation visually confirmed at three loop points), intro, an optimal 8-hop
two-change solve of the new daily (Stratford International to Notting Hill
Gate, "Spot on!", 16/16), result card with the enriched station cards (filled
years/traffic/ranks rendering), best-route narration overlay, stats, the
archive end-to-end (played Battersea Power Station to Piccadilly Circus to an
optimal 10/10, tick and best score in the menu, stats unpolluted, back to
today), and mobile at 375px. A greedy bot also played the old daily and got
trapped oscillating near Bow Church, which is what convinced me the greedy-gap
metric measures the right thing.

## Decisions that may need your call

- The tier rotation changes the daily for dates that previously produced a
  different puzzle. Anyone mid-streak sees a new puzzle today; the streak
  itself is unaffected.
- Archive endpoints are visible in the menu before playing (same information
  the intro card shows). I judged that fine for choosing a puzzle; fog and
  anti-cheat are untouched.
- Traffic figures for non-tube stations are estimates, not gateline data. If
  you want sourced numbers, TfL publishes DLR/Overground/Elizabeth counts that
  could feed a future `parse_station_usage` extension; the override map keeps
  them easy to replace.
- Hard days can have an infinite greedy gap (the compass never gets you there).
  Playtest a couple before deciding whether 15% hard is right; the split is one
  constant in `tierForDate`.

## Known gaps, honestly

- Game progress is not persisted: refreshing mid-run restarts the day's puzzle
  (stats still record only once per date). Pre-existing, untouched.
- The greedy solver models a tireless player with perfect memory; it never
  "gives up and backtracks strategically". Good enough as a difficulty signal,
  not a human simulation.
- `refresh-facts` was not re-run (no graph change; facts are curated and
  stable). The regenerated artefact only changed stats and ranks.
- Bundle size warning (1.27MB JS, mostly MapLibre) remains; pre-existing.
