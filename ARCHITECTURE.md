# ARCHITECTURE — Climate generation & the cascade it feeds

Target of this project: replace the two functions that populate `grid.cells.temp` and
`grid.cells.prec` with a Sun-axis climate model, behind a Classic⇄Sun-axis toggle, and let
the rest of the generation DAG re-derive unchanged.

This fork is **mid-migration JS→TS**: `src/` holds migrated TS modules; `public/` still holds
legacy JS including `main.js`, which owns the generation pipeline, the global `options`/`grid`/
`pack` state, and the climate functions.

## Pinned commit

`fa5016a6982167f1ae169f0cdb203e281498bee7` (v1.122.12). Branch `claude/fantasy-map-sun-axis-climate-MbX1q`.

## Build / run (verified in T0)

- `npm install` ✓ (Node v22.22.2 present; copilot doc requests >=24 but build works on 22)
- `npm run build` ✓ (tsc + vite; warnings only, no errors)
- `npx vitest run` ✓ 65/65 tests pass
- Dev server: `npm run dev` → http://localhost:5173

## Generation pipeline (`public/main.js` `generate()` ~line 638)

```
generateGrid → HeightmapGenerator.generate → Features.markupGrid → lakes-in-depressions
→ OceanLayers → defineMapSize → calculateMapCoordinates
→ calculateTemperatures()      ← grid.cells.temp   (CLIMATE)
→ generatePrecipitation()      ← grid.cells.prec   (CLIMATE)
→ reGraph()                    ← builds pack + pack.cells.g (grid↔pack map)
→ Features.markupPack → Rivers.generate → Biomes.define → Ice.generate
→ rankCells → Cultures → Burgs → States → Routes → Religions → ... → Names
```

Climate is computed on **grid**, BEFORE `reGraph()` builds `pack`. Everything downstream
reads climate via `pack.cells.g`.

## The two climate functions (what we replace)

- **`calculateTemperatures()`** — `public/main.js:927`. Output: `grid.cells.temp` (Int8Array, °C,
  clamped −128..127). Earth model: latitude bands from `options.temperatureEquator`,
  `temperatureNorthPole`, `temperatureSouthPole`, with a tropical gradient and altitude lapse
  (6.5 °C/km via `heightExponentInput`). Per-row latitude from `mapCoordinates`.
- **`generatePrecipitation()`** — `public/main.js:976`. Output: `grid.cells.prec` (Uint8Array).
  Earth model: prevailing winds (`options.winds[tier]`, 6 latitude tiers), latitude-band rain
  modifiers, orographic lift, moisture pickup over water. `precInput`/`pointsInput` scale it.

## grid ↔ pack mapping

`pack.cells.g` created in `reGraph()` at **`public/main.js:1181`**:
`pack.cells.g = createTypedArray({maxValue: grid.points.length, from: newCells.g})`.
Downstream reads (representative):
- `src/modules/biomes.ts:102,107,115` — `prec[g[cellId]]`, `temp[g[cellId]]`
- `src/modules/river-generator.ts:70,549` — `prec[cells.g[i]]` → flux
- `src/modules/lakes.ts:54,58,59` — shoreline `prec`/`temp` via `g`
- `src/modules/burgs-generator.ts:53,516` — `temp[cells.g[cell]]`
- `src/modules/cultures-generator.ts:47`, `routes-generator.ts:285`, `renderers/draw-relief-icons.ts`

## Downstream consumers (cascade — must NOT need rewriting)

### Biomes — `src/modules/biomes.ts`
`Biomes.define()` reads `grid.cells.{temp,prec}` via `pack.cells.g`. Whittaker matrix
`biomesData.biomesMatrix` (5 moisture rows × 26 temperature cols). `getId(moisture,temp,height,hasRiver)`:
- height<20 → 0 Marine; temp<−5 → 11 Glacier; temp≥25 & no river & moisture<8 → 1 Hot desert;
  wetland check → 12; else `matrix[min(moisture/5,4)][clamp(20−temp,0,25)]`.
- moisture = `prec` + river flux bonus + neighbour-averaged `prec`, `+4`.
- **Purely f(temp, prec, height)** → generalizes to Sun-axis with no change expected (T4 verifies).

### Rivers — `src/modules/river-generator.ts`
`cells.fl[i] += prec[cells.g[i]] / cellsNumberModifier` (drainWater). Flux → rivers, depression
filling, confluences. Lake outlet when `flux > evaporation`.

### Lakes — `src/modules/lakes.ts`
`getFlux` = Σ shoreline `prec`; `getLakeTemp` from shoreline `temp`; `getLakeEvaporation` Penman
variant `((700*(temp+0.006*h))/50+75)/(80−temp) * cells`. Lakes form where inflow>evap, dry up otherwise.

### Population — `rankCells()` `public/main.js:1198`
`score = biomesData.habitability[biome]` (+ river/flux, − elevation, + coastal/harbor bonuses).
`pop = s * area / meanArea`. Burgs/cultures further gate on `temp` (`burgs-generator.ts:53,516`,
`cultures-generator.ts:47`).

## Config / state model

Global `options` — `public/main.js:149`:
```js
{ pinNotes, winds:[225,45,225,315,135,315], temperatureEquator:27,
  temperatureNorthPole:-30, temperatureSouthPole:-15, stateLabelsMode, showBurgPreview, burgs }
```
World-config UI: dialog `#worldConfigurator` (`src/index.html:2499`), wiring in
`public/modules/ui/world-configurator.js`. `updateWorld()` (line 82) re-runs
`calculateTemperatures(); generatePrecipitation(); Rivers; Biomes; ...` and redraws.
Inputs: `heightExponentInput` (`src/index.html:5293`), `precInput` (`:2612`), `pointsInput` (`:1610`).

`mapCoordinates` (`calculateMapCoordinates()` `public/main.js:~910`): `{latT, latN, latS, lonT, lonW, lonE}`.
Per-row latitude: `lat = latN − (y/graphHeight)*latT`, range [+90..−90].

## Save / load (`.map`)

- `public/modules/io/save.js`: pipe-delimited. `settings` (data[1]) field **index 19** =
  `JSON.stringify(options)` → **whole options object round-trips**. Grid arrays as comma lists:
  data[7]=`grid.cells.h`, data[8]=`grid.cells.prec`, data[10]=`grid.cells.t`, data[11]=`grid.cells.temp`.
- `public/modules/io/load.js:256`: `options = JSON.parse(settings[19])` (REPLACES object —
  must merge with defaults for new fields / old maps). data[8]→prec, data[11]→temp restored as typed arrays.

→ **Adding fields to `options` auto-persists** via save/load. Backward-compat handled by merging
defaults on load (T1).

## Rendering (read-only, no world mutation)

`src/renderers/draw-temperature.ts` (isolines from `cells.temp`), `draw-*` precipitation/biomes,
`public/modules/ui/temperature-graph.js` (per-burg curve from lat + `prec`).

---

## Regression reference — ORIGINAL climate algorithms (verbatim, pinned commit)

Preserved so Classic mode can be proven byte-for-behavior equivalent.

### `calculateTemperatures()` (original)
```js
const cells = grid.cells;
cells.temp = new Int8Array(cells.i.length);
const {temperatureEquator, temperatureNorthPole, temperatureSouthPole} = options;
const tropics = [16, -20]; const tropicalGradient = 0.15;
const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);
const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);
const exponent = +heightExponentInput.value;
// per row: rowLatitude = latN - (y/graphHeight)*latT; tempSeaLevel = calculateSeaLevelTemp(lat)
// per cell: temp = minmax(tempSeaLevel - altitudeDrop(h), -128, 127)
// calculateSeaLevelTemp: tropical [-20..16] => eq - |lat|*0.15; else gradient from tropic to pole
// altitudeDrop: h<20 => 0; else (pow(h-18, exponent)/1000)*6.5
```

### `generatePrecipitation()` (original)
```js
cells.prec = new Uint8Array(cells.i.length);
const cellsNumberModifier = (pointsInput.dataset.cells / 10000) ** 0.25;
const modifier = cellsNumberModifier * (precInput.value / 100);
const latitudeModifier = [4,2,2,2,1,1,2,2,2,2,3,3,2,2,1,1,1,0.5]; // 5°-bands
const MAX_PASSABLE_ELEVATION = 85;
// winds by tier (options.winds[tier]) → westerly/easterly/northerly/southerly passes
// passWind: humidity carried across cells, coastal precip, orographic getPrecipitation,
//   no flux where temp < -5 (permafrost)
```

The full original source remains in git history at commit `fa5016a` and is preserved as the
`Classic` branch of the new toggled functions.
