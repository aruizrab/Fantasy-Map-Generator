# Sun-Axis Climate Model

A physically-motivated, tunable climate model for a planet whose **spin axis points near its
star** — not standard obliquity, not a normal tidal lock. It replaces Azgaar FMG's Earth-centric
temperature and precipitation generators while leaving the rest of the generation pipeline
(rivers, lakes, biomes, population) to re-derive unchanged.

It lives **behind a toggle**: `Classic (upstream)` reproduces the original Earth-like behavior
exactly (regression safety net); `Sun-axis` enables this model. Switch in
**Tools → Configure World → Climate model**.

---

## 1. The physical picture

The rotation axis points roughly at the star, so:

- The **sunward pole** sits under permanent daylight (a **permanent-day / lit cap**). The opposite
  pole sits in permanent darkness (a **permanent-night cap**). Between them is a **band that cycles
  day/night** as the planet rotates.
- The **axial tilt** is the angle between the axis and the planet→star line. The derived
  **sub-solar latitude** φₛ = 90° − tilt is the only latitude where the sun reaches the zenith at
  local noon.
- Geometrically, φₛ behaves exactly like an extreme **solar declination** near the pole, so the
  standard daily-mean insolation integral applies — with declination = φₛ:
  - Permanent-day cap = latitudes poleward of **+tilt** on the sunward side (the sun never sets).
  - Permanent-night cap = poleward of **−tilt** on the dark side (the sun never rises).
  - Day/night band = |latitude| < tilt.
- **Two heating peaks that do not coincide** (both are modeled):
  - **Integrated-warmth peak** — in the lit cap, toward the lit pole. The cap receives continuous
    *oblique* (low-angle) sunlight: weak per unit area, but with **no night to radiate heat away**,
    so equilibrium temperature integrates upward. This is the warmest region.
  - **Instantaneous (noon) peak** — at the sub-solar latitude φₛ, where the noon sun is highest.
    Strongest momentary heating, but a lower daily total than the cap.
- **Moisture:** permanent heating over the lit cap drives convection/convergence → a **standing
  rain belt where ocean moisture is reachable** (coasts, ocean-adjacent lit land). Moist air rains
  out as it travels inland — and rains out *faster* over the hot convective cap — so the **baked
  continental interior starves into desert**. **Descending-air belts** between the hot cap and the
  cold cap are dry; the **night cap** is cold/frozen and dry.

The end result on a real heightmap is the motivating outcome: **lush lit coasts and desert lit
interiors coexist correctly**, with an ice-capped night side.

---

## 2. How the cascade flows from temp + prec

Azgaar's generation is a DAG rooted at two per-cell arrays on the **grid** graph:
`grid.cells.temp` (°C, Int8) and `grid.cells.prec` (moisture, Uint8). Everything else derives:

```
calculateTemperatures()  → grid.cells.temp ┐
generatePrecipitation()  → grid.cells.prec ┘
        │ (reGraph builds pack; pack.cells.g maps pack→grid)
        ▼
   Biomes.define()   reads temp/prec via pack.cells.g  → pack.cells.biome   (Whittaker matrix)
   Rivers.generate() flux += prec[g]                   → rivers, confluences
   Lakes             inflow = Σ shoreline prec; evap = f(temp) → lakes / dry lakes
   rankCells()       score = habitability[biome] + …    → population
   Cultures / Burgs / States / Religions / …            → settlements, names, …
```

**This project replaces only the two functions that populate `temp` and `prec`.** Because the
biome matrix is a pure function of (temperature, moisture, height) it generalizes to the Sun-axis
regime with **no retuning** — verified: lit coast → rainforest, lit interior → hot desert, night
cap → glacier, no unclassified cells. Rivers nucleate in the rain belt; hot-cap lakes trend
evaporative/dry; population concentrates on the wet, temperate lit coasts.

Climate is computed on the **grid** graph and read downstream via **`pack.cells.g`** — never inject
climate directly into `pack`.

---

## 3. The temperature model (`calculateTemperaturesSunAxis`)

Per grid cell at latitude φ:

1. **Daily-mean insolation** H(φ) over one rotation, with φₛ as declination:
   `cosH₀ = −tan φ · tan φₛ`; H₀ = π (permanent day) if `cosH₀ ≤ −1`, 0 (permanent night) if
   `cosH₀ ≥ 1`, else `arccos(cosH₀)`. Then
   `H = (H₀·sinφ·sinφₛ + cosφ·cosφₛ·sinH₀) / π`, clamped ≥ 0. `H` is normalized by the planet's
   global maximum (sampled deterministically over all latitudes, independent of map crop).
2. **Sea-level temperature:** `T = nightCapTemp + (peakTemp − nightCapTemp) · (H/Hmax)^insolationExponent`.
3. **Diurnal band cooling:** rotating day/night-band cells radiate heat each rotation, so subtract
   `bandCoolingC · 4 · (1 − dayFraction) · dayFraction` (maximal where a cell is lit ~half the rotation).
4. **Per cell:** ocean cells relax toward the global mean by `oceanThermalInertia` (thermal inertia);
   land cells get the 6.5 °C/km **altitude lapse**. Output clamped to Int8 [−128, 127].

`peakTemp` is clamped to [−50, 50] °C internally so downstream formulas (e.g. lake evaporation,
whose denominator is `80 − lakeTemp`) can never blow up.

---

## 4. The precipitation model (`generatePrecipitationSunAxis`)

1. **Moisture optical depth from oceans** — a heap Dijkstra from all ocean cells (sources). Each
   inland step costs `1 + convectionStrength · warmth(cell)`, where `warmth ∈ [0,1]` is the cell's
   convective potential (0 at/below 0 °C, ~1 over the hot cap). Moist air rains out faster over the
   hot convective cap, so optical depth climbs quickly across baked interiors. Ocean-moisture
   availability `reach = exp(−opticalDepth / travel)`.
2. **Convective/convergence rainfall** `= convectionStrength · warmth` (peaks over the lit cap;
   ~0 in the frozen night cap).
3. **Orographic lift** where moist air climbs terrain from its ocean-ward (lower optical-depth)
   neighbour — **gated by warmth** so frozen night-cap mountains stay dry.
4. **Subsidence dry belt** — a Gaussian dryness multiplier for descending air equatorward of the
   convergence (subtropics-like).
5. **Per cell:** `prec = outputScale · reach · (convective + orographic) · (1 − subsidence)`, where
   `outputScale = 50 · (precInput/100) · precipScale`. Clamped to Uint8 [0, 255].

`travel` scales with grid resolution as `moistureTravel · sqrt(cells / 10000)` so physical reach is
resolution-independent. The existing global precipitation slider (`precInput`) still applies.

---

## 5. Configuration & tunable coefficients

User-facing geometry lives in the **Configure World** dialog; all coefficients live in the single
block `options.sunAxis` (defaults from `getDefaultSunAxisConfig()` in `public/main.js`) and
**round-trip through `.map` save/load** automatically. Old maps load as Classic.

### Geometry (UI)
| Field (UI label) | Default | Effect |
|-------|---------|--------|
| Climate model | `classic` | Toggle Classic ⇄ Sun-axis. |
| `axialTilt` (Axial tilt) | 18° | Angle between spin axis and planet→star line. 0 = sun fixed over the sunward pole; larger = sub-solar point further from the pole, wider day/night band, and a *larger warm hemisphere*. |
| `subsolarLatitude` (Sub-solar lat) | auto (=90−tilt) | Override the sub-solar latitude; `null`/Auto derives it. |
| `sunwardPole` (Sunward pole) | `north` | Which pole faces the star (the lit cap). `south` mirrors everything. |
| `rotationBand` (Rotating day/night band) | true | If on, the day/night band radiates heat each rotation (cooler band). |
| `moistureTravel` (Moisture reach) | 9 | How far ocean moisture reaches inland (e-folding length in cells @ 10k-cell reference). Lower = drier, larger desert interiors. |
| `precipScale` (Wetness) | 1.0 | Overall wetness multiplier. <1 = drier world (more desert), >1 = wetter. |

### Temperature coefficients
| Coefficient | Default | Effect |
|-------------|---------|--------|
| `peakTemp` | 32 °C | Hottest sea-level temperature (lit-cap/integrated-warmth peak). Clamped [−50, 50]. |
| `nightCapTemp` | −55 °C | Sea-level temperature of the permanent-night cap. |
| `insolationExponent` | 0.5 | Shapes insolation→temperature. Lower spreads warmth poleward (flatter); higher concentrates it. |
| `oceanThermalInertia` | 0.35 | 0 = none; 1 = oceans fully relaxed to the global mean (moderates coastal extremes). |
| `bandCoolingC` | 8 °C | Extra diurnal cooling for the rotating day/night band. |

### Moisture coefficients
| Coefficient | Default | Effect |
|-------------|---------|--------|
| `convectionStrength` | 1.6 | Convergence/convective rainfall over the hot cap **and** inland rainout rate (coupled). Higher = wetter coasts, sharper desert interiors. |
| `moistureTravel` (Moisture reach) | 9 | E-folding inland travel length (cells @ 10k-cell reference). Smaller = sharper coast→interior drying (more desert). UI-exposed. |
| `orographicFactor` | 1.0 | Strength of orographic (terrain-lift) rainfall. |
| `subsidenceDryness` | 0.35 | Dryness of the descending subtropical-like belt (0..1). |
| `precipScale` (Wetness) | 1.0 | Global precipitation multiplier (on top of the `precInput` slider). UI-exposed. |
| `oceanEvaporation`, `evaporationTempFactor` | 1.0, 0.03 | Reserved evaporation-source knobs. |

The precipitation base magnitude is tuned so the wettest coasts land in the forest/rainforest range
and the **wetland** biome stays rare — so a warm lit cap spans desert → grassland → forest rather
than turning into uniform wetland.

**Tuning tips (in the Configure World dialog):**
- **World too wet / too many wetlands** (common at high `axialTilt`, where the *entire* sunward
  hemisphere is warm and ocean-fed): lower **Wetness** (e.g. 0.6) and/or **Moisture reach** (e.g. 5)
  to expand deserts and dry continental interiors.
- **World too dry / too much desert:** raise **Wetness** and/or **Moisture reach**.
- Note: results are geography-dependent — continents with lots of coastline (archipelagos, narrow
  landmasses) are wetter because ocean moisture reaches everywhere; only large landmasses develop
  deep desert interiors.
- For a milder planet raise `insolationExponent` toward 1 and `oceanThermalInertia`. For a narrow
  lit cap with a wide cycling band (and a smaller warm hemisphere), *lower* `axialTilt`.

---

## 6. Classic fallback (regression safety net)

`options.climateModel = "classic"` (the default) routes `calculateTemperatures()` /
`generatePrecipitation()` to `calculateTemperaturesClassic` / `generatePrecipitationClassic`, whose
bodies are **byte-for-behavior identical** to upstream `fa5016a`. The Sun-axis path is fully
isolated behind the toggle, so Classic maps are reproduced exactly. Both code paths are exercised by
`npm run build` + the unit-test suite.

---

## 7. Where the code lives

- `public/main.js` — `getDefaultSunAxisConfig`, `getSunAxisGeometry`, the climate dispatchers, and
  `calculateTemperaturesSunAxis` / `generatePrecipitationSunAxis` (+ the verbatim `*Classic` bodies).
- `public/modules/ui/world-configurator.js` + `src/index.html` (`#worldConfigurator`) — the UI.
- `public/modules/io/load.js` — merges Sun-axis defaults onto loaded `options` (backward compat).
- Downstream (unchanged): `src/modules/biomes.ts`, `river-generator.ts`, `lakes.ts`,
  `burgs-generator.ts`, `rankCells()` in `public/main.js`.

See `ARCHITECTURE.md` for the full landmark map and `PROJECT_PLAN.md` for the task DAG and decisions log.
