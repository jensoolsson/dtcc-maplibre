// ---- 1. Map setup ----

const MAX_PITCH = 80; // or 85
const MIN_PITCH = 0;

const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    center: [18.0686, 59.3293], // Stockholm
    zoom: 13,
    pitch: 60,        // start a bit more tilted
    bearing: -60,
    maxPitch: MAX_PITCH, // allow more tilt towards horizon
    minPitch: MIN_PITCH, // optional, default is 0
});


map.addControl(new maplibregl.NavigationControl());

// Turn off built-in drag rotate so it doesn't fight us
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();

// ---- 2. Rectangle draw state ----

let isDrawing = false;
let drawModeArmed = false;

// Anchor corner (first click) in lng/lat
let anchorLngLat = null;

// Local scaling: cos(lat0) for this anchor
let localCosLat = null;

// Camera-aligned axes in local (X,Y) space
let axisU = null; // { x, y }
let axisV = null; // { x, y }

// Last rectangle ring used for selection (array of [lng, lat])
let currentSelectionRing = null;

// Turf polygon built from the selection ring (or null if none)
let selectionPolygon = null;

// Whether buses should be shown (only after Build 3D)
let busesEnabled = false;

// Visibility flags from checkboxes
let buildingsVisible = true;
let busesVisible = true;

// --- Vehicle interpolation state ---

// Maps vehicle id -> { lon, lat }
let prevVehicles = new Map();
let currVehicles = new Map();

// Timing for interpolation
let animationStartTime = performance.now();
const POLL_INTERVAL_MS = 5000;        // how often you poll /api/vehicles
const ANIMATION_DURATION_MS = 4500;    // how long to interpolate between snapshots

const drawButton = document.getElementById("drawButton");
const clearButton = document.getElementById("clearButton");
const build3DButton = document.getElementById("build3DButton");
const toggleSelectionCheckbox = document.getElementById("toggleSelection");
const toggleBuildingsCheckbox = document.getElementById("toggleBuildings");
const toggleBusesCheckbox = document.getElementById("toggleBuses");

// Arm drawing when button is clicked
drawButton.addEventListener("click", () => {
    drawModeArmed = true;
    drawButton.classList.add("active");
    drawButton.textContent = "Click + drag to draw";
});

// Clear selection
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

    const src = map.getSource("selection-rectangle");
    if (src) {
        src.setData({
            type: "FeatureCollection",
            features: [],
        });
    }

    // Also clear 3D buildings
    const bSrc = map.getSource("buildings-3d");
    if (bSrc) {
        bSrc.setData({
            type: "FeatureCollection",
            features: [],
        });
    }

    const busSrc = map.getSource("bus-positions");
    if (busSrc) {
        busSrc.setData({ type: "FeatureCollection", features: [] });
    }

    console.log("Selection + 3D buildings + buses cleared");
});


let selectionLayersReady = false;

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
    if (map.getLayer("buildings-3d-layer")) {
        map.setLayoutProperty(
            "buildings-3d-layer",
            "visibility",
            show ? "visible" : "none"
        );
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

toggleSelectionCheckbox.addEventListener("change", (e) => {
    setSelectionVisibility(e.target.checked);
});

toggleBuildingsCheckbox.addEventListener("change", (e) => {
    setBuildingsVisibility(e.target.checked);
});

toggleBusesCheckbox.addEventListener("change", (e) => {
    setBusesVisibility(e.target.checked);
});

// ---- 3. Building footprints data (GeoJSON) ----

let allBuildings = null;

// Load your buildings dataset (adjust path as needed)
// This should be a FeatureCollection of building polygons.
fetch("sthlm_XL.geojson")
    .then((res) => res.json())
    .then((data) => {
        allBuildings = data;
        console.log("Loaded buildings:", allBuildings.features.length);
    })
    .catch((err) => {
        console.error("Error loading *.geojson file", err);
    });

// ---- 4. Sources + layers ----

map.on("load", () => {
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

    // 3D buildings layer (initially empty)
    map.addSource("buildings-3d", {
        type: "geojson",
        data: {
            type: "FeatureCollection",
            features: [],
        },
    });

    map.addLayer({
        id: "buildings-3d-layer",
        type: "fill-extrusion",
        source: "buildings-3d",
        paint: {
            "fill-extrusion-color": "#888888",
            "fill-extrusion-height": 30, // constant height in metres
            "fill-extrusion-opacity": 0.8,
        },
    });

    // Mark selection layers as ready and sync with checkbox
    selectionLayersReady = true;
    setSelectionVisibility(toggleSelectionCheckbox.checked);
    setBuildingsVisibility(toggleBuildingsCheckbox.checked);
    setBusesVisibility(toggleBusesCheckbox.checked);

    // --- Live bus positions (initially empty) ---
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

    // Start polling vehicle positions
    startVehicleLoop();


});

function updateRectangleFromAxes(anchor, a, b) {
    const src = map.getSource("selection-rectangle");
    if (!src || !axisU || !axisV || !anchor || !localCosLat) return;

    // Corners in *local* coordinates
    const c0 = { x: 0, y: 0 }; // anchor
    const c1 = { x: a * axisU.x, y: a * axisU.y };
    const c3 = { x: b * axisV.x, y: b * axisV.y };
    const c2 = { x: c1.x + c3.x, y: c1.y + c3.y }; // stays under mouse

    // Convert local (X,Y) back to lng/lat
    function localToLngLat(pt) {
        return {
            lng: anchor.lng + pt.x / localCosLat,
            lat: anchor.lat + pt.y,
        };
    }

    const A = { lng: anchor.lng, lat: anchor.lat }; // anchor itself
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

// Helper to update rectangle source
function updateRectangleSource(bounds) {
    const src = map.getSource("selection-rectangle");
    if (!src) return;

    const [minLng, minLat, maxLng, maxLat] = bounds;

    const rectangleGeoJSON = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [minLng, minLat],
                            [maxLng, minLat],
                            [maxLng, maxLat],
                            [minLng, maxLat],
                            [minLng, minLat],
                        ],
                    ],
                },
            },
        ],
    };

    src.setData(rectangleGeoJSON);
}

// ---- 5. Mouse events for custom rotation ----

let isCustomRotating = false;
let lastMousePos = null;

// Explicit yaw/pitch state (deg)
let yawDeg = map.getBearing();   // yaw around vertical (north)
let pitchDeg = map.getPitch();   // pitch (0 = top-down)

// Prevent the context menu on right-click
map.getCanvas().addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
    if (!isCustomRotating || !lastMousePos) return;

    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    lastMousePos = { x: e.clientX, y: e.clientY };

    // Sensitivity – tweak these to taste
    const yawSpeed = 0.15;    // deg per pixel horizontally
    const pitchSpeed = 0.1;  // deg per pixel vertically

    // Yaw (bearing): horizontal drag
    yawDeg += dx * yawSpeed;

    // Pitch: vertical drag
    pitchDeg -= dy * pitchSpeed;
    pitchDeg = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitchDeg));

    map.setBearing(yawDeg);
    map.setPitch(pitchDeg);
});

window.addEventListener("mouseup", (e) => {
    if (!isCustomRotating) return;
    // Only end when right button is released
    if (e.button !== 2) return;

    isCustomRotating = false;
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
});

// Start rotate on right mouse down
map.getCanvas().addEventListener("mousedown", (e) => {
    // 2 = right mouse button
    if (e.button !== 2) return;

    // Don't rotate while drawing a selection rectangle
    if (isDrawing || drawModeArmed) return;

    e.preventDefault();
    isCustomRotating = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    map.dragPan.disable();
    map.getCanvas().style.cursor = "grab";
});


// ---- 5. Mouse events for drawing ----

map.on("mousedown", (e) => {
    if (!drawModeArmed) return;
    if (e.originalEvent.button !== 0) return; // left click only

    isDrawing = true;
    anchorLngLat = e.lngLat;
    currentSelectionRing = null;

    // Local scaling based on anchor latitude
    const lat0Rad = (anchorLngLat.lat * Math.PI) / 180;
    localCosLat = Math.cos(lat0Rad);

    // Map bearing in radians (clockwise from north)
    const bearingDeg = map.getBearing();
    const bearingRad = (bearingDeg * Math.PI) / 180;

    // In local coordinates: X ≈ east, Y ≈ north
    // Unit vector u along bearing
    axisU = {
        x: Math.sin(bearingRad),
        y: Math.cos(bearingRad),
    };

    // v is perpendicular to u
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

    // Convert P to *local* coordinates relative to anchor
    const dX = (lng - anchorLngLat.lng) * localCosLat; // east-west, scaled
    const dY = (lat - anchorLngLat.lat);               // north-south

    // d in local coords
    // Decompose d into components along u and v
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


// ---- 6. Build 3D button: filter buildings and extrude ----

build3DButton.addEventListener("click", () => {
    if (!allBuildings) {
        console.warn("Buildings not loaded yet");
        return;
    }
    if (!currentSelectionRing) {
        console.warn("No selection rectangle defined");
        return;
    }

    const selectionPoly = turf.polygon([currentSelectionRing]);

    const selectedFeatures = allBuildings.features.filter((f) =>
        turf.booleanIntersects(f, selectionPoly)
    );

    const selectedCollection = {
        type: "FeatureCollection",
        features: selectedFeatures,
    };

    console.log(
        `Selected ${selectedFeatures.length} buildings inside camera-aligned rectangle`
    );

    const src = map.getSource("buildings-3d");
    if (src) {
        src.setData(selectedCollection);
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
    // Respect current checkbox state
    setBusesVisibility(toggleBusesCheckbox.checked);
    setBuildingsVisibility(toggleBuildingsCheckbox.checked);
});


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

        // Shift current -> previous
        prevVehicles = currVehicles;
        currVehicles = new Map();

        // Fill currVehicles from new snapshot
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

        // Reset interpolation window
        animationStartTime = performance.now();

        console.log(
            `Fetched snapshot: ${currVehicles.size} vehicles (prev: ${prevVehicles.size})`
        );
    } catch (err) {
        console.error("Error fetching vehicle positions:", err);
    }
}

// Main loop: fetch every POLL_INTERVAL_MS and animate continuously
function startVehicleLoop() {
    // Kick off first fetch
    fetchVehiclesSnapshot();

    // Poll regularly
    setInterval(fetchVehiclesSnapshot, POLL_INTERVAL_MS);

    // Start animation frame loop
    animateVehicles();
}

function animateVehicles() {
    const now = performance.now();
    const elapsed = now - animationStartTime;
    const tRaw = elapsed / ANIMATION_DURATION_MS;
    const tClamped = Math.max(0, Math.min(1, tRaw));
    const t = tClamped * tClamped * (3 - 2 * tClamped); // easing

    const src = map.getSource("bus-positions");

    if (src && (!selectionPolygon || !busesEnabled)) {
        src.setData({
            type: "FeatureCollection",
            features: [],
        });
        requestAnimationFrame(animateVehicles);
        return;
    }

    if (src && selectionPolygon && busesEnabled) {
        const features = [];

        for (const [id, curr] of currVehicles.entries()) {
            const prev = prevVehicles.get(id) || curr;

            const lon = prev.lon + (curr.lon - prev.lon) * t;
            const lat = prev.lat + (curr.lat - prev.lat) * t;

            // Only keep vehicles inside the selection polygon
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

        const geojson = {
            type: "FeatureCollection",
            features,
        };

        src.setData(geojson);
    }

    requestAnimationFrame(animateVehicles);
}


