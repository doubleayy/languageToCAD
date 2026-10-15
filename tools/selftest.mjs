#!/usr/bin/env node
// Setup check for attendees: every example builds, measures and renders, the
// checker catches a known-bad answer, and the reference skill's bundled copies
// are in sync with the app.
import fs from 'node:fs';
import path from 'node:path';
import { validateSpec } from '../app/lib/validate.mjs';
import { buildMesh } from '../app/lib/build.mjs';
import { runChecks } from './check.mjs';
import { renderSpec } from './render.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

for (const f of fs.readdirSync('examples').filter((f) => f.endsWith('.json'))) {
  const spec = JSON.parse(fs.readFileSync(path.join('examples', f), 'utf8'));
  ok(validateSpec(spec).errors.length === 0, `${f} validates`);
  const { stats } = buildMesh(spec);
  ok(stats.triangles > 0 && stats.volume_mm3 > 0, `${f} builds (${stats.size.join(' x ')} mm)`);
  ok(renderSpec(spec, { size: 64 }).png.length > 100, `${f} renders`);
}

const plate = JSON.parse(fs.readFileSync('examples/mounting-plate.json', 'utf8'));
const holeCheck = [{ type: 'open', from: [-34, -19, -1], to: [-34, -19, 7] }];
ok(runChecks(plate, holeCheck).results[0].passed, 'checker finds a real through-hole');
const noHoles = { ...plate, features: plate.features.slice(0, 1) };
ok(!runChecks(noHoles, holeCheck).results[0].passed, 'checker fails a plate without holes');

const same = (a, b) => !fs.existsSync(b) || fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8');
ok(same('app/lib/validate.mjs', 'solutions/session-1/cad-spec/scripts/validate.mjs'), 'reference skill validator matches app/lib/validate.mjs');
ok(same('app/SPEC_FORMAT.md', 'solutions/session-1/cad-spec/references/spec-format.md'), 'reference skill spec-format matches app/SPEC_FORMAT.md');

console.log(failures ? `\n${failures} self-test(s) failed` : '\nAll self-tests passed');
process.exit(failures ? 1 : 0);
