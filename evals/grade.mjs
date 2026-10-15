#!/usr/bin/env node
// Grades eval runs: geometry checks from evals.json against outputs/model.json,
// plus behaviour checks read from the agent's transcript. Writes grading.json in
// the format skill-creator's aggregate_benchmark.py and review viewer expect.
//
//   npm run grade -- evals/workspace/iteration-1     (re-grade after editing checks)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../tools/check.mjs';
import { renderSpec } from '../tools/render.mjs';

const VERIFY_CMD = /validate\.mjs|npm run (measure|check|render)|tools[\\/](measure|check|render)\.mjs/;

// Reads a stream-json transcript into the facts the grader and reports need.
export function readTranscript(file) {
  const facts = { toolCalls: {}, bashCommands: [], skills: [], toolErrors: 0, result: null, turns: 0, costUsd: 0, durationMs: 0, tokens: 0 };
  if (!fs.existsSync(file)) return facts;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant') {
      for (const c of ev.message?.content ?? []) {
        if (c.type !== 'tool_use') continue;
        facts.toolCalls[c.name] = (facts.toolCalls[c.name] ?? 0) + 1;
        if (c.name === 'Bash') facts.bashCommands.push(c.input?.command ?? '');
        if (c.name === 'Skill') facts.skills.push(c.input?.skill ?? c.input?.command ?? '?');
      }
    } else if (ev.type === 'user') {
      for (const c of ev.message?.content ?? []) if (c.type === 'tool_result' && c.is_error) facts.toolErrors++;
    } else if (ev.type === 'result') {
      const u = ev.usage ?? {};
      facts.result = ev.result ?? '';
      facts.turns = ev.num_turns ?? 0;
      facts.costUsd = ev.total_cost_usd ?? 0;
      facts.durationMs = ev.duration_ms ?? 0;
      facts.tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    }
  }
  return facts;
}

export function gradeRun(runDir, evalCase) {
  const outputs = path.join(runDir, 'outputs');
  const modelFile = path.join(outputs, 'model.json');
  const facts = readTranscript(path.join(runDir, 'transcript.jsonl'));

  let expectations;
  let spec = null;
  try { spec = JSON.parse(fs.readFileSync(modelFile, 'utf8')); } catch { /* graded as missing below */ }
  if (spec) {
    expectations = runChecks(spec, evalCase.checks).results;
    try { fs.writeFileSync(path.join(outputs, 'render.png'), renderSpec(spec).png); } catch { /* invalid specs have no render */ }
  } else {
    const why = fs.existsSync(modelFile) ? 'outputs/model.json is not valid JSON' : 'No outputs/model.json was produced';
    expectations = runChecks({}, evalCase.checks).results.map((r) => ({ ...r, passed: false, evidence: why }));
  }

  const verified = facts.bashCommands.filter((c) => VERIFY_CMD.test(c));
  expectations.push({
    text: '[behaviour] Verified the model with a tool before finishing',
    passed: verified.length > 0,
    evidence: verified.length ? `Ran: ${verified.slice(0, 3).join(' | ')}` : 'No validate/measure/check/render command in the transcript',
  });

  const passed = expectations.filter((e) => e.passed).length;
  const grading = {
    expectations,
    summary: { passed, failed: expectations.length - passed, total: expectations.length, pass_rate: +(passed / expectations.length).toFixed(3) },
    execution_metrics: {
      tool_calls: facts.toolCalls,
      total_tool_calls: Object.values(facts.toolCalls).reduce((a, b) => a + b, 0),
      total_steps: facts.turns,
      errors_encountered: facts.toolErrors,
      output_chars: (facts.result ?? '').length,
      skills_invoked: facts.skills,
      cost_usd: facts.costUsd,
    },
    timing: { total_duration_seconds: +(facts.durationMs / 1000).toFixed(1) },
  };
  fs.writeFileSync(path.join(runDir, 'grading.json'), JSON.stringify(grading, null, 2));
  fs.writeFileSync(path.join(runDir, 'timing.json'), JSON.stringify({
    total_tokens: facts.tokens, duration_ms: facts.durationMs, total_duration_seconds: +(facts.durationMs / 1000).toFixed(1),
  }, null, 2));
  return { grading, facts };
}

// Finds every run directory (eval-*/<config>/run-*) in an iteration folder.
export function findRuns(iterationDir, evals) {
  const runs = [];
  for (const evalDir of fs.readdirSync(iterationDir).filter((d) => d.startsWith('eval-'))) {
    const id = Number(evalDir.split('-')[1]);
    const evalCase = evals.find((e) => e.id === id);
    if (!evalCase) continue;
    for (const config of fs.readdirSync(path.join(iterationDir, evalDir))) {
      const configDir = path.join(iterationDir, evalDir, config);
      if (!fs.statSync(configDir).isDirectory()) continue;
      for (const run of fs.readdirSync(configDir).filter((r) => r.startsWith('run-'))) {
        runs.push({ evalCase, config, run, runDir: path.join(configDir, run) });
      }
    }
  }
  return runs;
}

export function printSummary(rows) {
  console.table(rows.map((r) => ({
    eval: r.evalCase.name,
    config: r.config,
    run: r.run,
    checks: `${r.grading.summary.passed}/${r.grading.summary.total}`,
    'skill used': r.facts.skills.join(', ') || '-',
    turns: r.facts.turns,
    seconds: Math.round(r.facts.durationMs / 1000),
    'cost $': r.facts.costUsd.toFixed(3),
  })));
  const byConfig = {};
  for (const r of rows) (byConfig[r.config] ??= []).push(r);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  console.log('\nBy configuration:');
  console.table(Object.fromEntries(Object.entries(byConfig).map(([config, rs]) => [config, {
    'pass rate': `${(mean(rs.map((r) => r.grading.summary.pass_rate)) * 100).toFixed(0)}%`,
    'fully correct': `${rs.filter((r) => r.grading.summary.failed === 0).length}/${rs.length}`,
    'avg seconds': Math.round(mean(rs.map((r) => r.facts.durationMs / 1000))),
    'avg turns': mean(rs.map((r) => r.facts.turns)).toFixed(1),
    'avg cost $': mean(rs.map((r) => r.facts.costUsd)).toFixed(3),
  }])));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === fs.realpathSync(process.argv[1]).toLowerCase();
if (isMain) {
  const iterationDir = process.argv[2];
  if (!iterationDir) { console.error('Usage: npm run grade -- evals/workspace/iteration-N'); process.exit(2); }
  const { evals } = JSON.parse(fs.readFileSync('evals/evals.json', 'utf8'));
  const rows = findRuns(iterationDir, evals).map((r) => ({ ...r, ...gradeRun(r.runDir, r.evalCase) }));
  printSummary(rows);
}
