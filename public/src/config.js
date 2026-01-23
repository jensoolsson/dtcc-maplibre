export const MAX_PITCH = 85;
export const MIN_PITCH = 0;

export const POLL_INTERVAL_MS = 5000;
export const ANIMATION_DURATION_MS = 4500;

export const baseStyles = {
    light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    default: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
};

// Map style key -> UI theme key (or label)
export const uiThemes = {
    light: "light",
    dark: "dark",
    default: "light",
};

export const uiSky = {
    light: {
        "sky-color": "#b1b7c0",
        "horizon-color": "#f8fbff",
        "sky-horizon-blend": 0.85,
        "fog-color": "#999ba2",
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.15
    },
    dark: {
        "sky-color": "#07162e",
        "horizon-color": "#0b2c5e",
        "sky-horizon-blend": 0.85,
        "fog-color": "#050814",
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.15
    },
    default: {
        "sky-color": "#68a0f9",
        "horizon-color": "#f8fbff",
        "sky-horizon-blend": 0.85,
        "fog-color": "#999ba2",
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.15
    },
};


export const initialView = {
    center: [18.0686, 59.3293],
    zoom: 13,
    pitch: 60,
    bearing: -60,
};