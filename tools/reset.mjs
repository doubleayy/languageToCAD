#!/usr/bin/env node
// Facilitator tool: puts the repo back to the workshop's starting state.
// Removes the skills, hook settings, generated models, checks, renders, eval
// results and batch logs. Shows what it would delete unless given --yes.
import fs from 'node:fs';
import path from 'node:path';

const keep = new Set(fs.readdirSync('examples').filter((f) => f.endsWith('.json')));
const targets = [
  '.claude/skills/cad-spec',
  '.claude/skills/text-to-cad',
  '.claude/settings.json',
  'app/checks',
  'app/renders',
  'evals/workspace',
  'pipeline/logs',
  ...fs.readdirSync('app/models').filter((f) => !keep.has(f)).map((f) => `app/models/${f}`),
].filter((p) => fs.existsSync(p));

if (!targets.length) { console.log('Already in the starting state.'); process.exit(0); }
if (!process.argv.includes('--yes')) {
  console.log('Would delete:\n' + targets.map((t) => `  ${t}`).join('\n') + '\n\nRun `npm run reset -- --yes` to delete them.');
  process.exit(0);
}
for (const t of targets) fs.rmSync(t, { recursive: true, force: true });
for (const f of keep) fs.copyFileSync(path.join('examples', f), path.join('app/models', f));
console.log(`Deleted ${targets.length} path(s); examples restored to app/models/.`);
