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
import { resolveEntity, type EntityFact } from "@/lib/client/entities";
import { useCityStore } from "@/store/useCityStore";

/** Characters of a long file name that always stay: its end and extension. */
const NAME_END = 14;

/**
 * A repository path on one line, elided in the middle when it is too long:
 * "compiler/packages/…HIRBuilder.ts". The directories give way first; a file
 * name too long for the line then gives up its middle but keeps its end, so
 * two long names in one list still read apart. The full path is the tooltip,
 * and it is still the text a screen reader reads or a copy takes.
 */
function PathText({ path }: { path: string }) {
  const cut = path.lastIndexOf("/", path.length - 2);
  const dirs = path.slice(0, cut + 1);
  const name = path.slice(cut + 1);
  const long = name.length > NAME_END + 6;
  return (
    <>
      {/* A huge shrink factor: the directories are spent before the name. */}
      {dirs ? <span className="min-w-0 shrink-[1000] truncate">{dirs}</span> : null}
      {long ? <span className="min-w-0 truncate">{name.slice(0, -NAME_END)}</span> : null}
      <span className="shrink-0">{long ? name.slice(-NAME_END) : name}</span>
    </>
  );
}

/** A value that reads as a repository path: slashes and no spaces. */
const isPath = (value: string): boolean => value.includes("/") && !/\s/.test(value);

function FactValue({ fact }: { fact: EntityFact }) {
  const path = isPath(fact.value);
  const text = path ? <PathText path={fact.value} /> : fact.value;
  const layout = path ? "flex min-w-0" : "";
  if (fact.href) {
    return (
      <a
        href={fact.href}
        target="_blank"
        rel="noreferrer noopener"
        title={path ? fact.value : undefined}
        /* External link to GitHub; the city screen stays put. */
        className={`${layout} underline decoration-white/25 underline-offset-4 transition hover:decoration-white/70`}
      >
        {text}
      </a>
    );
  }
  return path ? (
    <span className={layout} title={fact.value}>
      {text}
    </span>
  ) : (
    text
  );
}

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
                /* Two named modules in one district can share a basename, so
                   the label alone is not a unique key. */
                <div key={`${fact.label}:${fact.value}`} className="flex gap-3 text-[13px]">
                  <dt className="w-24 shrink-0 text-white/45">{fact.label}</dt>
                  <dd className="min-w-0 flex-1 break-words text-white/85">
                    <FactValue fact={fact} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {entity.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {entity.tags.map((tag) => (
                <span key={tag} className="chip max-w-full break-words">
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
