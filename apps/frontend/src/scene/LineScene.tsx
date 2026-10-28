/**
 * The line in 3D (plan steps 12 and 13), built from machine.json at run time:
 * no part is hardcoded (hard rule 1). Which parts a page shows, where clicking
 * each leads and which boxes are see-through come from navigation/places.ts.
 *
 * - Hover (mouse): every part leading to the same page lights up in the brand's
 *   light blue, and that page's name shows above them (doc 03).
 * - Touch has no hover: the first tap shows the name, a second tap opens it.
 * - Click opens the page; a drag (turning the view) is not a click.
 * - The camera frames each page and glides to it (none with reduced motion).
 */
import type { Machine } from '@mixline/shared';
import { Html, OrbitControls, useCursor } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Vector3 } from 'three';

import type { PageScene } from '../navigation/places';
import { useLabel } from '../navigation/useLabel';
import { boundsOf, MM, type Vec3 } from './frame';
import { Part } from './Part';
import { passesThrough } from './picking';
import styles from './scene.module.css';
import { useCssColor } from './useCssColor';
import { clampTarget, DEFAULT_VIEW, FOV, GLIDE_MS, ORBIT_LIMITS, type View, viewFor } from './view';

/** A click after the pointer moved more than this (px) was a drag: it turned the view. */
const DRAG_PX = 6;

export interface SceneContentProps {
  machine: Machine;
  page: PageScene;
  /** "Pending" tags on every pending part; otherwise only on what the pointer lights up. */
  allTags: boolean;
  glow: string;
  /** The edge colour of see-through boxes, so their shape stays readable. */
  outline?: string;
  onNavigate: (path: string) => void;
}

/** The parts, the lights and the hover name; also rendered alone by the tests (no WebGL there). */
export function SceneContent({
  machine,
  page,
  allTags,
  glow,
  outline,
  onNavigate,
}: SceneContentProps) {
  const { t } = useTranslation();
  const label = useLabel();
  // What the pointer lit, and on which page: on another page nothing is lit any more.
  const [litOn, setLitOn] = useState<{ page: PageScene; path: string; touch: boolean } | undefined>(
    undefined,
  );
  const lit = litOn?.page === page ? litOn : undefined;
  const setLit = (next: { path: string; touch: boolean } | undefined) => {
    setLitOn(next && { page, ...next });
  };
  useCursor(lit !== undefined && !lit.touch);

  const litTarget = lit ? [...page.targets.values()].find((x) => x.path === lit.path) : undefined;
  const litParts = lit ? page.subject.filter((c) => page.targets.get(c.id)?.path === lit.path) : [];
  const nameAt = litParts.length ? above(litParts) : undefined;

  const touchOf = (e: ThreeEvent<MouseEvent | PointerEvent>) =>
    (e.nativeEvent as PointerEvent).pointerType === 'touch';

  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a4250', 1.1]} />
      <directionalLight position={[1.5, 3, 2]} intensity={1.8} />
      <directionalLight position={[-1, 1.5, -2]} intensity={0.4} />
      {page.subject.map((part) => {
        const target = page.targets.get(part.id);
        const on = target !== undefined && target.path === lit?.path;
        const through = (e: ThreeEvent<MouseEvent | PointerEvent>) =>
          passesThrough(part.id, e.intersections, page.targets, page.seeThrough);
        return (
          <Part
            key={part.id}
            part={part}
            machine={machine}
            glow={on ? glow : undefined}
            seeThrough={page.seeThrough.has(part.id)}
            outline={outline}
            pendingTag={allTags || on ? t('status.pending') : undefined}
            onPointerOver={
              target
                ? (e) => {
                    if (touchOf(e) || through(e)) return;
                    e.stopPropagation();
                    setLit({ path: target.path, touch: false });
                  }
                : undefined
            }
            onPointerOut={
              target
                ? (e) => {
                    if (touchOf(e)) return;
                    if (lit?.path === target.path && !lit.touch) setLit(undefined);
                  }
                : undefined
            }
            onClick={
              target
                ? (e) => {
                    if (through(e)) return;
                    e.stopPropagation();
                    if (e.delta > DRAG_PX) return;
                    if (touchOf(e) && lit?.path !== target.path) {
                      setLit({ path: target.path, touch: true });
                      return;
                    }
                    onNavigate(target.path);
                  }
                : undefined
            }
          />
        );
      })}
      {page.context.map((part) => (
        <Part key={`context-${part.id}`} part={part} machine={machine} ghost />
      ))}
      {litTarget && nameAt && (
        <Html center position={nameAt} zIndexRange={[30, 0]}>
          <span className={styles.name}>
            {label(litTarget)}
            {lit?.touch && <small className={styles.hint}>{t('nav.tapAgain')}</small>}
          </span>
        </Html>
      )}
    </>
  );
}

/** Just above the top centre of some parts: where their name shows. */
function above(parts: Parameters<typeof boundsOf>[0]): Vec3 {
  const box = boundsOf(parts);
  const center = box.getCenter(new Vector3());
  return [center.x, box.max.y + 0.03, center.z];
}

/** What the camera rig needs from the orbit controls. */
interface Orbit {
  target: Vector3;
  update: () => void;
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** Moves the camera to the page's view: a glide, or a jump on first show and with reduced motion. */
function CameraRig({ view, reducedMotion }: { view: View; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Orbit | null;
  const invalidate = useThree((s) => s.invalidate);
  const glide = useRef<{ from: View; to: View; start: number } | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (!controls) return;
    if (!shown.current || reducedMotion) {
      shown.current = true;
      camera.position.set(...view.position);
      controls.target.set(...view.target);
      controls.update();
    } else {
      glide.current = {
        from: { position: camera.position.toArray(), target: controls.target.toArray() },
        to: view,
        start: performance.now(),
      };
    }
    invalidate();
  }, [view, controls, camera, invalidate, reducedMotion]);

  useFrame(() => {
    const g = glide.current;
    if (!g || !controls) return;
    const k = Math.min(1, (performance.now() - g.start) / GLIDE_MS);
    const e = ease(k);
    const mix = (a: Vec3, b: Vec3) => a.map((v, i) => v + ((b[i] ?? v) - v) * e) as Vec3;
    camera.position.set(...mix(g.from.position, g.to.position));
    controls.target.set(...mix(g.from.target, g.to.target));
    controls.update();
    if (k < 1) invalidate();
    else glide.current = null;
  });
  return null;
}

/** The view for this page: the line from the front, or its subject framed. */
function PageView({
  page,
  overview,
  reducedMotion,
}: {
  page: PageScene;
  overview: boolean;
  reducedMotion: boolean;
}) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const view = useMemo(
    () => (overview ? DEFAULT_VIEW : viewFor(boundsOf(page.subject), aspect, FOV)),
    // The aspect is read when the page changes, so resizing does not move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, overview],
  );
  return <CameraRig view={view} reducedMotion={reducedMotion} />;
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

export interface LineSceneProps {
  machine: Machine;
  page: PageScene;
  /** The line page (level 1): the line from the front instead of a framed subject. */
  overview: boolean;
  /** "Pending" tags on every pending part; otherwise only on what the pointer lights up. */
  allTags: boolean;
  onNavigate: (path: string) => void;
}

export default function LineScene({
  machine,
  page,
  overview,
  allTags,
  onNavigate,
}: LineSceneProps) {
  const glow = useCssColor('--brand-glow', '#5fd3ff');
  const floor = useCssColor('--surface', '#1c222c');
  const outline = useCssColor('--text-muted', '#9aa6b4');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <Canvas
      // Pinned to the frame's edges: a percentage height inside a flex box would fall back to 150 px.
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ position: DEFAULT_VIEW.position, fov: FOV, near: 0.01, far: 50 }}
      gl={{ antialias: true, alpha: true }}
    >
      <SceneContent
        machine={machine}
        page={page}
        allTags={allTags}
        outline={outline}
        glow={glow}
        onNavigate={onNavigate}
      />
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
      <PageView page={page} overview={overview} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
