#!/usr/bin/env node
// Builds a CAD spec with real CSG and prints what came out, as JSON:
// validation errors/warnings, exact bounding box, size and volume.
//
//   npm run measure -- app/models/my-part.json
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateSpec } from '../app/lib/validate.mjs';
import { buildMesh } from '../app/lib/build.mjs';

export function measureFile(file) {
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { file, valid: false, errors: [`Cannot read JSON: ${e.message}`], warnings: [] }; }
  const { errors, warnings } = validateSpec(spec);
  if (errors.length) return { file, valid: false, errors, warnings };
  try {
    const { stats } = buildMesh(spec);
    if (stats.triangles === 0) return { file, valid: false, errors: ['CSG produced an empty solid'], warnings, ...stats };
    return { file, valid: true, errors, warnings, name: spec.name, features: spec.features.length, ...stats };
  } catch (e) {
    return { file, valid: false, errors: [`CSG build failed: ${e.message}`], warnings };
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === fs.realpathSync(process.argv[1]).toLowerCase();
if (isMain) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: npm run measure -- <model.json> [...]'); process.exit(2); }
  const results = files.map(measureFile);
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  process.exit(results.every((r) => r.valid) ? 0 : 1);
}
