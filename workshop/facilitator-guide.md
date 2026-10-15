# Facilitator guide

## The arc

One use case carried through all three sessions, so each session builds on the
last instead of starting over:

| Session | Attendees leave with | The idea to land |
|---|---|---|
| 1 Create | A `cad-spec` skill they built with skill-creator | A skill is a folder; the **description** decides when it loads; **scripts** beat prose for anything exact |
| 2 Apply | A `/text-to-cad` pipeline, a hook, a batch job | Wrap a non-deterministic agent in deterministic checks: **checks first, verify loop, look at the output** |
| 3 Evaluate | Benchmark numbers, an eval case of their own, an improved skill | **With vs without** on the same prompts, graded by code; read transcripts for **behaviour**, not just results |

## Before the day

- [ ] Every attendee machine: Node 20+, Claude Code signed in, Python 3,
      skill-creator plugin (`/plugin install skill-creator@claude-plugins-official`)
- [ ] `npm install && npm test` passes (it builds, measures and renders every example)
- [ ] Confirm the model ID works for your org: `echo hi | claude -p --model claude-sonnet-5`.
      The bare `sonnet` alias may resolve to an older model, so use the explicit ID.
      To change it everywhere, set `WORKSHOP_MODEL`.
- [ ] Run the whole thing once yourself (about 25 min of agent time), then
      `npm run reset -- --yes` to return to the starting state
- [ ] Bad venue wifi? `node_modules/` is all the app needs; there are no CDN
      calls. Claude itself still needs the network.

## Timings and cost (measured on claude-sonnet-5)

Measured in the dry run unless marked *estimate*:

| Step | Wall time | Cost |
|---|---|---|
| S1: one `cad-spec` prompt (flange, plate) | 30–90 s | $0.20–0.40 |
| S1: creating the skill with skill-creator | 10–15 min *(estimate)* | ~$1–2 *(estimate)* |
| S2: one `/text-to-cad` run (checks → design → verify → render → report) | ~5.5 min, 20 turns | ~$0.80 |
| S2: `npm run batch` (3 parts, 3 in parallel) | ~6–8 min | ~$2.50 |
| S3: `npm run eval` (6 evals × 2 configs, 4 in parallel) | ~9 min | ~$4.50 |
| S3: re-run 2 evals with the skill only | ~3 min | ~$0.70 |

**Budget about $10–12 per attendee** for the whole workshop. For a large room,
check your org's rate limits; `--concurrency 2` halves the burst.

### Dry-run eval results (claude-sonnet-5, 1 run each)

| | Check pass rate | Fully correct | Avg turns | Avg cost |
|---|---|---|---|---|
| with `cad-spec` | 100% | 6 / 6 | 10.3 | $0.34 |
| without (repo docs only) | 94% | 3 / 6 | 12.3 | $0.42 |

The geometry was right in both configurations. That's a fair result, because
the baseline can read `SPEC_FORMAT.md`. The difference is **behaviour**: all
three baseline misses were "never verified the model with a tool", and the
skill was cheaper and took fewer turns. That's a good discussion: skills buy
*consistency and process* as much as correctness. Expect your numbers to vary
from run to run, which is the case for `--runs 3`.

A finding for Session 3 that showed up in the dry run: on the flange, the agent
reported *"default clearance, since the skill's table stops at M8"*. The skill's
screw-clearance table is missing M10 and M12. It's left that way on purpose: a
good example of reading agent reports to improve a skill.

Preview Session 3 without running anything: open
[sample-eval-review.html](sample-eval-review.html), the review page from the dry run.

## Catch-up commands

Anyone who falls behind can jump to the next session's starting state:

```bash
cp -r solutions/session-1/cad-spec .claude/skills/        # before Session 2 or 3
cp -r solutions/session-2/text-to-cad .claude/skills/     # skip Session 2 Ex. 1
cp solutions/session-2/settings.json .claude/settings.json  # the hook
```

## Things that go wrong

| Symptom | Cause and fix |
|---|---|
| Skill not used | Not discovered yet: check `/skills` and restart `claude`. Or the description is too vague; this is a good teaching moment. |
| skill-creator starts running evals in Session 1 | Tell it to stop. The prompt asks it to skip evals, but it's eager. |
| Viewer shows a red error | The spec is invalid. Run `node app/lib/validate.mjs <file>`. |
| Viewer blank | Hard-refresh. Check that `npm start` is still running and the browser console has no import errors. |
| Hook doesn't fire | Hooks load at session start, so restart `claude`. |
| `npm run eval:view` can't find skill-creator | It searches `~/.claude/skills` and `~/.claude/plugins/cache`. Install the plugin. |
| Batch or evals very slow | Lower `--concurrency` if you hit rate limits; use `--only 2,5` for a subset. |

## Discussion prompts worth having

- **Session 1:** Show a one-line description ("CAD helper") next to the real
  one. Which prompts would each catch? This sets up the trigger evals in Session 3.
- **Session 2:** Ask who saw the agent change a *check* rather than the
  *model*. Was it right to? This is the same question as "who tests the tests?"
- **Session 3:** Find an assertion that passes for both configurations.
  Is it useless, or a regression guard? Both answers are defensible.
- **Session 3, a true story to tell:** in the first dry run, "Plate centre is
  solid" failed for *both* configurations, even though both plates were
  correct. The grader's inside/outside ray from (0, 0, 2.5) ran exactly
  through the seam between two triangles, counted two hits, and concluded
  "outside". It was a grader bug, not a skill bug. **When a check fails for
  every configuration, suspect the check first.** (It's fixed: rays are now
  skewed, with a 2-of-3 vote.)

## Architecture notes (for questions)

- The spec is deliberately small (5 primitives, 3 boolean ops, 2 patterns).
  A small, documented target language is what makes the skill short and the
  output checkable. The same idea applies to SQL, Terraform, chart specs and so on.
- `app/lib/build.mjs` runs unchanged in the browser and in Node, so the grader
  measures exactly the solid the viewer shows.
- `open` checks ray-cast through the real CSG mesh, which is how "is there a
  through-hole at (42, 22)?" gets a yes/no answer without an LLM judge.
- `tools/render.mjs` is a ~150-line software rasteriser: no GPU, no browser,
  so it works headless in evals and CI, and Claude can read the PNG.
