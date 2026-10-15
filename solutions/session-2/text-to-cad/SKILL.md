---
name: text-to-cad
description: End-to-end, verified text-to-CAD pipeline. Writes acceptance checks from the request, designs the part with the cad-spec skill, measures the real solid against the checks, looks at a render, and publishes to the viewer. Run as /text-to-cad <description of the part>.
argument-hint: <description of the part>
disable-model-invocation: true
---

# Text to CAD pipeline

Request: **$ARGUMENTS**

Run every stage in order. Do not ask the user questions: choose sensible
defaults and list them in the final report. Pick a short kebab-case `<slug>` for
the part (e.g. `pipe-flange`). Use these paths:

- Model: `app/models/<slug>.json`
- Checks: `app/checks/<slug>.checks.json`
- Render: `app/renders/<slug>.png`

## 1. Requirements → acceptance checks (before any design)

Write down what "done" means *before* designing, so the checks test the request
rather than your design. List every explicit requirement in the request, then
encode the measurable ones as checks in the checks file. The format is
documented at the top of `tools/check.mjs`. Always include:

- `size` with the overall dimensions (from the request, or your chosen defaults)
- `sits_on_floor` and `centered_xy`
- an `open` check through every through-hole or opening the request mentions
- a `solid` check in a place that must be material (e.g. a wall or floor)
- `count` for repeated features (e.g. 4 holes → `subtract` min 4)

## 2. Design

Use the **cad-spec** skill to write `app/models/<slug>.json`.

## 3. Verify (loop, max 3 rounds)

```bash
npm run check -- app/models/<slug>.json app/checks/<slug>.checks.json
```

If anything fails, fix the **model** and run again. Only change a check if it
misread the request; if you do, say so in the report. After 3 failed rounds,
stop and report what still fails.

## 4. Look at it

```bash
npm run render -- app/models/<slug>.json app/renders/<slug>.png
```

Read the PNG (two opposite views). Check what numbers can't: proportions look
right, nothing floating or disconnected, features on the correct faces, holes
visible where expected. If something is wrong, go back to step 3.

## 5. Report

Reply with:

1. One-line summary and the viewer URL `http://localhost:3000`
2. A table: requirement | check | result
3. Defaults you chose, and anything you approximated or could not model
