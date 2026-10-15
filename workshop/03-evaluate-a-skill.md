# Session 3: Evaluate a skill (60 min)

**Goal:** measure whether `cad-spec` actually helps, look at *how* the agent
behaves, and improve the skill using evidence.

| Time | Activity |
|---|---|
| 0:00 | Concepts: three questions to ask of a skill |
| 0:08 | Exercise 1: start the eval run (runs in the background) |
| 0:10 | Exercise 2: write your own eval case while it runs |
| 0:22 | Exercise 3: read the results: numbers, renders, transcripts |
| 0:37 | Exercise 4: improve the skill and re-run |
| 0:50 | Exercise 5 (optional): trigger evals |
| 0:52 | Debrief |

Start state: `.claude/skills/cad-spec/` exists. The viewer doesn't need to be running.

---

## Concepts (8 min)

| Question | How we measure it | Where |
|---|---|---|
| **Does it trigger?** | Should-trigger and should-not-trigger prompts | `evals/trigger-evals.json` |
| **Is the output right?** | Same prompts **with** and **without** the skill, graded by code | `evals/evals.json` |
| **How does it behave?** | Transcript: skills used, tools, verification, turns, time, cost | `transcript.md` per run |

Prefer **deterministic graders**. Every check here runs against the real CSG
solid: bounding box, volume, and ray-casts that prove a hole goes all the way
through. An LLM judge is only for what code can't check (for example, "does it
look like a phone stand?"). For that, look at the render yourself.

Watch for **non-discriminating** assertions, ones that pass with or without the
skill. They make the score look better without telling you anything.

---

## Exercise 1: start the run (2 min)

```bash
npm run eval
```

This runs 6 prompts × 2 configurations (`with_skill`, `without_skill` using
`--disable-slash-commands`) on Sonnet, 4 at a time. It takes about **9 min** and costs about $4.50.
The baseline still has the repo, including `SPEC_FORMAT.md`, so it's a fair
fight: *does the skill beat a capable agent that can read the docs?*

Results go to `evals/workspace/iteration-1/`, laid out the way skill-creator
expects.

---

## Exercise 2: write your own eval case (12 min)

Open `evals/evals.json`. Each case says what it is meant to catch:

| Eval | What it's designed to catch |
|---|---|
| `flange-bolt-circle` | Circular patterns, radius vs diameter, M10 clearance size |
| `plate-corner-holes` | Exact hole positions (the `open` ray-casts at ±42, ±22) |
| `mug-hollow` | Hollowing with a floor left, open top |
| `enclosure-with-posts` | Multi-step CSG order (posts added *after* the cavity) |
| `inch-spacer` | Unit conversion: inches to mm |
| `vague-phone-stand` | Sensible defaults with no questions asked |

Add a **7th case** for a part you care about. Make at least one check *fail*
for a plausible wrong answer. Test your checks on a hand-written spec first:

```bash
npm run check -- my-test-model.json my-checks.json
```

Check types are documented at the top of `tools/check.mjs`.

---

## Exercise 3: read the results (15 min)

### The numbers
The run ends with a table: checks passed per run, which skill was used, turns,
seconds and cost, then an average per configuration.

### The review viewer (skill-creator)
```bash
npm run eval:view
```
- **Outputs** tab: for each run, the prompt, the **render**, the spec, and the
  agent's final report, with each check's PASS/FAIL and evidence. Leave feedback
  in the box; it's saved for the next iteration.
- **Benchmark** tab: pass rate, time and tokens, with skill vs without.

### Behaviour
Open a run's `transcript.md` (or `transcript.jsonl` for everything):
- Did `with_skill` actually **invoke** `cad-spec`? (`Skills invoked:`)
- Did the agent **verify** its work, or just write the file and stop?
- How many turns did the baseline spend *discovering* the format?

Questions for your table:
1. Which evals does the skill **win**? Which are a tie?
2. Is any check **non-discriminating** (always passes)? Is any **flaky**?
3. Find one failure. Is the **skill** wrong, or is the **eval** wrong?

---

## Exercise 4: improve and re-run (13 min)

Pick one failure. Fix the cause in the skill (`SKILL.md`, a recipe, or the
validator). Then re-run only the affected evals:

```bash
npm run eval -- --only 3,5 --configs with_skill
npm run eval:view
```

That creates `iteration-2`. The viewer shows the previous output and your
feedback next to the new one.

If you only changed a check, re-grade without re-running the agent:

```bash
npm run grade -- evals/workspace/iteration-1
```

**Variance:** one run per case is a sample of one. For a real decision, use
`--runs 3` and compare averages.

---

## Exercise 5 (optional): trigger evals (5 min)

`evals/trigger-evals.json` has 10 should-trigger and 10 should-not-trigger
prompts. The negatives are deliberately close: "fix the viewer's camera",
"explain CSG", "export OBJ". From the skill-creator folder (`npm run eval:view`
prints it):

```bash
python -m scripts.run_eval --eval-set <repo>/evals/trigger-evals.json \
  --skill-path <repo>/.claude/skills/cad-spec --model sonnet --runs-per-query 1 --verbose
```

`scripts.run_loop` goes further: it rewrites the description, re-tests it on a
held-out split, and keeps the best one. Start it after the workshop; it takes a
while.

---

## Debrief (8 min)

- What did the skill buy you: correctness, speed, cost, consistency?
- Which of your eval cases would you run in CI on every change to the skill?
- When is "the agent read the docs itself" good enough, and when do you need a skill?
