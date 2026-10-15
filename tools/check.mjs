#!/usr/bin/env node
// Acceptance checks for a CAD spec, run against the real CSG solid.
// Used by the text-to-cad workflow (agent writes checks before designing) and by
// the eval grader (humans write checks per eval case).
//
//   npm run check -- app/models/part.json app/checks/part.checks.json
//
// A checks file is a JSON array. Each check may carry a "text" label; otherwise one
// is generated. Supported checks:
//   { "type": "valid" }                                         spec validates and builds
//   { "type": "size", "expected": [x, y, z], "tolerance": 1 }   bounding box size (mm); null = any value on
//                                                               that axis; "any_orientation": true ignores axis order
//   { "type": "size_range", "min": [x, y, z], "max": [x, y, z] } each bounding box dimension within a range
//   { "type": "sits_on_floor" }                                 lowest point at z = 0
//   { "type": "centered_xy", "tolerance": 1 }                   bbox centred on the origin in X and Y
//   { "type": "volume", "min": 1000, "max": 2000 }              solid volume range (mm³)
//   { "type": "fill_ratio", "max": 0.6 }                        volume / bbox volume (hollow parts are low)
//   { "type": "count", "op": "subtract", "min": 4 }             feature instances (patterns expanded) by op
//   { "type": "has_shape", "shape": "torus" }                   uses a primitive at least once
//   { "type": "open", "from": [x,y,z], "to": [x,y,z] }          no material along the segment (a hole/gap)
//   { "type": "solid", "point": [x, y, z] }                     the point is inside material
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { validateSpec } from '../app/lib/validate.mjs';
import { buildMesh, instanceMatrices } from '../app/lib/build.mjs';

const fmt = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

function label(c) {
  if (c.text) return c.text;
  switch (c.type) {
    case 'valid': return 'Spec is valid and builds a solid';
    case 'size': return `Overall size is ${c.expected.map((v) => v ?? 'any').join(' x ')} mm (±${c.tolerance ?? 1})${c.any_orientation ? ', any orientation' : ''}`;
    case 'size_range': return `Each dimension between ${c.min.join(' x ')} and ${c.max.join(' x ')} mm`;
    case 'sits_on_floor': return 'Part sits on the floor (min z = 0)';
    case 'centered_xy': return 'Part is centred on the origin in X and Y';
    case 'volume': return `Volume is between ${c.min ?? 0} and ${c.max ?? '∞'} mm³`;
    case 'fill_ratio': return `Volume fills at most ${Math.round(c.max * 100)}% of its bounding box`;
    case 'count': return `At least ${c.min} ${c.op} feature instance(s)`;
    case 'has_shape': return `Uses a ${c.shape}`;
    case 'open': return `Open (no material) from ${fmt(c.from)} to ${fmt(c.to)}`;
    case 'solid': return `Material at ${fmt(c.point)}`;
    default: return `Unknown check "${c.type}"`;
  }
}

function hitsAlong(mesh, from, to) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const ray = new THREE.Raycaster(a, dir.normalize(), 0, len);
  return ray.intersectObject(mesh, false);
}

// Slightly skewed so rays from "nice" points like (0, 0, 2.5) don't run exactly
// through triangle edges (a hit on a shared edge counts twice and flips parity).
const PARITY_RAYS = [[1, 0.0123, 0.0071], [-0.0093, 1, 0.0157], [0.0111, -0.0137, 1]];

function isInside(mesh, point) {
  // Parity test: an odd number of surface crossings means inside. Majority of 3 rays.
  const far = 1e5;
  const odd = PARITY_RAYS.filter((d) => {
    const to = point.map((v, k) => v + d[k] * far);
    return hitsAlong(mesh, point, to).length % 2 === 1;
  }).length;
  return odd >= 2;
}

export function runChecks(spec, checks) {
  const results = [];
  const { errors } = validateSpec(spec);
  let built = null;
  let buildError = errors[0];
  if (!errors.length) {
    try {
      built = buildMesh(spec);
      if (built.stats.triangles === 0) { buildError = 'CSG produced an empty solid'; built = null; }
    } catch (e) { buildError = e.message; }
  }
  if (built) {
    built.mesh.material.side = THREE.DoubleSide;
    built.mesh.updateMatrixWorld(true);
  }

  for (const c of checks) {
    const text = label(c);
    if (c.type === 'valid') {
      results.push({ text, passed: !!built, evidence: built ? 'Validated and built with CSG' : buildError });
      continue;
    }
    if (!built) { results.push({ text, passed: false, evidence: `Cannot check: ${buildError}` }); continue; }
    const s = built.stats;
    let passed = false, evidence = '';
    switch (c.type) {
      case 'size': {
        const tol = c.tolerance ?? 1;
        const got = c.any_orientation ? [...s.size].sort((a, b) => a - b) : s.size;
        const want = c.any_orientation ? [...c.expected].sort((a, b) => a - b) : c.expected;
        passed = got.every((v, i) => want[i] == null || Math.abs(v - want[i]) <= tol);
        evidence = `Measured size ${s.size.join(' x ')} mm`;
        break;
      }
      case 'size_range':
        passed = s.size.every((v, i) => v >= c.min[i] && v <= c.max[i]);
        evidence = `Measured size ${s.size.join(' x ')} mm`;
        break;
      case 'sits_on_floor':
        passed = Math.abs(s.bbox.min[2]) <= (c.tolerance ?? 0.01);
        evidence = `Lowest z = ${s.bbox.min[2]}`;
        break;
      case 'centered_xy': {
        const cx = (s.bbox.min[0] + s.bbox.max[0]) / 2, cy = (s.bbox.min[1] + s.bbox.max[1]) / 2;
        passed = Math.abs(cx) <= (c.tolerance ?? 1) && Math.abs(cy) <= (c.tolerance ?? 1);
        evidence = `Bounding box centre at x=${cx.toFixed(2)}, y=${cy.toFixed(2)}`;
        break;
      }
      case 'volume':
        passed = s.volume_mm3 >= (c.min ?? 0) && s.volume_mm3 <= (c.max ?? Infinity);
        evidence = `Volume ${s.volume_mm3} mm³`;
        break;
      case 'fill_ratio': {
        const ratio = s.volume_mm3 / (s.size[0] * s.size[1] * s.size[2]);
        passed = ratio <= c.max;
        evidence = `Fill ratio ${(ratio * 100).toFixed(1)}%`;
        break;
      }
      case 'count': {
        const n = spec.features.filter((f) => f.op === c.op).reduce((sum, f) => sum + instanceMatrices(f).length, 0);
        passed = n >= c.min;
        evidence = `${n} ${c.op} instance(s)`;
        break;
      }
      case 'has_shape': {
        const ids = spec.features.filter((f) => f.shape === c.shape).map((f) => f.id);
        passed = ids.length > 0;
        evidence = passed ? `Features: ${ids.join(', ')}` : `No ${c.shape} in spec`;
        break;
      }
      case 'open': {
        const hits = hitsAlong(built.mesh, c.from, c.to);
        passed = hits.length === 0 && !isInside(built.mesh, c.from);
        evidence = passed ? 'Ray passes through without touching material' : `Ray hits material at ${hits.length ? fmt(hits[0].point.toArray().map((v) => +v.toFixed(2))) : 'its start point'}`;
        break;
      }
      case 'solid':
        passed = isInside(built.mesh, c.point);
        evidence = passed ? 'Point is inside the solid' : 'Point is outside the solid';
        break;
      default:
        evidence = 'Unknown check type';
    }
    results.push({ text, passed, evidence });
  }
  return { results, stats: built?.stats ?? null };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === fs.realpathSync(process.argv[1]).toLowerCase();
if (isMain) {
  const [modelFile, checksFile] = process.argv.slice(2);
  if (!modelFile || !checksFile) { console.error('Usage: npm run check -- <model.json> <checks.json>'); process.exit(2); }
  let spec;
  try { spec = JSON.parse(fs.readFileSync(modelFile, 'utf8')); }
  catch (e) { console.log(`FAIL cannot read ${modelFile}: ${e.message}`); process.exit(1); }
  const checks = JSON.parse(fs.readFileSync(checksFile, 'utf8'));
  const { results, stats } = runChecks(spec, [{ type: 'valid' }, ...checks.filter((c) => c.type !== 'valid')]);
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.text}  — ${r.evidence}`);
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed${stats ? `  |  size ${stats.size.join(' x ')} mm, volume ${stats.volume_mm3} mm³` : ''}`);
  process.exit(passed === results.length ? 0 : 1);
}
