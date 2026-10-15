#!/usr/bin/env node
// Runs every eval prompt headlessly, with the skill and without it (baseline),
// then grades each run. Output layout matches skill-creator's workspace, so its
// benchmark and review viewer work on it (npm run eval:view).
//
//   npm run eval                                  all evals, with + without skill, 1 run each
//   npm run eval -- --only 2,5 --runs 3           a subset, 3 runs each (see variance)
//   npm run eval -- --configs with_skill          skip the baseline
//   npm run eval -- --model haiku --concurrency 6
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, pool, DEFAULT_TOOLS, DEFAULT_MODEL } from '../tools/claude.mjs';
import { gradeRun, printSummary } from './grade.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const model = arg('model', DEFAULT_MODEL);
const runs = Number(arg('runs', 1));
const concurrency = Number(arg('concurrency', 4));
const configs = arg('configs', 'with_skill,without_skill').split(',');
const only = arg('only', '') ? arg('only').split(',').map(Number) : null;

const skillDir = path.join('.claude', 'skills', 'cad-spec');
if (configs.includes('with_skill') && !fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
  console.error(`No skill at ${skillDir}/SKILL.md. Finish Session 1 first, or: cp -r solutions/session-1/cad-spec .claude/skills/`);
  process.exit(1);
}

const { evals } = JSON.parse(fs.readFileSync('evals/evals.json', 'utf8'));
const selected = evals.filter((e) => !only || only.includes(e.id));
const ws = path.join('evals', 'workspace');
fs.mkdirSync(ws, { recursive: true });
const n = Number(arg('iteration', 0)) || 1 + Math.max(0, ...fs.readdirSync(ws).map((d) => Number(d.split('-')[1]) || 0));
const iterationDir = path.join(ws, `iteration-${n}`);

const jobs = [];
for (const e of selected) {
  const evalDir = path.join(iterationDir, `eval-${e.id}-${e.name}`);
  const meta = JSON.stringify({ eval_id: e.id, eval_name: e.name, prompt: e.prompt, assertions: e.checks.map((c) => c.text ?? c.type) }, null, 2);
  fs.mkdirSync(evalDir, { recursive: true });
  fs.writeFileSync(path.join(evalDir, 'eval_metadata.json'), meta);
  for (const config of configs) {
    fs.mkdirSync(path.join(evalDir, config), { recursive: true });
    fs.writeFileSync(path.join(evalDir, config, 'eval_metadata.json'), meta); // the review viewer looks here
    for (let r = 1; r <= runs; r++) jobs.push({ evalCase: e, config, run: `run-${r}`, runDir: path.join(evalDir, config, `run-${r}`) });
  }
}

console.log(`Iteration ${n}: ${jobs.length} run(s) on ${model}, ${concurrency} at a time -> ${iterationDir}\n`);
const rows = await pool(jobs, concurrency, async (job) => {
  const { evalCase, config, runDir } = job;
  const outputs = path.join(runDir, 'outputs');
  fs.mkdirSync(outputs, { recursive: true });
  const target = path.join(outputs, 'model.json').replaceAll('\\', '/');
  const label = `${evalCase.name} / ${config} / ${job.run}`;
  console.log(`start  ${label}`);

  const transcript = fs.createWriteStream(path.join(runDir, 'transcript.jsonl'));
  const { code } = await runClaude({
    prompt: `${evalCase.prompt}\n\nSave the finished CAD spec JSON to ${target}`,
    args: [
      '--model', model, '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits', '--allowedTools', ...DEFAULT_TOOLS,
      ...(config === 'without_skill' ? ['--disable-slash-commands'] : []),
    ],
    onLine: (l) => transcript.write(l + '\n'),
  });
  await new Promise((res) => transcript.end(res));

  const graded = gradeRun(runDir, evalCase);
  fs.writeFileSync(path.join(outputs, 'agent-report.md'), graded.facts.result ?? `(no final message, exit code ${code})`);
  writeReadableTranscript(runDir, graded.facts);
  const s = graded.grading.summary;
  console.log(`done   ${label}: ${s.passed}/${s.total} checks, ${Math.round(graded.facts.durationMs / 1000)}s`);
  return { ...job, ...graded };
});

console.log();
printSummary(rows);
console.log(`\nInspect runs in ${iterationDir}/eval-*/<config>/run-*/  (transcript.md, grading.json, outputs/render.png)`);
console.log(`Open the skill-creator review viewer: npm run eval:view -- ${iterationDir.replaceAll('\\', '/')}`);

// transcript.md: a short, human-readable trace of what the agent did.
function writeReadableTranscript(runDir, facts) {
  const lines = [`# Transcript summary`, '', `Turns: ${facts.turns} | Seconds: ${Math.round(facts.durationMs / 1000)} | Cost: $${facts.costUsd.toFixed(3)}`, ''];
  lines.push(`Skills invoked: ${facts.skills.join(', ') || 'none'}`, '');
  lines.push('Tool calls: ' + Object.entries(facts.toolCalls).map(([k, v]) => `${k} x${v}`).join(', '), '');
  lines.push('Bash commands:', ...facts.bashCommands.map((c) => `- \`${c.replaceAll('\n', ' ').slice(0, 200)}\``), '');
  lines.push('Final message:', '', facts.result ?? '(none)');
  fs.writeFileSync(path.join(runDir, 'transcript.md'), lines.join('\n'));
}
