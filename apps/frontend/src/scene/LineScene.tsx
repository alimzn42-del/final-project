/**
 * The line in 3D (plan step 12), built from machine.json at run time: no part
 * is hardcoded (hard rule 1). On the line page a part leads to its section, so
 * hovering any part lights up its whole section; the table leads nowhere.
 */
import type { Machine } from '@mixline/shared';
import { OrbitControls, useCursor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MM } from './frame';
import { Part } from './Part';
import { useCssColor } from './useCssColor';
import { clampTarget, DEFAULT_VIEW, ORBIT_LIMITS } from './view';

/** The parts and the lights; also rendered on its own by the scene tests (no WebGL needed there). */
export function LineContent({ machine, glow }: { machine: Machine; glow: string }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | undefined>(undefined);
  useCursor(hovered !== undefined);

  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a4250', 1.1]} />
      <directionalLight position={[1.5, 3, 2]} intensity={1.8} />
      <directionalLight position={[-1, 1.5, -2]} intensity={0.4} />
      {machine.components.map((part) => {
        // The line page's target for this part: its section (null: the table, scene only).
        const target = part.section ?? undefined;
        const lit = target !== undefined && target === hovered;
        return (
          <Part
            key={part.id}
            part={part}
            machine={machine}
            glow={lit ? glow : undefined}
            pendingTag={lit ? t('status.pending') : undefined}
            onPointerOver={
              target
                ? (e) => {
                    e.stopPropagation();
                    setHovered(target);
                  }
                : undefined
            }
            onPointerOut={
              target
                ? (e) => {
                    e.stopPropagation();
                    setHovered((h) => (h === target ? undefined : h));
                  }
                : undefined
            }
          />
        );
      })}
    </>
  );
}

/** The floor under the table, for scale (the drain bucket stands on it). */
function Floor({ machine, color }: { machine: Machine; color: string }) {
  return (
    <mesh
      position={[(machine.table.width * MM) / 2, -machine.table.heightToFloor * MM, -0.4]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
    >
      <planeGeometry args={[6, 6]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

export default function LineScene({ machine }: { machine: Machine }) {
  const glow = useCssColor('--brand-glow', '#5fd3ff');
  const floor = useCssColor('--surface', '#1c222c');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <Canvas
      // Pinned to the frame's edges: a percentage height inside a flex box would fall back to 150 px.
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ position: DEFAULT_VIEW.position, fov: 40, near: 0.05, far: 50 }}
      gl={{ antialias: true, alpha: true }}
    >
      <LineContent machine={machine} glow={glow} />
      <Floor machine={machine} color={floor} />
      <OrbitControls
        makeDefault
        target={DEFAULT_VIEW.target}
        enableDamping={!reducedMotion}
        minDistance={ORBIT_LIMITS.minDistance}
        maxDistance={ORBIT_LIMITS.maxDistance}
        minPolarAngle={ORBIT_LIMITS.minPolarAngle}
        maxPolarAngle={ORBIT_LIMITS.maxPolarAngle}
        onChange={(e) => {
          // Panning stops over the table, so the line cannot be lost off screen.
          const target = e?.target.target;
          if (!target) return;
          const [x, y, z] = clampTarget(target.toArray());
          if (x !== target.x || y !== target.y || z !== target.z) target.set(x, y, z);
        }}
      />
    </Canvas>
  );
}
