"use client";

/**
 * Development only: `?dev=backlog` (PLAN.md 76.11).
 *
 * Until population (S4) lands, a generated city has an empty `backlog`. With
 * `?dev=backlog` in the address and the synthetic backlog fixture loaded (type
 * `backlog` in the repository box, or `__repoCity.getState().actions.analyze("backlog")`),
 * this swaps in the same city with `fixtures/dev.backlog.ts`'s placement
 * applied, so the crowd can be built and screenshotted. `?tier=` still picks
 * the settlement; `&crowd=dense` packs the whole fixture in, for measuring.
 *
 * It does nothing in production, nothing without the flag, and nothing once
 * the city already carries a backlog: S4's real placement wins. Only
 * `&crowd=dense` replaces it, and only until everything is on the map. The
 * fixture module is imported lazily, so none of it ships.
 */

import { useEffect } from "react";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";

export function useDevBacklog(city: CityModel): void {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (new URLSearchParams(window.location.search).get("dev") !== "backlog") return;
    const dense = new URLSearchParams(window.location.search).get("crowd") === "dense";
    const drawn = (city.backlog?.incidents.length ?? 0) + (city.backlog?.constructionSites.length ?? 0);
    const everything =
      (city.backlog?.incidents.length ?? 0) + (city.backlog?.constructionSites.length ?? 0) >=
      (useCityStore.getState().analysis?.metrics.issues.backlog?.length ?? 0) +
        (useCityStore.getState().analysis?.metrics.pulls.backlog?.length ?? 0);
    // A placed city is left alone, unless measuring asks for all of it.
    if (drawn > 0 && (!dense || everything)) return;
    const { analysis, city: current } = useCityStore.getState();
    if (!analysis || current !== city) return;
    if (!analysis.metrics.issues.backlog?.length && !analysis.metrics.pulls.backlog?.length) return;

    let cancelled = false;
    void import("@/fixtures/dev.backlog").then(({ placeDevBacklog }) => {
      if (cancelled || useCityStore.getState().city !== city) return;
      useCityStore.setState({ city: placeDevBacklog(city, analysis, { dense }) });
    });
    return () => {
      cancelled = true;
    };
  }, [city]);
}
