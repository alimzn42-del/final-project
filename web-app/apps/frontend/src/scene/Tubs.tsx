/**
 * The containers on the belt in 3D (owner, step 17): the real tub from machine.json, a tapered
 * black body with its rim and a clear flat lid. The body is opaque, so the liquid shows from
 * above only: its surface at the fill height, in the live mix colour, seen through the lid.
 *
 * Smooth on a phone (owner, step 17): every tub shares one set of geometries made once from
 * the container's sizes, with 32 sides; nothing animates, so the scene only redraws when a
 * reading changes it (frameloop "demand").
 */
import {
  containerSpec,
  type LatestReading,
  type Machine,
  radiusAt,
  type StateSnapshot,
  fillHeight,
  tubInside,
} from '@mixline/shared';
import { useEffect, useMemo, useState } from 'react';
import { CircleGeometry, CylinderGeometry, DoubleSide, RingGeometry } from 'three';

import { MM, toScene } from './frame';
import { liveMixColour } from './liquid';
import { MATERIAL_LOOKS } from './looks';
import { remember, tubsOnBelt, type TubView } from './onBelt';

const SIDES = 32;

export interface TubsProps {
  machine: Machine;
  readings: Readonly<Record<string, LatestReading>>;
  states?: StateSnapshot | undefined;
  /** Ids of the parts drawn on this page. */
  drawn: ReadonlySet<string>;
}

export function Tubs({ machine, readings, states, drawn }: TubsProps) {
  const shapes = useTubShapes(machine);
  const partOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of machine.components) for (const s of c.sensors) map.set(s.id, c.id);
    return map;
  }, [machine]);
  // Each new set of readings updates the memory of fills (React: state that follows a prop).
  const [kept, setKept] = useState(() => ({
    readings,
    memory: remember(machine, readings, new Map()),
  }));
  let memory = kept.memory;
  if (kept.readings !== readings) {
    memory = remember(machine, readings, kept.memory);
    setKept({ readings, memory });
  }
  const visible = (sensorId: string) => {
    const part = partOf.get(sensorId);
    return part !== undefined && drawn.has(part) && states?.sensors[sensorId] !== 'offline';
  };
  const tubs = tubsOnBelt(machine, readings, memory, visible);
  const colour = liveMixColour(machine, readings) ?? machine.liquids.mix.hex;

  return (
    <>
      {tubs.map((tub) => (
        <Tub key={tub.station} tub={tub} shapes={shapes} colour={colour} />
      ))}
    </>
  );
}

interface TubShapes {
  inside: ReturnType<typeof tubInside>;
  /** Top of the body and its rim, mm (the lid sits on it). */
  bodyTop: number;
  rimHeight: number;
  lidThickness: number;
  body: CylinderGeometry;
  bottom: CircleGeometry;
  rimSide: CylinderGeometry;
  rimTop: RingGeometry;
  lid: CylinderGeometry;
  surface: CircleGeometry;
}

/** One set of geometries for every tub, from machine.json's container (metres). */
function useTubShapes(machine: Machine): TubShapes {
  const shapes = useMemo(() => {
    const spec = containerSpec(machine.container);
    const inside = tubInside(spec);
    const bodyTop = spec.height - spec.lidThickness;
    const top = (spec.topDiameter / 2) * MM;
    const wallTop = (spec.topDiameter / 2 - spec.rimOverhang) * MM;
    return {
      inside,
      bodyTop,
      rimHeight: spec.rimHeight,
      lidThickness: spec.lidThickness,
      body: new CylinderGeometry(
        wallTop,
        (spec.baseDiameter / 2) * MM,
        bodyTop * MM,
        SIDES,
        1,
        true,
      ),
      bottom: new CircleGeometry((spec.baseDiameter / 2) * MM, SIDES),
      rimSide: new CylinderGeometry(top, top, spec.rimHeight * MM, SIDES, 1, true),
      rimTop: new RingGeometry(inside.topRadius * MM, top, SIDES),
      lid: new CylinderGeometry(top, top, spec.lidThickness * MM, SIDES),
      surface: new CircleGeometry(1, SIDES),
    };
  }, [machine]);
  useEffect(
    () => () => {
      for (const g of [
        shapes.body,
        shapes.bottom,
        shapes.rimSide,
        shapes.rimTop,
        shapes.lid,
        shapes.surface,
      ]) {
        g.dispose();
      }
    },
    [shapes],
  );
  return shapes;
}

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];
const black = MATERIAL_LOOKS.blackPlastic;
const clear = MATERIAL_LOOKS.clearPlastic;

function Tub({ tub, shapes, colour }: { tub: TubView; shapes: TubShapes; colour: string }) {
  const { inside, bodyTop, rimHeight, lidThickness } = shapes;
  const level = fillHeight(inside, tub.fillMl);
  const radius = radiusAt(inside, level) * MM;
  const blackSurface = (
    <meshStandardMaterial
      color={black.color}
      roughness={black.roughness}
      metalness={black.metalness}
      side={DoubleSide}
    />
  );
  return (
    <group name={`tub-${tub.station}`} position={toScene(tub.position)}>
      <mesh geometry={shapes.body} position={[0, (bodyTop * MM) / 2, 0]} raycast={() => null}>
        {blackSurface}
      </mesh>
      <mesh
        geometry={shapes.bottom}
        position={[0, inside.floor * MM, 0]}
        rotation={FLAT}
        raycast={() => null}
      >
        {blackSurface}
      </mesh>
      <mesh
        geometry={shapes.rimSide}
        position={[0, (bodyTop - rimHeight / 2) * MM, 0]}
        raycast={() => null}
      >
        {blackSurface}
      </mesh>
      <mesh
        geometry={shapes.rimTop}
        position={[0, bodyTop * MM, 0]}
        rotation={FLAT}
        raycast={() => null}
      >
        {blackSurface}
      </mesh>
      {level > 0 && (
        <mesh
          name="liquid"
          geometry={shapes.surface}
          position={[0, (inside.floor + level) * MM, 0]}
          rotation={FLAT}
          scale={[radius, radius, 1]}
          raycast={() => null}
        >
          <meshStandardMaterial color={colour} roughness={0.2} />
        </mesh>
      )}
      {tub.lid && (
        <mesh
          name="lid"
          geometry={shapes.lid}
          position={[0, (bodyTop + lidThickness / 2) * MM, 0]}
          raycast={() => null}
        >
          <meshStandardMaterial
            color={clear.color}
            roughness={clear.roughness}
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
