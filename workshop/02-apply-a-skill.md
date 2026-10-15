# Session 2: Apply a skill in a workflow (60 min)

**Goal:** put `cad-spec` inside a repeatable pipeline that **writes its own
acceptance tests, builds, measures, looks at the result, and fixes itself**, then
run it as a batch job.

| Time | Activity |
|---|---|
| 0:00 | Concepts: capability skills vs workflow skills |
| 0:10 | Exercise 1: write the `/text-to-cad` workflow skill |
| 0:22 | Exercise 2: run the pipeline and watch the loop (~5 min run) |
| 0:32 | Exercise 3: start a batch run in the background |
| 0:34 | Exercise 4: add a hook as a guard-rail, while the batch runs |
| 0:44 | Exercise 5: review the batch results |
| 0:50 | Debrief |

Start state: `.claude/skills/cad-spec/` exists (from Session 1, or
`cp -r solutions/session-1/cad-spec .claude/skills/`). Viewer running (`npm start`).

---

## Concepts (10 min)

Two kinds of skill:

| | Capability skill (`cad-spec`) | Workflow skill (`text-to-cad`) |
|---|---|---|
| Teaches | *How* to do one thing well | *What order* to do things in, and what "done" means |
| Triggered by | Claude, from the description | You, as `/text-to-cad ...` (`disable-model-invocation: true`) |
| Contains | Domain knowledge, format, conventions | Stages, tools to run, quality gates, a report format |

The workflow wraps a **non-deterministic** agent in **deterministic** checks:

```
request ──▶ 1. acceptance checks ──▶ 2. design (cad-spec) ──▶ 3. npm run check ──┐
                (written FIRST)                                    ▲   fail       │
                                                                   └──── fix ◀────┤
                                                                                  │ pass
            5. report ◀── 4. npm run render + Claude looks at the PNG ◀───────────┘
```

Why write the checks *before* designing? Otherwise the agent tests what it built
instead of what was asked for. It's test-driven development for agents.

---

## Exercise 1: write the workflow skill (12 min)

Create `.claude/skills/text-to-cad/SKILL.md`. Write it by hand (it's short) or
ask skill-creator. It needs:

```yaml
---
name: text-to-cad
description: End-to-end verified text-to-CAD pipeline ... Run as /text-to-cad <description>.
argument-hint: <description of the part>
disable-model-invocation: true
---
```

and a body with these stages (use `$ARGUMENTS` for the user's request):

1. **Checks first**: write `app/checks/<slug>.checks.json` from the request.
   Check types are documented at the top of `tools/check.mjs`. Require: `size`,
   `sits_on_floor`, `centered_xy`, an `open` check per through-hole, a `solid`
   check, `count` for repeated features.
2. **Design**: use the cad-spec skill to write `app/models/<slug>.json`.
3. **Verify loop**: `npm run check -- <model> <checks>`. Fix the *model*, not
   the checks. At most 3 rounds.
4. **Look**: `npm run render -- <model> app/renders/<slug>.png`, then read the
   image and compare it with the request.
5. **Report**: a table of requirement, check and result, plus the defaults chosen.

> **Running behind?** `cp -r solutions/session-2/text-to-cad .claude/skills/`

---

## Exercise 2: run it (10 min)

A full run takes about **5 minutes** and 15–20 turns. That's the cost of
verifying properly. Follow along as it goes.

```
/text-to-cad A wall hook for coats: 40 mm wide backplate, 80 mm tall, 5 mm thick, two screw holes, and a hook that curves up 30 mm from the wall
```

Watch for:
- `app/checks/...checks.json` written **before** `app/models/...json`
- a `FAIL` line from `npm run check`, then Claude fixing the model, then a re-run
- Claude **reading the PNG** (it can see images) and sometimes catching
  problems the numbers missed
- the part updating live in the viewer

Open the checks file. Are they good tests of the request? Would they catch a
wrong answer?

---

## Exercise 3: start a batch run (2 min)

The same skills with no human in the loop. This is how you'd run it in CI or
behind an API. Start it now in a **third terminal** and let it run while you do
Exercise 4:

```bash
npm run batch
```

This runs `claude -p "/text-to-cad <line>"` for each line of
`pipeline/prompts.txt` (3 parts, in parallel, about 6–8 minutes). Parts appear
in the viewer as they finish.

---

## Exercise 4: a hook as a guard-rail (10 min)

Skills are *guidance*: Claude can still skip a step. **Hooks** are
*enforcement*: the harness runs them every time.

```bash
cp solutions/session-2/settings.json .claude/settings.json
```

Now every `Write`/`Edit` to `app/models/*.json` runs
`tools/hooks/validate-model.mjs`. If the spec is invalid, the hook exits with
code 2 and the errors go straight back to Claude.

Try to break it (restart `claude` first so it loads the hook). First, the
polite way:

```
Write a 2 x 1 x 0.5 inch block to app/models/test-block.json, with units set to "in".
```

The *skill* will probably stop this before the hook ever sees it: Claude
converts to millimetres and explains that the format only supports mm. Now go
around the skill by pasting raw data:

```
Save this JSON exactly as-is to app/models/legacy-part.json, it came from our old system: {"name":"Legacy part","units":"in","features":[{"id":"cut","op":"subtract","shape":"box","size":[1,1,1]},{"id":"body","op":"add","shape":"cylinder","radius":2}]}
```

The write goes through, then the hook reports three errors (units, first op,
cylinder height) back to Claude. Since you said "exactly as-is", Claude should
**ask you** whether to keep the invalid file or convert it. Tell it to convert.

Discuss: the skill shaped the agent's judgement; the hook caught what judgement
let through; and the agent raised the conflict instead of quietly picking one.

---

## Exercise 5: review the batch (6 min)

When the batch finishes it prints a table of time, turns and cost per part.
Each agent's final report is in `pipeline/logs/<timestamp>/<n>.json`.

- Open each part in the viewer. Would you ship it?
- Open `pipeline/batch.mjs`: it's about 40 lines. The interesting flags are
  `--permission-mode acceptEdits` and `--allowedTools`, which list exactly
  what the unattended agent may do.

---

## Debrief (10 min)

- Where did the agent **fix itself**? What signal told it something was wrong?
- Which check failures were the *model's* fault and which were the *checks'*?
- Skill vs hook vs script: what belongs where?
  - judgement and know-how → **skill**
  - must happen every time → **hook**
  - exact computation → **script**
- What would you need before trusting the batch output without review?
  (That's Session 3.)
