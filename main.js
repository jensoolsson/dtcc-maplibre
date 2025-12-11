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

// ---- 2. Rectangle draw state ----

let isDrawing = false;
let drawModeArmed = false;
let startLngLat = null;
let currentBounds = null; // [minLng, minLat, maxLng, maxLat]

const drawButton = document.getElementById("drawButton");
const clearButton = document.getElementById("clearButton");
const build3DButton = document.getElementById("build3DButton");
const toggleSelectionCheckbox = document.getElementById("toggleSelection");

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
    startLngLat = null;
    currentBounds = null;

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

    console.log("Selection + 3D cleared");
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

toggleSelectionCheckbox.addEventListener("change", (e) => {
    setSelectionVisibility(e.target.checked);
});

// ---- 3. Building footprints data (GeoJSON) ----

let allBuildings = null;

// Load your buildings dataset (adjust path as needed)
// This should be a FeatureCollection of building polygons.
fetch("data/sthlm_XL.geojson")
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
});

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

// ---- 5. Mouse events for drawing ----

map.on("mousedown", (e) => {
    if (!drawModeArmed) return;
    if (e.originalEvent.button !== 0) return; // left click only

    isDrawing = true;
    startLngLat = e.lngLat;
    currentBounds = [
        startLngLat.lng,
        startLngLat.lat,
        startLngLat.lng,
        startLngLat.lat,
    ];

    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";

    updateRectangleSource(currentBounds);
});

map.on("mousemove", (e) => {
    if (!isDrawing || !startLngLat) return;

    const end = e.lngLat;
    const minLng = Math.min(startLngLat.lng, end.lng);
    const maxLng = Math.max(startLngLat.lng, end.lng);
    const minLat = Math.min(startLngLat.lat, end.lat);
    const maxLat = Math.max(startLngLat.lat, end.lat);

    currentBounds = [minLng, minLat, maxLng, maxLat];
    updateRectangleSource(currentBounds);
});

map.on("mouseup", () => {
    if (!isDrawing) return;

    isDrawing = false;
    drawModeArmed = false;

    map.dragPan.enable();
    map.getCanvas().style.cursor = "";

    drawButton.classList.remove("active");
    drawButton.textContent = "Draw rectangle";

    if (!currentBounds) return;

    const [minLng, minLat, maxLng, maxLat] = currentBounds;
    console.log("Rectangle (degrees):", {
        west: minLng,
        south: minLat,
        east: maxLng,
        north: maxLat,
    });
});

// ---- 6. Build 3D button: filter buildings and extrude ----

build3DButton.addEventListener("click", () => {
    if (!allBuildings) {
        console.warn("Buildings not loaded yet");
        return;
    }
    if (!currentBounds) {
        console.warn("No selection rectangle defined");
        return;
    }

    const [minLng, minLat, maxLng, maxLat] = currentBounds;

    // Create a polygon from the selection bounds
    const selectionPoly = turf.bboxPolygon(currentBounds);

    // Filter buildings that intersect the selection polygon
    const selectedFeatures = allBuildings.features.filter((f) =>
        turf.booleanIntersects(f, selectionPoly)
    );

    const selectedCollection = {
        type: "FeatureCollection",
        features: selectedFeatures,
    };

    console.log(
        `Selected ${selectedFeatures.length} buildings inside rectangle`
    );

    const src = map.getSource("buildings-3d");
    if (src) {
        src.setData(selectedCollection);
    }

    // Optionally zoom to the selected area/buildings
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
});
