"use client";

/**
 * Bottom-left legend teaching the visual language (PLAN.md section 40).
 * W0 ships a placeholder list; W6 owns the finished legend.
 */

const ENTRIES = [
  ["Buildings", "files and modules"],
  ["Districts", "codebase areas"],
  ["Incidents", "open issues"],
  ["Construction", "pull requests"],
  ["Power station", "continuous integration"],
] as const;

export default function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-5 left-5 select-none rounded-lg border border-white/10 bg-black/35 p-3 text-xs text-white/60 backdrop-blur">
      <p className="mb-2 font-semibold tracking-[0.3em] text-white/50">LEGEND</p>
      <ul className="space-y-1">
        {ENTRIES.map(([term, meaning]) => (
          <li key={term}>
            <span className="text-white/80">{term}</span>
            <span className="text-white/40"> &middot; {meaning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
