// ---- 1. Map setup ----

const MAX_PITCH = 85;
const MIN_PITCH = 0;

const baseStyles = {
    light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    default: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    osmBright: "https://demotiles.maplibre.org/style.json",
};

const map = new maplibregl.Map({
    container: "map",
    style: baseStyles.light,
    center: [18.0686, 59.3293], // Stockholm
    zoom: 13,
    pitch: 60,
    bearing: -60,
    maxPitch: MAX_PITCH,
    minPitch: MIN_PITCH,
});

map.addControl(new maplibregl.NavigationControl());

// Turn off built-in drag rotate so it doesn't fight us
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();

// ---- Global state ----

// Rectangle drawing
let isDrawing = false;
let drawModeArmed = false;
let anchorLngLat = null;      // first click
let localCosLat = null;       // cos(lat0)
let axisU = null;             // camera-aligned X
let axisV = null;             // camera-aligned Y
let currentSelectionRing = null; // [[lng,lat], ...]
let selectionPolygon = null;     // turf polygon

// Buildings (3D)
let allBuildings = null;
let currentBuildingsGeoJSON = {
    type: "FeatureCollection",
    features: [],
};

// Currently selected building id (for feature-state)
let lastSelectedBuildingId = null;

// Buses
let busesEnabled = false;   // only after Build 3D
let buildingsVisible = true;
let busesVisible = true;

// Selection visibility
let selectionLayersReady = false;

// Vehicle interpolation state
let prevVehicles = new Map(); // id -> {lon,lat,...}
let currVehicles = new Map();
let animationStartTime = performance.now();
const POLL_INTERVAL_MS = 5000;
const ANIMATION_DURATION_MS = 4500;

// DOM elements
const drawButton = document.getElementById("drawButton");
const clearButton = document.getElementById("clearButton");
const build3DButton = document.getElementById("build3DButton");
const toggleSelectionCheckbox = document.getElementById("toggleSelection");
const toggleBuildingsCheckbox = document.getElementById("toggleBuildings");
const toggleBusesCheckbox = document.getElementById("toggleBuses");
const themeSelect = document.getElementById("themeSelect");

// ---- Helpers for layer visibility ----

function setSelectionVisibility(show) {
    if (!selectionLayersReady) return;
    const visibility = show ? "visible" : "none";

    ["selection-rectangle-fill", "selection-rectangle-outline"].forEach((id) => {
        if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", visibility);
        }
    });
}

function setBuildingsVisibility(show) {
    buildingsVisible = show;
    const visibility = show ? "visible" : "none";

    if (map.getLayer("buildings-3d-layer")) {
        map.setLayoutProperty("buildings-3d-layer", "visibility", visibility);
    }
}

function setBusesVisibility(show) {
    busesVisible = show;
    if (map.getLayer("bus-positions-layer")) {
        map.setLayoutProperty(
            "bus-positions-layer",
            "visibility",
            show ? "visible" : "none"
        );
    }
}

// ---- 2. Custom sources + layers (reused after style change) ----

function setupCustomLayers() {
    // Selection rectangle
    map.addSource("selection-rectangle", {
        type: "geojson",
        data: {
            type: "FeatureCollection",
            features: [],
        },
    });

    map.addLayer({
        id: "selection-rectangle-fill",
        type: "fill",
        source: "selection-rectangle",
        paint: {
            "fill-color": "#ffea00ff",
            "fill-opacity": 0.1,
        },
    });

    map.addLayer({
        id: "selection-rectangle-outline",
        type: "line",
        source: "selection-rectangle",
        paint: {
            "line-color": "#e1ce00ff",
            "line-width": 2,
        },
    });

    // If we already have a selection ring, redraw it so it survives theme changes
    if (currentSelectionRing) {
        const srcSel = map.getSource("selection-rectangle");
        if (srcSel) {
            srcSel.setData({
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "Polygon",
                            coordinates: [currentSelectionRing],
                        },
                    },
                ],
            });
        }
    }

    // 3D buildings - use cached GeoJSON so it persists across theme changes
    map.addSource("buildings-3d", {
        type: "geojson",
        data: currentBuildingsGeoJSON,
        promoteId: "id",        // <-- add this
    });

    map.addLayer({
        id: "buildings-3d-layer",
        type: "fill-extrusion",
        source: "buildings-3d",
        paint: {
            // Color depends on feature-state "selected"
            "fill-extrusion-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#ffff00",  // highlighted
                "#888888"   // normal
            ],
            "fill-extrusion-height": 30,
            "fill-extrusion-opacity": 0.9,
        },
    });


    // Buses
    map.addSource("bus-positions", {
        type: "geojson",
        data: {
            type: "FeatureCollection",
            features: [],
        },
    });

    map.addLayer({
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

    // Mark selection layers as ready and sync with checkboxes
    selectionLayersReady = true;
    setSelectionVisibility(toggleSelectionCheckbox.checked);
    setBuildingsVisibility(toggleBuildingsCheckbox.checked);
    setBusesVisibility(toggleBusesCheckbox.checked);
}

// ---- 3. UI handlers (buttons, checkboxes, theme) ----

// Arm drawing when button is clicked
drawButton.addEventListener("click", () => {
    drawModeArmed = true;
    drawButton.classList.add("active");
    drawButton.textContent = "Click + drag to draw";
});

// Clear selection + buildings + buses
clearButton.addEventListener("click", () => {
    isDrawing = false;
    drawModeArmed = false;
    anchorLngLat = null;
    axisU = null;
    axisV = null;
    localCosLat = null;
    currentSelectionRing = null;
    selectionPolygon = null;
    busesEnabled = false;

    drawButton.classList.remove("active");
    drawButton.textContent = "Draw rectangle";
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";

    const selSrc = map.getSource("selection-rectangle");
    if (selSrc) {
        selSrc.setData({
            type: "FeatureCollection",
            features: [],
        });
    }

    // Clear buildings cache + source
    currentBuildingsGeoJSON = {
        type: "FeatureCollection",
        features: [],
    };
    const bSrc = map.getSource("buildings-3d");
    if (bSrc) {
        bSrc.setData(currentBuildingsGeoJSON);
    }

    // Clear buses
    const busSrc = map.getSource("bus-positions");
    if (busSrc) {
        busSrc.setData({
            type: "FeatureCollection",
            features: [],
        });
    }

    console.log("Selection + 3D buildings + buses cleared");
});

toggleSelectionCheckbox.addEventListener("change", (e) => {
    setSelectionVisibility(e.target.checked);
});

toggleBuildingsCheckbox.addEventListener("change", (e) => {
    setBuildingsVisibility(e.target.checked);
});

toggleBusesCheckbox.addEventListener("change", (e) => {
    setBusesVisibility(e.target.checked);
});

// Theme switch (light / dark)
themeSelect.addEventListener("change", (e) => {
    const value = e.target.value; // "light" or "dark"
    const styleUrl = baseStyles[value];
    if (!styleUrl) return;

    // Save current camera state
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    // Reset flag so we can re-set selection visibility later
    selectionLayersReady = false;

    // Switch style
    map.setStyle(styleUrl);

    // When the new style is ready, restore view + re-add custom layers
    map.once("styledata", () => {
        map.jumpTo({ center, zoom, bearing, pitch });
        setupCustomLayers();
    });
});

// ---- 4. Building footprints data (GeoJSON) ----

fetch("sthlm_XL.geojson")
    .then((res) => res.json())
    .then((data) => {
        allBuildings = data;
        console.log("Loaded buildings:", allBuildings.features.length);
    })
    .catch((err) => {
        console.error("Error loading *.geojson file", err);
    });

// ---- 5. Map load ----

map.on("load", () => {
    setupCustomLayers();
    startVehicleLoop();
});

// --- Click / hover on 3D buildings ---

// Change cursor when hovering buildings
map.on("mouseenter", "buildings-3d-layer", () => {
    // Don't override the cursor while drawing / rotating
    if (!isDrawing && !isCustomRotating && !drawModeArmed) {
        map.getCanvas().style.cursor = "pointer";
    }
});

map.on("mouseleave", "buildings-3d-layer", () => {
    if (!isDrawing && !isCustomRotating && !drawModeArmed) {
        map.getCanvas().style.cursor = "";
    }
});

// Click on a building
map.on("click", "buildings-3d-layer", (e) => {
    if (!e.features || !e.features.length) return;

    const feature = e.features[0];
    const featureId = feature.id;

    if (featureId === undefined || featureId === null) {
        console.warn("Clicked building has no id – cannot set feature-state");
        console.log("Clicked building feature.id:", feature.id);
        return;
    }

    // Clear previous selection
    if (lastSelectedBuildingId !== null) {
        map.setFeatureState(
            { source: "buildings-3d", id: lastSelectedBuildingId },
            { selected: false }
        );
    }

    // Mark this building as selected
    map.setFeatureState(
        { source: "buildings-3d", id: featureId },
        { selected: true }
    );
    lastSelectedBuildingId = featureId;

    // Choose a point for the popup: use feature centroid if possible
    let popupLngLat = e.lngLat;
    try {
        const plainFeature = {
            type: "Feature",
            geometry: feature.geometry,
            properties: { ...(feature.properties || {}) },
        };
        const center = turf.centerOfMass(plainFeature);
        if (center && center.geometry && center.geometry.coordinates) {
            const [lng, lat] = center.geometry.coordinates;
            popupLngLat = { lng, lat };
        }
    } catch (_) {
        // fall back to e.lngLat
    }

    const props = feature.properties || {};
    const id = props.id || props.osm_id || "–";
    const height =
        typeof props.height === "number"
            ? `${props.height.toFixed(1)} m`
            : "30 m (default)";

    const name = props.name || props.building || "Building";

    new maplibregl.Popup()
        .setLngLat(popupLngLat)
        .setHTML(
            `<strong>${name}</strong><br/>
             ID: ${id}<br/>
             Height: ${height}`
        )
        .addTo(map);
});

map.on("click", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["buildings-3d-layer"] });
    if (features.length) return; // building click handled above

    if (lastSelectedBuildingId !== null) {
        map.setFeatureState(
            { source: "buildings-3d", id: lastSelectedBuildingId },
            { selected: false }
        );
        lastSelectedBuildingId = null;
    }
});
// ---- 6. Rectangle drawing (camera-aligned) ----

function updateRectangleFromAxes(anchor, a, b) {
    const src = map.getSource("selection-rectangle");
    if (!src || !axisU || !axisV || !anchor || !localCosLat) return;

    // Corners in local coordinates
    const c1 = { x: a * axisU.x, y: a * axisU.y };
    const c3 = { x: b * axisV.x, y: b * axisV.y };
    const c2 = { x: c1.x + c3.x, y: c1.y + c3.y };

    function localToLngLat(pt) {
        return {
            lng: anchor.lng + pt.x / localCosLat,
            lat: anchor.lat + pt.y,
        };
    }

    const A = { lng: anchor.lng, lat: anchor.lat };
    const B = localToLngLat(c1);
    const C = localToLngLat(c2);
    const D = localToLngLat(c3);

    const ring = [
        [A.lng, A.lat],
        [B.lng, B.lat],
        [C.lng, C.lat],
        [D.lng, D.lat],
        [A.lng, A.lat],
    ];

    const rectangleGeoJSON = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "Polygon",
                    coordinates: [ring],
                },
            },
        ],
    };

    src.setData(rectangleGeoJSON);
    currentSelectionRing = ring;
    selectionPolygon = turf.polygon([ring]);
}

// Mouse events for drawing
map.on("mousedown", (e) => {
    if (!drawModeArmed) return;
    if (e.originalEvent.button !== 0) return; // left click only

    isDrawing = true;
    anchorLngLat = e.lngLat;
    currentSelectionRing = null;

    const lat0Rad = (anchorLngLat.lat * Math.PI) / 180;
    localCosLat = Math.cos(lat0Rad);

    const bearingDeg = map.getBearing();
    const bearingRad = (bearingDeg * Math.PI) / 180;

    axisU = {
        x: Math.sin(bearingRad),
        y: Math.cos(bearingRad),
    };
    axisV = {
        x: -axisU.y,
        y: axisU.x,
    };

    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";
});

map.on("mousemove", (e) => {
    if (!isDrawing || !anchorLngLat || !axisU || !axisV || !localCosLat) return;

    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;

    const dX = (lng - anchorLngLat.lng) * localCosLat;
    const dY = (lat - anchorLngLat.lat);

    const a = dX * axisU.x + dY * axisU.y;
    const b = dX * axisV.x + dY * axisV.y;

    updateRectangleFromAxes(anchorLngLat, a, b);
});

map.on("mouseup", () => {
    if (!isDrawing) return;

    isDrawing = false;
    drawModeArmed = false;

    map.dragPan.enable();
    map.getCanvas().style.cursor = "";

    drawButton.classList.remove("active");
    drawButton.textContent = "Draw rectangle";

    if (!currentSelectionRing) return;

    const selectionPoly = turf.polygon([currentSelectionRing]);
    const bbox = turf.bbox(selectionPoly);

    console.log("Selection bbox (degrees):", {
        west: bbox[0],
        south: bbox[1],
        east: bbox[2],
        north: bbox[3],
    });
});

// ---- 7. Custom rotation with right mouse button ----

let isCustomRotating = false;
let lastMousePos = null;
let yawDeg = map.getBearing();
let pitchDeg = map.getPitch();

// Prevent context menu on right-click
map.getCanvas().addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

map.getCanvas().addEventListener("mousedown", (e) => {
    // right mouse button
    if (e.button !== 2) return;
    if (isDrawing || drawModeArmed) return;

    e.preventDefault();
    isCustomRotating = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    map.dragPan.disable();
    map.getCanvas().style.cursor = "grab";
});

window.addEventListener("mousemove", (e) => {
    if (!isCustomRotating || !lastMousePos) return;

    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    lastMousePos = { x: e.clientX, y: e.clientY };

    const yawSpeed = 0.15;
    const pitchSpeed = 0.1;

    yawDeg += dx * yawSpeed;
    pitchDeg -= dy * pitchSpeed;
    pitchDeg = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitchDeg));

    map.setBearing(yawDeg);
    map.setPitch(pitchDeg);
});

window.addEventListener("mouseup", (e) => {
    if (!isCustomRotating) return;
    if (e.button !== 2) return;

    isCustomRotating = false;
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
});

// ---- 8. Build 3D button: filter buildings and extrude ----

build3DButton.addEventListener("click", () => {
    if (!allBuildings) {
        console.warn("Buildings not loaded yet");
        return;
    }
    if (!currentSelectionRing || !selectionPolygon) {
        console.warn("No selection rectangle defined");
        return;
    }

    const selectedFeatures = allBuildings.features
        .filter((f) => turf.booleanIntersects(f, selectionPolygon))
        .map((f, idx) => {
            const baseProps = f.properties || {};
            const newId = f.id ?? baseProps.id ?? idx;

            return {
                type: "Feature",
                geometry: f.geometry,
                properties: {
                    ...baseProps,
                    id: newId,      // <-- needed for promoteId: "id"
                },
                id: newId,          // <-- helpful for queryRenderedFeatures
            };
        });

    const selectedCollection = {
        type: "FeatureCollection",
        features: selectedFeatures,
    };

    console.log(
        `Selected ${selectedFeatures.length} buildings inside camera-aligned rectangle`
    );

    currentBuildingsGeoJSON = selectedCollection;

    const src = map.getSource("buildings-3d");
    if (src) {
        src.setData(currentBuildingsGeoJSON);
    }

    // reset any previous selection state (since we rebuilt features)
    if (lastSelectedBuildingId !== null) {
        map.removeFeatureState?.({
            source: "buildings-3d",
            id: lastSelectedBuildingId,
        });
        lastSelectedBuildingId = null;
    }

    if (selectedFeatures.length > 0) {
        const bbox = turf.bbox(selectedCollection);
        map.fitBounds(
            [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[3]],
            ],
            { padding: 40 }
        );
    }

    // Enable buses only after we have built 3D in this area
    busesEnabled = true;
    setBuildingsVisibility(toggleBuildingsCheckbox.checked);
    setBusesVisibility(toggleBusesCheckbox.checked);
});


// ---- 9. Vehicle fetching + interpolation ----

async function fetchVehiclesSnapshot() {
    try {
        const res = await fetch("/api/vehicles");
        if (!res.ok) {
            console.warn("Failed to fetch /api/vehicles:", res.status);
            return;
        }

        const data = await res.json();
        if (!data.vehicles) {
            console.warn("No vehicles in response");
            return;
        }

        prevVehicles = currVehicles;
        currVehicles = new Map();

        for (const v of data.vehicles) {
            if (typeof v.lon !== "number" || typeof v.lat !== "number") continue;
            currVehicles.set(v.id || `${v.lon},${v.lat}`, {
                lon: v.lon,
                lat: v.lat,
                routeId: v.routeId,
                tripId: v.tripId,
                bearing: v.bearing,
                speed: v.speed,
            });
        }

        animationStartTime = performance.now();

        console.log(
            `Fetched snapshot: ${currVehicles.size} vehicles (prev: ${prevVehicles.size})`
        );
    } catch (err) {
        console.error("Error fetching vehicle positions:", err);
    }
}

function startVehicleLoop() {
    fetchVehiclesSnapshot();
    setInterval(fetchVehiclesSnapshot, POLL_INTERVAL_MS);
    animateVehicles();
}

function animateVehicles() {
    const now = performance.now();
    const elapsed = now - animationStartTime;
    const tRaw = elapsed / ANIMATION_DURATION_MS;
    const tClamped = Math.max(0, Math.min(1, tRaw));
    const t = tClamped * tClamped * (3 - 2 * tClamped); // easing

    const src = map.getSource("bus-positions");

    // No selection, buses not enabled, or user hid buses → nothing
    if (src && (!selectionPolygon || !busesEnabled || !busesVisible)) {
        src.setData({
            type: "FeatureCollection",
            features: [],
        });
        requestAnimationFrame(animateVehicles);
        return;
    }

    if (src && selectionPolygon && busesEnabled && busesVisible) {
        const features = [];

        for (const [id, curr] of currVehicles.entries()) {
            const prev = prevVehicles.get(id) || curr;

            const lon = prev.lon + (curr.lon - prev.lon) * t;
            const lat = prev.lat + (curr.lat - prev.lat) * t;

            const pt = turf.point([lon, lat]);
            if (!turf.booleanPointInPolygon(pt, selectionPolygon)) {
                continue;
            }

            features.push({
                type: "Feature",
                properties: {
                    id,
                    routeId: curr.routeId,
                    tripId: curr.tripId,
                    bearing: curr.bearing,
                    speed: curr.speed,
                },
                geometry: {
                    type: "Point",
                    coordinates: [lon, lat],
                },
            });
        }

        src.setData({
            type: "FeatureCollection",
            features,
        });
    }

    requestAnimationFrame(animateVehicles);
}
