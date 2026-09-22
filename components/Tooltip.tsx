"use client";

/**
 * Two-line hover label that follows the pointer (PLAN.md section 42).
 *
 * Hover is a shortcut, never the only route: everything it names can also be
 * clicked or tapped, which opens the inspector with the full story.
 */

import { useEffect, useState } from "react";
import { resolveEntity } from "@/lib/client/entities";
import { useCityStore } from "@/store/useCityStore";

const OFFSET = 14;

export default function Tooltip() {
  const hoveredId = useCityStore((s) => s.hoveredId);
  const city = useCityStore((s) => s.city);
  const analysis = useCityStore((s) => s.analysis);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  // Only listen while something is hovered; the canvas emits a lot of moves.
  // The last known point survives an unhover on purpose: the pointer has not
  // moved, so it is still where the next tooltip belongs.
  useEffect(() => {
    if (!hoveredId) return;
    const onPointerMove = (event: PointerEvent) => {
      setPoint({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [hoveredId]);

  const entity = resolveEntity(hoveredId, city, analysis);
  if (!entity || !point) return null;

  // Flip towards the middle near the right or bottom edge so the label is
  // never clipped by the viewport.
  const flipX = point.x > window.innerWidth - 240;
  const flipY = point.y > window.innerHeight - 96;

  return (
    <div
      role="status"
      className="glass pointer-events-none fixed z-40 max-w-[15rem] px-3 py-2"
      style={{
        left: point.x + (flipX ? -OFFSET : OFFSET),
        top: point.y + (flipY ? -OFFSET : OFFSET),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      <p className="truncate text-[13px] font-medium text-white">{entity.title}</p>
      {/* Two lines, always (PLAN.md section 42). `tooltip` is built in
          `lib/client/entities.ts`: for a building it is the curated role when
          the interpretation named one, and the district otherwise. */}
      <p className="line-clamp-2 text-[11px] leading-snug text-white/55">
        {entity.tooltip || entity.label.toLowerCase()}
      </p>
    </div>
  );
}
