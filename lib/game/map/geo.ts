// Geographic reference layer: real-world lat/long as a display translation
// over game meters. Meters stay canonical (exact, stored in map files);
// lat/long is always derived, never stored, so round-trips never drift.
//
// Axis convention (locked to the north-up minimap): +X = east, -Z = north.

export interface GeoAnchor {
  lat: number;
  lon: number;
}

/** Real-world point equal to game position (0, 0). Move this to your site. */
export const GEO_ANCHOR: GeoAnchor = { lat: 0, lon: 0 };

const METERS_PER_DEG_LAT = 111320;

export function metersToLatLong(
  x: number,
  z: number,
  anchor: GeoAnchor = GEO_ANCHOR,
): { lat: number; lon: number } {
  return {
    lat: anchor.lat - z / METERS_PER_DEG_LAT,
    lon:
      anchor.lon +
      x / (METERS_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180)),
  };
}

export function latLongToMeters(
  lat: number,
  lon: number,
  anchor: GeoAnchor = GEO_ANCHOR,
): { x: number; z: number } {
  const kx = METERS_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180);
  return {
    x: (lon - anchor.lon) * kx,
    z: -(lat - anchor.lat) * METERS_PER_DEG_LAT,
  };
}

/** e.g. `27.71720°N 85.32400°E` (~1m precision at 5 decimals). */
export function formatLatLong(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(5)}°${lon >= 0 ? "E" : "W"}`;
  return `${la} ${lo}`;
}
