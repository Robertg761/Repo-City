"use client";

/**
 * The one context inspector (PLAN.md sections 6, 12, 40 and 41).
 *
 * It overlays the city and never replaces it: closing it leaves the world
 * exactly as it was, and "Return to overview" only asks the camera to fly back
 * (section 6). Every kind of object - incident, construction site, landmark,
 * building, district - uses this same layout, which is what makes the visual
 * language learnable.
 *
 * On a phone it becomes a bottom sheet rather than a side panel.
 */

import { useEffect } from "react";
import { resolveEntity } from "@/lib/client/entities";
import { useCityStore } from "@/store/useCityStore";

export default function Inspector() {
  const selectedId = useCityStore((s) => s.selectedId);
  const city = useCityStore((s) => s.city);
  const analysis = useCityStore((s) => s.analysis);
  const select = useCityStore((s) => s.actions.select);
  const returnToOverview = useCityStore((s) => s.actions.returnToOverview);

  // Escape closes the inspector, the way every overlay on the web does.
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, select]);

  const entity = resolveEntity(selectedId, city, analysis);
  if (!selectedId) return null;

  return (
    <aside
      aria-label="Selected object"
      /* Bottom sheet on a phone; on a wider screen a right-hand panel that
         starts below the health card and hugs its own content. */
      className="glass animate-panel-in pointer-events-auto absolute inset-x-2 bottom-2 z-30 max-h-[52vh] overflow-y-auto overscroll-contain p-4 text-sm text-white/80 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[18rem] sm:max-h-[calc(100dvh-19.5rem)] sm:w-[21rem]"
    >
      {entity ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow pt-1 text-accent">{entity.label}</p>
            <button
              type="button"
              onClick={() => select(null)}
              aria-label="Close inspector"
              className="hud-button -mr-1 -mt-1 px-2 py-1 text-base leading-none tracking-normal"
            >
              {"×"}
            </button>
          </div>

          {entity.subtitle && entity.subtitle !== entity.title ? (
            <p className="mt-2 break-words text-[13px] text-white/55">{entity.subtitle}</p>
          ) : null}
          <h2 className="mt-0.5 text-base font-medium leading-snug text-white">{entity.title}</h2>

          {entity.description ? (
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">{entity.description}</p>
          ) : null}

          {entity.facts.length > 0 ? (
            <dl className="mt-4 space-y-1.5">
              {entity.facts.map((fact) => (
                <div key={fact.label} className="flex gap-3 text-[13px]">
                  <dt className="w-24 shrink-0 text-white/45">{fact.label}</dt>
                  <dd className="min-w-0 break-words text-white/85">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {entity.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {entity.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {entity.reason ? (
            <div className="mt-4 rounded-xl bg-white/[0.06] p-3">
              <p className="eyebrow mb-1.5">Why this exists</p>
              <p className="text-[13px] leading-relaxed text-white/75">{entity.reason}</p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {entity.sourceUrl ? (
              <a
                href={entity.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                /* External link to GitHub. The city screen stays put. */
                className="hud-button bg-accent/90 text-[#1a1206] hover:bg-accent"
              >
                View on GitHub
              </a>
            ) : null}
            <button type="button" onClick={returnToOverview} className="hud-button">
              Return to overview
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow pt-1">Inspector</p>
            <button
              type="button"
              onClick={() => select(null)}
              aria-label="Close inspector"
              className="hud-button -mr-1 -mt-1 px-2 py-1 text-base leading-none tracking-normal"
            >
              {"×"}
            </button>
          </div>
          <p className="mt-3 break-all font-mono text-xs text-white/45">{selectedId}</p>
          <p className="mt-3 text-[13px] text-white/60">
            Nothing in the city carries that id yet.
          </p>
          <button type="button" onClick={returnToOverview} className="hud-button mt-4">
            Return to overview
          </button>
        </>
      )}
    </aside>
  );
}
