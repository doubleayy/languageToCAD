#!/usr/bin/env node
// Claude Code PostToolUse hook: whenever Claude writes or edits a model in
// app/models/, validate it. On errors, exit 2 so the messages go back to Claude,
// which then fixes the file. A deterministic guard-rail around the skill.
import fs from 'node:fs';
import path from 'node:path';
import { validateSpec } from '../../app/lib/validate.mjs';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const file = JSON.parse(input || '{}').tool_input?.file_path ?? '';
  const normalised = file.replaceAll('\\', '/');
  if (!/\/app\/models\/[^/]+\.json$/.test(normalised) && !/^app\/models\/[^/]+\.json$/.test(normalised)) process.exit(0);

  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`${path.basename(file)} is not valid JSON: ${e.message}`); process.exit(2); }

  const { errors, warnings } = validateSpec(spec);
  if (errors.length) {
    console.error(`CAD spec validation failed for ${path.basename(file)}:\n${errors.map((e) => `- ${e}`).join('\n')}`);
    process.exit(2);
  }
  if (warnings.length) console.log(`Validated ${path.basename(file)} with warnings:\n${warnings.map((w) => `- ${w}`).join('\n')}`);
  process.exit(0);
});
