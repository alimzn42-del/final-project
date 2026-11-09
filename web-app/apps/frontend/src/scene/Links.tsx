/**
 * Tubes and cables (machine.json `links`, owner step 17): the pump tubes, the RS485 chain and
 * the Ethernet cables, each drawn along its path as thin cylinders (hard rule 7: primitives).
 *
 * Smooth on a phone (owner, step 17): every segment of one kind is an instance of a single
 * mesh, so all the links together cost three draw calls. They never catch the pointer.
 */
import type { Link, LinkKind } from '@mixline/shared';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CylinderGeometry, type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';

import { MM, toScene } from './frame';

/** Physical looks: clear silicone tube, an RS485 twisted pair, a yellow Cat6 cable. */
export const LINK_LOOKS: Record<LinkKind, { color: string; opacity: number; diameterMm: number }> =
  {
    tube: { color: '#dfe8ee', opacity: 0.6, diameterMm: 6 },
    rs485: { color: '#9a5b34', opacity: 1, diameterMm: 5 },
    ethernet: { color: '#d4a51c', opacity: 1, diameterMm: 6 },
  };

type Segment = readonly [Vector3, Vector3];

/** Every straight piece of the links of one kind, in scene metres. */
export function segmentsOf(links: readonly Link[], kind: LinkKind): Segment[] {
  return links
    .filter((l) => l.kind === kind)
    .flatMap((l) =>
      l.path.slice(1).map((point, i): Segment => {
        const from = l.path[i] ?? point;
        return [new Vector3(...toScene(from)), new Vector3(...toScene(point))];
      }),
    );
}

export function Links({ links }: { links: readonly Link[] }) {
  return (
    <>
      {(Object.keys(LINK_LOOKS) as LinkKind[]).map((kind) => {
        const segments = segmentsOf(links, kind);
        // The instance count is fixed when the mesh is made, so a new count is a new mesh.
        return segments.length > 0 ? (
          <KindMesh key={`${kind}-${String(segments.length)}`} kind={kind} segments={segments} />
        ) : null;
      })}
    </>
  );
}

const UP = new Vector3(0, 1, 0);

function KindMesh({ kind, segments }: { kind: LinkKind; segments: Segment[] }) {
  const look = LINK_LOOKS[kind];
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  // One unit cylinder (radius 1, height 1, 8 sides), stretched per segment.
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 8, 1, true), []);
  useLayoutEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const radius = (look.diameterMm / 2) * MM;
    const matrix = new Matrix4();
    const turn = new Quaternion();
    segments.forEach(([a, b], i) => {
      const along = b.clone().sub(a);
      const length = along.length();
      turn.setFromUnitVectors(UP, length > 0 ? along.normalize() : UP);
      matrix.compose(
        a.clone().add(b).multiplyScalar(0.5),
        turn,
        new Vector3(radius, Math.max(length, 1e-6), radius),
      );
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [segments, look, invalidate]);

  const seeThrough = look.opacity < 1;
  return (
    <instancedMesh
      ref={mesh}
      name={`links-${kind}`}
      args={[geometry, undefined, segments.length]}
      raycast={() => null}
    >
      <meshStandardMaterial
        color={look.color}
        roughness={0.6}
        transparent={seeThrough}
        opacity={look.opacity}
        depthWrite={!seeThrough}
      />
    </instancedMesh>
  );
}
