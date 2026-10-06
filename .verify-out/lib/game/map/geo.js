"use strict";
// Geographic reference layer: real-world lat/long as a display translation
// over game meters. Meters stay canonical (exact, stored in map files);
// lat/long is always derived, never stored, so round-trips never drift.
//
// Axis convention (locked to the north-up minimap): +X = east, -Z = north.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEO_ANCHOR = void 0;
exports.metersToLatLong = metersToLatLong;
exports.latLongToMeters = latLongToMeters;
exports.formatLatLong = formatLatLong;
/** Real-world point equal to game position (0, 0). Move this to your site. */
exports.GEO_ANCHOR = { lat: 0, lon: 0 };
const METERS_PER_DEG_LAT = 111320;
function metersToLatLong(x, z, anchor = exports.GEO_ANCHOR) {
    return {
        lat: anchor.lat - z / METERS_PER_DEG_LAT,
        lon: anchor.lon +
            x / (METERS_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180)),
    };
}
function latLongToMeters(lat, lon, anchor = exports.GEO_ANCHOR) {
    const kx = METERS_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180);
    return {
        x: (lon - anchor.lon) * kx,
        z: -(lat - anchor.lat) * METERS_PER_DEG_LAT,
    };
}
/** e.g. `27.71720°N 85.32400°E` (~1m precision at 5 decimals). */
function formatLatLong(lat, lon) {
    const la = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}`;
    const lo = `${Math.abs(lon).toFixed(5)}°${lon >= 0 ? "E" : "W"}`;
    return `${la} ${lo}`;
}
