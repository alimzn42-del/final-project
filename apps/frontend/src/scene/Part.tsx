/**
 * One part of the line, drawn from machine.json with simple shapes (hard rule
 * 7): a box, a cylinder, or the six walls of a hollow box; tanks show their
 * liquid. A pending part is a see-through placeholder with a tag (doc 03).
 * Highlighted parts glow in the brand's light blue (surface and edges), never a state colour.
 */
import type { Machine, MachineComponent } from '@mixline/shared';
import { Edges, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { hollowWalls, partFrame, type Vec3 } from './frame';
import { type Look, liquidLook, partLook } from './looks';
import styles from './scene.module.css';

export interface PartProps {
  part: MachineComponent;
  machine: Machine;
  /** The glow colour when highlighted (hover); undefined when not. */
  glow?: string | undefined;
  /** Closed boxes: see-through walls when their inside is the subject (owner, step 12). */
  seeThrough?: boolean;
  /** Text of the tag on a pending part; no tag when undefined. */
  pendingTag?: string | undefined;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export function Part({
  part,
  machine,
  glow,
  seeThrough = false,
  pendingTag,
  onPointerOver,
  onPointerOut,
  onClick,
}: PartProps) {
  const frame = partFrame(part);
  const look = partLook(part, { seeThrough });
  const g = part.geometry;
  const [, height] = frame.size;
  const surface = <Surface look={look} glow={glow} />;

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
              {glow && <Edges color={glow} threshold={20} />}
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
            {glow && <Edges color={glow} threshold={20} />}
          </mesh>
        )}
        {g.shape === 'cylinder' && g.liquid && (
          <Liquid
            radius={(g.diameter / 2000) * 0.94}
            height={height}
            level={g.liquid.level}
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

function Surface({ look, glow }: { look: Look; glow: string | undefined }) {
  const seeThrough = look.opacity < 1;
  return (
    <meshStandardMaterial
      color={look.color}
      metalness={look.metalness}
      roughness={look.roughness}
      transparent={seeThrough}
      opacity={look.opacity}
      depthWrite={!seeThrough}
      emissive={glow ?? '#000000'}
      emissiveIntensity={glow ? 0.35 : 0}
    />
  );
}

/** The liquid fills the tank from its bottom up to `level` (0..1); live levels come in step 14. */
function Liquid({
  radius,
  height,
  level,
  color,
  opacity,
}: {
  radius: number;
  height: number;
  level: number;
  color: string;
  opacity: number;
}) {
  const inner = height * 0.96;
  const depth = Math.max(0.001, inner * Math.min(1, Math.max(0, level)));
  return (
    <mesh position={[0, -inner / 2 + depth / 2, 0]} raycast={() => null}>
      <cylinderGeometry args={[radius, radius, depth, 32]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
        roughness={0.2}
      />
    </mesh>
  );
}
