function editWorld() {
  if (customization) return;

  $("#worldConfigurator").dialog({
    title: "Configure World",
    resizable: false,
    width: "minmax(40em, 85vw)",
    buttons: {"Update world": updateWorld},
    open: function () {
      const checkbox = /* html */ `<div class="dontAsk" data-tip="Automatically update world on input changes and button clicks">
        <input id="wcAutoChange" class="checkbox" type="checkbox" checked />
        <label for="wcAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </div>`;
      const pane = this.parentElement.querySelector(".ui-dialog-buttonpane");
      pane.insertAdjacentHTML("afterbegin", checkbox);

      const button = this.parentElement.querySelector(".ui-dialog-buttonset > button");
      button.on("mousemove", () => tip("Apply current settings to the map"));
    },
    close: function () {
      $(this).dialog("destroy");
    }
  });

  const globe = d3.select("#globe");
  const projection = d3.geoOrthographic().translate([100, 100]).scale(100);
  const path = d3.geoPath(projection);

  updateInputValues();
  updateGlobeTemperature();
  updateGlobePosition();

  if (modules.editWorld) return;
  modules.editWorld = true;

  const graticule = d3.geoGraticule();
  globe.select("#globeWindArrows").on("click", handleWindChange);
  globe.select("#globeGraticule").attr("d", round(path(graticule()))); // globe graticule
  updateWindDirections();

  ensureEl("worldControls").on("input", handleControlsChange);
  ensureEl("climateModelInput").on("change", handleClimateModelChange);
  ensureEl("sunAxisPoleInput").on("change", handleSunAxisChange);
  ensureEl("sunAxisRotationInput").on("change", handleSunAxisChange);
  ensureEl("sunAxisSubsolarAuto").on("click", () => {
    options.sunAxis.subsolarLatitude = null;
    ensureEl("sunAxisSubsolarInput").value = "";
    updateSubsolarDerived();
    if (ensureEl("wcAutoChange").checked) updateWorld();
  });
  ensureEl("restoreWinds").on("click", restoreDefaultWinds);
  ensureEl("wcWholeWorld").on("click", () => applyWorldPreset(100, 50));
  ensureEl("wcNorthern").on("click", () => applyWorldPreset(33, 25));
  ensureEl("wcTropical").on("click", () => applyWorldPreset(33, 50));
  ensureEl("wcSouthern").on("click", () => applyWorldPreset(33, 75));

  function updateInputValues() {
    if (!options.sunAxis) options.sunAxis = getDefaultSunAxisConfig();
    const sa = options.sunAxis;
    ensureEl("climateModelInput").value = options.climateModel || "classic";
    ensureEl("sunAxisTiltInput").value = sa.axialTilt;
    ensureEl("sunAxisTiltOutput").value = sa.axialTilt;
    ensureEl("sunAxisSubsolarInput").value = sa.subsolarLatitude === null || sa.subsolarLatitude === undefined ? "" : sa.subsolarLatitude;
    ensureEl("sunAxisPoleInput").value = sa.sunwardPole || "north";
    ensureEl("sunAxisRotationInput").checked = sa.rotationBand !== false;
    ensureEl("sunAxisHeatInput").value = ensureEl("sunAxisHeatOutput").value = sa.heatTransport;
    ensureEl("sunAxisTravelInput").value = ensureEl("sunAxisTravelOutput").value = sa.moistureTravel;
    ensureEl("sunAxisWetnessInput").value = ensureEl("sunAxisWetnessOutput").value = sa.precipScale;
    updateClimateModelVisibility();
    updateSubsolarDerived();

    ensureEl("temperatureEquatorInput").value = options.temperatureEquator;
    ensureEl("temperatureEquatorOutput").value = options.temperatureEquator;
    ensureEl("temperatureEquatorF").innerText = convertTemperature(options.temperatureEquator, "°F");

    ensureEl("temperatureNorthPoleInput").value = options.temperatureNorthPole;
    ensureEl("temperatureNorthPoleOutput").value = options.temperatureNorthPole;
    ensureEl("temperatureNorthPoleF").innerText = convertTemperature(options.temperatureNorthPole, "°F");

    ensureEl("temperatureSouthPoleInput").value = options.temperatureSouthPole;
    ensureEl("temperatureSouthPoleOutput").value = options.temperatureSouthPole;
    ensureEl("temperatureSouthPoleF").innerText = convertTemperature(options.temperatureSouthPole, "°F");
  }

  function handleControlsChange({target}) {
    const stored = target.dataset.stored;

    // these have dedicated "change" handlers (no Input/Output/lock triplet) — ignore here
    if (stored === "climateModel" || stored === "sunAxisPole" || stored === "sunAxisRotation") return;

    // Sun-axis numeric controls (handled separately; some lack a lock/Output pair)
    if (stored === "sunAxisTilt") {
      ensureEl("sunAxisTiltInput").value = target.value;
      ensureEl("sunAxisTiltOutput").value = target.value;
      options.sunAxis.axialTilt = minmax(Number(target.value), 0, 90);
      updateSubsolarDerived();
      if (ensureEl("wcAutoChange").checked) updateWorld();
      return;
    }
    if (stored === "sunAxisSubsolar") {
      const v = target.value;
      options.sunAxis.subsolarLatitude = v === "" ? null : minmax(Number(v), -90, 90);
      updateSubsolarDerived();
      if (ensureEl("wcAutoChange").checked) updateWorld();
      return;
    }
    if (stored === "sunAxisHeat") {
      ensureEl("sunAxisHeatInput").value = target.value;
      ensureEl("sunAxisHeatOutput").value = target.value;
      options.sunAxis.heatTransport = minmax(Number(target.value), 0, 1);
      if (ensureEl("wcAutoChange").checked) updateWorld();
      return;
    }
    if (stored === "sunAxisTravel") {
      ensureEl("sunAxisTravelInput").value = target.value;
      ensureEl("sunAxisTravelOutput").value = target.value;
      options.sunAxis.moistureTravel = minmax(Number(target.value), 2, 30);
      if (ensureEl("wcAutoChange").checked) updateWorld();
      return;
    }
    if (stored === "sunAxisWetness") {
      ensureEl("sunAxisWetnessInput").value = target.value;
      ensureEl("sunAxisWetnessOutput").value = target.value;
      options.sunAxis.precipScale = minmax(Number(target.value), 0.2, 2);
      if (ensureEl("wcAutoChange").checked) updateWorld();
      return;
    }

    ensureEl(stored + "Input").value = target.value;
    ensureEl(stored + "Output").value = target.value;
    lock(stored);

    if (stored === "temperatureEquator") {
      options.temperatureEquator = Number(target.value);
      ensureEl("temperatureEquatorF").innerText = convertTemperature(options.temperatureEquator, "°F");
    } else if (stored === "temperatureNorthPole") {
      options.temperatureNorthPole = Number(target.value);
      ensureEl("temperatureNorthPoleF").innerText = convertTemperature(options.temperatureNorthPole, "°F");
    } else if (stored === "temperatureSouthPole") {
      options.temperatureSouthPole = Number(target.value);
      ensureEl("temperatureSouthPoleF").innerText = convertTemperature(options.temperatureSouthPole, "°F");
    }

    if (ensureEl("wcAutoChange").checked) updateWorld();
  }

  function handleClimateModelChange({target}) {
    options.climateModel = target.value === "sunAxis" ? "sunAxis" : "classic";
    updateClimateModelVisibility();
    if (ensureEl("wcAutoChange").checked) updateWorld();
  }

  function handleSunAxisChange() {
    options.sunAxis.sunwardPole = ensureEl("sunAxisPoleInput").value === "south" ? "south" : "north";
    options.sunAxis.rotationBand = ensureEl("sunAxisRotationInput").checked;
    updateSubsolarDerived();
    if (ensureEl("wcAutoChange").checked) updateWorld();
  }

  function updateClimateModelVisibility() {
    const isSunAxis = (options.climateModel || "classic") === "sunAxis";
    ensureEl("sunAxisControls").style.display = isSunAxis ? null : "none";
  }

  // show the effective sub-solar latitude (auto = 90 − tilt, mirrored to the sunward pole)
  function updateSubsolarDerived() {
    const sa = options.sunAxis;
    const sign = sa.sunwardPole === "south" ? -1 : 1;
    const derived = sign * (90 - minmax(Number(sa.axialTilt) || 0, 0, 90));
    const effective = sa.subsolarLatitude === null || sa.subsolarLatitude === undefined ? derived : sa.subsolarLatitude;
    ensureEl("sunAxisSubsolarDerived").innerText = rn(effective, 1);
  }

  function updateWorld() {
    updateGlobeTemperature();
    updateGlobePosition();
    calculateTemperatures();
    generatePrecipitation();
    const heights = new Uint8Array(pack.cells.h);
    Rivers.generate();
    Rivers.specify();
    pack.cells.h = new Float32Array(heights);
    Biomes.define();
    Features.defineGroups();
    Lakes.defineNames();

    if (layerIsOn("toggleTemperature")) drawTemperature();
    if (layerIsOn("togglePrecipitation")) drawPrecipitation();
    if (layerIsOn("toggleBiomes")) drawBiomes();
    if (layerIsOn("toggleCoordinates")) drawCoordinates();
    if (layerIsOn("toggleRivers")) drawRivers();
    if (ensureEl("canvas3d")) setTimeout(() => ThreeD.update(), 500);
  }

  function updateGlobePosition() {
    const size = +ensureEl("mapSizeOutput").value;
    const eqD = ((graphHeight / 2) * 100) / size;

    calculateMapCoordinates();
    const mc = mapCoordinates;
    const unit = distanceUnitInput.value;
    const meridian = toKilometer(eqD * 2 * distanceScale);
    ensureEl("mapSize").innerHTML = `${graphWidth}x${graphHeight}`;
    ensureEl("mapSizeFriendly").innerHTML = `${rn(graphWidth * distanceScale)}x${rn(graphHeight * distanceScale)} ${unit}`;
    ensureEl("meridianLength").innerHTML = rn(eqD * 2);
    ensureEl("meridianLengthFriendly").innerHTML = `${rn(eqD * 2 * distanceScale)} ${unit}`;
    ensureEl("meridianLengthEarth").innerHTML = meridian ? " = " + rn(meridian / 200) + "%🌏" : "";
    ensureEl("mapCoordinates").innerHTML = `${lat(mc.latN)} ${Math.abs(rn(mc.lonW))}°W; ${lat(mc.latS)} ${rn(mc.lonE)}°E`;

    function toKilometer(v) {
      if (unit === "km") return v;
      if (unit === "mi") return v * 1.60934;
      if (unit === "lg") return v * 4.828;
      if (unit === "vr") return v * 1.0668;
      if (unit === "nmi") return v * 1.852;
      if (unit === "nlg") return v * 5.556;
      return 0; // 0 if distanceUnitInput is a custom unit
    }

    // parse latitude value
    function lat(lat) {
      return lat > 0 ? Math.abs(rn(lat)) + "°N" : Math.abs(rn(lat)) + "°S";
    }

    const area = d3.geoGraticule().extent([
      [mc.lonW, mc.latN],
      [mc.lonE, mc.latS]
    ]);

    globe.select("#globeArea").attr("d", round(path(area.outline()))); // map area
  }

  // update temperatures on globe (visual-only)
  function updateGlobeTemperature() {
    const tEq = options.temperatureEquator;
    const tNP = options.temperatureNorthPole;
    const tSP = options.temperatureSouthPole;

    const scale = d3.scaleSequential(d3.interpolateSpectral);
    const getColor = value => scale(1 - value);
    const [tMin, tMax] = [-25, 30]; // temperature extremes
    const tDelta = tMax - tMin;

    globe.select("#grad90").attr("stop-color", getColor((tNP - tMin) / tDelta));
    globe.select("#grad60").attr("stop-color", getColor((tEq - ((tEq - tNP) * 2) / 3 - tMin) / tDelta));
    globe.select("#grad30").attr("stop-color", getColor((tEq - ((tEq - tNP) * 1) / 4 - tMin) / tDelta));
    globe.select("#grad0").attr("stop-color", getColor((tEq - tMin) / tDelta));
    globe.select("#grad-30").attr("stop-color", getColor((tEq - ((tEq - tSP) * 1) / 4 - tMin) / tDelta));
    globe.select("#grad-60").attr("stop-color", getColor((tEq - ((tEq - tSP) * 2) / 3 - tMin) / tDelta));
    globe.select("#grad-90").attr("stop-color", getColor((tSP - tMin) / tDelta));
  }

  function updateWindDirections() {
    globe
      .select("#globeWindArrows")
      .selectAll("path")
      .each(function (d, i) {
        const tr = parseTransform(this.getAttribute("transform"));
        this.setAttribute("transform", `rotate(${options.winds[i]} ${tr[1]} ${tr[2]})`);
      });
  }

  function handleWindChange() {
    const arrow = d3.event.target.nextElementSibling;
    const tier = +arrow.dataset.tier;
    options.winds[tier] = (options.winds[tier] + 45) % 360;
    const tr = parseTransform(arrow.getAttribute("transform"));
    arrow.setAttribute("transform", `rotate(${options.winds[tier]} ${tr[1]} ${tr[2]})`);
    localStorage.setItem("winds", options.winds);

    const mapTiers = d3.range(mapCoordinates.latN, mapCoordinates.latS, -30).map(c => ((90 - c) / 30) | 0);
    if (ensureEl("wcAutoChange").checked && mapTiers.includes(tier)) updateWorld();
  }

  function restoreDefaultWinds() {
    const defaultWinds = [225, 45, 225, 315, 135, 315];
    const mapTiers = d3.range(mapCoordinates.latN, mapCoordinates.latS, -30).map(c => ((90 - c) / 30) | 0);
    const update = ensureEl("wcAutoChange").checked && mapTiers.some(t => options.winds[t] != defaultWinds[t]);
    options.winds = defaultWinds;
    updateWindDirections();
    if (update) updateWorld();
  }

  function applyWorldPreset(size, lat) {
    ensureEl("mapSizeInput").value = ensureEl("mapSizeOutput").value = size;
    ensureEl("latitudeInput").value = ensureEl("latitudeOutput").value = lat;
    lock("mapSize");
    lock("latitude");
    if (ensureEl("wcAutoChange").checked) updateWorld();
  }
}
