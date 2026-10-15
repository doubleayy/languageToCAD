// Runs Claude Code headlessly (`claude -p`) and resolves with its output.
// The prompt goes in on stdin, which avoids shell quoting problems on Windows.
import { spawn } from 'node:child_process';

// Model for headless runs. Override per run with --model, or for the whole workshop with WORKSHOP_MODEL.
export const DEFAULT_MODEL = process.env.WORKSHOP_MODEL ?? 'claude-sonnet-5';

export const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Bash(npm run *)', 'Bash(node *)'];

export function runClaude({ prompt, args = [], cwd = process.cwd(), timeoutMs = 15 * 60 * 1000, onLine }) {
  const attempt = (useShell) => new Promise((resolve, reject) => {
    const started = Date.now();
    const argv = useShell ? args.map((a) => `"${a.replaceAll('"', '\\"')}"`) : args;
    const child = spawn('claude', ['-p', ...argv], { cwd, shell: useShell, windowsHide: true });
    let stdout = '', stderr = '', buffered = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d;
      if (!onLine) return;
      buffered += d;
      const lines = buffered.split('\n');
      buffered = lines.pop();
      lines.forEach((l) => l.trim() && onLine(l));
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ms: Date.now() - started });
    });
    child.stdin.end(prompt);
  });
  // Native installs expose claude(.exe); npm installs on Windows only have claude.cmd, which needs a shell.
  return attempt(false).catch((e) => {
    if (e.code === 'ENOENT' && process.platform === 'win32') return attempt(true);
    throw e;
  });
}

// Runs async jobs with at most `limit` in flight.
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
