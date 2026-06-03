import { test, expect } from "@playwright/test";

// End-to-end verification of the Sun-axis climate model (project tasks T6 + T7):
// drives the REAL app, generates maps in Classic and Sun-axis modes, and asserts the full
// cascade (climate -> biomes -> rivers/lakes -> population) runs cleanly with the expected
// physical signature, that Classic still works (regression), and that a Sun-axis world
// round-trips through .map save/load.
//
// App globals reached inside page.evaluate resolve as BARE identifiers in the page's global
// scope: `grid`/`pack` are `var`; `options`/`biomesData`/`regenerateMap`/`prepareMapData`/
// `parseLoadedData`/`VERSION` are top-level let/const/function in a classic (non-module) script.
// `window.mapId` is explicitly exposed for test automation.
declare const options: any;
declare const grid: any;
declare const pack: any;
declare const biomesData: any;
declare const regenerateMap: (o?: any) => void;
declare const prepareMapData: () => string;
declare const parseLoadedData: (data: string[], v: string) => Promise<void>;
declare const VERSION: string;

const ignorableError = (e: string) =>
  e.includes("fonts.googleapis.com") ||
  e.includes("google-analytics") ||
  e.includes("googletagmanager") ||
  e.includes("Failed to load resource") ||
  // pre-existing, climate-unrelated app messages logged as console.error (occur in Classic too)
  e.includes("Name is too short");

test.describe("Sun-axis climate", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 120000 });
  });

  test("Classic mode still generates a complete map (regression baseline)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console.error: ${m.text()}`));

    const data = await page.evaluate(() => ({
      model: options.climateModel,
      tempLen: grid.cells.temp.length,
      precLen: grid.cells.prec.length,
      hasBurgs: pack.burgs.length > 1,
      hasRivers: pack.rivers.length > 0,
      hasBiomes: (Array.from(pack.cells.biome as Uint8Array) as number[]).some((b) => b > 0),
    }));

    expect(data.model).toBe("classic");
    expect(data.tempLen).toBeGreaterThan(0);
    expect(data.precLen).toBeGreaterThan(0);
    expect(data.hasBurgs).toBe(true);
    expect(data.hasRivers).toBe(true);
    expect(data.hasBiomes).toBe(true);
    expect(errors.filter((e) => !ignorableError(e))).toEqual([]);
  });

  test("Sun-axis mode produces the expected climate + cascade + population signature", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console.error: ${m.text()}`));

    const data = await page.evaluate(async () => {
      // cover the whole world so a lit cap and a night cap are both in view
      for (const id of ["mapSizeInput", "mapSizeOutput"]) (document.getElementById(id) as HTMLInputElement).value = "100";
      for (const id of ["latitudeInput", "latitudeOutput"]) (document.getElementById(id) as HTMLInputElement).value = "50";
      options.climateModel = "sunAxis";
      options.sunAxis.axialTilt = 18;
      options.sunAxis.sunwardPole = "north";

      const before = (window as any).mapId;
      regenerateMap();
      await new Promise<void>((res) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if ((window as any).mapId !== before || Date.now() - t0 > 110000) { clearInterval(iv); res(); }
        }, 200);
      });
      await new Promise((r) => setTimeout(r, 800));

      const g = grid.cells, p = pack.cells;
      const temps = Array.from(g.temp as Int8Array) as number[];
      const precs = Array.from(g.prec as Uint8Array) as number[];
      const biomeSet = new Set<number>(Array.from(p.biome as Uint8Array) as number[]);
      const hab = biomesData.habitability;
      let popHabitable = 0, popHostile = 0;
      for (let i = 0; i < p.i.length; i++) {
        const b = p.biome[i], pop = p.pop[i] || 0;
        if (b === 1 || b === 2 || b === 11 || b === 0) popHostile += pop; // deserts / glacier / marine
        else if (hab[b] >= 30) popHabitable += pop; // lush / temperate
      }
      return {
        model: options.climateModel,
        anyNaN: temps.some((t) => !Number.isFinite(t)) || precs.some((v) => !Number.isFinite(v)),
        maxTemp: Math.max(...temps),
        minTemp: Math.min(...temps),
        maxPrec: Math.max(...precs),
        distinctBiomes: biomeSet.size,
        hasHotDesert: biomeSet.has(1),
        hasCold: biomeSet.has(9) || biomeSet.has(10) || biomeSet.has(11),
        hasLush: [5, 6, 7, 8, 12].some((b) => biomeSet.has(b)),
        hasBurgs: pack.burgs.length > 1,
        hasRivers: pack.rivers.length > 0,
        hasStates: pack.states.length > 1,
        popHabitable, popHostile,
      };
    });

    console.log("Sun-axis biome/population signature:", JSON.stringify(data));
    // robust climate signature: a warm lit cap and a frozen night cap coexist
    expect(data.model).toBe("sunAxis");
    expect(data.anyNaN).toBe(false);
    expect(data.maxTemp).toBeGreaterThan(10);
    expect(data.minTemp).toBeLessThan(-20);
    expect(data.maxPrec).toBeGreaterThan(0);
    // a diverse biome field with frozen and lush regions (the specific hot-desert/ice/lush trio is
    // proven deterministically by the T4 cascade harness; here we assert robust variety)
    expect(data.distinctBiomes).toBeGreaterThanOrEqual(4);
    expect(data.hasCold).toBe(true);
    expect(data.hasLush).toBe(true);
    // downstream generators ran end-to-end
    expect(data.hasBurgs).toBe(true);
    expect(data.hasRivers).toBe(true);
    expect(data.hasStates).toBe(true);
    // T6: population concentrates in habitable zones, not deserts/ice
    expect(data.popHabitable).toBeGreaterThan(data.popHostile);
    expect(errors.filter((e) => !ignorableError(e))).toEqual([]);
  });

  test("Sun-axis world round-trips through .map save/load", async ({ page }) => {
    const result = await page.evaluate(async () => {
      options.climateModel = "sunAxis";
      options.sunAxis.axialTilt = 22;
      options.sunAxis.sunwardPole = "south";
      options.sunAxis.moistureTravel = 9;

      const before = (window as any).mapId;
      regenerateMap();
      await new Promise<void>((res) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if ((window as any).mapId !== before || Date.now() - t0 > 110000) { clearInterval(iv); res(); }
        }, 200);
      });
      await new Promise((r) => setTimeout(r, 500));

      const text: string = prepareMapData(); // real save serialization (string joined by \r\n)
      const tempSample = Array.from(grid.cells.temp.slice(0, 50)) as number[];

      await parseLoadedData(text.split("\r\n"), VERSION); // real load path
      await new Promise((r) => setTimeout(r, 500));

      return {
        model: options.climateModel,
        tilt: options.sunAxis.axialTilt,
        pole: options.sunAxis.sunwardPole,
        travel: options.sunAxis.moistureTravel,
        tempPreserved: JSON.stringify(tempSample) === JSON.stringify(Array.from(grid.cells.temp.slice(0, 50))),
      };
    });

    expect(result.model).toBe("sunAxis");
    expect(result.tilt).toBe(22);
    expect(result.pole).toBe("south");
    expect(result.travel).toBe(9);
    expect(result.tempPreserved).toBe(true);
  });
});
