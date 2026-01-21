// src/ui.js

import { baseStyles, uiThemes } from "./config.js";
import { setupCustomLayers } from "./layers.js";
import { selectBuildings, applyBuildings } from "./buildings.js";

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

export function createUI(map, state, selectionTool) {
    const ui = {
        drawButton: document.getElementById("drawButton"),
        clearButton: document.getElementById("clearButton"),
        build3DButton: document.getElementById("build3DButton"),
        toggleSelectionCheckbox: document.getElementById("toggleSelection"),
        toggleBuildingsCheckbox: document.getElementById("toggleBuildings"),
        toggleBusesCheckbox: document.getElementById("toggleBuses"),
        themeSelect: document.getElementById("themeSelect"),

        togglesWrap: document.getElementById("toggles"),
        toggleSelectionRow: document.getElementById("toggleSelectionRow"),
        toggleBuildingsRow: document.getElementById("toggleBuildingsRow"),
        toggleBusesRow: document.getElementById("toggleBusesRow"),

        showToggles: (show) => ui.togglesWrap?.classList.toggle("d-none", !show),
        showSelectionToggle: (show) => ui.toggleSelectionRow?.classList.toggle("d-none", !show),
        showBuildingsToggle: (show) => ui.toggleBuildingsRow?.classList.toggle("d-none", !show),
        showBusesToggle: (show) => ui.toggleBusesRow?.classList.toggle("d-none", !show),

        setSelectionVisibility: (show) => setSelectionVisibility(map, state, show),
        setBuildingsVisibility: (show) => setBuildingsVisibility(map, state, show),
        setBusesVisibility: (show) => setBusesVisibility(map, state, show),
    };

    // Draw
    ui.drawButton.addEventListener("click", () => {
        selectionTool.arm();
        ui.drawButton.classList.add("active");
        ui.drawButton.textContent = "Click + drag to draw";
    });

    // Clear
    ui.clearButton.addEventListener("click", () => {
        selectionTool.clear();

        // Hide build options + disable build
        ui.showBuildOptions(false);

        // Reset defaults
        ui.includeBuildingsCheckbox.checked = true;
        ui.includeBusesCheckbox.checked = false;

        state.busesEnabled = false;

        // clear buildings cache + source
        state.currentBuildingsGeoJSON = { type: "FeatureCollection", features: [] };
        map.getSource("buildings-3d")?.setData(state.currentBuildingsGeoJSON);

        // clear buses
        map.getSource("bus-positions")?.setData({ type: "FeatureCollection", features: [] });

        // NEW: hide toggles again
        ui.showBusesToggle(false);
        ui.showBuildingsToggle(false);
        ui.showSelectionToggle(false);
        ui.showToggles(false);

        ui.drawButton.classList.remove("active");
        ui.drawButton.textContent = "Draw rectangle";

        console.log("Selection + buildings + buses cleared");
    });

    // Build 3D
    ui.build3DButton.addEventListener("click", () => {
        if (!state.allBuildings) {
            console.warn("Buildings not loaded yet");
            return;
        }
        if (!state.selectionPolygon) {
            console.warn("No selection rectangle defined");
            return;
        }

        const selected = selectBuildings(state.allBuildings, state.selectionPolygon);
        applyBuildings(map, state, selected);

        // enable buses after build
        state.busesEnabled = true;

        // NEW: reveal toggles now they matter
        ui.showToggles(true);
        ui.showSelectionToggle(true);
        ui.showBuildingsToggle(true);
        ui.showBusesToggle(true);

        // respect visibility toggles
        ui.setBuildingsVisibility(ui.toggleBuildingsCheckbox.checked);
        ui.setBusesVisibility(ui.toggleBusesCheckbox.checked);

        console.log(`Built ${selected.length} buildings`);
    });

    // Toggles
    ui.toggleSelectionCheckbox.addEventListener("change", (e) => ui.setSelectionVisibility(e.target.checked));
    ui.toggleBuildingsCheckbox.addEventListener("change", (e) => ui.setBuildingsVisibility(e.target.checked));
    ui.toggleBusesCheckbox.addEventListener("change", (e) => ui.setBusesVisibility(e.target.checked));

    const buildOptions = document.getElementById("buildOptions");
    const includeBuildings = document.getElementById("includeBuildings");
    const includeBuses = document.getElementById("includeBuses");

    ui.buildOptionsWrap = buildOptions;
    ui.includeBuildingsCheckbox = includeBuildings;
    ui.includeBusesCheckbox = includeBuses;

    ui.showBuildOptions = (show) => {
        ui.buildOptionsWrap?.classList.toggle("d-none", !show);
    };


    ui.themeSelect.addEventListener("change", (e) => {
        const key = e.target.value;
        const styleUrl = baseStyles[key];
        if (!styleUrl) return;

        // Apply UI theme (uses CSS vars like html[data-ui-theme="dark"])
        const uiThemeKey = uiThemes[key] || "light";
        document.documentElement.dataset.uiTheme = uiThemeKey;

        // Save camera
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();

        // Block drawing during switch (prevents the "source missing" click)
        state.selectionLayersReady = false;
        state.drawModeArmed = false;
        if (ui.drawButton) {
            ui.drawButton.disabled = true;
            ui.drawButton.classList.remove("active");
            ui.drawButton.textContent = "Loading theme…";
        }

        console.log("before sources:", Object.keys(map.getStyle()?.sources || {}));

        // Force a full rebuild (often helps)
        map.setStyle(styleUrl, { diff: false });

        waitForStyleReady(map, () => {
            console.log("style ready; after sources:", Object.keys(map.getStyle()?.sources || {}));
            map.jumpTo({ center, zoom, bearing, pitch });
            setupCustomLayers(map, state);
            console.log("restored selection source:", !!map.getSource("selection-rectangle"));

            // Re-apply toggles
            ui.setSelectionVisibility?.(ui.toggleSelectionCheckbox?.checked);
            ui.setBuildingsVisibility?.(ui.toggleBuildingsCheckbox?.checked);
            ui.setBusesVisibility?.(ui.toggleBusesCheckbox?.checked);

            // Re-enable drawing
            if (ui.drawButton) {
                ui.drawButton.disabled = false;
                ui.drawButton.textContent = "Draw rectangle";
            }

        });
    });

    ui.showBuildOptions(false);

    return ui;
}
