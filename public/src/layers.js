// src/layers.js

export function setupCustomLayers(map, state) {

    console.log("setupCustomLayers");
    // --- Selection rectangle ---
    if (!map.getSource("selection-rectangle")) {
        map.addSource("selection-rectangle", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
        });
    }

    if (!map.getLayer("selection-rectangle-fill")) {
        map.addLayer({
            id: "selection-rectangle-fill",
            type: "fill",
            source: "selection-rectangle",
            paint: {
                "fill-color": "#ffea00",
                "fill-opacity": 0.1,
            },
        });
    }

    if (!map.getLayer("selection-rectangle-outline")) {
        map.addLayer({
            id: "selection-rectangle-outline",
            type: "line",
            source: "selection-rectangle",
            paint: {
                "line-color": "#e1ce00",
                "line-width": 2,
            },
        });
    }

    // Restore selection geometry if we already have one
    if (state.currentSelectionRing) {
        map.getSource("selection-rectangle")?.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Polygon",
                        coordinates: [state.currentSelectionRing],
                    },
                },
            ],
        });
    }

    // --- Buildings ---
    if (!map.getSource("buildings-3d")) {
        map.addSource("buildings-3d", {
            type: "geojson",
            data: state.currentBuildingsGeoJSON || { type: "FeatureCollection", features: [] },
            promoteId: "id",
        });
    }

    if (!map.getLayer("buildings-3d-layer")) {
        map.addLayer({
            id: "buildings-3d-layer",
            type: "fill-extrusion",
            source: "buildings-3d",
            paint: {
                "fill-extrusion-color": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    "#ffff00",
                    "#888888",
                ],
                "fill-extrusion-height": 30,
                "fill-extrusion-opacity": 0.9,
            },
        });
    }

    // Restore buildings data
    map.getSource("buildings-3d")?.setData(
        state.currentBuildingsGeoJSON || { type: "FeatureCollection", features: [] }
    );

    // --- Buses ---
    if (!map.getSource("bus-positions")) {
        map.addSource("bus-positions", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
        });
    }

    if (!map.getLayer("bus-positions-layer")) {
        map.addLayer({
            id: "bus-positions-layer",
            type: "circle",
            source: "bus-positions",
            paint: {
                "circle-radius": 4,
                "circle-color": "#ff4b4b",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fff",
                "circle-opacity": 0.9,
            },
        });
    }

    // Mark ready (for checkbox toggles)
    state.selectionLayersReady = true;
}

export function setSelectionVisibility(map, state, show) {
    if (!state.selectionLayersReady) return;
    const vis = show ? "visible" : "none";
    ["selection-rectangle-fill", "selection-rectangle-outline"].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
}

export function setBuildingsVisibility(map, state, show) {
    state.buildingsVisible = show;
    const vis = show ? "visible" : "none";
    if (map.getLayer("buildings-3d-layer")) map.setLayoutProperty("buildings-3d-layer", "visibility", vis);
}

export function setBusesVisibility(map, state, show) {
    state.busesVisible = show;
    const vis = show ? "visible" : "none";
    if (map.getLayer("bus-positions-layer")) map.setLayoutProperty("bus-positions-layer", "visibility", vis);
}
