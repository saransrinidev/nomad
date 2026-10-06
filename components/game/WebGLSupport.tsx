// WebGL failure handling: if the browser cannot create a GL context (broken
// drivers, blocklisted GPU, disabled acceleration), the Canvas throws during
// mount. This boundary steps the renderer down (full → minimal → help
// screen) instead of crashing the page.

"use client";

import { Component, type ReactNode } from "react";

export class CanvasErrorBoundary extends Component<{
  onError: () => void;
  children: ReactNode;
}> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function WebGLHelpScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b1220] p-6 select-none">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 p-6 text-white">
        <h2 className="text-lg font-black tracking-wide">3D could not start</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">
          Your browser reported that it cannot create a WebGL context — the
          graphics driver offered no usable configuration. Nomad needs WebGL
          to render. This is a device/browser issue, not a game bug. Try:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-white/85">
          <li>Turn on hardware acceleration in your browser settings, then restart it.</li>
          <li>Update your graphics drivers to the latest version.</li>
          <li>Close other tabs or apps using the GPU and reload.</li>
          <li>Try the latest Chrome or Edge, which bundles its own software WebGL fallback.</li>
        </ol>
        <button
          onClick={onRetry}
          className="mt-5 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
