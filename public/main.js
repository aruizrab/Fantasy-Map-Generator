"use strict";
// Azgaar (azgaar.fmg@yandex.com). Minsk, 2017-2023. MIT License
// https://github.com/Azgaar/Fantasy-Map-Generator

// set debug options
const PRODUCTION = location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
const DEBUG = JSON.safeParse(localStorage.getItem("debug")) || {};
const INFO = true;
const TIME = true;
const WARN = true;
const ERROR = true;

// detect device
const MOBILE = window.innerWidth < 600 || navigator.userAgentData?.mobile;

if (PRODUCTION && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.error("ServiceWorker registration failed: ", err);
    });
  });

  window.addEventListener(
    "beforeinstallprompt",
    async event => {
      event.preventDefault();
      const Installation = await import("./modules/dynamic/installation.js?v=1.89.19");
      Installation.init(event);
    },
    {once: true}
  );
}

// append svg layers (in default order)
let svg = d3.select("#map");
let defs = svg.select("#deftemp");
let viewbox = svg.select("#viewbox");
let scaleBar = svg.select("#scaleBar");
let legend = svg.append("g").attr("id", "legend");
let ocean = viewbox.append("g").attr("id", "ocean");
let oceanLayers = ocean.append("g").attr("id", "oceanLayers");
let oceanPattern = ocean.append("g").attr("id", "oceanPattern");
let landmass = viewbox.append("g").attr("id", "landmass");
let texture = viewbox.append("g").attr("id", "texture");
let terrs = viewbox.append("g").attr("id", "terrs");
let lakes = viewbox.append("g").attr("id", "lakes");
let biomes = viewbox.append("g").attr("id", "biomes");
let cells = viewbox.append("g").attr("id", "cells");
let gridOverlay = viewbox.append("g").attr("id", "gridOverlay");
let coordinates = viewbox.append("g").attr("id", "coordinates");
let compass = viewbox.append("g").attr("id", "compass").style("display", "none");
let rivers = viewbox.append("g").attr("id", "rivers");
let terrain = viewbox.append("g").attr("id", "terrain");
let relig = viewbox.append("g").attr("id", "relig");
let cults = viewbox.append("g").attr("id", "cults");
let regions = viewbox.append("g").attr("id", "regions");
let statesBody = regions.append("g").attr("id", "statesBody");
let statesHalo = regions.append("g").attr("id", "statesHalo");
let provs = viewbox.append("g").attr("id", "provs");
let zones = viewbox.append("g").attr("id", "zones");
let borders = viewbox.append("g").attr("id", "borders");
let stateBorders = borders.append("g").attr("id", "stateBorders");
let provinceBorders = borders.append("g").attr("id", "provinceBorders");
let routes = viewbox.append("g").attr("id", "routes");
let roads = routes.append("g").attr("id", "roads");
let trails = routes.append("g").attr("id", "trails");
let searoutes = routes.append("g").attr("id", "searoutes");
let temperature = viewbox.append("g").attr("id", "temperature");
let coastline = viewbox.append("g").attr("id", "coastline");
let ice = viewbox.append("g").attr("id", "ice");
let prec = viewbox.append("g").attr("id", "prec").style("display", "none");
let population = viewbox.append("g").attr("id", "population");
let emblems = viewbox.append("g").attr("id", "emblems").style("display", "none");
let icons = viewbox.append("g").attr("id", "icons");
let labels = viewbox.append("g").attr("id", "labels");
let burgIcons = icons.append("g").attr("id", "burgIcons");
let anchors = icons.append("g").attr("id", "anchors");
let armies = viewbox.append("g").attr("id", "armies");
let markers = viewbox.append("g").attr("id", "markers");
let fogging = viewbox
  .append("g")
  .attr("id", "fogging-cont")
  .attr("mask", "url(#fog)")
  .append("g")
  .attr("id", "fogging")
  .style("display", "none");
let ruler = viewbox.append("g").attr("id", "ruler").style("display", "none");
var debug = viewbox.append("g").attr("id", "debug");

lakes.append("g").attr("id", "freshwater");
lakes.append("g").attr("id", "salt");
lakes.append("g").attr("id", "sinkhole");
lakes.append("g").attr("id", "frozen");
lakes.append("g").attr("id", "lava");
lakes.append("g").attr("id", "dry");

coastline.append("g").attr("id", "sea_island");
coastline.append("g").attr("id", "lake_island");

terrs.append("g").attr("id", "oceanHeights");
terrs.append("g").attr("id", "landHeights");

labels.append("g").attr("id", "states");
labels.append("g").attr("id", "addedLabels");
let burgLabels = labels.append("g").attr("id", "burgLabels");

// population groups
population.append("g").attr("id", "rural");
population.append("g").attr("id", "urban");

// emblem groups
emblems.append("g").attr("id", "burgEmblems");
emblems.append("g").attr("id", "provinceEmblems");
emblems.append("g").attr("id", "stateEmblems");

// compass
compass.append("use").attr("xlink:href", "#defs-compass-rose");

// fogging
fogging.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
fogging
  .append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("fill", "#e8f0f6")
  .attr("filter", "url(#splotch)");

// assign events separately as not a viewbox child
scaleBar.on("mousemove", () => tip("Click to open Units Editor")).on("click", () => editUnits());
legend
  .on("mousemove", () => tip("Drag to change the position. Click to hide the legend"))
  .on("click", () => clearLegend());

// main data variables
var grid = {}; // initial graph based on jittered square grid and data
var pack = {}; // packed graph and data
var seed;
let mapId;
let mapHistory = [];
let elSelected;
let modules = {};
let notes = [];
let rulers = new Rulers();
let customization = 0;

// global options; in v2.0 to be used for all UI settings
let options = {
  pinNotes: false,
  winds: [225, 45, 225, 315, 135, 315],
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  // Climate model selector: "classic" (upstream Earth-like) or "sunAxis" (spin axis points near the star).
  // See SUN_AXIS_CLIMATE.md and getDefaultSunAxisConfig() for the physics and tunable coefficients.
  climateModel: "classic",
  sunAxis: getDefaultSunAxisConfig(),
  stateLabelsMode: "auto",
  showBurgPreview: true,
  burgs: {
    groups: JSON.safeParse(localStorage.getItem("burg-groups")) || Burgs.getDefaultGroups()
  }
};

// Single tunable coefficient block for the Sun-axis climate model (planet whose spin axis points
// near its star). All "magic numbers" of the new physics live here so they can be tuned/persisted.
// Stored on options.sunAxis so it round-trips through .map save/load automatically.
function getDefaultSunAxisConfig() {
  return {
    // --- Geometry (user-facing) ---
    // Axial tilt = angle (deg) between the spin axis and the planet->star line.
    // tilt=0 => sun fixed over the sunward pole; larger tilt => sub-solar point further from the pole.
    axialTilt: 18,
    // Derived sub-solar latitude phi_s = 90 - axialTilt (only latitude where the sun reaches zenith).
    // null => auto-derive from axialTilt; set a number to override.
    subsolarLatitude: null,
    // Which pole faces the star (the permanent-day cap). "north" => +90 lit, -90 dark.
    sunwardPole: "north",
    // Whether the day/night band actually rotates (cools each rotation). If false the band is treated
    // as if frozen in place (no diurnal radiative cooling penalty).
    rotationBand: true,

    // --- Temperature model (T2) ---
    // Target hottest sea-level temperature (deg C), reached near the integrated-warmth peak.
    peakTemp: 32,
    // Target sea-level temperature (deg C) of the permanent-night cap.
    nightCapTemp: -55,
    // Exponent shaping daily-mean insolation -> temperature (lower spreads warmth poleward).
    insolationExponent: 0.5,
    // Ocean thermal inertia: 0 = none, 1 = ocean fully relaxed toward the global mean temperature.
    oceanThermalInertia: 0.35,
    // Extra cooling (deg C) applied to day/night-band cells that radiate heat every rotation.
    bandCoolingC: 8,
    // Meridional heat transport (atmosphere/ocean carrying heat from the hot lit cap to the cold night
    // cap): 0 = none (pure radiative, very cold dark side), 1 = strong mixing. Warms the dark side and
    // flattens the gradient. Exposed in the UI as "Heat transport".
    heatTransport: 0.4,

    // --- Moisture / precipitation model (T3) ---
    // Base evaporation rate from ocean cells (dimensionless source strength).
    oceanEvaporation: 1.0,
    // How strongly cell temperature boosts evaporation (per deg C above 0).
    evaporationTempFactor: 0.03,
    // Convergence/convective rainfall multiplier over the hot lit cap where ocean moisture is reachable.
    convectionStrength: 1.6,
    // Coriolis deflection of the surface winds (0 = winds blow straight toward the hot cap; 1 = strong
    // rotation-induced sideways deflection, spiralling winds). Exposed in the UI as "Coriolis".
    coriolis: 0.4,
    // How strongly the prevailing wind steers moisture (0 = isotropic from nearest ocean; 1 = moisture
    // only travels downwind, giving strong windward-wet / leeward-dry rain shadows).
    windMoisture: 0.6,
    // Dryness multiplier (0..1) for descending-air belts between the hot cap and the cold cap.
    subsidenceDryness: 0.35,
    // Orographic lift sensitivity to terrain height.
    orographicFactor: 1.0,
    // E-folding travel length (in cells, at the 10k-cell reference resolution) for ocean moisture
    // advecting inland before it rains out. Smaller = sharper coast-to-interior drying (desert interiors).
    // Exposed in the UI as "Moisture reach".
    moistureTravel: 9,
    // Global precipitation scale (on top of the precInput slider). <1 = drier world (more desert),
    // >1 = wetter world. Exposed in the UI as "Wetness".
    precipScale: 1.0
  };
}

// global style object; in v2.0 to be used for all map styles and render settings
let style = {burgLabels: {}, burgIcons: {}, anchors: {}};

let biomesData = Biomes.getDefault();
let nameBases = Names.getNameBases(); // cultures-related data
let color = d3.scaleSequential(d3.interpolateSpectral); // default color scheme
const lineGen = d3.line().curve(d3.curveBasis); // d3 line generator with default curve interpolation

// d3 zoom behavior
let scale = 1;
let viewX = 0;
let viewY = 0;

let rafId = null;
let pendingScaleChange = false;
let pendingPositionChange = false;
function zoomRaf() {
  const {k, x, y} = d3.event.transform;

  const isScaleChanged = Boolean(scale - k);
  const isPositionChanged = Boolean(viewX - x || viewY - y);
  if (!isScaleChanged && !isPositionChanged) return;

  scale = k;
  viewX = x;
  viewY = y;

  // Coalesce multiple zoom events into one paint.
  // While a RAF is pending, keep updating latest transform state and OR-change flags.
  // The scheduled RAF consumes these accumulated flags and then resets them.
  pendingScaleChange = pendingScaleChange || isScaleChanged;
  pendingPositionChange = pendingPositionChange || isPositionChanged;

  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;

    // Safely clears these flags for future renders
    const didScaleChange = pendingScaleChange;
    const didPositionChange = pendingPositionChange;
    pendingScaleChange = false;
    pendingPositionChange = false;

    // Uses global values, so each frame always draws using the latest positioning values
    viewbox.attr("transform", `translate(${viewX} ${viewY}) scale(${scale})`);

    if (didPositionChange) {
      if (layerIsOn("toggleCoordinates")) drawCoordinates();
    }

    if (customization === 1) {
      const canvas = ensureEl("canvas");
      if (canvas && canvas.style.opacity !== "0") {
        const img = ensureEl("imageToConvert");
        if (img) {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(scale, 0, 0, scale, viewX, viewY);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }
    }

    if (didScaleChange) {
      invokeActiveZooming();
      drawScaleBar(scaleBar, scale);
      fitScaleBar(scaleBar, svgWidth, svgHeight);
    }

    if (didPositionChange || didScaleChange) {
      window.updateMinimap && updateMinimap();
    }
  });
}

const zoom = d3.zoom().scaleExtent([1, 20]).on("zoom", zoomRaf);

var mapCoordinates = {}; // map coordinates on globe
let populationRate = +ensureEl("populationRateInput").value;
let distanceScale = +ensureEl("distanceScaleInput").value;
let urbanization = +ensureEl("urbanizationInput").value;
let urbanDensity = +ensureEl("urbanDensityInput").value;

applyStoredOptions();

// voronoi graph extension, cannot be changed after generation
var graphWidth = +mapWidthInput.value;
var graphHeight = +mapHeightInput.value;

// svg canvas resolution, can be changed
let svgWidth = graphWidth;
let svgHeight = graphHeight;

landmass.append("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
oceanPattern
  .append("rect")
  .attr("fill", "url(#oceanic)")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", graphWidth)
  .attr("height", graphHeight);
oceanLayers
  .append("rect")
  .attr("id", "oceanBase")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", graphWidth)
  .attr("height", graphHeight);

document.addEventListener("DOMContentLoaded", async () => {
  if (!location.hostname) {
    const wiki = "https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Run-FMG-locally";
    alertMessage.innerHTML = /* html */ `Fantasy Map Generator cannot run serverless. Follow the <a href="${wiki}" target="_blank">instructions</a> on how you can easily run a local web-server`;

    $("#alert").dialog({
      resizable: false,
      title: "Loading error",
      width: "28em",
      position: {my: "center center-4em", at: "center", of: "svg"},
      buttons: {
        OK: function () {
          $(this).dialog("close");
        }
      }
    });
  } else {
    hideLoading();
    await checkLoadParameters();
  }
  restoreDefaultEvents(); // apply default viewbox events
  initiateAutosave();
  initTourPromptButton();
});

function hideLoading() {
  d3.select("#loading").transition().duration(3000).style("opacity", 0);
  d3.select("#optionsContainer").transition().duration(2000).style("opacity", 1);
  d3.select("#tooltip").transition().duration(3000).style("opacity", 1);
}

function showLoading() {
  d3.select("#loading").transition().duration(200).style("opacity", 1);
  d3.select("#optionsContainer").transition().duration(100).style("opacity", 0);
  d3.select("#tooltip").transition().duration(200).style("opacity", 0);
}

// decide which map should be loaded or generated on page load
async function checkLoadParameters() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  // of there is a valid maplink, try to load .map/.gz file from URL
  if (params.get("maplink")) {
    WARN && console.warn("Load map from URL");
    const maplink = params.get("maplink");
    const pattern = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
    const valid = pattern.test(maplink);
    if (valid) {
      setTimeout(() => {
        loadMapFromURL(maplink, 1);
      }, 1000);
      return;
    } else showUploadErrorMessage("Map link is not a valid URL", maplink);
  }

  // if there is a seed (user of MFCG provided), generate map for it
  if (params.get("seed")) {
    WARN && console.warn("Generate map for seed");
    await generateMapOnLoad();
    return;
  }

  // check if there is a map saved to indexedDB
  if (ensureEl("onloadBehavior").value === "lastSaved") {
    try {
      const blob = await ldb.get("lastMap");
      if (blob) {
        WARN && console.warn("Loading last stored map");
        uploadMap(blob);
        return;
      }
    } catch (error) {
      ERROR && console.error(error);
    }
  }

  // else generate random map
  WARN && console.warn("Generate random map");
  generateMapOnLoad();
}

async function generateMapOnLoad() {
  await applyStyleOnLoad(); // apply previously selected default or custom style
  await generate(); // generate map
  applyLayersPreset(); // apply saved layers preset and reder layers
  drawLayers();
  fitMapToScreen();
  focusOn(); // based on searchParams focus on point, cell or burg from MFCG
  toggleAssistant();
}

// focus on coordinates, cell or burg provided in searchParams
function focusOn() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const fromMGCG = params.get("from") === "MFCG" && document.referrer;
  if (fromMGCG) {
    if (params.get("seed").length === 13) {
      // show back burg from MFCG
      const burgSeed = params.get("seed").slice(-4);
      params.set("burg", burgSeed);
    } else {
      // select burg for MFCG
      findBurgForMFCG(params);
      return;
    }
  }

  const scaleParam = params.get("scale");
  const cellParam = params.get("cell");
  const burgParam = params.get("burg");

  if (scaleParam || cellParam || burgParam) {
    const scale = +scaleParam || 8;

    if (cellParam) {
      const cell = +params.get("cell");
      const [x, y] = pack.cells.p[cell];
      zoomTo(x, y, scale, 1600);
      return;
    }

    if (burgParam) {
      const burg = isNaN(+burgParam) ? pack.burgs.find(burg => burg.name === burgParam) : pack.burgs[+burgParam];
      if (!burg) return;

      const {x, y} = burg;
      zoomTo(x, y, scale, 1600);
      return;
    }

    const x = +params.get("x") || graphWidth / 2;
    const y = +params.get("y") || graphHeight / 2;
    zoomTo(x, y, scale, 1600);
  }
}

let isAssistantLoaded = false;
function toggleAssistant() {
  const showAssistant = document.getElementById("azgaarAssistant")?.value === "show";
  if (showAssistant) {
    if (isAssistantLoaded) {
      const assistantContainer = document.getElementById("chat-widget-container");
      if (assistantContainer) assistantContainer.style.display = "block";
    } else {
      import("./libs/openwidget.min.js").then(() => {
        isAssistantLoaded = true;
        setTimeout(() => {
          const bubble = document.getElementById("chat-widget-minimized");
          if (bubble) {
            bubble.dataset.tip = "Click to open the Assistant";
            bubble.on("mouseover", showDataTip);
          }
        }, 5000);
      });
    }
  } else if (isAssistantLoaded) {
    const assistantContainer = document.getElementById("chat-widget-container");
    if (assistantContainer) assistantContainer.style.display = "none";
  }
}

function initTourPromptButton() {
  const MAX_SHOWS = 3;
  const STORAGE_KEY = "fmg-tour-prompt-count";
  const btn = document.getElementById("tourPromptButton");
  if (!btn) return;

  const count = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (count >= MAX_SHOWS) return;

  localStorage.setItem(STORAGE_KEY, count + 1);
  btn.style.display = "flex";
  btn.addEventListener("click", () => {
    UITour.start();
  });
}

// find burg for MFCG and focus on it
function findBurgForMFCG(params) {
  const cells = pack.cells,
    burgs = pack.burgs;
  if (pack.burgs.length < 2) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }

  // used for selection
  const size = +params.get("size");
  const coast = +params.get("coast");
  const port = +params.get("port");
  const river = +params.get("river");

  let selection = defineSelection(coast, port, river);
  if (!selection.length) selection = defineSelection(coast, !port, !river);
  if (!selection.length) selection = defineSelection(!coast, 0, !river);
  if (!selection.length) selection = [burgs[1]]; // select first if nothing is found

  function defineSelection(coast, port, river) {
    if (port && river) return burgs.filter(b => b.port && cells.r[b.cell]);
    if (!port && coast && river) return burgs.filter(b => !b.port && cells.t[b.cell] === 1 && cells.r[b.cell]);
    if (!coast && !river) return burgs.filter(b => cells.t[b.cell] !== 1 && !cells.r[b.cell]);
    if (!coast && river) return burgs.filter(b => cells.t[b.cell] !== 1 && cells.r[b.cell]);
    if (coast && river) return burgs.filter(b => cells.t[b.cell] === 1 && cells.r[b.cell]);
    return [];
  }

  // select a burg with closest population from selection
  const selected = d3.scan(selection, (a, b) => Math.abs(a.population - size) - Math.abs(b.population - size));
  const burgId = selection[selected].i;
  if (!burgId) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }

  const b = burgs[burgId];
  const referrer = new URL(document.referrer);
  for (let p of referrer.searchParams) {
    if (p[0] === "name") b.name = p[1];
    else if (p[0] === "size") b.population = +p[1];
    else if (p[0] === "seed") b.MFCG = +p[1];
    else if (p[0] === "shantytown") b.shanty = +p[1];
    else b[p[0]] = +p[1]; // other parameters
  }
  if (params.get("name") && params.get("name") != "null") b.name = params.get("name");

  const label = burgLabels.select("[data-id='" + burgId + "']");
  if (label.size()) {
    label
      .text(b.name)
      .classed("drag", true)
      .on("mouseover", function () {
        d3.select(this).classed("drag", false);
        label.on("mouseover", null);
      });
  }

  zoomTo(b.x, b.y, 8, 1600);
  invokeActiveZooming();
  tip("Here stands the glorious city of " + b.name, true, "success", 15000);
}

// Zoom to a specific point
function zoomTo(x, y, z = 8, d = 2000) {
  const transform = d3.zoomIdentity.translate(x * -z + svgWidth / 2, y * -z + svgHeight / 2).scale(z);
  svg.transition().duration(d).call(zoom.transform, transform);
}

// Reset zoom to initial
function resetZoom(d = 1000) {
  svg.transition().duration(d).call(zoom.transform, d3.zoomIdentity);
}

// active zooming feature
function invokeActiveZooming() {
  const isOptimized = shapeRendering.value === "optimizeSpeed";

  if (coastline.select("#sea_island").size() && +coastline.select("#sea_island").attr("auto-filter")) {
    // toggle shade/blur filter for coatline on zoom
    const filter = scale > 1.5 && scale <= 2.6 ? null : scale > 2.6 ? "url(#blurFilter)" : "url(#dropShadow)";
    coastline.select("#sea_island").attr("filter", filter);
  }

  // rescale labels on zoom
  if (labels.style("display") !== "none") {
    labels.selectAll("g").each(function () {
      if (this.id === "burgLabels") return;
      const desired = +this.dataset.size;
      const relative = Math.max(rn((desired + desired / scale) / 2, 2), 1);
      if (rescaleLabels.checked) this.setAttribute("font-size", relative);

      const hidden = hideLabels.checked && (relative * scale < 6 || relative * scale > 60);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
    });
  }

  // rescale emblems on zoom
  if (emblems.style("display") !== "none") {
    emblems.selectAll("g").each(function () {
      const size = this.getAttribute("font-size") * scale;
      const hidden = hideEmblems.checked && (size < 25 || size > 300);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
      if (!hidden && window.COArenderer && this.children.length && !this.children[0].getAttribute("href"))
        renderGroupCOAs(this);
    });
  }

  // change states halo width
  if (!customization && !isOptimized) {
    const desired = +statesHalo.attr("data-width");
    const haloSize = rn(desired / scale ** 0.8, 2);
    statesHalo.attr("stroke-width", haloSize).style("display", haloSize > 0.1 ? "block" : "none");
  }

  // rescale map markers
  +markers.attr("rescale") &&
    pack.markers?.forEach(marker => {
      const {i, x, y, size = 30, hidden} = marker;
      const el = !hidden && document.getElementById(`marker${i}`);
      if (!el) return;

      const zoomedSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);
      el.setAttribute("width", zoomedSize);
      el.setAttribute("height", zoomedSize);
      el.setAttribute("x", rn(x - zoomedSize / 2, 1));
      el.setAttribute("y", rn(y - zoomedSize, 1));
    });

  // rescale rulers to have always the same size
  if (ruler.style("display") !== "none") {
    const size = rn((10 / scale ** 0.3) * 2, 2);
    ruler.selectAll("text").attr("font-size", size);
  }
}

// add drag to upload logic, pull request from @evyatron
void (function addDragToUpload() {
  document.addEventListener("dragover", function (e) {
    e.stopPropagation();
    e.preventDefault();
    ensureEl("mapOverlay").style.display = null;
  });

  document.addEventListener("dragleave", function (e) {
    ensureEl("mapOverlay").style.display = "none";
  });

  document.addEventListener("drop", function (e) {
    e.stopPropagation();
    e.preventDefault();

    const overlay = ensureEl("mapOverlay");
    overlay.style.display = "none";
    if (e.dataTransfer.items == null || e.dataTransfer.items.length !== 1) return; // no files or more than one
    const file = e.dataTransfer.items[0].getAsFile();

    if (!file.name.endsWith(".map") && !file.name.endsWith(".gz")) {
      alertMessage.innerHTML =
        "Please upload a map file (<i>.map</i> or <i>.gz</i> formats) you have previously downloaded";
      $("#alert").dialog({
        resizable: false,
        title: "Invalid file format",
        position: {my: "center", at: "center", of: "svg"},
        buttons: {
          Close: function () {
            $(this).dialog("close");
          }
        }
      });
      return;
    }

    // all good - show uploading text and load the map
    overlay.style.display = null;
    overlay.innerHTML = "Uploading<span>.</span><span>.</span><span>.</span>";
    if (closeDialogs) closeDialogs();
    uploadMap(file, () => {
      overlay.style.display = "none";
      overlay.innerHTML = "Drop a map file to open";
    });
  });
})();

async function generate(options) {
  try {
    const timeStart = performance.now();
    const {seed: precreatedSeed, graph: precreatedGraph} = options || {};

    invokeActiveZooming();
    setSeed(precreatedSeed);
    INFO && console.group("Generated Map " + seed);

    applyGraphSize();
    randomizeOptions();

    if (shouldRegenerateGrid(grid, precreatedSeed)) grid = precreatedGraph || generateGrid();
    else delete grid.cells.h;
    grid.cells.h = await HeightmapGenerator.generate(grid);
    pack = {}; // reset pack

    Features.markupGrid();
    addLakesInDeepDepressions();
    openNearSeaLakes();

    OceanLayers();
    defineMapSize();
    calculateMapCoordinates();
    calculateTemperatures();
    generatePrecipitation();

    reGraph();
    Features.markupPack();
    createDefaultRuler();

    Rivers.generate();
    Biomes.define();
    Features.defineGroups();

    Ice.generate();

    rankCells();
    Cultures.generate();
    Cultures.expand();

    Burgs.generate();
    States.generate();
    Routes.generate();
    Religions.generate();

    Burgs.specify();
    States.collectStatistics();
    States.defineStateForms();

    Provinces.generate();
    Provinces.getPoles();

    Rivers.specify();
    Lakes.defineNames();

    Military.generate();
    Markers.generate();
    Zones.generate();

    drawScaleBar(scaleBar, scale);
    Names.getMapName();

    WARN && console.warn(`TOTAL: ${rn((performance.now() - timeStart) / 1000, 2)}s`);
    showStatistics();
    INFO && console.groupEnd("Generated Map " + seed);
  } catch (error) {
    ERROR && console.error(error);
    const parsedError = parseError(error);
    clearMainTip();

    alertMessage.innerHTML = /* html */ `An error has occurred on map generation. Please retry. <br />If error is critical, clear the stored data and try again.
      <p id="errorBox">${parsedError}</p>`;
    $("#alert").dialog({
      resizable: false,
      title: "Generation error",
      width: "32em",
      buttons: {
        "Cleanup data": () => cleanupData(),
        Regenerate: function () {
          regenerateMap("generation error");
          $(this).dialog("close");
        },
        Ignore: function () {
          $(this).dialog("close");
        }
      },
      position: {my: "center", at: "center", of: "svg"}
    });
  }
}

// set map seed (string!)
function setSeed(precreatedSeed) {
  if (!precreatedSeed) {
    const first = !mapHistory[0];
    const params = new URL(window.location.href).searchParams;
    const urlSeed = params.get("seed");
    if (first && params.get("from") === "MFCG" && urlSeed.length === 13) seed = urlSeed.slice(0, -4);
    else if (first && urlSeed) seed = urlSeed;
    else seed = generateSeed();
  } else {
    seed = precreatedSeed;
  }

  ensureEl("optionsSeed").value = seed;
  Math.random = aleaPRNG(seed);
}

function addLakesInDeepDepressions() {
  TIME && console.time("addLakesInDeepDepressions");
  const elevationLimit = +ensureEl("lakeElevationLimitOutput").value;
  if (elevationLimit === 80) return;

  const {cells, features} = grid;
  const {c, h, b} = cells;

  for (const i of cells.i) {
    if (b[i] || h[i] < 20) continue;

    const minHeight = d3.min(c[i].map(c => h[c]));
    if (h[i] > minHeight) continue;

    let deep = true;
    const threshold = h[i] + elevationLimit;
    const queue = [i];
    const checked = [];
    checked[i] = true;

    // check if elevated cell can potentially pour to water
    while (deep && queue.length) {
      const q = queue.pop();

      for (const n of c[q]) {
        if (checked[n]) continue;
        if (h[n] >= threshold) continue;
        if (h[n] < 20) {
          deep = false;
          break;
        }

        checked[n] = true;
        queue.push(n);
      }
    }

    // if not, add a lake
    if (deep) {
      const lakeCells = [i].concat(c[i].filter(n => h[n] === h[i]));
      addLake(lakeCells);
    }
  }

  function addLake(lakeCells) {
    const f = features.length;

    lakeCells.forEach(i => {
      cells.h[i] = 19;
      cells.t[i] = -1;
      cells.f[i] = f;
      c[i].forEach(n => !lakeCells.includes(n) && (cells.t[c] = 1));
    });

    features.push({i: f, land: false, border: false, type: "lake"});
  }

  TIME && console.timeEnd("addLakesInDeepDepressions");
}

// near sea lakes usually get a lot of water inflow, most of them should break threshold and flow out to sea (see Ancylus Lake)
function openNearSeaLakes() {
  if (ensureEl("templateInput").value === "Atoll") return; // no need for Atolls

  const cells = grid.cells;
  const features = grid.features;
  if (!features.find(f => f.type === "lake")) return; // no lakes
  TIME && console.time("openLakes");
  const LIMIT = 22; // max height that can be breached by water

  for (const i of cells.i) {
    const lakeFeatureId = cells.f[i];
    if (features[lakeFeatureId].type !== "lake") continue; // not a lake

    check_neighbours: for (const c of cells.c[i]) {
      if (cells.t[c] !== 1 || cells.h[c] > LIMIT) continue; // water cannot break this

      for (const n of cells.c[c]) {
        const ocean = cells.f[n];
        if (features[ocean].type !== "ocean") continue; // not an ocean
        removeLake(c, lakeFeatureId, ocean);
        break check_neighbours;
      }
    }
  }

  function removeLake(thresholdCellId, lakeFeatureId, oceanFeatureId) {
    cells.h[thresholdCellId] = 19;
    cells.t[thresholdCellId] = -1;
    cells.f[thresholdCellId] = oceanFeatureId;
    cells.c[thresholdCellId].forEach(function (c) {
      if (cells.h[c] >= 20) cells.t[c] = 1; // mark as coastline
    });

    cells.i.forEach(i => {
      if (cells.f[i] === lakeFeatureId) cells.f[i] = oceanFeatureId;
    });
    features[lakeFeatureId].type = "ocean"; // mark former lake as ocean
  }

  TIME && console.timeEnd("openLakes");
}

// define map size and position based on template and random factor
function defineMapSize() {
  const [size, latitude, longitude] = getSizeAndLatitude();
  const randomize = new URL(window.location.href).searchParams.get("options") === "default"; // ignore stored options
  if (randomize || !locked("mapSize")) mapSizeOutput.value = mapSizeInput.value = size;
  if (randomize || !locked("latitude")) latitudeOutput.value = latitudeInput.value = latitude;
  if (randomize || !locked("longitude")) longitudeOutput.value = longitudeInput.value = longitude;

  function getSizeAndLatitude() {
    const template = ensureEl("templateInput").value; // heightmap template

    if (template === "africa-centric") return [45, 53, 38];
    if (template === "arabia") return [20, 35, 35];
    if (template === "atlantics") return [42, 23, 65];
    if (template === "britain") return [7, 20, 51.3];
    if (template === "caribbean") return [15, 40, 74.8];
    if (template === "east-asia") return [11, 28, 9.4];
    if (template === "eurasia") return [38, 19, 27];
    if (template === "europe") return [20, 16, 44.8];
    if (template === "europe-accented") return [14, 22, 44.8];
    if (template === "europe-and-central-asia") return [25, 10, 39.5];
    if (template === "europe-central") return [11, 22, 46.4];
    if (template === "europe-north") return [7, 18, 48.9];
    if (template === "greenland") return [22, 7, 55.8];
    if (template === "hellenica") return [8, 27, 43.5];
    if (template === "iceland") return [2, 15, 55.3];
    if (template === "indian-ocean") return [45, 55, 14];
    if (template === "mediterranean-sea") return [10, 29, 45.8];
    if (template === "middle-east") return [8, 31, 34.4];
    if (template === "north-america") return [37, 17, 87];
    if (template === "us-centric") return [66, 27, 100];
    if (template === "us-mainland") return [16, 30, 77.5];
    if (template === "world") return [78, 27, 40];
    if (template === "world-from-pacific") return [75, 32, 30]; // longitude doesn't fit

    const part = grid.features.some(f => f.land && f.border); // if land goes over map borders
    const max = part ? 80 : 100; // max size
    const lat = () => gauss(P(0.5) ? 40 : 60, 20, 25, 75); // latitude shift

    if (!part) {
      if (template === "pangea") return [100, 50, 50];
      if (template === "shattered" && P(0.7)) return [100, 50, 50];
      if (template === "continents" && P(0.5)) return [100, 50, 50];
      if (template === "archipelago" && P(0.35)) return [100, 50, 50];
      if (template === "highIsland" && P(0.25)) return [100, 50, 50];
      if (template === "lowIsland" && P(0.1)) return [100, 50, 50];
    }

    if (template === "pangea") return [gauss(70, 20, 30, max), lat(), 50];
    if (template === "volcano") return [gauss(20, 20, 10, max), lat(), 50];
    if (template === "mediterranean") return [gauss(25, 30, 15, 80), lat(), 50];
    if (template === "peninsula") return [gauss(15, 15, 5, 80), lat(), 50];
    if (template === "isthmus") return [gauss(15, 20, 3, 80), lat(), 50];
    if (template === "atoll") return [gauss(3, 2, 1, 5, 1), lat(), 50];

    return [gauss(30, 20, 15, max), lat(), 50]; // Continents, Archipelago, High Island, Low Island
  }
}

// calculate map position on globe
function calculateMapCoordinates() {
  const sizeFraction = +ensureEl("mapSizeOutput").value / 100;
  const latShift = +ensureEl("latitudeOutput").value / 100;
  const lonShift = +ensureEl("longitudeOutput").value / 100;

  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);

  const lonT = rn(Math.min((graphWidth / graphHeight) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);
  mapCoordinates = {latT, latN, latS, lonT, lonW, lonE};
}

// temperature model, trying to follow real-world data
// based on http://www-das.uwyo.edu/~geerts/cwx/notes/chap16/Image64.gif
// Climate model dispatcher: routes to the upstream Earth-like model ("classic") or the
// Sun-axis model (spin axis points near the star). Classic is the regression safety net and
// is byte-for-behavior identical to upstream.
function calculateTemperatures() {
  TIME && console.time("calculateTemperatures");
  if (options.climateModel === "sunAxis") calculateTemperaturesSunAxis();
  else calculateTemperaturesClassic();
  TIME && console.timeEnd("calculateTemperatures");
}

// Resolve the effective sub-solar latitude phi_s (deg) and lit-pole sign from the Sun-axis config.
// phi_s = 90 - axialTilt, mirrored to the dark hemisphere when the sunward pole is "south".
function getSunAxisGeometry() {
  const cfg = options.sunAxis || getDefaultSunAxisConfig();
  const tilt = minmax(+cfg.axialTilt || 0, 0, 90);
  const sign = cfg.sunwardPole === "south" ? -1 : 1;
  const derived = 90 - tilt;
  const subsolar = cfg.subsolarLatitude === null || cfg.subsolarLatitude === undefined ? derived : +cfg.subsolarLatitude;
  return {cfg, tilt, sign, subsolarLatitude: sign * Math.abs(subsolar)};
}

// Sun-axis temperature model (T2). The spin axis points near the star, so the sub-solar latitude
// phi_s (90 - tilt) behaves like an extreme solar "declination" near the pole. We integrate the
// daily-mean insolation over one rotation per latitude (phi_s playing the declination role in the
// standard insolation integral) and map it to an equilibrium sea-level temperature:
//   - Permanent-day cap (poleward of +tilt on the sunward side): the sun never sets, so insolation
//     accumulates with no night to radiate it away -> the *integrated-warmth* peak sits in the lit
//     cap (toward the lit pole), NOT at the sub-solar latitude.
//   - Sub-solar latitude phi_s: highest *instantaneous* (noon) sun -> strongest peak heating, but a
//     lower integrated total than the cap. Both are modeled (and logged when DEBUG.temperature).
//   - Day/night band (|phi| < tilt): cools every rotation -> an extra diurnal cooling penalty.
//   - Permanent-night cap (poleward of -tilt): no sunlight -> floor temperature.
// Altitude lapse and ocean thermal inertia are applied per cell. All coefficients live in options.sunAxis.
function calculateTemperaturesSunAxis() {
  const cells = grid.cells;
  cells.temp = new Int8Array(cells.i.length);

  const {cfg, subsolarLatitude: decl} = getSunAxisGeometry();
  const exponent = +heightExponentInput.value;
  const DEG = Math.PI / 180;
  // clamp target temperatures to a sane range (defense-in-depth: keeps cell temps < 50°C so the
  // downstream lake-evaporation denominator (80 - lakeTemp) can never reach/cross zero, matching
  // Classic's UI cap; peakTemp/nightCapTemp are coefficients with no UI bound)
  const peakTemp = minmax(+cfg.peakTemp || 0, -50, 50);
  const nightCapTemp = minmax(+cfg.nightCapTemp || 0, -128, peakTemp);

  // daily-mean insolation factor over one rotation, with phi_s as the solar declination.
  // returns {H: mean insolation in [0,1], dayFraction: fraction of rotation the sun is up}
  function insolation(latDeg) {
    const phi = latDeg * DEG;
    const d = decl * DEG;
    const cosH0 = -Math.tan(phi) * Math.tan(d);
    let h0;
    if (cosH0 <= -1) h0 = Math.PI; // permanent day
    else if (cosH0 >= 1) h0 = 0; // permanent night
    else h0 = Math.acos(cosH0);
    const H = (h0 * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(h0)) / Math.PI;
    return {H: Math.max(0, H), dayFraction: h0 / Math.PI};
  }

  // deterministic global maximum insolation (sampled over the whole sphere, independent of map crop)
  let Hmax = 0;
  for (let l = -90; l <= 90; l += 0.5) Hmax = Math.max(Hmax, insolation(l).H);
  if (!(Hmax > 0)) Hmax = 1; // degenerate guard (e.g. fully dark crop)

  function seaLevelTemp(latDeg) {
    const {H, dayFraction} = insolation(latDeg);
    const shaped = Math.pow(H / Hmax, cfg.insolationExponent);
    let t = nightCapTemp + (peakTemp - nightCapTemp) * shaped;
    // diurnal cooling for the rotating day/night band (max where the cell is lit ~half the rotation)
    if (cfg.rotationBand) t -= cfg.bandCoolingC * 4 * (1 - dayFraction) * dayFraction;
    return t;
  }

  // temperature drops by 6.5°C per 1km of altitude (same lapse model as Classic)
  function getAltitudeTemperatureDrop(h) {
    if (h < 20) return 0;
    const height = Math.pow(h - 18, exponent);
    return rn((height / 1000) * 6.5);
  }

  // precompute per-row sea-level temperature and a global mean for ocean thermal inertia
  const rowCount = Math.ceil(cells.i.length / grid.cellsX);
  const rowTemp = new Float64Array(rowCount);
  for (let r = 0, rowCellId = 0; rowCellId < cells.i.length; r++, rowCellId += grid.cellsX) {
    const [, y] = grid.points[rowCellId];
    const lat = mapCoordinates.latN - (y / graphHeight) * mapCoordinates.latT; // [90; -90]
    rowTemp[r] = seaLevelTemp(lat);
  }

  // Meridional heat transport: a real atmosphere/ocean advects heat from the hot lit cap toward the
  // cold night cap, warming the dark side and flattening the gradient (radiative equilibrium alone is
  // far too extreme). Modeled as meridional diffusion of the latitude temperature profile; strength is
  // the tunable `heatTransport` coefficient (0 = none/pure radiative, 1 = strong mixing).
  const heatTransport = minmax(cfg.heatTransport ?? 0, 0, 1);
  if (heatTransport > 0 && rowCount > 2) {
    const iterations = Math.round(heatTransport * rowCount * rowCount * 0.15);
    const k = 0.5;
    let a = rowTemp;
    let b = new Float64Array(rowCount);
    for (let it = 0; it < iterations; it++) {
      for (let r = 0; r < rowCount; r++) {
        const lo = a[r === 0 ? 0 : r - 1];
        const hi = a[r === rowCount - 1 ? rowCount - 1 : r + 1];
        b[r] = a[r] + k * (lo + hi - 2 * a[r]);
      }
      const tmp = a; a = b; b = tmp;
    }
    if (a !== rowTemp) rowTemp.set(a);
  }

  let meanSeaTemp = 0;
  for (let r = 0; r < rowCount; r++) meanSeaTemp += rowTemp[r];
  meanSeaTemp /= rowCount;

  const inertia = minmax(cfg.oceanThermalInertia, 0, 1);
  for (let r = 0, rowCellId = 0; rowCellId < cells.i.length; r++, rowCellId += grid.cellsX) {
    const tSea = rowTemp[r];
    for (let cellId = rowCellId; cellId < rowCellId + grid.cellsX && cellId < cells.i.length; cellId++) {
      const h = cells.h[cellId];
      const t = h < 20
        ? tSea + (meanSeaTemp - tSea) * inertia // oceans relax toward the global mean (thermal inertia)
        : tSea - getAltitudeTemperatureDrop(h); // land cools with altitude
      cells.temp[cellId] = minmax(Math.round(t), -128, 127);
    }
  }

  if (DEBUG.temperature) {
    // report both peaks to confirm they are modeled and do not coincide
    let peakMeanLat = 0, peakMean = -Infinity, peakNoonLat = 0, peakNoon = -1;
    for (let lat = 90; lat >= -90; lat -= 0.5) {
      const t = seaLevelTemp(lat);
      const noon = Math.max(0, Math.cos((lat - decl) * DEG)); // instantaneous noon insolation
      if (t > peakMean) {peakMean = t; peakMeanLat = lat;}
      if (noon > peakNoon) {peakNoon = noon; peakNoonLat = lat;}
    }
    console.info(`Sun-axis: subsolar=${rn(decl)}°  integrated-warmth peak @ ${rn(peakMeanLat)}° (${rn(peakMean)}°C)  instantaneous-noon peak @ ${rn(peakNoonLat)}°`);
  }
}

function calculateTemperaturesClassic() {
  const cells = grid.cells;
  cells.temp = new Int8Array(cells.i.length); // temperature array

  const {temperatureEquator, temperatureNorthPole, temperatureSouthPole} = options;
  const tropics = [16, -20]; // tropics zone
  const tropicalGradient = 0.15;

  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);

  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);

  const exponent = +heightExponentInput.value;

  for (let rowCellId = 0; rowCellId < cells.i.length; rowCellId += grid.cellsX) {
    const [, y] = grid.points[rowCellId];
    const rowLatitude = mapCoordinates.latN - (y / graphHeight) * mapCoordinates.latT; // [90; -90]
    const tempSeaLevel = calculateSeaLevelTemp(rowLatitude);
    DEBUG.temperature && console.info(`${rn(rowLatitude)}° sea temperature: ${rn(tempSeaLevel)}°C`);

    for (let cellId = rowCellId; cellId < rowCellId + grid.cellsX; cellId++) {
      const tempAltitudeDrop = getAltitudeTemperatureDrop(cells.h[cellId]);
      cells.temp[cellId] = minmax(tempSeaLevel - tempAltitudeDrop, -128, 127);
    }
  }

  function calculateSeaLevelTemp(latitude) {
    const isTropical = latitude <= 16 && latitude >= -20;
    if (isTropical) return temperatureEquator - Math.abs(latitude) * tropicalGradient;

    return latitude > 0
      ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
      : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
  }

  // temperature drops by 6.5°C per 1km of altitude
  function getAltitudeTemperatureDrop(h) {
    if (h < 20) return 0;
    const height = Math.pow(h - 18, exponent);
    return rn((height / 1000) * 6.5);
  }
}

// simplest precipitation model
function generatePrecipitation() {
  if (options.climateModel === "sunAxis") return generatePrecipitationSunAxis();
  return generatePrecipitationClassic();
}

// Sun-axis moisture & precipitation model (T3). Permanent heating over the lit cap drives
// convection/convergence; moist air is drawn in from the oceans and rises over the hot cap,
// producing a standing rain belt where ocean moisture is reachable (coasts/ocean-adjacent lit land).
// Moisture rains out as it travels inland — and rains out FASTER over the hot, convective cap — so
// the baked continental interior starves into desert. Descending-air belts between the hot cap and
// the cold cap are dry; the permanent-night cap is cold/frozen and dry. Orographic lift adds rain
// where moist air climbs terrain. All coefficients live in options.sunAxis; the global precInput
// slider still scales output. Output -> grid.cells.prec (Uint8Array).
function generatePrecipitationSunAxis() {
  TIME && console.time("generatePrecipitation");
  prec.selectAll("*").remove();
  const {cells, cellsX} = grid;
  const n = cells.i.length;
  cells.prec = new Uint8Array(n);

  const {cfg} = getSunAxisGeometry();
  const temp = cells.temp;
  const h = cells.h;
  const neighbors = cells.c;

  const FREEZE = 0; // °C below which convective uplift (and rainfall) is suppressed
  // use the same clamped peak as the temperature model so warmth normalization matches the temp ceiling
  const tempSpan = Math.max(1, minmax(+cfg.peakTemp || 0, -50, 50) - FREEZE);
  // resolution-aware: denser grids have more cells per physical distance, so moisture travels more
  // cells to cover the same ground (same idea as Classic's cellsNumberModifier)
  // moisture travels more cells on denser grids to cover the same physical distance: cells-per-
  // distance scales ~ sqrt(cell count), so the e-folding travel length scales the same way.
  const resolutionScale = (pointsInput.dataset.cells / 10000) ** 0.5;
  const travel = Math.max(1, cfg.moistureTravel * resolutionScale);
  const precInputModifier = precInput.value / 100;
  // base magnitude tuned so the wettest coasts land in the forest/rainforest range and the wetland
  // biome stays rare; the warm lit cap then spans desert -> grassland -> forest instead of all-wetland
  const outputScale = 35 * precInputModifier * cfg.precipScale;

  // convective uplift potential of a cell, 0 (frozen) .. ~1 (peak warmth over the lit cap)
  const warmth = i => Math.max(0, Math.min(1, (temp[i] - FREEZE) / tempSpan));

  // --- thermal-circulation surface wind field ---
  // Surface winds blow from the cold caps (high pressure) toward the hot lit cap (low pressure), i.e.
  // up the LARGE-SCALE temperature gradient, deflected sideways by the planet's rotation (Coriolis).
  // The temperature is smoothed first so the wind reflects the planetary circulation rather than local
  // mountain cooling. The wind then steers where ocean moisture goes (downwind) and which slopes get
  // orographic rain (windward) vs rain shadow (leeward).
  const points = grid.points;
  const coriolis = minmax(cfg.coriolis ?? 0, 0, 1);
  const windMoisture = minmax(cfg.windMoisture ?? 0, 0, 1);
  let tSmooth = new Float64Array(temp);
  for (let pass = 0; pass < 3; pass++) {
    const srcT = tSmooth.slice();
    for (let i = 0; i < n; i++) {
      let s = srcT[i], c = 1;
      for (const nb of neighbors[i]) {s += srcT[nb]; c++;}
      tSmooth[i] = s / c;
    }
  }
  const windX = new Float64Array(n), windY = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const xi = points[i][0], yi = points[i][1];
    let gx = 0, gy = 0;
    for (const nb of neighbors[i]) {
      const dx = points[nb][0] - xi, dy = points[nb][1] - yi;
      const d2 = dx * dx + dy * dy || 1;
      const dt = tSmooth[nb] - tSmooth[i]; // warmer neighbour -> wind points toward it (toward the hot cap)
      gx += (dt * dx) / d2;
      gy += (dt * dy) / d2;
    }
    // Coriolis: deflect the toward-warm vector sideways, sign by hemisphere (screen y runs south-down)
    const lat = mapCoordinates.latN - (yi / graphHeight) * mapCoordinates.latT;
    const theta = coriolis * (Math.PI / 3) * (lat >= 0 ? 1 : -1);
    const cs = Math.cos(theta), sn = Math.sin(theta);
    const wx = gx * cs - gy * sn, wy = gx * sn + gy * cs;
    const m = Math.hypot(wx, wy) || 1;
    windX[i] = wx / m;
    windY[i] = wy / m;
  }

  // 1) moisture "optical depth" from the oceans via Dijkstra (binary min-heap). Each inland step
  //    costs 1 + convectionStrength * warmth: moist air rains out faster over the hot convective cap,
  //    so the cost climbs quickly across baked lit-cap interiors. The cost is also DIRECTIONAL: moving
  //    downwind is cheap (the wind carries moisture there) and moving upwind is expensive, so windward
  //    coasts are wet and leeward interiors fall into rain shadow.
  const dist = new Float64Array(n).fill(Infinity);
  const heap = []; // array of cell ids, ordered by dist via siftUp/siftDown
  const hpush = id => {
    heap.push(id);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (dist[heap[p]] <= dist[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const hpop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1, r = l + 1;
        let s = p;
        if (l < heap.length && dist[heap[l]] < dist[heap[s]]) s = l;
        if (r < heap.length && dist[heap[r]] < dist[heap[s]]) s = r;
        if (s === p) break;
        [heap[s], heap[p]] = [heap[p], heap[s]];
        p = s;
      }
    }
    return top;
  };
  for (let i = 0; i < n; i++) if (h[i] < 20) {dist[i] = 0; hpush(i);}
  while (heap.length) {
    const i = hpop();
    const di = dist[i];
    const xi = points[i][0], yi = points[i][1];
    for (const nb of neighbors[i]) {
      if (h[nb] < 20) continue; // moisture paths run over land; oceans are the dist-0 sources
      const dx = points[nb][0] - xi, dy = points[nb][1] - yi;
      const dl = Math.hypot(dx, dy) || 1;
      const align = (dx * windX[i] + dy * windY[i]) / dl; // +1 downwind, -1 upwind
      const dirFactor = Math.max(0.35, 1 - windMoisture * align); // downwind cheap, upwind costly
      const stepCost = (1 + cfg.convectionStrength * warmth(nb)) * dirFactor;
      const nd = di + stepCost;
      if (nd < dist[nb]) {dist[nb] = nd; hpush(nb);}
    }
  }

  // 2) descending-air dry belt: subsidence equatorward of the lit-cap convergence (subtropics-like).
  const sign = cfg.sunwardPole === "south" ? -1 : 1;
  const beltCenter = sign * Math.max(0, +cfg.axialTilt - 25);
  const beltWidth = 22;
  const subsidence = lat => cfg.subsidenceDryness * Math.exp(-(((lat - beltCenter) / beltWidth) ** 2));

  // 3) per-cell precipitation
  let totalLit = 0, totalAll = 0;
  for (let rowCellId = 0; rowCellId < n; rowCellId += cellsX) {
    const [, y] = grid.points[rowCellId];
    const lat = mapCoordinates.latN - (y / graphHeight) * mapCoordinates.latT;
    const dry = 1 - subsidence(lat);
    for (let i = rowCellId; i < rowCellId + cellsX && i < n; i++) {
      if (h[i] < 20) continue; // water cells handled by the engine separately
      const reach = Math.exp(-dist[i] / travel); // ocean moisture availability after rainout
      // orographic lift: moist air forced UPHILL on the windward slope rains out; the leeward slope sits
      // in rain shadow. We measure the climb from the upwind neighbour (where the wind blows FROM).
      // Gated by warmth so the cold/frozen night cap stays dry (cold air holds negligible water vapor).
      const w = warmth(i);
      const xi = points[i][0], yi = points[i][1];
      let climb = 0;
      for (const nb of neighbors[i]) {
        const dx = points[nb][0] - xi, dy = points[nb][1] - yi;
        const dl = Math.hypot(dx, dy) || 1;
        const upwind = -(dx * windX[i] + dy * windY[i]) / dl; // neighbour is upwind when this > 0
        if (upwind > 0 && h[nb] < h[i]) climb = Math.max(climb, (h[i] - h[nb]) * upwind);
      }
      const oro = ((cfg.orographicFactor * climb) / 20) * w;
      const p = outputScale * reach * (cfg.convectionStrength * w + oro) * dry;
      cells.prec[i] = minmax(Math.round(p), 0, 255);
      totalAll += cells.prec[i];
      if (w > 0.6) totalLit += cells.prec[i];
    }
  }

  // wind direction arrows (coarse sample of the surface wind field), drawn in the precipitation layer
  void (function drawWindField() {
    const windG = prec
      .append("g")
      .attr("id", "wind")
      .attr("stroke", "#3b6ea5")
      .attr("stroke-width", 0.7)
      .attr("fill", "none")
      .attr("opacity", 0.65);
    const stride = Math.max(1, Math.floor(n / 240));
    const L = (grid.spacing || 12) * 0.9;
    let d = "";
    for (let i = 0; i < n; i += stride) {
      const x = points[i][0], y = points[i][1];
      const ex = x + windX[i] * L, ey = y + windY[i] * L;
      const ang = Math.atan2(ey - y, ex - x);
      const hl = L * 0.35;
      const a1 = ang + Math.PI * 0.82, a2 = ang - Math.PI * 0.82;
      d += `M${rn(x, 1)},${rn(y, 1)}L${rn(ex, 1)},${rn(ey, 1)}`;
      d += `M${rn(ex, 1)},${rn(ey, 1)}L${rn(ex + Math.cos(a1) * hl, 1)},${rn(ey + Math.sin(a1) * hl, 1)}`;
      d += `M${rn(ex, 1)},${rn(ey, 1)}L${rn(ex + Math.cos(a2) * hl, 1)},${rn(ey + Math.sin(a2) * hl, 1)}`;
    }
    windG.append("path").attr("d", d);
  })();

  DEBUG.precipitation &&
    console.info(`Sun-axis precipitation: total=${totalAll}, lit-cap total=${totalLit}, travel=${rn(travel, 1)} cells`);

  TIME && console.timeEnd("generatePrecipitation");
}

function generatePrecipitationClassic() {
  TIME && console.time("generatePrecipitation");
  prec.selectAll("*").remove();
  const {cells, cellsX, cellsY} = grid;
  cells.prec = new Uint8Array(cells.i.length); // precipitation array

  const cellsNumberModifier = (pointsInput.dataset.cells / 10000) ** 0.25;
  const precInputModifier = precInput.value / 100;
  const modifier = cellsNumberModifier * precInputModifier;

  const westerly = [];
  const easterly = [];
  let southerly = 0;
  let northerly = 0;

  // precipitation modifier per latitude band
  // x4 = 0-5 latitude: wet through the year (rising zone)
  // x2 = 5-20 latitude: wet summer (rising zone), dry winter (sinking zone)
  // x1 = 20-30 latitude: dry all year (sinking zone)
  // x2 = 30-50 latitude: wet winter (rising zone), dry summer (sinking zone)
  // x3 = 50-60 latitude: wet all year (rising zone)
  // x2 = 60-70 latitude: wet summer (rising zone), dry winter (sinking zone)
  // x1 = 70-85 latitude: dry all year (sinking zone)
  // x0.5 = 85-90 latitude: dry all year (sinking zone)
  const latitudeModifier = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];
  const MAX_PASSABLE_ELEVATION = 85;

  // define wind directions based on cells latitude and prevailing winds there
  d3.range(0, cells.i.length, cellsX).forEach(function (c, i) {
    const lat = mapCoordinates.latN - (i / cellsY) * mapCoordinates.latT;
    const latBand = ((Math.abs(lat) - 1) / 5) | 0;
    const latMod = latitudeModifier[latBand];
    const windTier = (Math.abs(lat - 89) / 30) | 0; // 30d tiers from 0 to 5 from N to S
    const {isWest, isEast, isNorth, isSouth} = getWindDirections(windTier);

    if (isWest) westerly.push([c, latMod, windTier]);
    if (isEast) easterly.push([c + cellsX - 1, latMod, windTier]);
    if (isNorth) northerly++;
    if (isSouth) southerly++;
  });

  // distribute winds by direction
  if (westerly.length) passWind(westerly, 120 * modifier, 1, cellsX);
  if (easterly.length) passWind(easterly, 120 * modifier, -1, cellsX);

  const vertT = southerly + northerly;
  if (northerly) {
    const bandN = ((Math.abs(mapCoordinates.latN) - 1) / 5) | 0;
    const latModN = mapCoordinates.latT > 60 ? d3.mean(latitudeModifier) : latitudeModifier[bandN];
    const maxPrecN = (northerly / vertT) * 60 * modifier * latModN;
    passWind(d3.range(0, cellsX, 1), maxPrecN, cellsX, cellsY);
  }

  if (southerly) {
    const bandS = ((Math.abs(mapCoordinates.latS) - 1) / 5) | 0;
    const latModS = mapCoordinates.latT > 60 ? d3.mean(latitudeModifier) : latitudeModifier[bandS];
    const maxPrecS = (southerly / vertT) * 60 * modifier * latModS;
    passWind(d3.range(cells.i.length - cellsX, cells.i.length, 1), maxPrecS, -cellsX, cellsY);
  }

  function getWindDirections(tier) {
    const angle = options.winds[tier];

    const isWest = angle > 40 && angle < 140;
    const isEast = angle > 220 && angle < 320;
    const isNorth = angle > 100 && angle < 260;
    const isSouth = angle > 280 || angle < 80;

    return {isWest, isEast, isNorth, isSouth};
  }

  function passWind(source, maxPrec, next, steps) {
    const maxPrecInit = maxPrec;

    for (let first of source) {
      if (first[0]) {
        maxPrec = Math.min(maxPrecInit * first[1], 255);
        first = first[0];
      }

      let humidity = maxPrec - cells.h[first]; // initial water amount
      if (humidity <= 0) continue; // if first cell in row is too elevated consider wind dry

      for (let s = 0, current = first; s < steps; s++, current += next) {
        if (cells.temp[current] < -5) continue; // no flux in permafrost

        if (cells.h[current] < 20) {
          // water cell
          if (cells.h[current + next] >= 20) {
            cells.prec[current + next] += Math.max(humidity / rand(10, 20), 1); // coastal precipitation
          } else {
            humidity = Math.min(humidity + 5 * modifier, maxPrec); // wind gets more humidity passing water cell
            cells.prec[current] += 5 * modifier; // water cells precipitation (need to correctly pour water through lakes)
          }
          continue;
        }

        // land cell
        const isPassable = cells.h[current + next] <= MAX_PASSABLE_ELEVATION;
        const precipitation = isPassable ? getPrecipitation(humidity, current, next) : humidity;
        cells.prec[current] += precipitation;
        const evaporation = precipitation > 1.5 ? 1 : 0; // some humidity evaporates back to the atmosphere
        humidity = isPassable ? minmax(humidity - precipitation + evaporation, 0, maxPrec) : 0;
      }
    }
  }

  function getPrecipitation(humidity, i, n) {
    const normalLoss = Math.max(humidity / (10 * modifier), 1); // precipitation in normal conditions
    const diff = Math.max(cells.h[i + n] - cells.h[i], 0); // difference in height
    const mod = (cells.h[i + n] / 70) ** 2; // 50 stands for hills, 70 for mountains
    return minmax(normalLoss + diff * mod, 1, humidity);
  }

  void (function drawWindDirection() {
    const wind = prec.append("g").attr("id", "wind");

    d3.range(0, 6).forEach(function (t) {
      if (westerly.length > 1) {
        const west = westerly.filter(w => w[2] === t);
        if (west && west.length > 3) {
          const from = west[0][0],
            to = west[west.length - 1][0];
          const y = (grid.points[from][1] + grid.points[to][1]) / 2;
          wind.append("text").attr("text-rendering", "optimizeSpeed").attr("x", 20).attr("y", y).text("\u21C9");
        }
      }
      if (easterly.length > 1) {
        const east = easterly.filter(w => w[2] === t);
        if (east && east.length > 3) {
          const from = east[0][0],
            to = east[east.length - 1][0];
          const y = (grid.points[from][1] + grid.points[to][1]) / 2;
          wind
            .append("text")
            .attr("text-rendering", "optimizeSpeed")
            .attr("x", graphWidth - 52)
            .attr("y", y)
            .text("\u21C7");
        }
      }
    });

    if (northerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", graphWidth / 2)
        .attr("y", 42)
        .text("\u21CA");
    if (southerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", graphWidth / 2)
        .attr("y", graphHeight - 20)
        .text("\u21C8");
  })();

  TIME && console.timeEnd("generatePrecipitation");
}

// recalculate Voronoi Graph to pack cells
function reGraph() {
  TIME && console.time("reGraph");
  const {cells: gridCells, points, features} = grid;
  const newCells = {p: [], g: [], h: []}; // store new data
  const spacing2 = grid.spacing ** 2;

  for (const i of gridCells.i) {
    const height = gridCells.h[i];
    const type = gridCells.t[i];

    if (height < 20 && type !== -1 && type !== -2) continue; // exclude all deep ocean points
    if (type === -2 && (i % 4 === 0 || features[gridCells.f[i]].type === "lake")) continue; // exclude non-coastal lake points

    const [x, y] = points[i];
    addNewPoint(i, x, y, height);

    // add additional points for cells along coast
    if (type === 1 || type === -1) {
      if (gridCells.b[i]) continue; // not for near-border cells
      gridCells.c[i].forEach(function (e) {
        if (i > e) return;
        if (gridCells.t[e] === type) {
          const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
          if (dist2 < spacing2) return; // too close to each other
          const x1 = rn((x + points[e][0]) / 2, 1);
          const y1 = rn((y + points[e][1]) / 2, 1);
          addNewPoint(i, x1, y1, height);
        }
      });
    }
  }

  function addNewPoint(i, x, y, height) {
    newCells.p.push([x, y]);
    newCells.g.push(i);
    newCells.h.push(height);
  }

  const {cells: packCells, vertices} = calculateVoronoi(newCells.p, grid.boundary);
  pack.vertices = vertices;
  pack.cells = packCells;
  pack.cells.p = newCells.p;
  pack.cells.g = createTypedArray({maxValue: grid.points.length, from: newCells.g});
  pack.cells.h = createTypedArray({maxValue: 100, from: newCells.h});
  pack.cells.area = createTypedArray({maxValue: UINT16_MAX, length: packCells.i.length}).map((_, cellId) => {
    const area = Math.abs(d3.polygonArea(getPackPolygon(cellId)));
    return Math.min(area, UINT16_MAX);
  });

  TIME && console.timeEnd("reGraph");
}

function isWetLand(moisture, temperature, height) {
  if (moisture > 40 && temperature > -2 && height < 25) return true; //near coast
  if (moisture > 24 && temperature > -2 && height > 24 && height < 60) return true; //off coast
  return false;
}

// assess cells suitability to calculate population and rand cells for culture center and burgs placement
function rankCells() {
  TIME && console.time("rankCells");
  const {cells, features} = pack;
  cells.s = new Int16Array(cells.i.length); // cell suitability array
  cells.pop = new Float32Array(cells.i.length); // cell population array

  const meanFlux = d3.median(cells.fl.filter(f => f)) || 0;
  const maxFlux = d3.max(cells.fl) + d3.max(cells.conf); // to normalize flux
  const meanArea = d3.mean(cells.area); // to adjust population by cell area

  const scoreMap = {
    estuary: 15,
    ocean_coast: 5,
    save_harbor: 20,
    freshwater: 30,
    salt: 10,
    frozen: 1,
    dry: -5,
    sinkhole: -5,
    lava: -30
  };

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue; // no population in water
    let score = biomesData.habitability[cells.biome[i]]; // base suitability derived from biome habitability
    if (!score) continue; // uninhabitable biomes has 0 suitability

    if (meanFlux) score += normalize(cells.fl[i] + cells.conf[i], meanFlux, maxFlux) * 250; // big rivers and confluences are valued
    score -= (cells.h[i] - 50) / 5; // low elevation is valued, high is not;

    if (cells.t[i] === 1) {
      if (cells.r[i]) score += scoreMap.estuary;
      const feature = features[cells.f[cells.haven[i]]];
      if (feature.type === "lake") {
        score += scoreMap[feature.group] || 0;
      } else {
        score += scoreMap.ocean_coast;
        if (cells.harbor[i] === 1) score += scoreMap.save_harbor;
      }
    }

    cells.s[i] = score / 5; // general population rate
    // cell rural population is suitability adjusted by cell area
    cells.pop[i] = cells.s[i] > 0 ? (cells.s[i] * cells.area[i]) / meanArea : 0;
  }

  TIME && console.timeEnd("rankCells");
}

// show map stats on generation complete
function showStatistics() {
  const heightmap = ensureEl("templateInput").value;
  const isTemplate = heightmap in heightmapTemplates;
  const heightmapType = isTemplate ? "template" : "precreated";
  const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

  const stats = `  Seed: ${seed}
    Canvas size: ${graphWidth}x${graphHeight} px
    Heightmap: ${heightmap}
    Template: ${isRandomTemplate}${heightmapType}
    Points: ${grid.points.length}
    Cells: ${pack.cells.i.length}
    Map size: ${mapSizeOutput.value}%
    States: ${pack.states.length - 1}
    Provinces: ${pack.provinces.length - 1}
    Burgs: ${pack.burgs.length - 1}
    Religions: ${pack.religions.length - 1}
    Culture set: ${culturesSet.value}
    Cultures: ${pack.cultures.length - 1}`;

  mapId = Date.now(); // unique map id is it's creation date number
  window.mapId = mapId; // expose for test automation
  mapHistory.push({seed, width: graphWidth, height: graphHeight, template: heightmap, created: mapId});
  INFO && console.info(stats);

  // Dispatch event for test automation and external integrations
  window.dispatchEvent(new CustomEvent("map:generated", {detail: {seed, mapId}}));
}

const regenerateMap = debounce(async function (options) {
  WARN && console.warn("Generate new random map");

  const cellsDesired = +ensureEl("pointsInput").dataset.cells;
  const shouldShowLoading = cellsDesired > 10000;
  shouldShowLoading && showLoading();

  closeDialogs("#worldConfigurator, #options3d");
  customization = 0;
  resetZoom(1000);
  undraw();
  await generate(options);
  drawLayers();
  if (ThreeD.options.isOn) ThreeD.redraw();
  if ($("#worldConfigurator").is(":visible")) editWorld();

  fitMapToScreen();
  shouldShowLoading && hideLoading();
  clearMainTip();
}, 250);

// clear the map
function undraw() {
  viewbox
    .selectAll("path, circle, polygon, line, text, use, #texture > image, #zones > g, #armies > g, #ruler > g")
    .remove();
  ensureEl("deftemp")
    .querySelectorAll("path, clipPath, svg")
    .forEach(el => el.remove());
  ensureEl("coas").innerHTML = ""; // remove auto-generated emblems
  notes = [];
  unfog();
}
