// src/rotation.js

import { MAX_PITCH, MIN_PITCH } from "./config.js";

export function setupRightMouseRotation(map, state) {
    state.yawDeg = map.getBearing();
    state.pitchDeg = map.getPitch();

    // Prevent context menu
    map.getCanvas().addEventListener("contextmenu", (e) => e.preventDefault());

    map.getCanvas().addEventListener("mousedown", (e) => {
        if (e.button !== 2) return;
        if (state.isDrawing || state.drawModeArmed) return;

        e.preventDefault();
        state.isCustomRotating = true;
        state.lastMousePos = { x: e.clientX, y: e.clientY };
        map.dragPan.disable();
        map.getCanvas().style.cursor = "grab";
    });

    window.addEventListener("mousemove", (e) => {
        if (!state.isCustomRotating || !state.lastMousePos) return;

        const dx = e.clientX - state.lastMousePos.x;
        const dy = e.clientY - state.lastMousePos.y;
        state.lastMousePos = { x: e.clientX, y: e.clientY };

        const yawSpeed = 0.15;
        const pitchSpeed = 0.1;

        state.yawDeg += dx * yawSpeed;
        state.pitchDeg -= dy * pitchSpeed;
        state.pitchDeg = Math.max(MIN_PITCH, Math.min(MAX_PITCH, state.pitchDeg));

        map.setBearing(state.yawDeg);
        map.setPitch(state.pitchDeg);
    });

    window.addEventListener("mouseup", (e) => {
        if (!state.isCustomRotating) return;
        if (e.button !== 2) return;

        state.isCustomRotating = false;
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
    });
}
