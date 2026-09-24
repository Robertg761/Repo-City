/**
 * The small pictures in the legend (`lib/client/legend.ts`). One line
 * drawing per term, in the same 24-unit stroke style as the time-of-day
 * icons, sat on a tile tinted with the colour the thing wears in the city:
 * the flame orange of a fire, the sign blue of a signpost, the hi-vis yellow
 * of a crane (the paints in `components/city/backlog/forms.ts`, lifted a
 * little so they read on the dark glass).
 */

import type { ReactNode } from "react";
import type { LegendGlyph } from "@/lib/client/legend";

const TINTS: Record<LegendGlyph, string> = {
  building: "#e6d6b8",
  district: "#ffc36b",
  power: "#ffd35a",
  fireStation: "#ff7a66",
  info: "#7fb0ea",
  transit: "#7fd1b0",
  highway: "#b9c3cc",
  queue: "#a9b4bd",
  incident: "#ffae3a",
  fire: "#ff8a2a",
  roadblock: "#ffb347",
  signpost: "#6fa3e6",
  survey: "#ff7fa0",
  collision: "#f0cc3a",
  wreck: "#cf8656",
  pothole: "#aab0b5",
  crane: "#f0d44a",
  van: "#ece8de",
  hoarding: "#78b894",
  trench: "#d0a56a",
  scaffold: "#d9b98a",
  beacon: "#ff5147",
  stopBoard: "#ff6a5f",
  flag: "#5fd07e",
};

const PATHS: Record<LegendGlyph, ReactNode> = {
  building: <path d="M6 21V5l6-2v18M12 8l6 2v11M4 21h16M9 8v.01M9 12v.01M9 16v.01M15 13v.01M15 17v.01" />,
  district: <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2ZM9 4v14M15 6v14" />,
  power: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  fireStation: <path d="m3 11 9-7 9 7v10H3ZM8 21v-6h8v6M8 18h8" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  transit: (
    <>
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 10.5h12M9.5 14v.01M14.5 14v.01M9 17l-2 4M15 17l2 4" />
    </>
  ),
  highway: <path d="M4 21 10 3M20 21 14 3M12 21v-3M12 14v-3M12 7V5" />,
  queue: (
    <>
      <rect x="2" y="10" width="5.5" height="4.5" rx="1.2" />
      <rect x="9.25" y="10" width="5.5" height="4.5" rx="1.2" />
      <rect x="16.5" y="10" width="5.5" height="4.5" rx="1.2" />
    </>
  ),
  incident: <path d="M12 3 2 20h20ZM12 10v4M12 17v.01" />,
  fire: (
    <path d="M12 21c4 0 7-2.7 7-6.8 0-3.2-2-5.7-4-7.7-.3 2-1.3 3.3-2.6 3.8C12.6 7.5 11.5 5 9 3c.3 3-1.3 4.8-2.7 6.4C5.2 10.8 5 12.4 5 14.2 5 18.3 8 21 12 21Z" />
  ),
  roadblock: (
    <>
      <rect x="3" y="7" width="18" height="6" rx="1" />
      <path d="M9 7 6 13M14 7l-3 6M19 7l-3 6M6 13v7M18 13v7" />
    </>
  ),
  signpost: <path d="M12 21V3M12 5h7l2 2.5-2 2.5h-7M12 12H5l-2 2.5L5 17h7" />,
  survey: <path d="M5 21V8M12 21V6M19 21V8M5 11.5 12 9l7 2.5" />,
  collision: (
    <path d="m12 3 1.7 4.6L18.4 6l-1.9 4.3L21 12l-4.5 1.7 1.9 4.3-4.7-1.6L12 21l-1.7-4.6L5.6 18l1.9-4.3L3 12l4.5-1.7L5.6 6l4.7 1.6Z" />
  ),
  wreck: (
    <g transform="rotate(-9 12 14)">
      <path d="M3 15.5v-3.5l2-4h9l3 4h3.5v3.5ZM10 8l-1 4" />
      <circle cx="7" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
    </g>
  ),
  pothole: (
    <>
      <ellipse cx="12" cy="14" rx="8" ry="3.5" />
      <path d="M8 14.5c1.3.6 2.5.8 4 .8s2.7-.2 4-.8M4 14l-2-2M20 14l2-2" />
    </>
  ),
  crane: <path d="M6 21V3M3 6h18M6 3 3 6M6 3l6 3M17 6v5M15.5 11h3v2.5h-3ZM3.5 21h5" />,
  van: (
    <>
      <path d="M2 16V7h12l4 4h4v5ZM14 7v4h4" />
      <circle cx="6.5" cy="17" r="1.8" />
      <circle cx="17" cy="17" r="1.8" />
    </>
  ),
  hoarding: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <path d="M9 6v12M15 6v12M5 18v3M19 18v3" />
    </>
  ),
  trench: <path d="M2 11h5v7h10v-7h5M10 11V8M14 11V8M16.5 8.5c.8-2 2-3 3.5-3" />,
  scaffold: <path d="M5 3v18M19 3v18M5 8h14M5 14h14M3 21h18M5 8l14 6" />,
  beacon: <path d="M7 19v-5a5 5 0 0 1 10 0v5M5 19h14M12 3v2M4.5 6.5 6 8M19.5 6.5 18 8" />,
  stopBoard: <path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7ZM8 12h8" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
};

/** A glyph on its tinted tile. Decorative: the term beside it says the same thing. */
export default function LegendGlyphTile({ glyph }: { glyph: LegendGlyph }) {
  const tint = TINTS[glyph];
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
      style={{
        color: tint,
        backgroundColor: `${tint}1c`,
        boxShadow: `inset 0 0 0 1px ${tint}33`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[glyph]}
      </svg>
    </span>
  );
}
