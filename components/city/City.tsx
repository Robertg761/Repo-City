"use client";

/**
 * The whole city, composed from one `CityModel` and nothing else (PLAN.md
 * section 34). No GitHub objects, no analysis types, no store reads beyond
 * selection and hover.
 *
 * Draw order and reveal order both follow section 43: terrain, roads,
 * districts, buildings, landmarks, incidents, construction, the backlog and
 * its queue (PLAN.md 76.8), traffic.
 */

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { CityModel } from "@/types/city";
import Backlog from "./backlog/Backlog";
import { BatchProvider } from "./Batch";
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
import { cityRevealEnd } from "./reveal";
import { RevealContext, useRevealTicker } from "./useReveal";

/** The lowest a district label hangs: over a city's low-rise blocks. */
const LABEL_FLOOR = 12;
/** The same over a village's cottages. */
const VILLAGE_LABEL_FLOOR = 7.5;

/**
 * Development only: the renderer and camera on `window.__repoCityRenderer`
 * and `window.__repoCityCamera`, so a driver can read `renderer.info` (draw
 * calls, triangles) and project a crowd object to the screen to point at it
 * (PLAN.md 76.13). Nothing is exposed in production.
 */
function useDevRendererHandle(): void {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const handle = window as unknown as {
      __repoCityRenderer?: typeof gl;
      __repoCityCamera?: typeof camera;
    };
    handle.__repoCityRenderer = gl;
    handle.__repoCityCamera = camera;
  }, [gl, camera]);
}

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
  useDevRendererHandle();

  // Traffic waits for the whole reveal, the backlog's outward ripple and the
  // queue at the city limits included (PLAN.md 76.9).
  const trafficStart = useMemo(() => cityRevealEnd(city), [city]);

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
  const tier = city.settlement?.tier;
  // A village is cottages three to five units tall: its lane names hang just
  // over the roofs, not twelve units up in the sky.
  const labelFloor = tier === "village" ? VILLAGE_LABEL_FLOOR : LABEL_FLOOR;
  const labelHeights = useMemo(() => {
    const tallest = new Map<string, number>();
    for (const building of city.buildings) {
      const top = building.position[1] + building.size[1];
      if (top > (tallest.get(building.districtId) ?? 0)) tallest.set(building.districtId, top);
    }
    const heights = new Map<string, number>();
    for (const district of city.districts) {
      heights.set(district.id, Math.max((tallest.get(district.id) ?? 0) + 5.5, labelFloor));
    }
    return heights;
  }, [city, labelFloor]);

  return (
    <RevealContext.Provider value={clock}>
      <BatchProvider>
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
          labelY={labelHeights.get(district.id) ?? labelFloor}
          settlement={tier}
          // The overview sits at about 1.45 times the city's side, so a label
          // scaled off `bounds.size` reads the same in a town and a metropolis.
          labelScale={size * 0.72}
        />
      ))}

      <Roads roads={city.roads} atmosphere={atmosphere} />

      <Buildings buildings={instanced} atmosphere={atmosphere} settlement={tier} roads={city.roads} />
      {civic.map((building) => (
        <CivicBuilding key={building.id} building={building} atmosphere={atmosphere} />
      ))}

      {city.landmarks.map((landmark) => (
        <LandmarkPiece key={landmark.id} landmark={landmark} atmosphere={atmosphere} settlement={tier} />
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
      </BatchProvider>
    </RevealContext.Provider>
  );
}
