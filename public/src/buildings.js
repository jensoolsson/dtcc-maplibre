// src/buildings.js

function hash01(value) {
    // stable 0..1 from any string/number
    const s = String(value);
    let h = 2166136261; // FNV-1a-ish
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    // convert uint32 -> 0..1
    return (h >>> 0) / 4294967295;
}

export function randomHeightForFeature(feature, min, max) {
    const id = feature.id ?? feature.properties?.id ?? JSON.stringify(feature.geometry).length;
    const t = hash01(id); // stable per feature id
    return min + t * (max - min);
}

export function addRandomHeights(features, minH, maxH) {
    for (const f of features) {
        f.properties ||= {};
        f.properties.dt_height = randomHeightForFeature(f, minH, maxH);
    }
    return features;
}

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

export function getBuildingType(props) {
    const raw =
        props?.building ??
        props?.building_type ??
        props?.type ??
        props?.use ??
        props?.class ??
        "other";

    const v = String(raw).toLowerCase();

    if (["apartments", "apartment", "residential", "house", "detached", "terrace", "semidetached_house", "bungalow"].includes(v)) {
        return "Residential";
    }
    if (["office", "commercial"].includes(v)) return "Office";
    if (["retail", "shop", "mall", "supermarket"].includes(v)) return "Retail";
    if (["industrial", "warehouse"].includes(v)) return "Industrial";
    if (["school", "university", "college", "kindergarten"].includes(v)) return "Education";
    if (["hospital", "clinic"].includes(v)) return "Healthcare";
    if (["hotel", "hostel"].includes(v)) return "Hotel";

    return "Other";
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
