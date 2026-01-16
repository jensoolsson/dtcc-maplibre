// src/ui.js

import { baseStyles } from "./config.js";
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

export function createUI(map, state, selectionTool) {
    const ui = {
        drawButton: document.getElementById("drawButton"),
        clearButton: document.getElementById("clearButton"),
        build3DButton: document.getElementById("build3DButton"),
        toggleSelectionCheckbox: document.getElementById("toggleSelection"),
        toggleBuildingsCheckbox: document.getElementById("toggleBuildings"),
        toggleBusesCheckbox: document.getElementById("toggleBuses"),
        themeSelect: document.getElementById("themeSelect"),

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

        state.busesEnabled = false;

        // clear buildings cache + source
        state.currentBuildingsGeoJSON = { type: "FeatureCollection", features: [] };
        map.getSource("buildings-3d")?.setData(state.currentBuildingsGeoJSON);

        // clear buses
        map.getSource("bus-positions")?.setData({ type: "FeatureCollection", features: [] });

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

        // respect visibility toggles
        ui.setBuildingsVisibility(ui.toggleBuildingsCheckbox.checked);
        ui.setBusesVisibility(ui.toggleBusesCheckbox.checked);

        console.log(`Built ${selected.length} buildings`);
    });

    // Toggles
    ui.toggleSelectionCheckbox.addEventListener("change", (e) => ui.setSelectionVisibility(e.target.checked));
    ui.toggleBuildingsCheckbox.addEventListener("change", (e) => ui.setBuildingsVisibility(e.target.checked));
    ui.toggleBusesCheckbox.addEventListener("change", (e) => ui.setBusesVisibility(e.target.checked));

    // Theme switching
    ui.themeSelect.addEventListener("change", (e) => {
        const key = e.target.value;
        const styleUrl = baseStyles[key];
        if (!styleUrl) return;

        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();

        state.selectionLayersReady = false;
        map.setStyle(styleUrl);

        map.once("style.load", () => {
            map.jumpTo({ center, zoom, bearing, pitch });
            setupCustomLayers(map, state, ui);

            // re-apply current checkbox states after layers exist
            ui.setSelectionVisibility(ui.toggleSelectionCheckbox.checked);
            ui.setBuildingsVisibility(ui.toggleBuildingsCheckbox.checked);
            ui.setBusesVisibility(ui.toggleBusesCheckbox.checked);
        });
    });

    return ui;
}
