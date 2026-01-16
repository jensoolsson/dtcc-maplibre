// src/map.js

import { MAX_PITCH, MIN_PITCH, initialView } from "./config.js";

export function createMap(styleUrl) {
    const map = new maplibregl.Map({
        container: "map",
        style: styleUrl,
        center: initialView.center,
        zoom: initialView.zoom,
        pitch: initialView.pitch,
        bearing: initialView.bearing,
        maxPitch: MAX_PITCH,
        minPitch: MIN_PITCH,
    });

    map.addControl(new maplibregl.NavigationControl());

    // Turn off built-in rotate (we use right mouse rotation)
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    return map;
}
