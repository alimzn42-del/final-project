/**
 * The containers on the belt in 3D (owner, step 17): the real tub from machine.json, a tapered
 * black body with its rim and a clear flat lid. The body is opaque, so the liquid shows from
 * above only: its surface at the fill height, in the live mix colour, seen through the lid.
 *
 * They slide along the belt while it runs (owner, step 17, option b; `onBelt.ts`).
 *
 * Smooth on a phone (owner, step 17): every tub shares one set of geometries made once from
 * the container's sizes, with 32 sides; frames are drawn only while the belt runs or a reading
 * changes something (frameloop "demand").
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
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { CircleGeometry, CylinderGeometry, DoubleSide, type Group, RingGeometry } from 'three';

import { MM, toScene } from './frame';
import { liveMixColour } from './liquid';
import { MATERIAL_LOOKS } from './looks';
import { EMPTY_BELT, follow, tubsOnBelt, type TubView, xAt } from './onBelt';

const SIDES = 32;

export interface TubsProps {
  machine: Machine;
  readings: Readonly<Record<string, LatestReading>>;
  states?: StateSnapshot | undefined;
  /** Ids of the parts drawn on this page. */
  drawn: ReadonlySet<string>;
  /** The server's clock minus the browser's, ms (live data): the belt's times are the line's. */
  clockOffset?: number;
}

type Readings = TubsProps['readings'];

/** The line's clock now: the browser's, corrected by the server's (live data). */
const lineNow = (clockOffset: number) => Date.now() + clockOffset;

/** The line's time of the newest reading: "now" as far as the readings know. */
const newest = (readings: Readings) =>
  Object.values(readings).reduce((t, r) => Math.max(t, Date.parse(r.ts)), 0);

export function Tubs({ machine, readings, states, drawn, clockOffset = 0 }: TubsProps) {
  const shapes = useTubShapes(machine);
  const invalidate = useThree((s) => s.invalidate);
  const partOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of machine.components) for (const s of c.sensors) map.set(s.id, c.id);
    return map;
  }, [machine]);
  // Each new set of readings moves the belt on (React: state that follows a prop).
  const [kept, setKept] = useState(() => ({
    readings,
    belt: follow(machine, EMPTY_BELT, readings, newest(readings)),
  }));
  let belt = kept.belt;
  if (kept.readings !== readings) {
    belt = follow(machine, kept.belt, readings, newest(readings));
    setKept({ readings, belt });
  }
  const running = machine.conveyor.runningSensor;
  const visible = (sensorId: string) => {
    const part = partOf.get(sensorId);
    const live = (id: string) => states?.sensors[id] !== 'offline';
    return part !== undefined && drawn.has(part) && live(sensorId) && live(running);
  };
  const tubs = tubsOnBelt(machine, belt, readings, newest(readings), visible);
  const colour = liveMixColour(machine, readings) ?? machine.liquids.mix.hex;

  // While the belt runs, the containers slide every frame (only then: frameloop "demand").
  const [groups] = useState(() => new Map<number, Group>());
  /** Puts every container where the belt has taken it at `now` (the line's clock). */
  const slide = (now: number) => {
    for (const tub of belt.tubs) {
      const group = groups.get(tub.id);
      if (group) group.position.x = xAt(machine, belt, tub, now) * MM;
    }
  };
  // After each render too, so a new reading never shows a container a step behind.
  useLayoutEffect(() => {
    slide(lineNow(clockOffset));
  });
  useFrame(() => {
    if (belt.movingSince === null) return;
    slide(lineNow(clockOffset));
    invalidate();
  });
  useEffect(() => {
    if (belt.movingSince !== null) invalidate();
  }, [belt.movingSince, invalidate]);

  return (
    <>
      {tubs.map((tub) => (
        <Tub
          key={tub.id}
          tub={tub}
          shapes={shapes}
          colour={colour}
          place={(group) => {
            if (group) groups.set(tub.id, group);
            else groups.delete(tub.id);
          }}
        />
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

function Tub({
  tub,
  shapes,
  colour,
  place,
}: {
  tub: TubView;
  shapes: TubShapes;
  colour: string;
  /** Hands the tub's group to the belt, which slides it while the belt runs. */
  place: (group: Group | null) => void;
}) {
  const { inside, bodyTop, rimHeight, lidThickness } = shapes;
  const level = fillHeight(inside, tub.ml);
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
    <group ref={place} name={`tub-${String(tub.id)}`} position={toScene(tub.position)}>
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
