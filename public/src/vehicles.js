// src/vehicles.js

import { POLL_INTERVAL_MS, ANIMATION_DURATION_MS } from "./config.js";

export function startVehicleLoop(map, state) {
    fetchVehiclesSnapshot(map, state);
    setInterval(() => fetchVehiclesSnapshot(map, state), POLL_INTERVAL_MS);
    animateVehicles(map, state);
}

async function fetchVehiclesSnapshot(map, state) {
    try {
        const res = await fetch("/api/vehicles");
        if (!res.ok) return;

        const data = await res.json();
        if (!data.vehicles) return;

        state.prevVehicles = state.currVehicles;
        state.currVehicles = new Map();

        for (const v of data.vehicles) {
            if (typeof v.lon !== "number" || typeof v.lat !== "number") continue;
            state.currVehicles.set(v.id || `${v.lon},${v.lat}`, {
                lon: v.lon,
                lat: v.lat,
                routeId: v.routeId,
                tripId: v.tripId,
                bearing: v.bearing,
                speed: v.speed,
            });
        }

        state.animationStartTime = performance.now();
    } catch (err) {
        console.error("Error fetching vehicle positions:", err);
    }
}

function animateVehicles(map, state) {
    const now = performance.now();
    const elapsed = now - state.animationStartTime;
    const tRaw = elapsed / ANIMATION_DURATION_MS;
    const tClamped = Math.max(0, Math.min(1, tRaw));
    const t = tClamped * tClamped * (3 - 2 * tClamped);

    const src = map.getSource("bus-positions");

    // Hide buses unless enabled + selection exists + checkbox on
    if (src && (!state.selectionPolygon || !state.busesEnabled || !state.busesVisible)) {
        src.setData({ type: "FeatureCollection", features: [] });
        requestAnimationFrame(() => animateVehicles(map, state));
        return;
    }

    if (src) {
        const features = [];

        for (const [id, curr] of state.currVehicles.entries()) {
            const prev = state.prevVehicles.get(id) || curr;
            const lon = prev.lon + (curr.lon - prev.lon) * t;
            const lat = prev.lat + (curr.lat - prev.lat) * t;

            const pt = turf.point([lon, lat]);
            if (!turf.booleanPointInPolygon(pt, state.selectionPolygon)) continue;

            features.push({
                type: "Feature",
                properties: { id, routeId: curr.routeId, tripId: curr.tripId, bearing: curr.bearing, speed: curr.speed },
                geometry: { type: "Point", coordinates: [lon, lat] },
            });
        }

        src.setData({ type: "FeatureCollection", features });
    }

    requestAnimationFrame(() => animateVehicles(map, state));
}
