# Development Guide

This document describes the development conventions and technical expectations
for contributing to **Web Map Editor**.

Web Map Editor is a standalone browser-based editor for GeoJSON / RTK map data.
It was developed primarily with Ardumower / Sunray-related maps in mind, while
remaining useful for compatible GeoJSON structures in other applications.

---

## Project structure

The application is intentionally lightweight and static.

Main application file:

- `index.html`

Supporting repository files may include:

- `README.md`
- `README_EN.md`
- `LICENSE`
- `DISCLAIMER.md`
- `CHANGELOG.md`
- `CHANGELOG_EN.md`
- `.nojekyll`
- `docs/code-documentation.md`
- `docs/code-documentation-en.md`
- `docs/DEVELOPMENT.md`

No build system or framework is required.

The editor should remain usable by opening `index.html` directly in a browser or
by publishing the repository with GitHub Pages.

---

## Release numbering

Substantial changes should increment the release number sequentially.

Current baseline:

- Ausgabe 047

Next substantial release:

- Ausgabe 048

Previous numbered releases should be preserved as rollback points where
possible.

For each release:

1. update the release number in the application
2. update documentation where relevant
3. update the changelog
4. run syntax and consistency checks
5. create a release ZIP if distributing a packaged build

---

## Privacy

The public application must not contain private user map data.

Do not embed:

- private GeoJSON maps
- user-specific RTK coordinates
- private filenames
- personal test datasets

The application should start without an embedded map.

Users load Map A and optionally Map B locally in the browser.

The application should not automatically upload map data to a server.

---

## Coordinate handling

Loaded GeoJSON data is the source of truth.

Coordinate conversion should remain centralized through the existing helper
functions, including:

- `toWorld(...)`
- `fromWorld(...)`

Supported relative RTK formats may be displayed and edited in local East/North
metres while preserving the raw loaded coordinate representation for export.

Do not duplicate conversion logic in unrelated functions.

Do not assume that a scale factor observed in one RTK map is universally valid
for every Ardumower / Sunray map.

---

## Ardumower / Sunray context

The editor is primarily designed around RTK-related GeoJSON maps used in the
Ardumower / Sunray ecosystem.

Important assumptions used by the editor:

- RTK positions are relative to the base antenna
- local coordinates are interpreted as East / North
- maps intended for merge operations must use the same local RTK coordinate
  frame
- the application cannot independently verify that two files use the same
  physical RTK base

The project is not officially affiliated with Ardumower or Sunray.

---

## Geometry semantics

### Closed polygon rings

Closed polygons use a technical duplicate of the first coordinate at the end of
the ring.

Editable vertices should exclude this technical duplicate.

When changing polygon structure:

- preserve closure
- preserve the intended vertex order
- keep at least 3 distinct polygon vertices

### Perimeter start / end

For closed polygons:

- first unique point = Start
- last unique point = End
- final repeated point = technical closure

Reassigning Start/End should preserve the polygon geometry and rotate the point
order cyclically.

### Extra coordinate dimensions

Structural polygon operations should preserve complete coordinate arrays where
possible.

If coordinates contain Z or additional dimensions, avoid reducing them to only
X/Y unless explicitly required.

---

## Selection model

The editor uses:

- `selectedVertex`
- `selectedVertices`

Use `getEffectiveSelectedVertices()` when logic needs one unified selection
source.

This is important for:

- selection counters
- delete operations
- status messages
- single vs multi-selection consistency

### Selection tools

The map toolbar contains:

- pointer
- rectangle
- lasso
- move
- delete
- clear selection

Modifier behavior:

- `Ctrl + click` toggles individual points
- `Ctrl + rectangle/lasso` adds to the existing selection

### Full Exclusion deletion

If all editable vertices of an Exclusion are selected, the trash action should
delete the complete Exclusion feature.

Partial selection should continue to delete only selected vertices while
preserving valid polygon geometry.

After deleting a complete Exclusion:

- renumber remaining Exclusions
- preserve Undo support

---

## Whole-feature operations

Whole-feature movement is supported for:

- Exclusion
- Search Wire
- Docking

Direct whole-perimeter dragging is intentionally avoided to reduce accidental
movement.

Exclusion duplication should:

- clone the Exclusion
- offset the clone visibly
- remove the old index from the clone
- renumber Exclusions
- select the duplicate
- remain undoable

---

## Search Wire

Search Wire is represented as an open `LineString`.

Supported operations:

- create
- extend
- delete

A non-empty Search Wire should contain at least 2 points.

An empty Search Wire placeholder may be valid.

When extending an existing Search Wire, existing points should remain protected
until the operation is finished.

---

## Docking

Docking is optional.

Validation semantics:

- no Docking feature → warning only
- empty Docking LineString → warning only
- non-empty Docking with 1, 2, or more than 3 points → error
- valid Docking → exactly 3 points
- maximum one Docking feature per map

Individual Docking points should not normally be deleted separately.

---

## Mower preview

The mower preview is derived geometrically from the selected path.

Orientation convention:

- 0° = East
- 90° = North

No per-point heading is assumed unless it is explicitly present in a future
supported format.

For polygons, direction follows the point sequence.

For open lines, the last point may derive direction from the previous segment.

---

## Measurement and validation

Measurement should provide:

- distance
- ΔEast
- ΔNorth
- angle

Map validation should include checks for:

- FeatureCollection structure
- perimeter geometry
- polygon closure
- polygon area
- Exclusion geometry and indices
- Docking rules
- Search Wire rules
- empty or incomplete geometry
- consecutive duplicate points
- unusually large segments

A missing or empty Docking path is not a fatal validation error.

---

## Map merge

Map A and Map B may be merged when they use the same local RTK frame.

The merge concept is:

- A End → B Start
- B End → A Start

The resulting perimeter must remain closed.

Non-perimeter features from Map B may be appended to Map A.

After merge:

- Exclusions should be renumbered
- the merged result becomes Map A
- Map B is removed

---

## Undo / Redo

History snapshots should cover editing operations such as:

- point movement
- group movement
- feature creation
- feature deletion
- merge
- reset

A continuous drag should normally create one Undo step.

Keyboard shortcuts include:

- `Ctrl/Cmd + Z`
- `Ctrl + Y`
- `Ctrl/Cmd + Shift + Z`

---

## Language support

The interface supports:

- Deutsch
- English

German is the default language.

When adding or changing UI text:

1. update the German source text
2. add or update the English translation
3. update dynamic-message patterns if needed
4. test both directions

Avoid rewriting the translation subsystem unless there is a concrete reason.

---

## Mobile / Android

The interface should remain usable in Chrome on Android.

Important principles:

- touch targets should be sufficiently large
- page scrolling must continue to work
- map gestures should remain usable
- avoid hidden controls that depend on fragile browser-specific behavior
- test toggles and selection tools on touch devices

---

## Testing requirements

Do not rely on syntax checking alone.

### JavaScript syntax

Extract the application script and run:

```bash
node --check extracted-script.js
```

### DOM ID audit

Every direct:

```js
document.getElementById("...")
```

should refer to an element that actually exists.

When removing a UI element, also search for:

- old IDs
- old variable names
- old event listeners
- initialization references

Several previous runtime bugs were caused by stale JavaScript references after
UI elements had already been removed.

### Runtime testing

For structural UI changes, browser runtime testing is strongly recommended.

### Privacy check

Before release, search generated files for private map data and user-specific
identifiers.

---

## Documentation

When behavior changes, update the relevant documentation:

- `README.md`
- `README_EN.md`
- `CHANGELOG.md`
- `CHANGELOG_EN.md`
- `docs/code-documentation.md`
- `docs/code-documentation-en.md`

German and English documentation should remain aligned.

---

## Code style

Prefer:

- small, focused helper functions
- clear comments for non-obvious geometry behavior
- centralized coordinate conversion
- minimal dependencies
- explicit validation
- readable standalone JavaScript
- responsive UI behavior

Avoid:

- duplicated geometry logic
- hidden global side effects
- stale DOM references
- unnecessary frameworks
- embedding private test data

---

## Safety and scope

Public project documentation should make clear that:

- the software may contain bugs
- edited maps should be independently verified
- the software is not a validated navigation, surveying, or safety system
- use is at the user's own risk
- the project is not officially affiliated with Ardumower or Sunray

See `DISCLAIMER.md` for the full wording.