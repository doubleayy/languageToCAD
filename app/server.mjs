// Zero-dependency local server for the CAD viewer.
//   GET /                 -> app/public/index.html
//   GET /api/models       -> list of app/models/*.json (newest first)
//   GET /models/<file>    -> a model spec
//   GET /lib/<file>       -> shared geometry code (also used by Node tools)
//   GET /vendor/<pkg>/... -> files from node_modules (three, three-bvh-csg, three-mesh-bvh)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(APP, '..');
const PORT = Number(process.env.PORT ?? 3000);
const VENDOR = new Set(['three', 'three-bvh-csg', 'three-mesh-bvh']);
const MODELS = process.env.MODELS_DIR ? path.resolve(process.env.MODELS_DIR) : path.join(APP, 'models');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function send(res, status, body, type = 'text/plain') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(res, base, rel) {
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, TYPES[path.extname(file)] ?? 'application/octet-stream');
  });
}

function listModels() {
  if (!fs.existsSync(MODELS)) return [];
  return fs.readdirSync(MODELS)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      const full = path.join(MODELS, file);
      let name = file;
      try { name = JSON.parse(fs.readFileSync(full, 'utf8')).name ?? file; } catch { /* shown as-is; the viewer reports the parse error */ }
      return { file, name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/' || url === '/index.html') return serveFile(res, path.join(APP, 'public'), 'index.html');
  if (url === '/api/models') return send(res, 200, JSON.stringify(listModels()), 'application/json');
  if (url.startsWith('/models/')) return serveFile(res, MODELS, url.slice('/models/'.length));
  if (url.startsWith('/lib/')) return serveFile(res, path.join(APP, 'lib'), url.slice('/lib/'.length));
  if (url.startsWith('/vendor/')) {
    const [pkg, ...rest] = url.slice('/vendor/'.length).split('/');
    if (VENDOR.has(pkg)) return serveFile(res, path.join(ROOT, 'node_modules', pkg), rest.join('/'));
  }
  if (url.startsWith('/public/')) return serveFile(res, path.join(APP, 'public'), url.slice('/public/'.length));
  send(res, 404, 'Not found');
}).listen(PORT, () => {
  console.log(`CAD viewer: http://localhost:${PORT}`);
  console.log(`Watching models in ${MODELS}`);
});
