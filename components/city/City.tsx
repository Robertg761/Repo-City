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
import Buildings from "./Buildings";
import CivicBuilding from "./Building";
import ConstructionSitePiece from "./ConstructionSite";
import DistrictGround from "./District";
import IssueIncident from "./IssueIncident";
import LandmarkPiece from "./Landmark";
import Lighting from "./Lighting";
import Props from "./Props";
import Roads from "./Roads";
import SelectionRing from "./SelectionRing";
import Terrain from "./Terrain";
import Traffic from "./Traffic";
import { splitBuildings } from "./instances";
import { atmosphere as buildAtmosphere } from "./palette";
import { revealEnd } from "./reveal";
import { RevealContext, useRevealTicker } from "./useReveal";

export default function City({ city }: { city: CityModel }) {
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

  return (
    <RevealContext.Provider value={clock}>
      <color attach="background" args={[atmosphere.background]} />
      <fog
        attach="fog"
        args={[
          atmosphere.background,
          size * atmosphere.fogNearFactor,
          size * atmosphere.fogFarFactor,
        ]}
      />

      <Lighting atmosphere={atmosphere} size={size} />

      <Terrain size={size} atmosphere={atmosphere} />

      {city.districts.map((district, index) => (
        <DistrictGround
          key={district.id}
          district={district}
          index={index}
          atmosphere={atmosphere}
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

      <Props city={city} atmosphere={atmosphere} />
      <Traffic city={city} startAt={trafficStart} atmosphere={atmosphere} />

      <SelectionRing city={city} />
    </RevealContext.Provider>
  );
}
