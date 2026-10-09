// Geographic reference layer: real-world lat/long as a display translation
// over game meters. Delegates to the Tamil Nadu projection (single source
// of truth) so the readout, map corners, and editor cursor always agree
// exactly with the terrain mask and district lookup.
//
// Axis convention (locked to the north-up minimap): +X = east, -Z = north.

import { gameToLatLon, latLonToGame, TN_CENTER } from "./tamilnadu";

export interface GeoAnchor {
  lat: number;
  lon: number;
}

/** Real-world point equal to game position (0, 0): the TN projection center. */
export const GEO_ANCHOR: GeoAnchor = { lat: TN_CENTER.lat, lon: TN_CENTER.lon };

export function metersToLatLong(
  x: number,
  z: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  anchor: GeoAnchor = GEO_ANCHOR,
): { lat: number; lon: number } {
  // Anchor is fixed to the projection center; the transform is the exact
  // inverse of latLonToGame, so round-trips never drift.
  return gameToLatLon(x, z);
}

export function latLongToMeters(
  lat: number,
  lon: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  anchor: GeoAnchor = GEO_ANCHOR,
): { x: number; z: number } {
  return latLonToGame(lon, lat);
}

/** e.g. `27.71720°N 85.32400°E` (~1m precision at 5 decimals). */
export function formatLatLong(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(5)}°${lon >= 0 ? "E" : "W"}`;
  return `${la} ${lo}`;
}
