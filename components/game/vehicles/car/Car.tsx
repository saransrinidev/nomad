"use client";

import type { RefObject } from "react";
import type { GameWorld } from "@/lib/game/state";

/**
 * Placeholder for the future drivable car.
 * Drop the car model + controller here:
 *  - visuals in `Car.tsx` (this file)
 *  - tuning in `lib/game/carController.ts` (to be added)
 *  - spawn constants in `lib/game/gameConstants.ts`
 *
 * Kept as a no-op component so `vehicles/car` follows the same
 * per-vehicle folder convention as bike/ and train/:
 *   vehicles/bike/  -> Motorcycle.tsx
 *   vehicles/train/ -> Train.tsx
 *   vehicles/car/   -> Car.tsx (this file)
 */
export default function Car({ worldRef }: { worldRef: RefObject<GameWorld> }) {
  void worldRef;
  return null;
}
