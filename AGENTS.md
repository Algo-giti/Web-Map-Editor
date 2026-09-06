# AGENTS.md

# Web Map Editor – Agent Instructions

This file contains the persistent working rules for AI coding agents operating
on this repository.

Read this file before making changes.

Also read:

- `CLAUDE.md`
- `docs/DEVELOPMENT.md`
- `README.md`
- `README_EN.md`
- `CHANGELOG.md`
- `CHANGELOG_EN.md`
- `DISCLAIMER.md`

---

## Project

Project name:

**Web Map Editor**

Current baseline:

**Ausgabe 047**

Next substantial release:

**Ausgabe 048**

Substantial releases are numbered sequentially and should be preserved as
rollback points.

Do not overwrite previous numbered release artifacts.

---

## Architecture

The application is intentionally a standalone static browser application.

Primary file:

- `index.html`

The project should remain:

- framework-free
- build-free
- backend-free
- usable directly in a browser
- suitable for GitHub Pages

Do not introduce dependencies, frameworks, bundlers, or server components unless
explicitly requested.

This restriction applies to the shipped application (`index.html`) itself.
Development-only helper scripts that do not affect `index.html` or the
deployed app - such as the zero-dependency Node scripts under `tools/` used
for automated verification (see `CLAUDE.md`) - are not subject to it. Keep
such tooling dependency-free where practical, and never let the shipped app
come to depend on it.

---

## Privacy

Never embed private user map data in public project files.

Do not commit or hard-code:

- private GeoJSON maps
- private RTK coordinates
- private filenames
- user-specific map content
- personal test datasets

The editor must start without an embedded user map.

Maps are loaded locally in the browser.

Before releasing, perform a privacy check across generated files.

---

## Coordinate handling

Loaded GeoJSON is the source of truth.

Use the existing centralized coordinate conversion helpers:

- `toWorld(...)`
- `fromWorld(...)`

Do not duplicate coordinate-conversion logic elsewhere.

Do not assume that a scale factor observed in one Ardumower / Sunray map is
universally valid.

Preserve raw coordinate semantics for export whenever possible.

---

## Polygon semantics

Closed polygon rings contain a technical duplicate of the first coordinate at
the end.

That technical closing coordinate is not an independent editable vertex.

When changing polygon structure:

- preserve ring closure
- preserve point order unless intentionally rotating it
- keep at least 3 distinct polygon vertices
- avoid dropping additional coordinate dimensions

For perimeter start/end semantics:

- first unique point = Start
- last unique point = End
- repeated final point = technical closure

---

## Selection model

The editor uses both:

- `selectedVertex`
- `selectedVertices`

When logic needs one unified selection source, use:

- `getEffectiveSelectedVertices()`

Keep single and multi-selection behavior consistent.

This especially applies to:

- selection counters
- status messages
- move operations
- delete operations

Do not reintroduce the previous bug where one visibly selected point showed
`0 selected`.

---

## Exclusion deletion

If all editable vertices of one Exclusion are selected, the trash action must
delete the complete Exclusion feature.

This must work with:

- rectangle selection
- lasso selection
- Ctrl + click

Partial Exclusion selection deletes only selected points and must leave at least
3 distinct polygon vertices.

After complete Exclusion deletion:

- renumber remaining Exclusions
- preserve Undo support

The separate point-editor button for deleting an entire Exclusion was removed.
Do not restore it unless explicitly requested.

---

## Whole-feature operations

Whole-feature movement is supported for:

- Exclusion
- Search Wire
- Docking

Do not make the whole perimeter directly draggable unless explicitly requested.

Exclusion duplication should remain undoable and should renumber Exclusions
correctly.

---

## Docking

Docking is optional.

Validation rules:

- no Docking feature → warning only
- empty Docking LineString → warning only
- non-empty Docking with 1, 2, or more than 3 points → error
- valid Docking → exactly 3 points
- maximum one Docking feature per map

Do not make missing Docking a fatal validation error.

---

## Search Wire

Search Wire is an open `LineString`.

Allowed states:

- empty placeholder
- non-empty line with at least 2 points

Supported operations include create, extend, move, and delete.

---

## Mower orientation

Do not assume that heading/yaw is stored per point unless a future supported
format explicitly contains it.

Current mower orientation is derived geometrically.

Convention:

- 0° = East
- 90° = North

---

## Undo / Redo

Preserve Undo / Redo behavior.

A continuous drag should normally create one Undo step.

Do not accidentally create one history entry per mousemove/pointermove event.

Keyboard nudging should also remain grouped appropriately.

---

## Language

The UI supports:

- Deutsch
- English

German is the default language.

Whenever adding or changing visible UI text:

1. update the German source text
2. update the English translation
3. update dynamic translation patterns if needed
4. test both languages

Do not casually rewrite the translation subsystem.

---

## Mobile / Android

Preserve mobile compatibility, especially Chrome on Android.

Check:

- touch target sizes
- page scrolling
- map interaction
- toolbar overflow
- toggle usability
- form-control sizing

Do not break desktop behavior while fixing mobile layout.

---

## UI removal rule

When removing any UI element, always search the full JavaScript for:

- the element ID
- related variable names
- event listeners
- initialization code
- enable/disable assignments
- status-update references

Previous runtime failures were caused by stale JavaScript references after UI
elements had already been removed.

Syntax checks alone will not detect these failures.

---

## Required checks before every release

At minimum:

### 1. JavaScript syntax

Extract the inline script from `index.html` and run:

```bash
node --check extracted-script.js
```

### 2. DOM ID audit

Verify every direct:

```js
document.getElementById("...")
```

references an existing HTML ID.

### 3. Stale-reference audit

Search for variables, IDs, listeners, and state updates related to UI elements
that were removed or renamed.

### 4. Privacy audit

Check generated HTML and documentation for:

- private map filenames
- private coordinates
- embedded private GeoJSON
- private test data

### 5. Browser runtime check

For structural UI changes, perform a real browser/runtime test whenever
possible.

---

## Documentation

Update relevant documentation whenever behavior changes.

Keep German and English documentation aligned.

Potentially affected files:

- `README.md`
- `README_EN.md`
- `CHANGELOG.md`
- `CHANGELOG_EN.md`
- `docs/DEVELOPMENT.md`
- `CLAUDE.md`

Update `AGENTS.md` only when persistent development rules or architecture change.

Do not place temporary feature requests or one-off implementation notes here.

---

## Release packaging

Release archives (e.g. `web-map-editor-release-048.zip`) are build
artifacts. Do not commit them, or a `web-map-editor-release-048/` staging
directory, into the git repository.

For the next substantial release:

1. tag the corresponding commit (e.g. `v048`)
2. attach a `web-map-editor-release-048.zip` (containing at minimum
   `index.html`) to a GitHub Release created from that tag

Future releases continue sequentially. Using tags and GitHub Releases keeps
every previous release downloadable as a rollback point without storing
binary archives in the repository's git history.

---

## Code style

Prefer:

- small focused helpers
- explicit geometry logic
- meaningful comments
- readable standalone JavaScript
- centralized conversion logic
- minimal dependencies
- defensive checks around DOM access
- clear Undo boundaries
- responsive UI behavior

Avoid:

- duplicated coordinate conversions
- unexplained global state changes
- stale DOM references
- unnecessary frameworks
- hidden private test data

---

## Safety and project scope

Public documentation should continue to state that:

- the software may contain bugs
- edited maps should be independently verified
- it is not a validated navigation, surveying, or safety system
- use is at the user's own risk
- the project is not officially affiliated with Ardumower or Sunray

See `DISCLAIMER.md`.

---

## Agent startup procedure

Before implementing a requested change:

1. read this `AGENTS.md`
2. read `docs/DEVELOPMENT.md`
3. inspect the current `index.html`
4. inspect the most recent changelog entries
5. understand the existing implementation before modifying it

For the current repository:

**Do not create Ausgabe 048 until a substantive change is requested.**

When the next substantive change is implemented, release it as:

# Ausgabe 048