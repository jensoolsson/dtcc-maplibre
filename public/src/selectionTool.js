// src/selectionTool.js

export function createSelectionTool(map, state, ui) {
    function getSelectionSource() {
        return map.getSource("selection-rectangle");
    }

    function setEmptySelection() {
        getSelectionSource()?.setData({ type: "FeatureCollection", features: [] });
    }

    function updateRectangleFromAxes(anchor, a, b) {
        const src = getSelectionSource();
        if (!src || !state.axisU || !state.axisV || !anchor || !state.localCosLat) return;

        const c1 = { x: a * state.axisU.x, y: a * state.axisU.y };
        const c3 = { x: b * state.axisV.x, y: b * state.axisV.y };
        const c2 = { x: c1.x + c3.x, y: c1.y + c3.y };

        const localToLngLat = (pt) => ({
            lng: anchor.lng + pt.x / state.localCosLat,
            lat: anchor.lat + pt.y,
        });

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

        src.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: { type: "Polygon", coordinates: [ring] },
                },
            ],
        });

        state.currentSelectionRing = ring;
        state.selectionPolygon = turf.polygon([ring]);
    }

    function arm() {
        state.drawModeArmed = true;
        map.dragPan.disable();
        map.getCanvas().style.cursor = "crosshair";
    }

    function clear() {
        state.isDrawing = false;
        state.drawModeArmed = false;
        state.anchorLngLat = null;
        state.localCosLat = null;
        state.axisU = null;
        state.axisV = null;
        state.currentSelectionRing = null;
        state.selectionPolygon = null;

        setEmptySelection();
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
    }

    // Important: style reload nukes sources/layers; cancel any ongoing interaction
    map.on("style.load", () => {
        console.log("map.on(style.load) in selectionTool");
        state.isDrawing = false;
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
    });

    map.on("mousedown", (e) => {
        if (!state.drawModeArmed) return;
        if (e.originalEvent.button !== 0) return;

        // If the selection source doesn't exist (e.g. right after setStyle),
        // don't start drawing. This is the main fix.
        const src = getSelectionSource();
        if (!src) {
            console.warn('Selection source missing ("selection-rectangle"). Did setupCustomLayers run after style change?');
            // Reset UI/interaction so we don't get stuck
            state.drawModeArmed = false;
            ui.drawButton?.classList.remove("active");
            ui.drawButton && (ui.drawButton.textContent = "Draw rectangle");
            map.dragPan.enable();
            map.getCanvas().style.cursor = "";
            return;
        }

        state.isDrawing = true;
        state.anchorLngLat = e.lngLat;
        state.currentSelectionRing = null;

        const lat0Rad = (state.anchorLngLat.lat * Math.PI) / 180;
        state.localCosLat = Math.cos(lat0Rad);

        const bearingRad = (map.getBearing() * Math.PI) / 180;
        state.axisU = { x: Math.sin(bearingRad), y: Math.cos(bearingRad) };
        state.axisV = { x: -state.axisU.y, y: state.axisU.x };

        map.dragPan.disable();
        map.getCanvas().style.cursor = "crosshair";
    });

    map.on("mousemove", (e) => {
        if (!state.isDrawing || !state.anchorLngLat || !state.axisU || !state.axisV || !state.localCosLat) return;

        // If style changed mid-drag, source might be gone; just abort cleanly.
        if (!getSelectionSource()) {
            clear();
            return;
        }

        const dX = (e.lngLat.lng - state.anchorLngLat.lng) * state.localCosLat;
        const dY = e.lngLat.lat - state.anchorLngLat.lat;

        const a = dX * state.axisU.x + dY * state.axisU.y;
        const b = dX * state.axisV.x + dY * state.axisV.y;

        updateRectangleFromAxes(state.anchorLngLat, a, b);
    });

    map.on("mouseup", () => {
        if (!state.isDrawing) return;

        state.isDrawing = false;
        state.drawModeArmed = false;

        map.dragPan.enable();
        map.getCanvas().style.cursor = "";

        ui.drawButton?.classList.remove("active");
        ui.drawButton && (ui.drawButton.textContent = "Draw rectangle");

        if (state.currentSelectionRing) {
            ui.showBuildOptions?.(true);
            console.log("Selection rectangle defined, showing build options");
        }

    });

    return { arm, clear };
}
