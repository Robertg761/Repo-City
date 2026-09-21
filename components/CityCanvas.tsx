"use client";

/**
 * The one persistent 3D viewport (PLAN.md section 0.2). Everything else in the
 * application overlays this canvas; nothing ever replaces it.
 *
 * W0 ships the scaffolding only: ground, lights, camera limits, and a handful
 * of placeholder blocks so the scene is visibly three-dimensional. W1 owns
 * `components/city/*` and replaces `<PlaceholderCity />` with the real
 * instanced city driven by `useCityStore().city`.
 *
 * Loaded through `next/dynamic` with `ssr: false` from `app/page.tsx`; three.js
 * must never run during server rendering.
 */

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { prngFor } from "@/lib/city/seed";

const GROUND_SIZE = 400;

/** Roughly 47 degrees above the horizon, per PLAN.md section 5. */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [30, 46, 30];

interface PlaceholderBlock {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

const PALETTE = ["#d9d3c7", "#c8bfae", "#b9c7c2", "#cfc2b0", "#aab8bd"] as const;

/**
 * A deterministic stand-in skyline built from the fixture seed, so the shape of
 * the placeholder never changes between reloads or screenshots.
 */
function usePlaceholderBlocks(): PlaceholderBlock[] {
  return useMemo(() => {
    const prng = prngFor("sample/repo-city@fixture0001", "w0-placeholder");
    const blocks: PlaceholderBlock[] = [];
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        if (gx === 0 && gz === 0) continue;
        const height = prng.range(1.5, 9);
        const width = prng.range(1.6, 3);
        const depth = prng.range(1.6, 3);
        blocks.push({
          id: `placeholder-${gx}-${gz}`,
          position: [gx * 6 + prng.range(-0.6, 0.6), height / 2, gz * 6 + prng.range(-0.6, 0.6)],
          size: [width, height, depth],
          color: prng.pick(PALETTE),
        });
      }
    }
    return blocks;
  }, []);
}

function PlaceholderCity() {
  const blocks = usePlaceholderBlocks();

  return (
    <group>
      {blocks.map((block) => (
        <mesh key={block.id} position={block.position} castShadow receiveShadow>
          <boxGeometry args={block.size} />
          <meshStandardMaterial color={block.color} roughness={0.85} metalness={0} />
        </mesh>
      ))}

      {/* Civic centre marker at the origin. */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.6, 2.4, 8]} />
        <meshStandardMaterial color="#8fa39b" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial color="#7f8b76" roughness={1} metalness={0} />
    </mesh>
  );
}

function Lighting() {
  return (
    <>
      <hemisphereLight args={["#cfe3f2", "#6b6f5c", 0.85]} />
      <directionalLight
        castShadow
        position={[38, 52, 22]}
        intensity={2.1}
        color="#fff3e0"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.0005}
      />
    </>
  );
}

export default function CityCanvas() {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: DEFAULT_CAMERA_POSITION, fov: 35, near: 0.5, far: 600 }}
      gl={{ antialias: true }}
      // The wrapper in `app/page.tsx` owns the sizing; R3F fills it exactly.
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#b9d4e6"]} />
      <fog attach="fog" args={["#b9d4e6", 120, 320]} />

      <Lighting />
      <Ground />
      <PlaceholderCity />

      <CameraControls
        makeDefault
        minDistance={10}
        maxDistance={160}
        // Stop just short of the horizon so the camera can never slip under
        // the ground plane (PLAN.md section 5).
        maxPolarAngle={Math.PI * 0.48}
        minPolarAngle={0.15}
      />
    </Canvas>
  );
}
