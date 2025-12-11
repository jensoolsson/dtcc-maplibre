// server.js
import express from "express";
import fetch from "node-fetch";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const app = express();
const PORT = 3000;

// TODO: replace with your actual Trafiklab GTFS-RT VehiclePositions URL
// Something like: "https://api.trafiklab.se/gtfs-rt/some-feed?key=YOUR_KEY"
const GTFS_RT_URL = "https://opendata.samtrafiken.se/gtfs-rt-sweden/sl/VehiclePositionsSweden.pb?key=c6d0930dfbb14641a61ce21d9d9cf1cb";


// Fetch + decode GTFS-RT and map to a simple JSON structure
async function fetchVehiclePositions() {
    const response = await fetch(GTFS_RT_URL);

    if (!response.ok) {
        throw new Error(`GTFS-RT HTTP error ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
    );

    // Map GTFS-RT entities -> simpler vehicle objects
    const vehicles = [];

    for (const entity of feed.entity) {
        if (!entity.vehicle || !entity.vehicle.position) continue;

        const vp = entity.vehicle;
        const pos = vp.position;

        vehicles.push({
            id: vp.vehicle?.id || entity.id,
            lat: pos.latitude,
            lon: pos.longitude,
            bearing: pos.bearing ?? null,
            speed: pos.speed ?? null,
            routeId: vp.trip?.routeId ?? null,
            tripId: vp.trip?.tripId ?? null,
            timestamp: vp.timestamp ? Number(vp.timestamp) : null,
        });
    }

    return vehicles;
}

// REST endpoint for the frontend
app.get("/api/vehicles", async (req, res) => {
    try {
        const vehicles = await fetchVehiclePositions();
        res.json({ vehicles });
    } catch (err) {
        console.error("Error in /api/vehicles:", err);
        res.status(500).json({ error: "Failed to fetch vehicles" });
    }
});

// Serve static files (your index.html / main.js) from "public" folder, if you want
app.use(express.static("public"));

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
