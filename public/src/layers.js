// public/src/layers.js
export function setupCustomLayers(map, state, ui) {
    const {
        currentSelectionRing,
        currentBuildingsGeoJSON,
    } = state;

    // --- helpers ---
    function ensureGeoJSONSource(id, data, extra = {}) {
        const existing = map.getSource(id);
        if (existing) {
            existing.setData(data);
            return;
        }
        map.addSource(id, { type: "geojson", data, ...extra });
    }

    function ensureLayer(layerDef) {
        if (map.getLayer(layerDef.id)) return;
        map.addLayer(layerDef);
    }

    // --- selection ---
    ensureGeoJSONSource("selection-rectangle", {
        type: "FeatureCollection",
        features: currentSelectionRing
            ? [{
                type: "Feature",
                properties: {},
                geometry: { type: "Polygon", coordinates: [currentSelectionRing] },
            }]
            : [],
    });

    ensureLayer({
        id: "selection-rectangle-fill",
        type: "fill",
        source: "selection-rectangle",
        paint: { "fill-color": "#ffea00ff", "fill-opacity": 0.1 },
    });

    ensureLayer({
        id: "selection-rectangle-outline",
        type: "line",
        source: "selection-rectangle",
        paint: { "line-color": "#e1ce00ff", "line-width": 2 },
    });

    // --- buildings ---
    ensureGeoJSONSource("buildings-3d", currentBuildingsGeoJSON, { promoteId: "id" });

    ensureLayer({
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

    // --- buses ---
    ensureGeoJSONSource("bus-positions", { type: "FeatureCollection", features: [] });

    ensureLayer({
        id: "bus-positions-layer",
        type: "circle",
        source: "bus-positions",
        paint: {
            "circle-radius": 4,
            "circle-color": "#ff4b4b",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
        },
    });

    // tell caller layers are ready + apply UI visibility
    ui.selectionLayersReady = true;
    ui.setSelectionVisibility(ui.toggleSelectionCheckbox.checked);
    ui.setBuildingsVisibility(ui.toggleBuildingsCheckbox.checked);
    ui.setBusesVisibility(ui.toggleBusesCheckbox.checked);
}
