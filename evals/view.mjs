#!/usr/bin/env node
// Opens skill-creator's benchmark + review viewer on an eval iteration.
//
//   npm run eval:view                                   latest iteration
//   npm run eval:view -- evals/workspace/iteration-2    a specific one (compares with iteration-1)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findSkillCreator() {
  const home = os.homedir();
  const candidates = [path.join(home, '.claude', 'skills', 'skill-creator')];
  const cache = path.join(home, '.claude', 'plugins', 'cache');
  const walk = (dir, depth) => {
    if (depth > 5 || !fs.existsSync(dir)) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const full = path.join(dir, d.name);
      if (d.name === 'skill-creator' && fs.existsSync(path.join(full, 'eval-viewer', 'generate_review.py'))) candidates.push(full);
      else walk(full, depth + 1);
    }
  };
  walk(cache, 0);
  return candidates
    .filter((c) => fs.existsSync(path.join(c, 'eval-viewer', 'generate_review.py')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const ws = path.join('evals', 'workspace');
const latest = fs.existsSync(ws) ? fs.readdirSync(ws).filter((d) => d.startsWith('iteration-')).sort((a, b) => b.split('-')[1] - a.split('-')[1])[0] : null;
const iterationDir = path.resolve(process.argv[2] ?? (latest ? path.join(ws, latest) : ''));
if (!fs.existsSync(iterationDir)) { console.error('No eval iteration found. Run `npm run eval` first.'); process.exit(1); }

const sc = findSkillCreator();
if (!sc) { console.error('skill-creator not found. Install it: /plugin install skill-creator@claude-plugins-official'); process.exit(1); }
// On Windows never probe python3: it's usually the Microsoft Store stub, and spawning
// it breaks every later child process in this Node process (AssignProcessToJobObject).
const launchers = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
const python = launchers.find((p) => spawnSync(p, ['--version']).status === 0);
if (!python) { console.error('Python 3 is needed for the skill-creator viewer.'); process.exit(1); }

const run = (args) => {
  // PYTHONUTF8: on Windows Python otherwise reads the outputs as cp1252 and garbles × ° ³.
  const r = spawnSync(python, args, { cwd: sc, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(['-m', 'scripts.aggregate_benchmark', iterationDir, '--skill-name', 'cad-spec']);

const n = Number(path.basename(iterationDir).split('-')[1]);
const previous = path.join(path.dirname(iterationDir), `iteration-${n - 1}`);
const out = path.join(iterationDir, 'review.html');
run([
  path.join('eval-viewer', 'generate_review.py'), iterationDir,
  '--skill-name', 'cad-spec',
  '--benchmark', path.join(iterationDir, 'benchmark.json'),
  ...(fs.existsSync(previous) ? ['--previous-workspace', previous] : []),
  '--static', out,
]);
console.log(`\nReview page: ${out}`);
const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', out]] : process.platform === 'darwin' ? ['open', [out]] : ['xdg-open', [out]];
spawnSync(opener[0], opener[1], { stdio: 'ignore' });
