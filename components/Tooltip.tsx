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

/**
 * Where the pointer last was, kept outside React so following it costs no
 * render while nothing is hovered. Without it the label had no position on
 * the move that started the hover, and only appeared on the move after:
 * holding the mouse still over a building showed nothing.
 */
const lastPointer = { x: 0, y: 0, seen: false };

export default function Tooltip() {
  const hoveredId = useCityStore((s) => s.hoveredId);
  const city = useCityStore((s) => s.city);
  const analysis = useCityStore((s) => s.analysis);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const remember = (event: PointerEvent) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
      lastPointer.seen = true;
    };
    // Capture phase: this runs before the canvas's own handler sets the hover.
    window.addEventListener("pointermove", remember, { passive: true, capture: true });
    return () => window.removeEventListener("pointermove", remember, { capture: true });
  }, []);

  // Follow the pointer only while something is hovered; the canvas emits a
  // lot of moves. The label starts where the pointer already is.
  useEffect(() => {
    if (!hoveredId) return;
    const onPointerMove = (event: PointerEvent) => {
      setPoint({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [hoveredId]);

  // Picked up during render when the hover changes, the pattern React
  // documents for "state derived from a change".
  const [sawHovered, setSawHovered] = useState(hoveredId);
  if (sawHovered !== hoveredId) {
    setSawHovered(hoveredId);
    if (hoveredId && lastPointer.seen) setPoint({ x: lastPointer.x, y: lastPointer.y });
  }

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
