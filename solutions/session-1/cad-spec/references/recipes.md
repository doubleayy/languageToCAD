# Recipes

Starting points for common parts. Adapt the numbers; keep the structure.

## Contents
- Plate with hole grid
- Flange / bolt circle
- Open box or enclosure
- Cup, mug, pot
- Tube, spacer, bushing
- L bracket with gusset
- Knob or handwheel

## Plate with hole grid

Box on the floor, then a linear pattern per row of holes.

```json
{ "id": "plate", "op": "add", "shape": "box", "size": [L, W, T], "position": [0, 0, T/2] },
{ "id": "hole-row", "op": "subtract", "shape": "cylinder", "radius": d/2, "height": T + 2,
  "position": [-L/2 + edge, -W/2 + edge, T/2],
  "pattern": { "type": "linear", "count": n, "step": [(L - 2*edge)/(n-1), 0, 0] } }
```

## Flange / bolt circle

Disc, optional raised hub, bore, then one hole with a circular pattern.
The hole sits at x = PCD/2 (pitch circle diameter / 2).

```json
{ "id": "disc", "op": "add", "shape": "cylinder", "radius": OD/2, "height": T, "position": [0, 0, T/2] },
{ "id": "bore", "op": "subtract", "shape": "cylinder", "radius": ID/2, "height": T + 2, "position": [0, 0, T/2] },
{ "id": "bolt-hole", "op": "subtract", "shape": "cylinder", "radius": d/2, "height": T + 2, "position": [PCD/2, 0, T/2],
  "pattern": { "type": "circular", "count": n, "axis": "z", "center": [0, 0, 0] } }
```

## Open box or enclosure

Outer box minus an inner box raised by the floor thickness. The inner box is
taller than needed so it cleanly opens the top.

```json
{ "id": "shell", "op": "add", "shape": "box", "size": [L, W, H], "position": [0, 0, H/2] },
{ "id": "cavity", "op": "subtract", "shape": "box", "size": [L - 2*wall, W - 2*wall, H],
  "position": [0, 0, floor + H/2] }
```

For a closed enclosure use cavity height `H - 2*floor` centred at `H/2`.
Mounting bosses: add cylinders inside the cavity *after* the cavity subtract.

## Cup, mug, pot

Outer cylinder, handle (torus rotated upright), then the cavity last so it also
trims the handle's inner half.

```json
{ "id": "body", "op": "add", "shape": "cylinder", "radius": R, "height": H, "position": [0, 0, H/2] },
{ "id": "handle", "op": "add", "shape": "torus", "radius": hr, "tube": ht, "position": [R, 0, H/2], "rotation": [90, 0, 0] },
{ "id": "cavity", "op": "subtract", "shape": "cylinder", "radius": R - wall, "height": H,
  "position": [0, 0, floor + H/2] }
```

## Tube, spacer, bushing

```json
{ "id": "tube", "op": "add", "shape": "cylinder", "radius": OD/2, "height": L, "position": [0, 0, L/2] },
{ "id": "bore", "op": "subtract", "shape": "cylinder", "radius": ID/2, "height": L + 2, "position": [0, 0, L/2] }
```

A flanged bushing adds a wider, short cylinder at the bottom before the bore.

## L bracket with gusset

Two boxes meeting at the corner; a rotated box as the gusset, trimmed with an
intersect that is the bracket's overall envelope. Holes come after the trim.

```json
{ "id": "base-leg", "op": "add", "shape": "box", "size": [W, A, T], "position": [0, A/2, T/2] },
{ "id": "upright-leg", "op": "add", "shape": "box", "size": [W, T, B], "position": [0, T/2, B/2] },
{ "id": "gusset", "op": "add", "shape": "box", "size": [g, 0.6*A, 0.6*B], "position": [0, T, T], "rotation": [45, 0, 0] },
{ "id": "trim", "op": "intersect", "shape": "box", "size": [W, A, B], "position": [0, A/2, B/2] },
{ "id": "upright-hole", "op": "subtract", "shape": "cylinder", "radius": d/2, "height": T + 2,
  "position": [x, T/2, z], "rotation": [90, 0, 0] }
```

## Knob or handwheel

Cylinder body, a cone for a tapered skirt, grip notches as a circular pattern
of subtracted cylinders whose centre sits on the rim, and a shaft bore.

```json
{ "id": "body", "op": "add", "shape": "cylinder", "radius": R, "height": H, "position": [0, 0, H/2] },
{ "id": "grip", "op": "subtract", "shape": "cylinder", "radius": g, "height": H + 2, "position": [R, 0, H/2],
  "pattern": { "type": "circular", "count": n } },
{ "id": "shaft", "op": "subtract", "shape": "cylinder", "radius": s/2, "height": 0.8*H, "position": [0, 0, 0.4*H - 1] }
```
