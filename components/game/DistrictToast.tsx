// District indicator: a persistent bottom-center chip with the current
// district, plus a "Welcome to X" toast each time the player rides into a
// new district. Driven by the `district` prop (polled in Game via
// useCurrentDistrict).

"use client";

import { useEffect, useRef, useState } from "react";

export default function DistrictToast({
  district,
}: {
  district: string | null;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const prev = useRef<string | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (district && district !== prev.current) {
      prev.current = district;
      setToast(district);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 2800);
    } else if (!district) {
      prev.current = null;
      setToast(null);
    }
    return () => window.clearTimeout(timer.current);
  }, [district]);

  return (
    <>
      {/* Welcome toast on district change */}
      {toast && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 select-none">
          <div className="flex flex-col items-center rounded-2xl border border-white/15 bg-black/65 px-6 py-2.5 shadow-xl backdrop-blur-sm">
            <span className="text-[10px] font-bold tracking-[0.2em] text-amber-300 uppercase">
              Welcome to
            </span>
            <span className="text-xl font-black tracking-wide text-white">
              {toast}
            </span>
          </div>
        </div>
      )}
      {/* Persistent current-district chip */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 select-none">
        <div className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-3.5 py-1.5 shadow-md backdrop-blur-sm">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[#ea4335]"
          >
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
              fill="currentColor"
            />
          </svg>
          <span className="text-xs font-bold text-[#3c4043]">
            {district ?? "Ocean"}
          </span>
        </div>
      </div>
    </>
  );
}
