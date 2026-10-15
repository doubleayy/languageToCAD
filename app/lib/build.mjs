// Turns a CAD spec (see app/SPEC_FORMAT.md) into a single three.js mesh using
// constructive solid geometry. Runs in the browser (viewer) and in Node
// (tools/measure.mjs, evals/grade.mjs) so both see exactly the same solid.
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

const OPS = { add: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };
const SEGMENTS = 64;
const DEG = Math.PI / 180;

function geometryFor(f) {
  switch (f.shape) {
    case 'box':
      return new THREE.BoxGeometry(f.size[0], f.size[1], f.size[2]);
    case 'cylinder':
      // three.js cylinders run along Y; the spec says local Z.
      return new THREE.CylinderGeometry(f.radius, f.radius, f.height, SEGMENTS).rotateX(90 * DEG);
    case 'cone':
      return new THREE.CylinderGeometry(f.radiusTop ?? 0, f.radiusBottom, f.height, SEGMENTS).rotateX(90 * DEG);
    case 'sphere':
      return new THREE.SphereGeometry(f.radius, SEGMENTS, SEGMENTS / 2);
    case 'torus':
      return new THREE.TorusGeometry(f.radius, f.tube, SEGMENTS / 2, SEGMENTS);
    default:
      throw new Error(`Unknown shape "${f.shape}" in feature "${f.id}"`);
  }
}

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

// One matrix per instance: a feature without a pattern yields one instance.
export function instanceMatrices(f) {
  const [px, py, pz] = f.position ?? [0, 0, 0];
  const [rx, ry, rz] = f.rotation ?? [0, 0, 0];
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  );
  const p = f.pattern;
  if (!p) return [local];

  const out = [];
  for (let i = 0; i < p.count; i++) {
    if (p.type === 'linear') {
      const [dx, dy, dz] = p.step;
      out.push(new THREE.Matrix4().makeTranslation(dx * i, dy * i, dz * i).multiply(local));
    } else if (p.type === 'circular') {
      const total = p.angle ?? 360;
      const step = total === 360 ? 360 / p.count : total / Math.max(p.count - 1, 1);
      const [cx, cy, cz] = p.center ?? [0, 0, 0];
      const m = new THREE.Matrix4().makeTranslation(cx, cy, cz)
        .multiply(new THREE.Matrix4().makeRotationAxis(AXES[p.axis ?? 'z'], (p.startAngle ?? 0) * DEG + step * i * DEG))
        .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz))
        .multiply(local);
      out.push(m);
    } else {
      throw new Error(`Unknown pattern type "${p.type}" in feature "${f.id}"`);
    }
  }
  return out;
}

// Exactly coplanar faces (a post standing on a floor, a pocket flush with a top)
// make CSG split triangles explosively: 40 triangles can become 100k and take a
// minute. Growing every tool after the first by a few microns removes the exact
// coincidence without changing any measurable dimension.
const COPLANAR_NUDGE = 1 + 1e-4;

function brushFor(geometry, matrix, material, nudge) {
  const b = new Brush(geometry, material);
  matrix.decompose(b.position, b.quaternion, b.scale);
  if (nudge) b.scale.multiplyScalar(COPLANAR_NUDGE);
  b.updateMatrixWorld(true);
  return b;
}

// Returns { mesh, stats }. Throws on an unbuildable spec.
export function buildMesh(spec, material = new THREE.MeshStandardMaterial({ color: spec.color ?? '#8fa3b8' })) {
  if (!spec?.features?.length) throw new Error('Spec has no features');
  if (spec.features[0].op !== 'add') throw new Error('The first feature must have op "add"');

  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal'];
  evaluator.useGroups = false;

  let acc = null;
  let instances = 0;
  for (const f of spec.features) {
    const op = OPS[f.op];
    if (op === undefined) throw new Error(`Unknown op "${f.op}" in feature "${f.id}"`);
    const geometry = geometryFor(f);
    for (const m of instanceMatrices(f)) {
      instances++;
      const brush = brushFor(geometry, m, material, acc !== null);
      acc = acc === null ? brush : evaluator.evaluate(acc, brush, op);
      acc.updateMatrixWorld(true);
    }
  }

  const mesh = new THREE.Mesh(acc.geometry, material);
  mesh.geometry.computeBoundingBox();
  return { mesh, stats: measureGeometry(mesh.geometry, instances) };
}

export function measureGeometry(geometry, instances = 0) {
  const box = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox);
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    volume += a.dot(b.clone().cross(c)) / 6; // signed tetrahedron volume
  }
  const r = (n) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0
  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    bbox: { min: [r(box.min.x), r(box.min.y), r(box.min.z)], max: [r(box.max.x), r(box.max.y), r(box.max.z)] },
    size: [r(size.x), r(size.y), r(size.z)],
    volume_mm3: r(Math.abs(volume)),
    triangles: triCount,
    instances,
  };
}
