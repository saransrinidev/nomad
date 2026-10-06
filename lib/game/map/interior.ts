// Shared interior-room geometry + per-type theming. Used by both the on-foot
// controller (for wall collision + exit-door detection) and the Interior
// scene component (for rendering), so the collision box always matches the art.

import type { BuildingType } from "./village";

/** Interior room half-extents (meters). Room spans [-X..X] by [-Z..Z]. */
export const ROOM_HALF_X = 9;
export const ROOM_HALF_Z = 7;
export const ROOM_HEIGHT = 4;
/** Wall thickness used for collision push-out. */
export const WALL_T = 0.4;

/**
 * The exit door is centered on the +Z wall. Standing on it (and pressing E)
 * returns the player outdoors. `EXIT_Z` is where the player spawns on entry.
 */
export const EXIT_Z = ROOM_HALF_Z - 1.2;
export const EXIT_HALF_W = 1.4;

/** Where the player is placed when they enter an interior. */
export const INTERIOR_SPAWN: [number, number, number] = [0, 0, EXIT_Z - 1];

export interface InteriorTheme {
  floor: string;
  wall: string;
  accent: string;
  /** Short title shown on an interior sign. */
  title: string;
}

export const INTERIOR_THEMES: Record<BuildingType, InteriorTheme> = {
  hospital: { floor: "#dfeef0", wall: "#eef6f7", accent: "#e23b3b", title: "Hospital" },
  hotel: { floor: "#5a4632", wall: "#efe3cf", accent: "#c9a227", title: "Hotel Lobby" },
  supermarket: { floor: "#d7d7d7", wall: "#f3f3f0", accent: "#2e9e4f", title: "Supermarket" },
  pharmacy: { floor: "#e6f3f0", wall: "#f1faf8", accent: "#1b9e8a", title: "Pharmacy" },
  restaurant: { floor: "#6b4a2f", wall: "#f0e2d0", accent: "#e2742b", title: "Restaurant" },
  bank: { floor: "#cfd6df", wall: "#eef1f5", accent: "#2d5fa6", title: "Bank" },
  school: { floor: "#d9cfe6", wall: "#f2ecf8", accent: "#8a4fb0", title: "Classroom" },
  house: { floor: "#8d6a44", wall: "#efe6d6", accent: "#8d6a44", title: "Home" },
};
