# PROJECT PLAN — Sun-Axis Climate Model

**Single source of truth** for the project that replaces Azgaar FMG's Earth-centric
climate generation with a physically-motivated climate model for a planet whose spin
axis points near its star.

## Pinned upstream commit

- **Fork:** `aruizrab/Fantasy-Map-Generator` (already a TS/Vite-migrating fork of Azgaar)
- **Pinned base commit:** `fa5016a6982167f1ae169f0cdb203e281498bee7` (`chore: bump version to 1.122.12`)
- **Feature branch:** `claude/fantasy-map-sun-axis-climate-MbX1q`
- **Node available:** v22.22.2 (copilot doc requests >=24; build/test must tolerate v22)

## Key architectural facts (verified in T0)

- Climate generation is **legacy JS in `public/main.js`**, NOT in `src/` yet:
  - `calculateTemperatures()` — `public/main.js:927` → populates `grid.cells.temp` (Int8Array °C)
  - `generatePrecipitation()` — `public/main.js:976` → populates `grid.cells.prec` (Uint8Array)
  - Pipeline: `generate()` at `public/main.js:638`; climate called at lines 662–663,
    BEFORE `reGraph()` (665) which builds `pack`.
- **grid vs pack:** `pack.cells.g` (`public/main.js:1181`) maps pack→grid cell ids.
  Climate is computed on **grid**; everything downstream reads via `pack.cells.g`.
- Global config object `options` defined at `public/main.js:149` (winds, temperatureEquator,
  temperatureNorthPole, temperatureSouthPole, ...).
- `mapCoordinates` (latN/latS/latT) drives per-row latitude in both climate functions.
- Biomes: `src/modules/biomes.ts` (`Biomes.define()`), Whittaker matrix.
- Rivers: `src/modules/river-generator.ts`. Lakes: `src/modules/lakes.ts`.
- Population: `rankCells()` at `public/main.js:1198`, uses `biomesData.habitability[biome]`.

## Climate-model strategy

The Sun-axis model is implemented behind a **Classic ⇄ Sun-axis toggle**. Classic preserves
the exact original code path (regression safety net). All new physics lives behind tunable,
documented coefficients in a single config block. Climate is injected into `grid.cells.temp`
/ `grid.cells.prec`; the rest of the DAG re-derives unchanged.

## Regression baseline

Because this is a client-only browser app (no headless map render in CI is practical here),
the regression baseline is preserved structurally: **Classic mode reuses the original
algorithm byte-for-behavior** (same code, gated by the toggle). T7 validates Classic output
is identical to the pinned-commit algorithm. The original climate functions are archived
verbatim in `ARCHITECTURE.md` for diff reference.

## Task DAG & status

| Task | Description | Deps | Status |
|------|-------------|------|--------|
| T0 | Architecture map, pin commit, baseline | — | PASS |
| T1 | Planetary config + UI + save/load + Classic toggle | T0 | PASS |
| T2 | Insolation & temperature model | T1 | PASS |
| T3 | Moisture circulation & precipitation model | T2 | PASS (cycle 2) |
| T4 | Biome cascade verification / retune | T3 | PASS |
| T5 | River & lake cascade verification | T3 | PASS |
| T6 | Population/burg/location cascade verification | T4 | PASS |
| T7 | End-to-end integration + regression | T4,T5,T6 | PASS |
| T8 | Documentation & handoff | T7 | PASS |

Status legend: BLOCKED → IN PROGRESS → IMPL DONE → PASS / FAIL (evaluator-gated).

**All tasks PASS.** Every implementation task was validated by an independent evaluator
subagent (a separate invocation from the implementer); T3 took 2 cycles (night-cap orographic
defect found and fixed). Deliverables: `ARCHITECTURE.md`, `SUN_AXIS_CLIMATE.md`, the toggled
climate model in `public/main.js`, the world-config UI, save/load backward-compat, and a real
Playwright e2e suite (`tests/e2e/sun-axis-climate.spec.ts`).

## Decisions log

- 2026-06-04: USER-REPORTED FIX (tilt 65, south-facing, whole world → entire south was wetland).
  Root cause (measured in the real app): at high `axialTilt` the *entire* sunward hemisphere is warm,
  real continents touch ocean on several sides, and the precip *magnitude* was high enough that almost
  any warm cell within a few cells of ocean exceeded the wetland threshold (74% of southern land was
  Wetland). The earlier single-coast synthetic validation hid this. Fixes: (1) lowered precip base
  magnitude 50→35 and `moistureTravel` default 12→9 so the wettest coasts land in forest/rainforest
  and wetland stays rare; (2) EXPOSED `moistureTravel` ("Moisture reach") and `precipScale` ("Wetness")
  as UI sliders so aridity is user-tunable. Re-measured tilt-65-south: wetland 74%→0-19%, now a
  desert/grassland/forest mix. Existing e2e signature relaxed to "vegetated" (forest OR grassland) to
  stay robust on drier maps. All sun-axis e2e + 65 unit tests pass.

- 2026-06-03: Pinned base commit `fa5016a`. Confirmed climate lives in `public/main.js`
  (not `src/`), contrary to the master prompt's "two functions" assumption — but the
  *concept* holds: two functions populate temp/prec. Will edit them in place behind a toggle.
- 2026-06-03: Regression strategy = structural (Classic toggle reuses original algorithm)
  rather than image-diff, because the container can't practically render maps headlessly.
- 2026-06-03: T1 PASS (independent evaluator). Toggle + config + UI + save/load round-trip +
  Classic byte-identical to upstream all verified; build ✓, 65/65 tests ✓.
- 2026-06-03: T2 PASS (independent evaluator: lit cap 31°C vs night −43°C, both warmth peaks
  modeled & distinct, no NaN at poles/edge tilts, Classic untouched, south-pole mirror works).
- 2026-06-03: T3 implemented. Sun-axis precipitation = ocean-moisture "optical depth" (heap Dijkstra,
  each inland step costs more where hotter so moist air rains out fast over the convective cap →
  desert interiors), × convective uplift (warmth-driven, peaks over lit cap), × subsidence dry belt,
  + orographic lift. Resolution-aware travel; reuses precInput slider. Validated by prototype +
  integration harness on the REAL function: wet lit coast 69, desert interior 14, orographic boost,
  dry band/night cap, bounded budget, no NaN. Classic precipitation untouched.
- 2026-06-03: T3 cycle-1 evaluator FAIL: frozen night-cap mountains still "rained" because the
  orographic term lacked a temperature gate (convective term was already freeze-gated). Fixed by
  multiplying orographic lift by warmth(i) → cold cap goes dry (night-cap mountain prec 35→0).
- 2026-06-03: T4 validated (cascade harness on real T2+T3 outputs): biome matrix unchanged (pure
  f(temp,prec,height) generalizes), lit coast = Tropical rainforest, lit interior = Hot desert, night
  cap = Glacier, no unclassified cells, full rainforest→savanna→desert gradient. The two-tool
  discrepancy (lush coast + desert interior) is resolved WITHOUT retuning the matrix. This required a
  T3 calibration: moistureTravel default 35→12 + sqrt resolution scaling so interiors reach the desert
  band while coasts stay lush. No biome-matrix changes.
- 2026-06-03: T5 PASS (independent evaluator): rivers/lakes consume climate only via pack.cells.g and
  re-derive cleanly; rivers nucleate in the rain belt, hot-cap lakes trend evaporative; no NaN/Inf.
  Applied its defense-in-depth suggestion: clamp peakTemp to [-50,50] (and nightCapTemp ≤ peakTemp) so
  the lake-evaporation denominator (80 − lakeTemp) can never reach zero even via console/save-file edits.
- 2026-06-03: T3 PASS cycle-2 (independent evaluator): night-cap mountain prec 35→0 fixed,
  orographic lift preserved on warm terrain, all 6 criteria green, Classic byte-identical.
- 2026-06-03: T4 PASS (independent evaluator): biomes.ts byte-identical to fa5016a (NO matrix
  retune), lit coast→Wetland/lush, lit interior→Hot desert, night cap→Glacier, exhaustive
  256-temp × moisture sweep produced 0 unclassified/out-of-range. Two-tool discrepancy resolved.
- 2026-06-03: Full e2e regression run (84 tests): 79 pass, 7 fail. The 7 failures are ALL
  `layers.spec.ts` HTML-snapshot tests (ocean/rivers/states/borders/routes/burgs/anchors). Proven
  PRE-EXISTING / environmental, NOT a Sun-axis regression: (a) the ocean layer is computed upstream
  of climate (OceanLayers at main.js:659 runs before calculateTemperatures at :662) so my changes
  cannot affect it; (b) the climate-derived snapshots (biomes, cells, coastline) PASS; (c) the
  failing `ocean layer` test fails IDENTICALLY when checked out at the pinned baseline fa5016a in
  this same container — the local chromium build (1194) differs from the 1223 build the committed
  snapshots were baselined against, yielding different SVG path coordinates. CI installs the matching
  browser, so these pass there. My 3 Sun-axis e2e tests and all non-snapshot e2e tests pass.
- 2026-06-03: T6 + T7 PASS via a REAL Playwright e2e test (tests/e2e/sun-axis-climate.spec.ts)
  driving the actual app in chromium:
  (1) Classic mode still generates a complete map (regression baseline) — no console errors.
  (2) Sun-axis whole-world map: clean end-to-end run (climate→biomes→rivers→burgs→states),
      temp signature maxTemp ~14-28 / minTemp ~-53..-86, 9-10 distinct biomes incl. cold + lush,
      no NaN, no console errors. T6: population concentrates in habitable zones (≈4880 habitable
      vs ≈444 hostile pop). (hot-desert presence varies with the random heightmap and is proven
      deterministically by the T4 cascade harness; e2e asserts robust properties only.)
  (3) A Sun-axis world round-trips through the real .map save/load (climateModel, axialTilt,
      sunwardPole, moistureTravel and grid.cells.temp all preserved).
  Note: locally the env's chromium build (1194) differs from playwright 1.60's expected build;
  the committed spec runs against the standard playwright.config.ts (CI installs the matching
  browser). A throwaway executablePath-override config was used locally only and not committed.
- 2026-06-03: T2 implemented. Sun-axis temperature uses the standard daily-mean insolation integral
  with phi_s (=90−tilt) as solar "declination". Validated by prototype + integration harness against
  a synthetic grid: lit cap warmest (integrated-warmth peak toward lit pole), instantaneous-noon peak
  at sub-solar latitude (the two peaks do NOT coincide, per ground truth), night cap frozen, ocean
  thermal inertia + altitude lapse + diurnal band cooling applied, no NaN/Inf, Int8-bounded.
- 2026-06-03: T0 PASS. Build ✓, 65/65 vitest ✓. ARCHITECTURE.md written with all landmarks
  traced to file:line. Confirmed `options` round-trips whole via save/load index 19 — new config
  fields auto-persist; load must merge defaults for backward compat. Confirmed biome matrix is
  pure f(temp,prec,height) → T4 expected to pass without retune. `grid.cells.temp` (Int8) saved
  at data[11], `grid.cells.prec` (Uint8) at data[8].
