// src/buildings.js

export async function loadBuildings(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return await res.json();
}

export function selectBuildings(allBuildings, selectionPolygon) {
    // NOTE: still intersects. You can swap to booleanWithin later if desired.
    return allBuildings.features
        .filter((f) => turf.booleanIntersects(f, selectionPolygon))
        .map((f, idx) => {
            const baseProps = f.properties || {};
            const newId = f.id ?? baseProps.id ?? idx;

            return {
                type: "Feature",
                geometry: f.geometry,
                properties: { ...baseProps, id: newId },
                id: newId,
            };
        });
}

export function applyBuildings(map, state, features) {
    state.currentBuildingsGeoJSON = { type: "FeatureCollection", features };

    const src = map.getSource("buildings-3d");
    src?.setData(state.currentBuildingsGeoJSON);

    // reset selected feature-state
    if (state.lastSelectedBuildingId !== null) {
        try {
            map.setFeatureState(
                { source: "buildings-3d", id: state.lastSelectedBuildingId },
                { selected: false }
            );
        } catch (_) { }
    }
    state.lastSelectedBuildingId = null;
}

export function setupBuildingInteraction(map, state) {
    map.on("mouseenter", "buildings-3d-layer", () => {
        if (!state.isDrawing && !state.isCustomRotating && !state.drawModeArmed) {
            map.getCanvas().style.cursor = "pointer";
        }
    });

    map.on("mouseleave", "buildings-3d-layer", () => {
        if (!state.isDrawing && !state.isCustomRotating && !state.drawModeArmed) {
            map.getCanvas().style.cursor = "";
        }
    });

    map.on("click", "buildings-3d-layer", (e) => {
        if (!e.features?.length) return;
        const feature = e.features[0];

        const featureId = feature.id;
        if (featureId === undefined || featureId === null) {
            console.warn("Clicked building has no id – cannot set feature-state");
            return;
        }

        // clear previous
        if (state.lastSelectedBuildingId !== null) {
            try {
                map.setFeatureState(
                    { source: "buildings-3d", id: state.lastSelectedBuildingId },
                    { selected: false }
                );
            } catch (_) { }
        }

        // set new
        map.setFeatureState({ source: "buildings-3d", id: featureId }, { selected: true });
        state.lastSelectedBuildingId = featureId;

        // Popup (optional)
        const props = feature.properties || {};
        const id = props.id || props.osm_id || "–";
        const height = typeof props.height === "number" ? `${props.height.toFixed(1)} m` : "30 m (default)";
        const name = props.name || props.building || "Building";

        new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${name}</strong><br/>ID: ${id}<br/>Height: ${height}`)
            .addTo(map);
    });

    // click outside to clear highlight
    map.on("click", (e) => {
        const feats = map.queryRenderedFeatures(e.point, { layers: ["buildings-3d-layer"] });
        if (feats.length) return;

        if (state.lastSelectedBuildingId !== null) {
            try {
                map.setFeatureState(
                    { source: "buildings-3d", id: state.lastSelectedBuildingId },
                    { selected: false }
                );
            } catch (_) { }
            state.lastSelectedBuildingId = null;
        }
    });
}
