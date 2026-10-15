#!/usr/bin/env node
// Renders a CAD spec to a shaded isometric PNG without a browser or GPU
// (z-buffer software rasteriser + outline pass). Agents can Read the PNG to
// look at what they built; the eval viewer shows it next to the grades.
//
//   npm run render -- app/models/my-part.json [out.png]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildMesh } from '../app/lib/build.mjs';

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Two opposite views, so features hidden behind a wall in one view show in the other.
const VIEWS = [[1, -1.3, 0.9], [-1, 1.3, 0.9]];

export function renderSpec(spec, { size = 400, views = VIEWS } = {}) {
  const { mesh, stats } = buildMesh(spec);
  const images = views.map((v) => rasterize(mesh.geometry, stats, spec.color ?? '#8fa3b8', size, v));
  const width = size * images.length;
  const rgb = Buffer.alloc(width * size * 3);
  for (let y = 0; y < size; y++) {
    images.forEach((img, n) => img.copy(rgb, (y * width + n * size) * 3, y * size * 3, (y + 1) * size * 3));
  }
  return { png: encodePNG(rgb, width, size), stats };
}

export function rasterize(g, stats, color, size, view) {
  const pos = g.attributes.position;
  const idx = g.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;

  const eye = norm(view);                            // from the part towards the viewer
  const right = norm(cross([0, 0, 1], eye));
  const up = norm(cross(eye, right));
  const { min, max } = stats.bbox;
  const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const radius = Math.hypot(...[0, 1, 2].map((k) => max[k] - min[k])) / 2 || 1;
  const scale = (size * 0.44) / radius;
  const light = norm([eye[0] + 0.4, eye[1] - 0.2, eye[2] + 0.8]);
  const base = hexToRgb(color).map((v) => 60 + v * 0.75); // keep dark colours readable

  const depth = new Float32Array(size * size).fill(-Infinity);
  const shadeBuf = new Float32Array(size * size);
  const faceId = new Int32Array(size * size).fill(-1);
  const normals = [];

  const P = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let t = 0; t < triCount; t++) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
    const w = ids.map(P);
    const n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0])));
    normals.push(n);
    const facing = dot(n, eye) >= 0 ? n : n.map((v) => -v);
    const shade = 0.28 + 0.72 * Math.max(0, dot(facing, light));
    const s = w.map((p) => {
      const d = sub(p, center);
      return [size / 2 + dot(d, right) * scale, size / 2 - dot(d, up) * scale, dot(d, eye)];
    });
    const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0])));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1])));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const b0 = ((s[1][0] - px) * (s[2][1] - py) - (s[2][0] - px) * (s[1][1] - py)) / area;
        const b1 = ((s[2][0] - px) * (s[0][1] - py) - (s[0][0] - px) * (s[2][1] - py)) / area;
        const b2 = 1 - b0 - b1;
        if (b0 < 0 || b1 < 0 || b2 < 0) continue;
        const z = b0 * s[0][2] + b1 * s[1][2] + b2 * s[2][2];
        const i = y * size + x;
        if (z > depth[i]) { depth[i] = z; shadeBuf[i] = shade; faceId[i] = t; }
      }
    }
  }

  // Compose: background, shaded part, dark outlines where depth or surface direction jumps.
  const rgb = Buffer.alloc(size * size * 3);
  const bg = [236, 240, 245];
  const depthJump = radius * 0.04;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let c = bg;
      if (faceId[i] >= 0) {
        c = base.map((v) => Math.min(255, v * shadeBuf[i] + 18));
        let edge = false;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          const j = yy * size + xx;
          if (faceId[j] < 0 || depth[i] - depth[j] > depthJump) { edge = true; break; }
          if (faceId[j] !== faceId[i] && dot(normals[faceId[i]], normals[faceId[j]]) < 0.82) { edge = true; break; }
        }
        if (edge) c = [40, 46, 58];
      }
      rgb.set(c.map(Math.round), i * 3);
    }
  }
  return rgb;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePNG(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === fs.realpathSync(process.argv[1]).toLowerCase();
if (isMain) {
  const [file, out = file?.replace(/\.json$/, '.png')] = process.argv.slice(2);
  if (!file) { console.error('Usage: npm run render -- <model.json> [out.png]'); process.exit(2); }
  const { png, stats } = renderSpec(JSON.parse(fs.readFileSync(file, 'utf8')));
  fs.writeFileSync(out, png);
  console.log(`Wrote ${out}  (size ${stats.size.join(' x ')} mm, volume ${stats.volume_mm3} mm³)`);
}
