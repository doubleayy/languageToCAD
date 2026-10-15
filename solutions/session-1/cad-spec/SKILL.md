---
name: cad-spec
description: Turns a plain-language description of a physical part (bracket, plate, flange, enclosure, mug, spacer, knob, etc.) into a CSG CAD spec JSON file that the local three.js viewer renders. Use whenever the user asks to design, model, draft or "make a 3D/CAD model of" an object, or to change the dimensions or features of an existing model in app/models/.
---

# CAD Spec

You write **CAD spec files**: JSON that describes a solid part as primitives
(box, cylinder, cone, sphere, torus) combined with add / subtract / intersect.
The viewer at `http://localhost:3000` renders every `*.json` in `app/models/`.

The full format is in [references/spec-format.md](references/spec-format.md).
Read it before writing your first spec in a session.

## Workflow

1. **Pin down the dimensions.** List every dimension the part needs. Take numbers
   from the request; for anything missing, choose a sensible real-world default
   and record it in `parameters`. Do not ask the user unless the request is
   genuinely ambiguous about *what* the object is.
2. **Plan the CSG tree** before writing JSON: the base solid(s) first, then the
   material you remove (holes, pockets, cavities), then any trimming intersect.
   For common parts, start from a recipe in
   [references/recipes.md](references/recipes.md).
3. **Write the spec** to `app/models/<kebab-case-name>.json` (or the path the
   user gave). Start from [assets/template.json](assets/template.json).
4. **Validate**: `node <this-skill-dir>/scripts/validate.mjs <file>`.
   Fix every error. Treat warnings as probable mistakes and fix them unless you
   can say why they are intended.
5. **Check the size** the validator prints against the requested dimensions.
   If the project has `npm run measure`, run it too — it builds the real solid
   and reports the exact size and volume.
6. **Report** in 2–4 lines: file path, overall size, the key features, and any
   defaults you chose.

## Rules that prevent most mistakes

- Units are millimetres. **Z is up.** Parts sit on the floor (lowest point at
  z = 0) and are centred on the origin in X and Y.
- `position` is the **centre** of a primitive. A box of height 6 sitting on the
  floor has `position[2] = 3`.
- Cylinders run along **Z**. For a horizontal hole along X use
  `rotation: [0, 90, 0]`; along Y use `rotation: [90, 0, 0]`.
- A diameter of D means `radius: D / 2`. Clearance holes for screws: M3 → 3.4,
  M4 → 4.5, M5 → 5.5, M6 → 6.6, M8 → 9 mm diameter.
- Cutting tools must **overshoot** what they cut by ~1 mm on each side, or a
  paper-thin skin is left behind.
- Solids you **join** (posts on a floor, ribs on a wall) overlap by ~0.5 mm
  instead of just touching. Exactly touching faces are slow for CSG and can
  leave seams.
- Hollow parts: subtract an inner solid that is **raised** so a floor remains
  (outer height H, floor F → inner centre z = F + (H − F) / 2 + overshoot / 2).
- Repeated features (bolt circles, rows of holes, ribs) use `pattern`, not copies.
- Give every feature a descriptive `id` (`"bolt-hole"`, not `"f3"`).
- Unsupported: fillets, chamfers, threads, text, freeform surfaces. Approximate
  or leave them out, and say so in the report.
