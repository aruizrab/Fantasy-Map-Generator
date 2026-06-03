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
| T1 | Planetary config + UI + save/load + Classic toggle | T0 | IN PROGRESS |
| T2 | Insolation & temperature model | T1 | BLOCKED |
| T3 | Moisture circulation & precipitation model | T2 | BLOCKED |
| T4 | Biome cascade verification / retune | T3 | BLOCKED |
| T5 | River & lake cascade verification | T3 | BLOCKED |
| T6 | Population/burg/location cascade verification | T4 | BLOCKED |
| T7 | End-to-end integration + regression | T4,T5,T6 | BLOCKED |
| T8 | Documentation & handoff | T7 | BLOCKED |

Status legend: BLOCKED → IN PROGRESS → IMPL DONE → PASS / FAIL (evaluator-gated).

## Decisions log

- 2026-06-03: Pinned base commit `fa5016a`. Confirmed climate lives in `public/main.js`
  (not `src/`), contrary to the master prompt's "two functions" assumption — but the
  *concept* holds: two functions populate temp/prec. Will edit them in place behind a toggle.
- 2026-06-03: Regression strategy = structural (Classic toggle reuses original algorithm)
  rather than image-diff, because the container can't practically render maps headlessly.
- 2026-06-03: T0 PASS. Build ✓, 65/65 vitest ✓. ARCHITECTURE.md written with all landmarks
  traced to file:line. Confirmed `options` round-trips whole via save/load index 19 — new config
  fields auto-persist; load must merge defaults for backward compat. Confirmed biome matrix is
  pure f(temp,prec,height) → T4 expected to pass without retune. `grid.cells.temp` (Int8) saved
  at data[11], `grid.cells.prec` (Uint8) at data[8].
