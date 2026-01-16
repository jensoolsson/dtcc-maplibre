// src/state.js

export function createState() {
    return {
        // Selection drawing
        isDrawing: false,
        drawModeArmed: false,
        anchorLngLat: null,
        localCosLat: null,
        axisU: null,
        axisV: null,
        currentSelectionRing: null, // [[lng,lat], ...]
        selectionPolygon: null,     // turf polygon (or null)

        // Buildings
        allBuildings: null,
        currentBuildingsGeoJSON: { type: "FeatureCollection", features: [] },
        lastSelectedBuildingId: null,

        // Buses
        busesEnabled: false,
        buildingsVisible: true,
        busesVisible: true,

        // Selection visibility
        selectionLayersReady: false,

        // Rotation
        isCustomRotating: false,
        lastMousePos: null,
        yawDeg: null,
        pitchDeg: null,

        // Vehicles interpolation
        prevVehicles: new Map(),
        currVehicles: new Map(),
        animationStartTime: performance.now(),
    };
}
