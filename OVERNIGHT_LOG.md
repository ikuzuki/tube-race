# Overnight log, round 5: give-up + hint, stars, share + countdown, minimal map, precompute

Branch `feat/round-5` off the latest `main` (draft PR opened). Web only. Final
status: `tsc --noEmit` clean, `vitest run` 263 passing, `vite build` clean.
Playwright verified at 1440px and 390px with no console errors.

Also shipped the separately-approved fix first: the two real Edgware Road
stations (Bakerloo vs Circle) and the two Bethnal Greens (tube vs Overground)
now keep a disambiguating qualifier in the display name, via a small override in
`lib/format.ts` (web only; the pipeline's name cleaner is untouched so curated
facts still match, and facts are looked up per station id anyway).

## What shipped, per task

1. Give up / show answer (`Game.tsx`). A "Give up" map control records the day
   played-but-unsolved (resets the streak on the daily, writes an archive
   completion) and opens the existing unsolved result card with "Show best
   route". Moves lock once the run is over.

2. Cost-based hint (`Game.tsx`, `PlayfieldMap.tsx`, `mapgeo.ts`). A "Hint (+3)"
   control lights the optimal next hop (shortestPath stations[1]) with a gold
   halo until the next move; one hint per position. `hintsUsed * 3` is threaded
   through the live score, the result score, the stars, the recorded completion
   and the share. No undo (deliberately excluded).

3. Star rating (`lib/share.ts`, `ResultCard.tsx`). `starRating` (pure, tested):
   3 = optimal (par, which needs no hints), 2 = >=80% optimal, 1 = solved, 0 =
   gave up. Stars are the result-card headline and the share title line
   (`Tube Race 2026-06-08 ⭐⭐⭐`); the % is kept as quiet supporting detail.
   The old square-grid/`SQUARES_RULE` was already gone.

4. Native share + URL + countdown (`ResultCard.tsx`, `lib/share.ts`,
   `lib/countdown.ts`). `handleShare` uses `navigator.share()` when available,
   else clipboard; the share text ends with `SITE_URL` (placeholder, TODO at
   hosting). A "Next puzzle in HH:MM:SS" countdown ticks to the next UTC
   midnight (a deliberate choice, matching how "today" is derived; noted in
   code). Pure `formatCountdown` / `msToNextUtcMidnight`, tested.

5. Continue vs change by shape (`PlayfieldMap.tsx`). Continue moves are filled
   dots; line changes are hollow diamonds (a generated canvas icon + symbol
   layer, hit-tested), so move type reads by shape not colour. The change picker
   lists "Stay on {line}" first and bold, changes beneath.

6. Compass direction word (`lib/compass.ts`, `StatusBar.tsx`). An 8-point word
   beside the distance, e.g. "NE · 1.8 km"; the dial's aria-label still
   announces precise degrees. Pure `compassWord`, tested.

7. Black-diamond Expert icon (`icons.tsx` -> `ExpertIcon`, `Header.tsx`,
   `ArchiveModal.tsx`). The summit glyph is replaced by a single filled diamond.

8. Minimal map (`mapgeo.ts`, `PlayfieldMap.tsx`). `stationsGeoJSON` now emits
   ONLY the current station, the legal moves and the target; the
   revealed-but-untaken edge layers and the faint past-station dots are gone.
   The travelled route, optimal-route reveal and hint marker remain. Verified:
   after several moves the map shows only the bold route, current, the next
   options and the target.

9. Trimmed onboarding (`OnboardingModal.tsx`). Now just the title, a one-line
   goal, the animated demo, the +1/+4 strip and the single compass rule. The
   "anywhere you visit stays on your map" promise is removed (no longer true
   after task 8).

10. Precomputed puzzles (`engine/puzzles.ts`, `scripts/precompute-puzzles.ts`,
    `public/data/puzzles.json`, wired through `App`/`Game`/`ArchiveModal`). A
    `tsx` build script (`npm run precompute`) writes endpoints-only puzzles for
    every date from launch to a 2-year horizon (731 dates, 95 KB, ~3 min to
    generate). The app recomputes the cheap `par` from the endpoints via
    `resolveDaily`/`resolveExpert`, falling back to on-the-fly generation for
    any date outside the file. The archive now opens in ~80ms (daily) / ~150ms
    (Expert) instead of generating in-browser. Lookup + fallback are tested.

## Decisions / notes for the owner

- The result card can show an inner scrollbar on the desktop when a station's
  fun fact is long. That is the consequence of your merged #12/#13 (show facts
  in full, one per row), which reverted round 4's three-line clamp. I respected
  that decision and did not re-clamp; if you want both (no scroll AND full
  facts) the card would need a different layout (e.g. facts in a disclosure).
- `revealedEdgesGeoJSON` in `mapgeo.ts` is now unused by the map (kept, with its
  tests, as it is pure and may be reused); say the word and I will delete it.
- Regenerate `puzzles.json` (like graph/stations-info) whenever the generator
  or the graph changes: `npm run precompute`. It is committed.

## Honest gaps

- The on-map hollow-diamond change marker is wired and unit-tested at the data
  layer (`moveClass: 'switch'`), and the same diamond glyph is visible on the
  Expert toggle, but I did not capture a Playwright screenshot of a diamond
  on the map (it needs a turn where a legal move is a line change; the
  follow-cam timing makes that fiddly to drive headlessly). The continue-dot vs
  change-diamond distinction is in place; worth an eyeball at a real interchange.
- The precompute horizon is 2 years; past that the app silently falls back to
  in-browser generation (correct, just slower for those far-future dates).

---

# Overnight log, round 4: mobile bar, result-card fit, % optimal, celebration

Branch `feat/mobile-and-result` off the latest `main` (draft PR opened). Web
only. Final status: `tsc --noEmit` clean, `vitest run` 232 passing, `vite
build` clean; Playwright verified at 1440px and 390px with no console errors.

## What was built, per task

1. Compact mobile status bar (`StatusBar.tsx`). On narrow screens the captions
   ("Score", "Stops", "Changes", "Line", "Start", "Destination") are dropped,
   stops/changes/line collapse to one inline icon+value row, the compass shrinks
   to ~36px and the start/destination journey is a single slim row. Everything
   restores at the `sm` breakpoint, so desktop is unchanged. Measured at
   390x844: the bar fell from ~149px to ~99px pre-move (~106px after a move) and
   the map's share of the viewport rose from ~62% to ~76% (>70% target met).

2. Result card fits with no inner scroll (`ResultCard.tsx`,
   `StationInfoCard.tsx`). Fun facts clamp to three whole lines (line-clamp ends
   at a line boundary, never mid-word; the Wikipedia link carries the rest), so
   a card's height no longer grows with fact length. Verified by injecting a
   12x-long fact: the fact box stayed 58px and the dialog's scrollHeight equalled
   its clientHeight (774 = 774, within a 900 viewport: no scrollbar). Vertical
   spacing tightened throughout. The two-up station layout now keys off the
   container width via a Tailwind container query (`@container` + `@md:grid-cols-2`)
   rather than the viewport `sm:`, so the cards sit side by side inside the modal
   on desktop and stack on a phone.

3. Wider result modal (`Modal.tsx`). Added an optional `size` prop ('md' default,
   'wide' = `max-w-xl` ~576px). Only the result card opts into 'wide'; the
   onboarding/stats/intro modals are untouched. Below the breakpoint the modal is
   already full-width-minus-padding, so phone fit is unaffected.

4. "% optimal" replaces the square grid (`lib/share.ts`, `share.test.ts`,
   `ResultCard.tsx`). `percentOptimal = round(best / score * 100)`, clamped to
   [0,100]; an optimal run reads 100%. The share text is now title / "Score 9
   (best 9), 100% optimal" / stops·changes / streak, still spoiler-free (a unit
   test asserts no emoji grid and no station names). The `SQUARES_RULE`
   small-print footer is gone; the % is surfaced prominently on the score block.

5. Count-up + celebration (`ResultCard.tsx`, new `Confetti.tsx`). On a solved
   open the score tweens 0 to final over ~0.5s (cubic ease, rAF) and a canvas
   confetti burst fires, 90 flecks when optimal vs 40 otherwise. Both are gated
   on `open && solved && !prefers-reduced-motion`, so they fire once per open
   (the modal remounts its body each open) and are fully suppressed under reduced
   motion, which shows the final score immediately and no canvas. Confetti is
   dependency-free and no-ops if the 2d context is unavailable. Locked with three
   component tests (reduced-motion shows final + no canvas; motion-allowed mounts
   a canvas; an unsolved run never celebrates).

Scrubbed the difficulty mechanism from display copy (owner's top note). On this
branch (from main) no user-facing copy exposed it. The "3 or more changes, where
the compass misleads hardest" line lived only in the unmerged expert-archive PR
(#10); I scrubbed it there at source to "the toughest routes the network can
throw at you" and pushed, so it lands whenever that PR is reconciled.

## Decisions / notes for the owner
- The reduced-motion and celebration paths are verified by deterministic
  component tests rather than a live Playwright solve: the headless optimal-route
  driver flaked on follow-cam timing (a test-harness issue, not the feature). The
  non-reduced celebration was confirmed live (confetti + count-up + "100%
  optimal" captured at 1440px).
- This branch was cut from `main`, which does not yet contain the expert-archive
  work (PR #10 is still open). These changes touch `ResultCard`/`StatusBar`/
  `Modal`/`share`, which #10 also touches lightly; expect a small reconcile when
  both merge. No `main` commits, no force-pushes.

---

# Overnight log, round 2, 7 June 2026

Targeted polish from the playtest review plus three owner requests, on
`feat/polish-round-2` (branched from main after the #4/#5 merges). Final
status: web 221 tests green, `tsc` clean, `vite build` clean; pipeline
untouched but re-verified green (154 tests, ruff, mypy); Playwright passes at
1440px and 390px with zero console errors on a fresh load. Nothing merged to
`main`.

## What was built, per task

**1. Shared-route rendering** (`mapgeo.ts`, `PlayfieldMap.tsx`). Edges are now
grouped per station pair and each co-located line gets a signed `offsetIdx`
centred on zero, rendered with MapLibre `line-offset` (6px per slot) so a
segment served by Circle and District shows both colours as TfL-style parallel
strokes. Coordinates are normalised lo-id to hi-id so offsets always land on
consistent sides. The minimum bar (the current line always visibly continues)
falls out of drawing every line. Verified live on the Notting Hill Gate to
High Street Kensington corridor. Note the ridden-path stroke still overdraws
the centre of a shared segment you have already travelled; the fan-out is most
visible on unridden segments, which is where the decision matters.

**2. Overground texture** (`theme.ts`, `PlayfieldMap.tsx`, `StatusBar.tsx`).
New `OVERGROUND_LINE_IDS`/`isOverground` in the theme; the map draws those six
lines via dashed twin layers (`line-dasharray` is not data-drivable, so solid
and dashed layers filter one source), for both the revealed network and the
ridden path. The journey ribbon mirrors it with a striped CSS gradient on
Overground legs. Hues untouched, as asked. The weaver/metropolitan,
mildmay/victoria and lioness/circle clashes now differ by texture. Line chips
and the route narration are unchanged (they carry the line name in text).

**3. Archive-only replay** (`Game.tsx`, `ResultCard.tsx`). A floating "Start
again" pill appears mid-run on archive replays only (after the first move);
the post-solve "Play again" (floating row and result card) is now also gated
to archive puzzles. The genuine daily offers no replay anywhere, keeping one
attempt per day. `onPlayAgain` on the result card became optional; best
results per date still win in the completion store, so an improved retry
updates it. Verified live: appears after move one, resets the run, absent on
the daily; covered by component tests.

**4. No degree-1 endpoints** (`daily.ts`). The tier draw rejects endpoints
with fewer than two distinct neighbours (with a defensive escape for
degenerate graphs). On the real graph that excludes 33 termini (Stratford
International, Morden, Brixton and friends); a 40-day probe showed zero
terminus endpoints and zero tier fallbacks. Today's daily changed from
Stratford International to Latimer Road to Bond Street as a result, which is
the intended effect. The legacy band-override path is untouched.

**5. Touch targets** (`PlayfieldMap.tsx`). Click hit box raised from a 16px to
a 22px half-width (~44px effective), keeping nearest-legal-within-box. A
deliberate 20px-off-centre tap at 390px registers the move.

**6. Mobile chrome** (`StatusBar.tsx`, `Game.tsx`). Before the first move the
journey row collapses to a one-line "Start to Destination" on narrow screens
(the ribbon appears with the first leg); the compass shrinks to 44px on
mobile; paddings tightened. The map container is now flex-fill rather than a
fixed 62vh slice (still capped at 640px), so the freed chrome becomes map.
Status bar at 390x844: 181px to 149px; map share of the viewport 62% to 70%.

**7. Cold-start framing** (`PlayfieldMap.tsx`). The opening frame fits to a
wider 11.8 max zoom before any move (verified 11.80 at launch, tightening to
12.50 after move one), so launch shows surrounding city instead of a blank
basemap around one station.

**8. Backtrack de-emphasis** (`mapgeo.ts`, `PlayfieldMap.tsx`). The
immediately-previous station carries a `prev` flag and renders dimmed (ring
0.35, dot 0.45 opacity) while staying fully legal. Right after move one that
is the start marker, which is correct (it IS the backtrack target).

## Decisions that may need your call

- The replay gating also removed the daily's post-solve "Play again" button,
  which previously allowed casual same-day retries. That follows the
  one-attempt-a-day rationale in the request, but it is a behaviour removal;
  easy to restore if you want daily retries that simply do not re-record.
- Parallel-stroke spacing is 6px per slot at all zooms. Four-line corridors
  (Baker Street to Liverpool Street) get wide; looked fine in testing but
  worth an eyeball on the City corridors.
- Dashes for the Overground are texture-only, as requested; DLR and Elizabeth
  stay solid (their hues are distinct).

## Known gaps

- The vitest suite can flake under heavy machine load (default 5s per-test
  timeout; the archive menu test derives ten puzzles in jsdom and fixture days
  that miss their tier burn the full attempt budget). I raised that test's
  waitFor to 10s; a tidier fix would be capping fixture attempt budgets.
- Stray dev servers from earlier sessions still hold ports 5173-5179; this
  round's server ran on 5180. Harmless, but a machine restart would tidy them.
- The route narration keeps solid colour pills for Overground lines (name text
  carries the information); extend the stripe treatment there if you want full
  consistency.

---

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
