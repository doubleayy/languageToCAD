#!/usr/bin/env node
// Structural validator for CAD spec files (see app/SPEC_FORMAT.md).
// No dependencies, so it can be copied into a skill's scripts/ folder as-is.
//
//   node validate.mjs path/to/model.json      -> prints a report, exits 1 on errors
//   import { validateSpec } from './validate.mjs'
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHAPES = {
  box: { size: 'vec3+' },
  cylinder: { radius: '+', height: '+' },
  cone: { radiusBottom: '+', radiusTop: '0+', height: '+' },
  sphere: { radius: '+' },
  torus: { radius: '+', tube: '+' },
};
const OPS = ['add', 'subtract', 'intersect'];
const FEATURE_KEYS = new Set(['id', 'op', 'shape', 'position', 'rotation', 'pattern', 'note']);
const TOP_KEYS = new Set(['name', 'units', 'description', 'color', 'parameters', 'features']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);

// --- tiny matrix helpers, for the approximate envelope -----------------------
const DEG = Math.PI / 180;
function rotXYZ([rx, ry, rz]) {
  const [a, b, c] = [rx * DEG, ry * DEG, rz * DEG];
  const X = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Y = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
  const Z = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  return mul(mul(X, Y), Z); // three.js 'XYZ' Euler order
}
function mul(A, B) { return A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0))); }
function apply(M, v) { return M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]); }
function axisRot(axis, deg) {
  return rotXYZ(axis === 'x' ? [deg, 0, 0] : axis === 'y' ? [0, deg, 0] : [0, 0, deg]);
}

function halfExtents(f) {
  switch (f.shape) {
    case 'box': return f.size.map((s) => s / 2);
    case 'cylinder': return [f.radius, f.radius, f.height / 2];
    case 'cone': { const r = Math.max(f.radiusBottom, f.radiusTop ?? 0); return [r, r, f.height / 2]; }
    case 'sphere': return [f.radius, f.radius, f.radius];
    case 'torus': return [f.radius + f.tube, f.radius + f.tube, f.tube];
  }
}

// Axis-aligned box around every instance of a feature (corners of its local box, transformed).
function featureBox(f) {
  const h = halfExtents(f);
  const R = rotXYZ(f.rotation ?? [0, 0, 0]);
  const p = f.position ?? [0, 0, 0];
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = apply(R, [sx * h[0], sy * h[1], sz * h[2]]);
    corners.push([c[0] + p[0], c[1] + p[1], c[2] + p[2]]);
  }
  const pts = [];
  const pat = f.pattern;
  const count = pat ? pat.count : 1;
  for (let i = 0; i < count; i++) {
    for (const c of corners) {
      if (!pat) pts.push(c);
      else if (pat.type === 'linear') pts.push(c.map((v, k) => v + pat.step[k] * i));
      else {
        const total = pat.angle ?? 360;
        const step = total === 360 ? 360 / count : total / Math.max(count - 1, 1);
        const ctr = pat.center ?? [0, 0, 0];
        const r = apply(axisRot(pat.axis ?? 'z', (pat.startAngle ?? 0) + step * i), c.map((v, k) => v - ctr[k]));
        pts.push(r.map((v, k) => v + ctr[k]));
      }
    }
  }
  return {
    min: [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k]))),
    max: [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k]))),
  };
}
const overlaps = (a, b) => [0, 1, 2].every((k) => a.min[k] < b.max[k] && b.min[k] < a.max[k]);

export function validateSpec(spec) {
  const errors = [];
  const warnings = [];
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) return { errors: ['Spec must be a JSON object'], warnings };

  if (typeof spec.name !== 'string' || !spec.name.trim()) errors.push('"name" must be a non-empty string');
  if (spec.units !== 'mm') errors.push('"units" must be "mm"');
  if (spec.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(spec.color)) errors.push('"color" must look like "#rrggbb"');
  for (const k of Object.keys(spec)) if (!TOP_KEYS.has(k)) warnings.push(`Unknown top-level key "${k}" is ignored`);
  if (!Array.isArray(spec.features) || spec.features.length === 0) {
    errors.push('"features" must be a non-empty array');
    return { errors, warnings };
  }
  if (spec.features[0]?.op !== 'add') errors.push('The first feature must have "op": "add"');

  const ids = new Set();
  spec.features.forEach((f, i) => {
    const where = `features[${i}]${f?.id ? ` ("${f.id}")` : ''}`;
    if (typeof f !== 'object' || f === null) return errors.push(`${where} must be an object`);
    if (typeof f.id !== 'string' || !f.id) errors.push(`${where}: "id" must be a non-empty string`);
    else if (ids.has(f.id)) errors.push(`${where}: duplicate id "${f.id}"`);
    else ids.add(f.id);
    if (!OPS.includes(f.op)) errors.push(`${where}: "op" must be one of ${OPS.join(', ')}`);
    const dims = SHAPES[f.shape];
    if (!dims) return errors.push(`${where}: "shape" must be one of ${Object.keys(SHAPES).join(', ')}`);

    for (const [key, kind] of Object.entries(dims)) {
      const v = f[key];
      if (kind === 'vec3+' && !(isVec3(v) && v.every((n) => n > 0))) errors.push(`${where}: ${f.shape} needs "${key}": [x, y, z] with positive numbers`);
      if (kind === '+' && !(isNum(v) && v > 0)) errors.push(`${where}: ${f.shape} needs "${key}" as a positive number`);
      if (kind === '0+' && v !== undefined && !(isNum(v) && v >= 0)) errors.push(`${where}: "${key}" must be a number >= 0`);
    }
    for (const k of Object.keys(f)) if (!FEATURE_KEYS.has(k) && !(k in dims)) warnings.push(`${where}: key "${k}" is not used by a ${f.shape} and is ignored`);
    if (f.position !== undefined && !isVec3(f.position)) errors.push(`${where}: "position" must be [x, y, z]`);
    if (f.rotation !== undefined && !isVec3(f.rotation)) errors.push(`${where}: "rotation" must be [rx, ry, rz] in degrees`);
    if (f.shape === 'torus' && isNum(f.tube) && isNum(f.radius) && f.tube >= f.radius) warnings.push(`${where}: torus "tube" >= "radius" makes a self-intersecting ring`);

    const p = f.pattern;
    if (p !== undefined) {
      if (!Number.isInteger(p.count) || p.count < 1 || p.count > 500) errors.push(`${where}: pattern "count" must be an integer from 1 to 500`);
      if (p.type === 'linear') { if (!isVec3(p.step)) errors.push(`${where}: linear pattern needs "step": [dx, dy, dz]`); }
      else if (p.type === 'circular') {
        if (p.axis !== undefined && !['x', 'y', 'z'].includes(p.axis)) errors.push(`${where}: circular pattern "axis" must be x, y or z`);
        if (p.center !== undefined && !isVec3(p.center)) errors.push(`${where}: circular pattern "center" must be [x, y, z]`);
      } else errors.push(`${where}: pattern "type" must be "linear" or "circular"`);
    }
  });
  if (errors.length) return { errors, warnings };

  // Geometry sanity checks on approximate (axis-aligned) envelopes.
  let solid = null;
  for (const f of spec.features) {
    const b = featureBox(f);
    if (f.op === 'add') {
      solid = solid ? { min: solid.min.map((v, k) => Math.min(v, b.min[k])), max: solid.max.map((v, k) => Math.max(v, b.max[k])) } : b;
    } else if (!overlaps(b, solid)) {
      if (f.op === 'intersect') errors.push(`"${f.id}" (intersect) does not touch the solid built so far, so the result is empty`);
      else warnings.push(`"${f.id}" (subtract) does not touch the solid built so far, so it has no effect`);
    } else if (f.op === 'intersect') {
      solid = { min: solid.min.map((v, k) => Math.max(v, b.min[k])), max: solid.max.map((v, k) => Math.min(v, b.max[k])) };
    }
  }
  const round = (v) => Math.round(v * 100) / 100 + 0;
  const envelope = { min: solid.min.map(round), max: solid.max.map(round), size: solid.max.map((v, k) => round(v - solid.min[k])) };
  if (Math.abs(envelope.min[2]) > 0.01) warnings.push(`The part's lowest point is z=${envelope.min[2]}, not 0. Parts usually sit on the XY floor.`);
  return { errors, warnings, envelope };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === fs.realpathSync(process.argv[1]).toLowerCase();
if (isMain) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node validate.mjs <model.json>'); process.exit(2); }
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.log(`INVALID ${file}\n  error: not valid JSON: ${e.message}`); process.exit(1); }
  const { errors, warnings, envelope } = validateSpec(spec);
  console.log(`${errors.length ? 'INVALID' : 'VALID'} ${file}`);
  for (const e of errors) console.log(`  error: ${e}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  if (envelope) console.log(`  approx size (mm): ${envelope.size.join(' x ')}  (min ${envelope.min.join(', ')} / max ${envelope.max.join(', ')})`);
  process.exit(errors.length ? 1 : 0);
}
