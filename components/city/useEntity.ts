"use client";

/**
 * Selection and hover wiring (PLAN.md sections 6 and 42). Hover only ever sets
 * `hoveredId`; the tooltip that reads it belongs to the HUD workstream. Click
 * selects, and clicking bare ground clears the selection.
 *
 * R3F fires `onClick` on release even after the pointer has travelled: it
 * only checks that the object was under the pointer when it went down. The
 * ground plane is under every press, so without `wasDrag` letting go of an
 * orbit over the grass cleared the selection and flew the camera out, and
 * pressing on a building to start one selected it.
 */

import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useCityStore } from "@/store/useCityStore";
import { isDragRelease } from "./entities";

/** Whether this click ended a drag (an orbit or a pan) rather than a click. */
export function wasDrag(event: ThreeEvent<MouseEvent>): boolean {
  return isDragRelease(event.delta, (event.nativeEvent as Partial<PointerEvent>).pointerType);
}

export interface EntityState {
  hovered: boolean;
  selected: boolean;
}

export function useEntityState(id: string): EntityState {
  const hovered = useCityStore((s) => s.hoveredId === id);
  const selected = useCityStore((s) => s.selectedId === id);
  return { hovered, selected };
}

function setCursor(pointer: boolean) {
  if (typeof document !== "undefined") {
    document.body.style.cursor = pointer ? "pointer" : "auto";
  }
}

export interface EntityHandlers {
  onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}

/** Handlers for an entity drawn as ordinary meshes. */
export function useEntityHandlers(id: string): EntityHandlers {
  const actions = useCityStore((s) => s.actions);
  return useMemo(
    () => ({
      onPointerOver(event) {
        event.stopPropagation();
        actions.hover(id);
        setCursor(true);
      },
      onPointerOut(event) {
        event.stopPropagation();
        actions.hover(null);
        setCursor(false);
      },
      onClick(event) {
        event.stopPropagation();
        if (wasDrag(event)) return;
        actions.select(id);
      },
    }),
    [actions, id],
  );
}

export interface InstanceHandlers {
  /** `pointermove`, not `pointerover`: moving between two instances of the
   * same mesh never fires an enter event. */
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}

/**
 * Handlers for an `InstancedMesh`: `event.instanceId` indexes the `ids` array
 * built alongside the instance matrices (PLAN.md section 38).
 */
export function useInstanceHandlers(ids: readonly string[]): InstanceHandlers {
  const actions = useCityStore((s) => s.actions);
  return useMemo(
    () => ({
      onPointerMove(event) {
        event.stopPropagation();
        const id = event.instanceId === undefined ? undefined : ids[event.instanceId];
        if (!id) return;
        actions.hover(id);
        setCursor(true);
      },
      onPointerOut(event) {
        event.stopPropagation();
        actions.hover(null);
        setCursor(false);
      },
      onClick(event) {
        event.stopPropagation();
        if (wasDrag(event)) return;
        const id = event.instanceId === undefined ? undefined : ids[event.instanceId];
        if (id) actions.select(id);
      },
    }),
    [actions, ids],
  );
}
