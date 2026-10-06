// Center-bottom interaction prompt ("Press E to ride").

"use client";

export default function InteractionPrompt({
  visible,
  text,
}: {
  visible: boolean;
  text: string;
}) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center select-none">
      <div className="animate-bounce rounded-full border border-white/20 bg-black/60 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm">
        Press <span className="font-mono text-amber-300">E</span> {text}
      </div>
    </div>
  );
}
