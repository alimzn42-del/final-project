/**
 * One part of the line, drawn from machine.json with simple shapes (hard rule
 * 7): a box, a cylinder, or the six walls of a hollow box; tanks show their
 * liquid. A pending part is a see-through placeholder with a tag (doc 03).
 *
 * Colours, from strongest to weakest:
 * - its state (doc 03 "State colors"): fault and warning glow and are outlined in
 *   their colour, so a fault stays visible even under the pointer; offline is grey
 *   and dimmed. A state change pulses once (none with reduced motion).
 * - hover: the brand's light blue on surface and edges (never a state colour).
 * - a see-through box keeps thin edge lines.
 */
import type { Machine, MachineComponent, State } from '@mixline/shared';
import { Edges, Html } from '@react-three/drei';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MeshStandardMaterial } from 'three';

import { hollowWalls, partFrame, type Vec3 } from './frame';
import {
  DEFAULT_STATE_COLORS,
  type Look,
  liquidLook,
  partLook,
  PULSE_MS,
  pulseBoost,
  type StateColors,
  stateLook,
} from './looks';
import styles from './scene.module.css';

export interface PartProps {
  part: MachineComponent;
  machine: Machine;
  /** The glow colour when highlighted (hover); undefined when not. */
  glow?: string | undefined;
  /** The part's live state; undefined before the first data (normal look). */
  state?: State | undefined;
  stateColors?: StateColors;
  /** Closed boxes: see-through walls when their inside is the subject (owner, step 12). */
  seeThrough?: boolean;
  /** Drawn faintly, for orientation only (the table under a section, the box around a part). */
  ghost?: boolean;
  /** Edge colour of a see-through box, so its shape stays readable. */
  outline?: string | undefined;
  /** Text of the tag on a pending part; no tag when undefined. */
  pendingTag?: string | undefined;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Part({
  part,
  machine,
  glow,
  state,
  stateColors = DEFAULT_STATE_COLORS,
  seeThrough = false,
  ghost = false,
  outline,
  pendingTag,
  onPointerOver,
  onPointerOut,
  onClick,
}: PartProps) {
  const frame = partFrame(part);
  const shown = stateLook(state, stateColors);
  const base = partLook(part, { seeThrough, ghost });
  const look: Look = shown.grey ? { ...base, color: shown.grey, roughness: 1 } : base;
  const emissive = shown.glow ?? glow;
  const emissiveIntensity = shown.glow ? 0.45 : glow ? 0.35 : 0;
  const edges = shown.outline ?? glow ?? (seeThrough ? outline : undefined);
  const g = part.geometry;
  const [, height] = frame.size;

  const materials = usePulse(state, stateColors, emissive, emissiveIntensity);
  const surface = (
    <Surface look={look} emissive={emissive} intensity={emissiveIntensity} register={materials} />
  );

  return (
    <group
      name={part.id}
      position={frame.anchor}
      rotation={frame.rotation}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <group position={frame.offset}>
        {g.shape === 'box' && g.hollow ? (
          hollowWalls(frame.size, g.wallThickness ?? 0).map((wall, i) => (
            <mesh key={i} position={wall.center}>
              <boxGeometry args={wall.size} />
              {surface}
              {edges && <Edges color={edges} threshold={20} />}
            </mesh>
          ))
        ) : (
          <mesh>
            {g.shape === 'box' ? (
              <boxGeometry args={frame.size} />
            ) : (
              <cylinderGeometry args={[g.diameter / 2000, g.diameter / 2000, height, 32]} />
            )}
            {surface}
            {(shown.outline ?? glow) && <Edges color={shown.outline ?? glow} threshold={20} />}
          </mesh>
        )}
        {g.shape === 'cylinder' && g.liquid && (
          <Liquid
            radius={(g.diameter / 2000) * 0.94}
            height={height}
            level={g.liquid.level}
            dim={state === 'offline'}
            {...liquidLook(machine, g.liquid)}
          />
        )}
        {pendingTag && part.status === 'pending' && (
          <Html center position={[0, height / 2 + 0.03, 0] as Vec3} zIndexRange={[20, 0]}>
            <span className={styles.tag}>{pendingTag}</span>
          </Html>
        )}
      </group>
    </group>
  );
}

/**
 * One pulse in the new state's colour when the state changes (not on the first data).
 * Returns the ref that collects the part's materials, which the pulse brightens briefly.
 */
function usePulse(
  state: State | undefined,
  colors: StateColors,
  emissive: string | undefined,
  intensity: number,
) {
  const invalidate = useThree((s) => s.invalidate);
  const materials = useRef(new Set<MeshStandardMaterial>());
  const previous = useRef(state);
  const pulse = useRef<{ start: number; color: string } | null>(null);
  // What the materials go back to after the pulse (the current props).
  const resting = useRef({ emissive, intensity });
  useEffect(() => {
    resting.current = { emissive, intensity };
  }, [emissive, intensity]);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === undefined || state === undefined || before === state || reducedMotion()) return;
    const color = state === 'none' ? colors.ok : colors[state];
    pulse.current = { start: performance.now(), color };
    invalidate();
  }, [state, colors, invalidate]);

  useFrame(() => {
    const p = pulse.current;
    if (!p) return;
    const progress = (performance.now() - p.start) / PULSE_MS;
    const done = progress >= 1;
    for (const m of materials.current) {
      if (done) {
        m.emissive.set(resting.current.emissive ?? '#000000');
        m.emissiveIntensity = resting.current.intensity;
      } else {
        m.emissive.set(p.color);
        m.emissiveIntensity = resting.current.intensity + pulseBoost(progress);
      }
    }
    if (done) pulse.current = null;
    else invalidate();
  });

  return materials;
}

function Surface({
  look,
  emissive,
  intensity,
  register,
}: {
  look: Look;
  emissive: string | undefined;
  intensity: number;
  register: { current: Set<MeshStandardMaterial> };
}) {
  const seeThrough = look.opacity < 1;
  return (
    <meshStandardMaterial
      ref={(m: MeshStandardMaterial | null) => {
        if (!m) return;
        register.current.add(m);
        return () => {
          register.current.delete(m);
        };
      }}
      color={look.color}
      metalness={look.metalness}
      roughness={look.roughness}
      transparent={seeThrough}
      opacity={look.opacity}
      depthWrite={!seeThrough}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={intensity}
    />
  );
}

/** The liquid fills the tank from its bottom up to `level` (0..1); dimmed when the tank is offline. */
function Liquid({
  radius,
  height,
  level,
  color,
  opacity,
  dim,
}: {
  radius: number;
  height: number;
  level: number;
  color: string;
  opacity: number;
  dim: boolean;
}) {
  const inner = height * 0.96;
  const depth = Math.max(0.001, inner * Math.min(1, Math.max(0, level)));
  const shown = dim ? opacity * 0.45 : opacity;
  return (
    <mesh position={[0, -inner / 2 + depth / 2, 0]} raycast={() => null}>
      <cylinderGeometry args={[radius, radius, depth, 32]} />
      <meshStandardMaterial
        color={color}
        transparent={shown < 1}
        opacity={shown}
        depthWrite={shown >= 1}
        roughness={0.2}
      />
    </mesh>
  );
}
