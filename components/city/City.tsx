"use client";

/**
 * The whole city, composed from one `CityModel` and nothing else (PLAN.md
 * section 34). No GitHub objects, no analysis types, no store reads beyond
 * selection and hover.
 *
 * Draw order and reveal order both follow section 43: terrain, roads,
 * districts, buildings, landmarks, incidents, construction, traffic.
 */

import { useMemo, useRef } from "react";
import type { CityModel } from "@/types/city";
import Backlog from "./backlog/Backlog";
import Buildings from "./Buildings";
import CivicBuilding from "./Building";
import ConstructionSitePiece from "./ConstructionSite";
import DistrictGround from "./District";
import Fields from "./Fields";
import IssueIncident from "./IssueIncident";
import LandmarkPiece from "./Landmark";
import Lighting from "./Lighting";
import Overflow from "./Overflow";
import Pedestrians from "./Pedestrians";
import Props from "./Props";
import Roads from "./Roads";
import SelectionRing from "./SelectionRing";
import Terrain from "./Terrain";
import Traffic from "./Traffic";
import { REFERENCE_ASPECT, aspectWiden } from "./entities";
import { splitBuildings } from "./instances";
import { atmosphere as buildAtmosphere } from "./palette";
import { revealEnd } from "./reveal";
import { RevealContext, useRevealTicker } from "./useReveal";

export default function City({
  city,
  aspect = REFERENCE_ASPECT,
}: {
  city: CityModel;
  /** Canvas width over height: a narrow viewport watches from further back. */
  aspect?: number;
}) {
  const atmosphere = useMemo(
    () => buildAtmosphere(city.ambience, city.repository.archived),
    [city],
  );
  const { instanced, civic } = useMemo(() => splitBuildings(city.buildings), [city]);

  // One clock per mounted model: every `appearAt` is relative to the moment
  // the model reached the renderer. `CityCanvas` keys this component on the
  // model, so a new city gets a fresh clock and replays the reveal.
  const clock = useRef(Number.POSITIVE_INFINITY);
  useRevealTicker(clock);

  const trafficStart = useMemo(
    () =>
      revealEnd([
        ...city.buildings.map((b) => b.appearAt),
        ...city.landmarks.map((l) => l.appearAt),
        ...city.incidents.map((i) => i.appearAt),
        ...city.constructionSites.map((c) => c.appearAt),
      ]),
    [city],
  );

  const size = city.bounds.size;
  // The fog only hides where the landscape ends; it never reaches the city
  // (`FOG_NEAR` in `palette.ts`). The overview pulls back on a narrow screen,
  // so the fog pulls back with it, or a phone would see the rim come closer.
  const fogReach = size * aspectWiden(aspect);

  /**
   * Where each district's label hangs. A district full of eighteen unit
   * towers needs its name higher than a district of sheds, or the DOM label
   * lands across a facade (PLAN.md section 8).
   */
  const labelHeights = useMemo(() => {
    const tallest = new Map<string, number>();
    for (const building of city.buildings) {
      const top = building.position[1] + building.size[1];
      if (top > (tallest.get(building.districtId) ?? 0)) tallest.set(building.districtId, top);
    }
    const heights = new Map<string, number>();
    for (const district of city.districts) {
      heights.set(district.id, Math.max((tallest.get(district.id) ?? 0) + 5.5, 12));
    }
    return heights;
  }, [city]);

  return (
    <RevealContext.Provider value={clock}>
      <color attach="background" args={[atmosphere.background]} />
      <fog
        attach="fog"
        args={[
          atmosphere.background,
          fogReach * atmosphere.fogNearFactor,
          fogReach * atmosphere.fogFarFactor,
        ]}
      />

      <Lighting atmosphere={atmosphere} size={size} />

      <Terrain size={size} atmosphere={atmosphere} />
      <Fields city={city} atmosphere={atmosphere} />

      {city.districts.map((district) => (
        <DistrictGround
          key={district.id}
          district={district}
          atmosphere={atmosphere}
          labelY={labelHeights.get(district.id) ?? 12}
          // The overview sits at about 1.45 times the city's side, so a label
          // scaled off `bounds.size` reads the same in a town and a metropolis.
          labelScale={size * 0.72}
        />
      ))}

      <Roads roads={city.roads} atmosphere={atmosphere} />

      <Buildings buildings={instanced} atmosphere={atmosphere} />
      {civic.map((building) => (
        <CivicBuilding key={building.id} building={building} atmosphere={atmosphere} />
      ))}

      {city.landmarks.map((landmark) => (
        <LandmarkPiece key={landmark.id} landmark={landmark} atmosphere={atmosphere} />
      ))}

      {city.incidents.map((incident) => (
        <IssueIncident key={incident.id} incident={incident} atmosphere={atmosphere} />
      ))}

      {city.constructionSites.map((site) => (
        <ConstructionSitePiece key={site.id} site={site} atmosphere={atmosphere} />
      ))}

      <Backlog city={city} atmosphere={atmosphere} />
      <Overflow city={city} atmosphere={atmosphere} />

      <Props city={city} atmosphere={atmosphere} />
      <Traffic city={city} startAt={trafficStart} atmosphere={atmosphere} />
      <Pedestrians city={city} startAt={trafficStart} atmosphere={atmosphere} />

      <SelectionRing city={city} />
    </RevealContext.Provider>
  );
}
