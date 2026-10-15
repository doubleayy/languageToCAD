# Setup (do this before Session 1, ~5 min)

## You need

- **Node.js 20+** — `node --version`
- **Claude Code** — `claude --version`, signed in
- **Python 3** — only for the skill-creator review viewer in Session 3
- **skill-creator plugin** — in Claude Code run:
  `/plugin install skill-creator@claude-plugins-official`

## Get running

```bash
npm install          # three.js + CSG library, no other dependencies
npm test             # should end with "All self-tests passed"
npm start            # viewer on http://localhost:3000 — leave this terminal running
```

Open http://localhost:3000. You should see four example parts in the sidebar.
Drag to orbit, scroll to zoom, right-drag to pan.

In a **second terminal**, in the project folder:

```bash
claude --model claude-sonnet-5
```

## How the pieces fit

```
 "a flange with 6 bolt holes"
            │
            ▼
   ┌──────────────────┐   writes   ┌───────────────────────┐   polls   ┌──────────────┐
   │  Claude + skill  │ ─────────▶ │ app/models/<part>.json│ ◀──────── │ Viewer :3000 │
   └──────────────────┘            └───────────────────────┘           │ three.js+CSG │
            │  runs                                                    └──────────────┘
            ▼
   validate · measure · check · render    (deterministic tools in tools/)
```

The model never draws triangles. It writes a small **CAD spec** (JSON: boxes,
cylinders, cones, spheres, tori combined with add / subtract / intersect), and the
code turns that into geometry. The format is in [app/SPEC_FORMAT.md](../app/SPEC_FORMAT.md).

## Tools you'll use

| Command | What it does |
|---|---|
| `npm start` | Viewer; new or changed files in `app/models/` appear automatically |
| `node app/lib/validate.mjs <file>` | Structural check of a spec, with readable errors |
| `npm run measure -- <file>` | Builds the real solid; exact size and volume |
| `npm run check -- <file> <checks.json>` | Acceptance tests against the solid (ray-casts holes, etc.) |
| `npm run render -- <file> [out.png]` | Two-view PNG render, no browser needed |
