// src/ui.js

import { baseStyles, uiThemes } from "./config.js";
import { setupCustomLayers } from "./layers.js";
import { selectBuildings, applyBuildings, addRandomHeights, getBuildingType } from "./buildings.js";

/** Small utilities */
const emptyFC = () => ({ type: "FeatureCollection", features: [] });

function waitForStyleReady(map, cb) {
    if (map.isStyleLoaded()) {
        cb();
        return;
    }
    const onRender = () => {
        if (map.isStyleLoaded()) {
            map.off("render", onRender);
            cb();
        }
    };
    map.on("render", onRender);
}

/** Color palette helpers */
function getChartPaletteFromCSS() {
    const s = getComputedStyle(document.documentElement);
    const cols = [];
    for (let i = 1; i <= 9; i++) {
        const v = s.getPropertyValue(`--chart-${i}`).trim();
        if (v) cols.push(v);
    }
    return cols;
}

function applyPalette(ui, paletteKey) {
    document.documentElement.dataset.uiPalette = paletteKey;

    // Let CSS apply before reading vars + updating charts
    requestAnimationFrame(() => applyChartColorsFromPalette(ui));
}

function applyChartColorsFromPalette(ui) {
    const palette = getChartPaletteFromCSS();
    if (!palette.length) return;

    // Bar (height histogram)
    if (ui._chart) {
        ui._chart.data.datasets[0].backgroundColor = palette[0];
        ui._chart.update();
    }

    // Pie (building types)
    if (ui.typesChart) {
        // Ensure enough colours for number of slices
        const n = ui.typesChart.data.labels?.length || 0;
        const colors = Array.from({ length: n }, (_, i) => palette[i % palette.length]);

        ui.typesChart.data.datasets[0].backgroundColor = colors;
        ui.typesChart.update();
    }
}

/** Visibility helpers */
function setSelectionVisibility(map, state, show) {
    if (!state.selectionLayersReady) return;
    const visibility = show ? "visible" : "none";
    ["selection-rectangle-fill", "selection-rectangle-outline"].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
    });
}

function setBuildingsVisibility(map, state, show) {
    state.buildingsVisible = show;
    const visibility = show ? "visible" : "none";
    if (map.getLayer("buildings-3d-layer")) {
        map.setLayoutProperty("buildings-3d-layer", "visibility", visibility);
    }
}

function setBusesVisibility(map, state, show) {
    state.busesVisible = show;
    const visibility = show ? "visible" : "none";
    if (map.getLayer("bus-positions-layer")) {
        map.setLayoutProperty("bus-positions-layer", "visibility", visibility);
    }
}

export function applySkyForUITheme(map, uiThemeKey) {
    // Only visible when pitched (try pitch > ~20)
    if (uiThemeKey === "dark") {
        map.setSky({
            "sky-color": "#07162e",        // deep blue
            "horizon-color": "#0b2c5e",    // lighter blue near horizon
            "sky-horizon-blend": 0.85,     // more blending = smoother gradient

            // optional “atmosphere” feel
            "fog-color": "#050814",
            "horizon-fog-blend": 0.6,
            "fog-ground-blend": 0.15
        });
    } else if (uiThemeKey === "light") {
        map.setSky({
            "sky-color": "#b1b7c0",        // deep blue
            "horizon-color": "#f8fbff",    // lighter blue near horizon
            "sky-horizon-blend": 0.85,     // more blending = smoother gradient

            // optional “atmosphere” feel
            "fog-color": "#999ba2",
            "horizon-fog-blend": 0.6,
            "fog-ground-blend": 0.15
        });
    } else {
        map.setSky({
            "sky-color": "#88b4fa",        // deep blue
            "horizon-color": "#f8fbff",    // lighter blue near horizon
            "sky-horizon-blend": 0.85,     // more blending = smoother gradient

            // optional “atmosphere” feel
            "fog-color": "#999ba2",
            "horizon-fog-blend": 0.6,
            "fog-ground-blend": 0.15
        });
    }
}

/** Main UI factory */
export function createUI(map, state, selectionTool) {
    // ---- DOM refs ------------------------------------------------------------
    const ui = {
        // palette selector
        paletteSelect: document.getElementById("paletteSelect"),

        // buttons
        drawButton: document.getElementById("drawButton"),
        clearButton: document.getElementById("clearButton"),
        build3DButton: document.getElementById("build3DButton"),

        // theme
        themeSelect: document.getElementById("themeSelect"),

        // build include options
        buildOptionsWrap: document.getElementById("buildOptions"),
        includeBuildingsCheckbox: document.getElementById("includeBuildings"),
        includeBusesCheckbox: document.getElementById("includeBuses"),

        // visibility toggles (shown after build)
        togglesWrap: document.getElementById("toggles"),
        toggleSelectionRow: document.getElementById("toggleSelectionRow"),
        toggleBuildingsRow: document.getElementById("toggleBuildingsRow"),
        toggleBusesRow: document.getElementById("toggleBusesRow"),
        toggleSelectionCheckbox: document.getElementById("toggleSelection"),
        toggleBuildingsCheckbox: document.getElementById("toggleBuildings"),
        toggleBusesCheckbox: document.getElementById("toggleBuses"),

        // stats panel
        statsPanel: document.getElementById("statsPanel"),
        statsStatus: document.getElementById("statsStatus"),
        statBuildings: document.getElementById("statBuildings"),
        statArea: document.getElementById("statArea"),
        statBuses: document.getElementById("statBuses"),
        statNote: document.getElementById("statNote"),

        // chart
        chartCanvas: document.getElementById("statsChart"),
        _chart: null,

        typesCanvas: document.getElementById("typesChart"),
        typesChart: null,
    };

    // ---- UI show/hide helpers ------------------------------------------------
    ui.showBuildOptions = (show) => ui.buildOptionsWrap?.classList.toggle("d-none", !show);

    ui.showToggles = (show) => ui.togglesWrap?.classList.toggle("d-none", !show);
    ui.showSelectionToggle = (show) => ui.toggleSelectionRow?.classList.toggle("d-none", !show);
    ui.showBuildingsToggle = (show) => ui.toggleBuildingsRow?.classList.toggle("d-none", !show);
    ui.showBusesToggle = (show) => ui.toggleBusesRow?.classList.toggle("d-none", !show);

    ui.showStatsPanel = (show) => ui.statsPanel?.classList.toggle("d-none", !show);

    // ---- UI setters (map layer visibility) -----------------------------------
    ui.setSelectionVisibility = (show) => setSelectionVisibility(map, state, show);
    ui.setBuildingsVisibility = (show) => setBuildingsVisibility(map, state, show);
    ui.setBusesVisibility = (show) => setBusesVisibility(map, state, show);

    // ---- Stats + chart -------------------------------------------------------
    const formatArea = (m2) => {
        if (!Number.isFinite(m2)) return "–";
        if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(2)} km²`;
        return `${Math.round(m2).toLocaleString()} m²`;
    };

    ui.updateStats = ({ buildingsCount, selectionAreaM2, busesEnabled, statusText, note }) => {
        ui.showStatsPanel(true);
        if (ui.statsStatus) ui.statsStatus.textContent = statusText ?? "Model ready";
        if (ui.statBuildings) ui.statBuildings.textContent = (buildingsCount ?? "–").toString();
        if (ui.statArea) ui.statArea.textContent = formatArea(selectionAreaM2);
        if (ui.statBuses) ui.statBuses.textContent = busesEnabled ? "Yes" : "No";
        if (ui.statNote && note != null) ui.statNote.textContent = note;
    };

    ui.updateChart = ({ heights }) => {
        if (!ui.chartCanvas || typeof Chart === "undefined") return;

        // histogram bins
        const bins = [0, 10, 20, 30, 50, 80, 120];
        const counts = new Array(bins.length - 1).fill(0);

        (heights || []).forEach((hRaw) => {
            const h = Number(hRaw) || 0;
            for (let i = 0; i < bins.length - 1; i++) {
                if (h >= bins[i] && h < bins[i + 1]) {
                    counts[i]++;
                    break;
                }
            }
        });

        const labels = bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}m`);

        if (!ui._chart) {
            ui._chart = new Chart(ui.chartCanvas, {
                type: "bar",
                data: { labels, datasets: [{ label: "Buildings", data: counts }] },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } },
                },
            });
        } else {
            ui._chart.data.labels = labels;
            ui._chart.data.datasets[0].data = counts;
            ui._chart.update();
        }

        applyChartColorsFromPalette(ui);
    };

    ui.updateTypeChart = ({ features }) => {
        if (!ui.typesCanvas || typeof Chart === "undefined") return;

        const counts = new Map();
        (features || []).forEach((f) => {
            const t = getBuildingType(f?.properties);
            counts.set(t, (counts.get(t) || 0) + 1);
        });

        const labels = Array.from(counts.keys());
        const data = Array.from(counts.values());

        // grow container when there are many legend rows
        const pieBox = ui.typesCanvas.closest(".chart-box--pie");
        if (pieBox) {
            const base = 220;                 // px
            const extraPerLabel = 14;         // px per label (tweak)
            pieBox.style.height = `${base + Math.max(0, labels.length - 6) * extraPerLabel}px`;
        }

        const palette = getChartPaletteFromCSS();

        if (!ui.typesChart) {
            ui.typesChart = new Chart(ui.typesCanvas, {
                type: "pie",
                data: {
                    labels,
                    datasets: [
                        {
                            data,
                            backgroundColor: palette,    // use CSS palette
                            borderWidth: 0               // optional: cleaner look
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: "bottom",
                            align: "start",
                            labels: {
                                boxWidth: 10,
                                boxHeight: 10,
                                padding: 12,
                                usePointStyle: true,
                                pointStyle: "circle",
                            },
                        },
                    },
                },
            });
        } else {
            // keep palette in sync when data/labels change
            ui.typesChart.data.labels = labels;
            ui.typesChart.data.datasets[0].data = data;
            ui.typesChart.data.datasets[0].backgroundColor = palette;
            ui.typesChart.update();
        }

        applyChartColorsFromPalette(ui);
    };


    // ---- Actions -------------------------------------------------------------
    function resetDrawButton() {
        ui.drawButton?.classList.remove("active");
        if (ui.drawButton) ui.drawButton.textContent = "Draw rectangle";
    }

    function clearModelAndUI() {
        selectionTool.clear();

        // hide build include options again
        ui.showBuildOptions(false);

        // reset include defaults (safe)
        if (ui.includeBuildingsCheckbox) ui.includeBuildingsCheckbox.checked = true;
        if (ui.includeBusesCheckbox) ui.includeBusesCheckbox.checked = false;

        // Ensure next drawn rectangle is visible (but don't show the toggle UI)
        if (ui.toggleSelectionCheckbox) ui.toggleSelectionCheckbox.checked = true;
        ui.setSelectionVisibility?.(true);

        // stop buses + clear sources
        state.busesEnabled = false;

        state.currentBuildingsGeoJSON = emptyFC();
        map.getSource("buildings-3d")?.setData(state.currentBuildingsGeoJSON);

        map.getSource("bus-positions")?.setData(emptyFC());

        // hide the visibility toggles again
        ui.showBusesToggle(false);
        ui.showBuildingsToggle(false);
        ui.showSelectionToggle(false);
        ui.showToggles(false);

        // stats / chart
        ui.showStatsPanel(false);
        ui.updateStats({
            buildingsCount: "–",
            selectionAreaM2: null,
            busesEnabled: false,
            statusText: "No model",
            note: "Draw a rectangle and build to see statistics here.",
        });

        ui.updateChart({ heights: [] });
        ui.updateTypeChart({ features: [] });

        resetDrawButton();
    }

    function buildFromSelection() {
        if (!state.allBuildings) {
            console.warn("Buildings not loaded yet");
            return;
        }
        if (!state.selectionPolygon) {
            console.warn("No selection rectangle defined");
            return;
        }

        const doBuildings = !!ui.includeBuildingsCheckbox?.checked;
        const doBuses = !!ui.includeBusesCheckbox?.checked;

        // --- Buildings ---
        let selected = [];
        let buildingsCount = 0;

        if (doBuildings) {
            const minH = 5;
            const maxH = 30;

            selected = addRandomHeights(selectBuildings(state.allBuildings, state.selectionPolygon), minH, maxH);

            applyBuildings(map, state, selected);
            buildingsCount = selected.length;

            ui.updateChart({ heights: selected.map((f) => f?.properties?.dt_height ?? 0) });
            ui.updateTypeChart({ features: selected });

        } else {
            // clear buildings if not included
            state.currentBuildingsGeoJSON = emptyFC();
            map.getSource("buildings-3d")?.setData(state.currentBuildingsGeoJSON);
            ui.updateChart({ heights: [] });
        }

        // --- Buses ---
        state.busesEnabled = doBuses;
        if (!doBuses) {
            map.getSource("bus-positions")?.setData(emptyFC());
        }

        // --- Stats (always useful after build) ---
        const selectionAreaM2 = state.selectionPolygon ? turf.area(state.selectionPolygon) : null;

        ui.updateStats({
            buildingsCount,
            selectionAreaM2,
            busesEnabled: state.busesEnabled,
            statusText: "Built",
            note: "Use the toggles to show/hide layers.",
        });

        // --- Show visibility toggles only for built content ---
        ui.showToggles(true);

        // you wanted "Show selection" only after build
        ui.showSelectionToggle(true);

        ui.showBuildingsToggle(doBuildings);
        ui.showBusesToggle(doBuses);

        // apply current visibility checkbox states (only if relevant)
        if (doBuildings) ui.setBuildingsVisibility(!!ui.toggleBuildingsCheckbox?.checked);
        if (doBuses) ui.setBusesVisibility(!!ui.toggleBusesCheckbox?.checked);

        console.log(
            `Build completed. buildings=${doBuildings ? buildingsCount : 0}, buses=${doBuses}`
        );
    }

    function switchTheme(key) {
        const styleUrl = baseStyles[key];
        if (!styleUrl) return;

        // UI theme switch (CSS vars)
        const uiThemeKey = uiThemes[key] || "light";
        document.documentElement.dataset.uiTheme = uiThemeKey;

        // save camera
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();

        // don’t disable draw button (per your preference), but do cancel drawing mode
        state.selectionLayersReady = false;
        state.drawModeArmed = false;
        resetDrawButton();

        map.setStyle(styleUrl, { diff: false });


        waitForStyleReady(map, () => {
            map.jumpTo({ center, zoom, bearing, pitch });
            setupCustomLayers(map, state);

            applySkyForUITheme(map, uiThemeKey);
            // re-apply visibility settings for anything that exists
            ui.setSelectionVisibility(!!ui.toggleSelectionCheckbox?.checked);
            ui.setBuildingsVisibility(!!ui.toggleBuildingsCheckbox?.checked);
            ui.setBusesVisibility(!!ui.toggleBusesCheckbox?.checked);
        });
    }

    // ---- Event listeners -----------------------------------------------------
    ui.drawButton?.addEventListener("click", () => {
        selectionTool.arm();
        ui.drawButton?.classList.add("active");
        if (ui.drawButton) ui.drawButton.textContent = "Click + drag to draw";
    });

    ui.clearButton?.addEventListener("click", clearModelAndUI);

    ui.build3DButton?.addEventListener("click", buildFromSelection);

    ui.toggleSelectionCheckbox?.addEventListener("change", (e) => ui.setSelectionVisibility(e.target.checked));

    ui.toggleBuildingsCheckbox?.addEventListener("change", (e) => ui.setBuildingsVisibility(e.target.checked));

    ui.toggleBusesCheckbox?.addEventListener("change", (e) => ui.setBusesVisibility(e.target.checked));

    ui.themeSelect?.addEventListener("change", (e) => switchTheme(e.target.value));

    ui.paletteSelect?.addEventListener("change", (e) => { applyPalette(ui, e.target.value); });

    // ---- Initial UI state ----------------------------------------------------
    ui.showBuildOptions(false);
    ui.showToggles(false);
    ui.showSelectionToggle(false);
    ui.showBuildingsToggle(false);
    ui.showBusesToggle(false);

    return ui;
}
