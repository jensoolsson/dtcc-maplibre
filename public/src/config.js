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


export const initialView = {
    center: [18.0686, 59.3293],
    zoom: 13,
    pitch: 60,
    bearing: -60,
};