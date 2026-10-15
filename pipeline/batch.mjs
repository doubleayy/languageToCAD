#!/usr/bin/env node
// Batch text-to-CAD: runs `/text-to-cad <prompt>` headlessly for every line of
// pipeline/prompts.txt. Keep the viewer open — parts appear as they finish.
//
//   npm run batch                    (all prompts, 3 at a time)
//   npm run batch -- --concurrency 3 --model claude-sonnet-5 --file my-prompts.txt
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, pool, DEFAULT_TOOLS, DEFAULT_MODEL } from '../tools/claude.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const file = arg('file', 'pipeline/prompts.txt');
const model = arg('model', DEFAULT_MODEL);
const concurrency = Number(arg('concurrency', 3));

const prompts = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const logDir = path.join('pipeline', 'logs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(logDir, { recursive: true });
console.log(`Running ${prompts.length} prompt(s) with ${model}, ${concurrency} at a time. Logs: ${logDir}\n`);

const rows = await pool(prompts, concurrency, async (prompt, i) => {
  console.log(`[${i + 1}] start: ${prompt}`);
  const { code, stdout, stderr, ms } = await runClaude({
    prompt: `/text-to-cad ${prompt}`,
    args: ['--model', model, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', ...DEFAULT_TOOLS],
  });
  fs.writeFileSync(path.join(logDir, `${i + 1}.json`), stdout || stderr);
  let out = {};
  try { out = JSON.parse(stdout); } catch { /* reported below as failed */ }
  const ok = code === 0 && !out.is_error;
  console.log(`[${i + 1}] ${ok ? 'done' : 'FAILED'} in ${(ms / 1000).toFixed(0)}s`);
  return { '#': i + 1, prompt: prompt.slice(0, 50), ok, seconds: Math.round(ms / 1000), turns: out.num_turns ?? '-', cost_usd: out.total_cost_usd?.toFixed(3) ?? '-' };
});

console.log();
console.table(rows);
console.log(`Final reports from the agent are in ${logDir}/<n>.json (field "result").`);
