// src/selectionTool.js

export function createSelectionTool(map, state, ui) {
    function updateRectangleFromAxes(anchor, a, b) {
        const src = map.getSource("selection-rectangle");
        if (!src || !state.axisU || !state.axisV || !anchor || !state.localCosLat) return;

        const c1 = { x: a * state.axisU.x, y: a * state.axisU.y };
        const c3 = { x: b * state.axisV.x, y: b * state.axisV.y };
        const c2 = { x: c1.x + c3.x, y: c1.y + c3.y };

        function localToLngLat(pt) {
            return {
                lng: anchor.lng + pt.x / state.localCosLat,
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

        src.setData({
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                properties: {},
                geometry: { type: "Polygon", coordinates: [ring] },
            }],
        });

        state.currentSelectionRing = ring;
        state.selectionPolygon = turf.polygon([ring]);
    }

    function arm() {
        state.drawModeArmed = true;
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

        const src = map.getSource("selection-rectangle");
        src?.setData({ type: "FeatureCollection", features: [] });
    }

    map.on("mousedown", (e) => {
        if (!state.drawModeArmed) return;
        if (e.originalEvent.button !== 0) return;

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

        const dX = (e.lngLat.lng - state.anchorLngLat.lng) * state.localCosLat;
        const dY = (e.lngLat.lat - state.anchorLngLat.lat);

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

        // UI reset
        ui.drawButton.classList.remove("active");
        ui.drawButton.textContent = "Draw rectangle";
    });

    return { arm, clear };
}
