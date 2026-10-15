# Session 1: Create a skill (60 min)

**Goal:** build `cad-spec`, a skill that teaches Claude to turn a part description
into a CAD spec the viewer can render, and learn what a skill is made of.

| Time | Activity |
|---|---|
| 0:00 | Concepts: what a skill is |
| 0:10 | Exercise 1: try it without a skill |
| 0:15 | Exercise 2: create the skill with skill-creator |
| 0:35 | Exercise 3: take the skill apart |
| 0:45 | Exercise 4: use it |
| 0:50 | Debrief and compare with the reference |

---

## Concepts (10 min)

A **skill** is a folder of instructions and resources that Claude loads *only
when it's relevant*.

```
.claude/skills/cad-spec/
├── SKILL.md              ← required: frontmatter + instructions
├── references/           ← docs Claude reads when it needs them
│   ├── spec-format.md
│   └── recipes.md
├── scripts/              ← code Claude runs (deterministic, cheap, reliable)
│   └── validate.mjs
└── assets/               ← files Claude copies or fills in (templates)
    └── template.json
```

**Progressive disclosure:** a skill costs almost nothing until it's used.

| Level | What | When it's loaded |
|---|---|---|
| 1 | `name` + `description` from the frontmatter | Always, for every installed skill (~100 tokens) |
| 2 | The body of `SKILL.md` | When Claude decides the skill is relevant |
| 3 | `references/`, `scripts/`, `assets/` | Only when the instructions point Claude to them |

So the **description is the trigger**. It must say *what* the skill does and
*when* to use it, in the words users actually type.

Where skills live: `.claude/skills/` (this project, shared via git),
`~/.claude/skills/` (just you, every project), or inside a plugin.

---

## Exercise 1: try it without a skill (5 min)

In Claude Code:

```
Make a mounting plate 100 x 60 x 5 mm with a 5 mm hole 8 mm in from each corner. Save it in app/models/.
```

Watch what it does. Claude has to *discover* the format (find and read
`SPEC_FORMAT.md`, maybe look at examples) before it can start. Note roughly how
many steps it takes and whether the result is right in the viewer.

Then `/clear`.

---

## Exercise 2: create the skill with skill-creator (20 min)

Paste this into Claude Code:

```
/skill-creator Create a project skill called cad-spec in .claude/skills/cad-spec.

It turns a plain-language description of a physical part (bracket, flange, enclosure,
mug, spacer, knob...) into a CAD spec JSON file in app/models/ that our three.js viewer
renders. The format is documented in app/SPEC_FORMAT.md. Copy it to references/.

Requirements:
- Copy app/lib/validate.mjs to scripts/validate.mjs and make running it a required step.
- State the conventions that cause most mistakes: millimetres, Z up, position is the
  centre of a primitive, parts sit on z=0 and are centred in X/Y, cylinders run along Z,
  diameter vs radius, cutting tools must overshoot.
- Add references/recipes.md with CSG recipes for common parts (plate with holes,
  flange with bolt circle, open box, mug, tube/spacer).
- Add assets/template.json as a starting point.
- Never ask the user questions unless the object itself is unclear; choose defaults.

Skip the eval and benchmark steps for now; we'll do evaluation in a later session.
```

skill-creator will interview you a little and draft the skill. Answer its
questions briefly. If it starts running test cases, tell it to stop: that's
Session 3.

> **Running behind?** `cp -r solutions/session-1/cad-spec .claude/skills/`

---

## Exercise 3: take the skill apart (10 min)

Open `.claude/skills/cad-spec/SKILL.md` and check it against this list:

- [ ] **`name`**: lowercase, hyphens, matches the folder name
- [ ] **`description`**: says *what* and *when*, with trigger words a user
      would really type ("design", "model", "3D", "bracket", "make a part")
- [ ] **Body**: a short, ordered workflow, not an essay. Under ~500 lines
- [ ] **Explains the why** behind rules, not just ALL CAPS MUSTs
- [ ] **Links** to `references/` files instead of pasting them inline
- [ ] **Runs the script** with a concrete command instead of asking Claude to
      "check carefully"

Discuss with a neighbour: what would happen if the description just said
`"CAD helper"`?

---

## Exercise 4: use it (5 min)

Check that Claude can see the skill: run `/skills` (restart `claude` if it isn't
listed). Then:

```
I need a pipe flange: 120 mm outside diameter, 12 mm thick, 50 mm bore, six M10 bolt holes on a 95 mm bolt circle.
```

Watch for:
1. The **Skill** tool call, which shows the skill was triggered by the description
2. Claude reading `references/spec-format.md`, which is Level 3 loading on demand
3. Claude running `scripts/validate.mjs`
4. The part appearing in the viewer

Then try one of your own. Something with holes or a hollow is a good test.

---

## Debrief (10 min)

Compare yours with the reference:

```bash
diff -r .claude/skills/cad-spec solutions/session-1/cad-spec
```

Questions to discuss:
- Which parts of the skill are **instructions** (judgement) and which are
  **scripts** (deterministic)? Why put validation in a script?
- What did the skill save compared with Exercise 1 (steps, mistakes)?
- What would you add to the skill after seeing it fail? (Keep your notes; you'll
  measure it in Session 3.)
