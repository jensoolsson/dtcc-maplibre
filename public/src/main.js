// src/main.js

import { baseStyles } from "./config.js";
import { createState } from "./state.js";
import { createMap } from "./map.js";
import { setupCustomLayers } from "./layers.js";
import { createSelectionTool } from "./selectionTool.js";
import { loadBuildings, setupBuildingInteraction } from "./buildings.js";
import { startVehicleLoop } from "./vehicles.js";
import { setupRightMouseRotation } from "./rotation.js";
import { createUI } from "./ui.js";

const state = createState();
const map = createMap(baseStyles.light);

let ui;
let selectionTool;

map.on("load", async () => {
    // Layers first
    // ui is needed by setupCustomLayers, but ui also wants selectionTool, so we do a tiny bootstrap:
    ui = {
        drawButton: document.getElementById("drawButton"),
        toggleSelectionCheckbox: document.getElementById("toggleSelection"),
        toggleBuildingsCheckbox: document.getElementById("toggleBuildings"),
        toggleBusesCheckbox: document.getElementById("toggleBuses"),
        setSelectionVisibility: () => { },
        setBuildingsVisibility: () => { },
        setBusesVisibility: () => { },
    };

    setupCustomLayers(map, state, ui);

    // Now the selection tool exists (needs ui to reset button text on mouseup)
    selectionTool = createSelectionTool(map, state, ui);

    // Now build the full UI (wires all handlers)
    ui = createUI(map, state, selectionTool);

    // Re-run setupCustomLayers so it uses the *real* ui methods
    // (optional but keeps everything consistent)
    state.selectionLayersReady = false;
    setupCustomLayers(map, state, ui);

    // Rotation and interactions
    setupRightMouseRotation(map, state);
    setupBuildingInteraction(map, state);

    // Load buildings dataset
    try {
        state.allBuildings = await loadBuildings("sthlm_XL.geojson");
        console.log("Loaded buildings:", state.allBuildings.features.length);
    } catch (err) {
        console.error(err);
    }

    // Vehicles loop
    startVehicleLoop(map, state);
});
