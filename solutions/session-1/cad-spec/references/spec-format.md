# CAD Spec Format (v1)

The viewer renders any `*.json` file in `app/models/` that follows this format.
A part is built by **constructive solid geometry (CSG)**: start from the first
feature, then add, subtract or intersect each following feature in order.

## Conventions

- Units are **millimetres**. `"units": "mm"` is required.
- **Z is up.** The XY plane is the "floor"; parts sit on it (lowest point at z = 0).
- Centre the part on the origin in X and Y unless told otherwise.
- `position` is the **centre** of the primitive, not a corner.
- `rotation` is in **degrees**, applied in X, then Y, then Z order.
- Cylinders, cones and tori are aligned to the local **Z axis** before rotation.

## Top level

| Field         | Type     | Required | Notes                                        |
|---------------|----------|----------|----------------------------------------------|
| `name`        | string   | yes      | Human readable part name                     |
| `units`       | `"mm"`   | yes      | Only millimetres are supported               |
| `description` | string   | no       | What the part is, design intent              |
| `color`       | `#rrggbb`| no       | Display colour                               |
| `parameters`  | object   | no       | Key dimensions, for humans (`{"wall": 3}`)   |
| `features`    | array    | yes      | At least one. The first must be `op: "add"`  |

## Feature

| Field      | Type                               | Required | Notes                         |
|------------|------------------------------------|----------|-------------------------------|
| `id`       | string                             | yes      | Unique, descriptive (`"bolt-hole"`) |
| `op`       | `"add"` `"subtract"` `"intersect"` | yes      | Applied to everything before it |
| `shape`    | see below                          | yes      |                               |
| `position` | `[x, y, z]`                        | no       | Default `[0, 0, 0]`           |
| `rotation` | `[rx, ry, rz]` degrees             | no       | Default `[0, 0, 0]`           |
| `pattern`  | object                             | no       | Repeat this feature           |

### Shapes and their dimensions

| `shape`    | Dimensions                                          | Orientation               |
|------------|-----------------------------------------------------|---------------------------|
| `box`      | `size: [x, y, z]`                                   | Axis aligned              |
| `cylinder` | `radius`, `height`                                  | Height along local Z      |
| `cone`     | `radiusBottom`, `radiusTop` (0 = point), `height`   | Bottom at -Z, top at +Z   |
| `sphere`   | `radius`                                            |                           |
| `torus`    | `radius` (centre of ring), `tube` (ring thickness)  | Ring lies in local XY     |

All dimensions must be positive numbers (except `radiusTop`, which may be 0).

### Patterns

Linear — `count` copies, each offset by `step`:

```json
"pattern": { "type": "linear", "count": 4, "step": [20, 0, 0] }
```

Circular — `count` copies rotated about an axis through `center`.
With the default `angle` of 360 the copies are evenly spaced around the full circle;
with a smaller angle the first and last copies sit at the ends of the arc.

```json
"pattern": { "type": "circular", "count": 6, "axis": "z", "center": [0, 0, 0], "angle": 360, "startAngle": 0 }
```

## Example — plate with four corner holes

```json
{
  "name": "Mounting plate",
  "units": "mm",
  "description": "80 x 50 x 6 mm plate, four M4 clearance holes 6 mm from each edge",
  "parameters": { "length": 80, "width": 50, "thickness": 6, "hole_d": 4.5 },
  "features": [
    { "id": "plate", "op": "add", "shape": "box", "size": [80, 50, 6], "position": [0, 0, 3] },
    { "id": "hole", "op": "subtract", "shape": "cylinder", "radius": 2.25, "height": 8,
      "position": [-34, -19, 3],
      "pattern": { "type": "linear", "count": 2, "step": [68, 0, 0] } },
    { "id": "hole-top-row", "op": "subtract", "shape": "cylinder", "radius": 2.25, "height": 8,
      "position": [-34, 19, 3],
      "pattern": { "type": "linear", "count": 2, "step": [68, 0, 0] } }
  ]
}
```

## Tips

- Make cutting tools (holes, pockets) **slightly longer** than the material they
  cut through, so the cut is clean (e.g. a 6 mm plate gets an 8 mm tall hole).
- Solids you **join** (a post on a floor, a rib on a wall) should overlap by
  ~0.5 mm rather than just touch. Faces that only touch are slow to compute and
  can leave seams.
- Hollow parts (cups, boxes, pipes): add the outer solid, then subtract a smaller
  inner solid that is offset upward so a floor remains.
- Fillets and chamfers are not supported; approximate with cones or leave them out.
