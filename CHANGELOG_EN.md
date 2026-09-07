# Changelog — English

## Release 048

> **Note for previously exported maps:** Up to and including release 047 the
> editor silently adopted the RTK reference point stored in a file when
> loading it - even when another map was already open. An export made
> afterwards could be shifted by the distance between the two reference
> points, with nothing in the file and no message indicating it. This affects
> only exports created while **two maps were loaded at the same time** and at
> least one of them carried a differing reference point. Compare such files
> with the original before using them. Maps exported with only one map loaded
> are not affected.

### CaSSAndRA compatibility

These features were already implemented but had never been recorded in a
changelog. They are verified against CaSSAndRA's own `export_geojson`
implementation.

- feature types follow CaSSAndRA's vocabulary: `perimeter`, `exclusion`,
  `search wire`, `dockpoints`
- `properties.name` carries the type only; a differing display name belongs in
  `properties.label` and is preserved when saving
- import additionally accepts the spellings `searchwire` and `dock points`;
  export normalises them back
- features with unknown names keep their value and are never renamed silently
- exclusion indices are kept in `idx` at feature level
- new **"Koordinatenbezug"** (coordinate reference) sidebar section for the
  RTK base position (lat/lon); in CaSSAndRA it lives under *Settings → Robot*
  and is not part of the GeoJSON file
- new **"Koordinaten beim Speichern"** (coordinates on save) selector:
  *as loaded* or *absolute WGS84 (CaSSAndRA)*
- maps in absolute WGS84 are detected on load and converted to local
  East/North metres
- the reference point is remembered in the browser and additionally stored in
  the file without disturbing CaSSAndRA's import
- with no reference point configured the editor behaves exactly as before

### Reference-point conflict (safety-relevant)

Internally the editor always computes relative to **one** reference point.
Until now a newly loaded file overwrote that point silently - the map already
open was then computed against a foreign RTK base and written out shifted
accordingly, without a warning and without a trace in the file. On a robot
using the real base the map would have been off by the distance between the
two base points.

- a reference point stored in a file no longer overwrites the active one
  while another map is loaded that would be displaced by the change
- the contradiction is reported clearly: highlighted status line, expanded
  "Koordinatenbezug" section, both values and their distance in plain text
- **merging** is blocked while either map contradicts the active reference
  point
- **saving is blocked in both output modes**. A relative export is not the
  safer case but the quieter one: there the file contains no number at all
  from which the wrong base could be recognised
- the conflict is resolved by entering the reported reference point under
  "Koordinatenbezug" and applying it
- a map converted from absolute WGS84 is re-based exactly when the reference
  point changes. Without that conversion the export would have been shifted
  again after resolving the conflict. **The displayed East/North values then
  run against a new origin and change visibly**, even though the geometry is
  unchanged
- the reference point is now part of the undo state; undo restores geometry
  and reference frame together
- fixed: merging two maps lost the information that they originated from
  absolute WGS84 - the result was subsequently saved as relative instead of
  absolute
- the map-loading messages are translated for the first time; they previously
  appeared in German even in English mode

### Cleanup and documentation

- removed dead code: `deleteSelectedExclusion()` (orphaned remnant of the
  button removed in release 043), `loadedAsAbsolute`, `toWorldForData` and
  `pendingDragHistory`
- the table of contents in the script header no longer matched the actual
  sections; it is corrected and explains the two quirks of the numbering
- fixed three statements that had lost their indentation
- added `tools/test-origin-conflict.mjs`: checks the reference-point conflict
  in a real browser
- added `tools/browser-harness.mjs`: shared Playwright and browser discovery
  for both browser tests. `check-all.mjs` stays dependency-free; the browser
  tests deliberately sit outside it
- extended `tools/test-cassandra.mjs` with tolerance, adoption rule and the
  export lock
- documentation aligned with the code: CLAUDE.md without line numbers, the
  test setup described environment-neutrally, and CaSSAndRA documented for the
  first time in `AGENTS.md`, `docs/DEVELOPMENT.md`, `README.md` and
  `README_EN.md`
- **release ZIPs are dropped entirely.** Development simply continues; a
  release now consists only of the version number, the changelogs and a git
  tag. The application runs as a single `index.html` straight from the
  repository and from GitHub Pages - an archive would only duplicate that one
  file. Earlier states remain checkoutable through the tags.

## Release 047
- refreshed the GitHub README to match the current feature set
- added a complete English project description to `README.md`
- added separate `README_EN.md`
- added English changelog
- added English code-documentation overview
- retained the existing bilingual German/English disclaimer

## Release 046
- fixed the actual cause of the single-point selection counter remaining at 0
- removed stale `deleteExclusionButton` JavaScript reference
- `updateSelectionPanel()` now reaches the toolbar update again
- single-point selection correctly displays `1 selected`

## Release 045
- unified primary single selection and multi-selection for the toolbar counter
- selection status and delete logic use the same effective selection

## Release 044
- docking paths are optional
- empty docking placeholders with 0 points produce a warning, not an error
- non-empty docking features must still contain exactly 3 points
- duplicate generic empty-geometry warnings for docking/Search Wire were removed

## Release 043
- removed the separate “Delete entire exclusion” button from the point editor
- full exclusions are deleted via map selection + trash button

## Release 042
- selecting all editable vertices of an exclusion is treated as selecting the complete feature
- trash button deletes the complete exclusion
- partial selections keep the polygon minimum-vertex validation
- exclusion indices are renumbered after deletion
- Undo remains available

## Release 041
- selection-toolbar error messages are reset when the selection or selection tool changes

## Release 040
- restored the language control as a compact slider toggle
- retained the working German/English translation logic
- enlarged the touch target on mobile devices

## Releases 038–039
- fixed startup runtime errors caused by stale references to removed UI elements
- repaired German/English switching
- added DOM-reference checks
- removed the temporary DE/EN debug status indicator

## Releases 033–037
- introduced German/English interface switching
- added translation of help, tooltips, status messages, and validation output
- iterated on Android/Chrome compatibility and translation initialization

## Release 032
- removed the visible Sunray detection panel
- removed the “Apply E/N values” button
- retained internal coordinate-format detection
- missing docking point became non-fatal

## Release 031
- moved multi-selection controls from the sidebar to a compact map toolbar
- added pointer, rectangle, lasso, move, delete, and clear-selection tools
- added hover tooltips and mobile-friendly controls

## Releases 024–030
- whole-feature movement for exclusions, Search Wire, and docking
- exclusion duplication
- collapsible sidebar organization
- map information moved into the map view
- Ctrl-based multi-selection
- group deletion fixes and feedback

## Releases 021–023
- exclusion drawing
- docking-point creation/deletion
- measurement and map validation
- Search Wire creation, extension, and deletion

## Releases 014–020
- rectangle/lasso multi-selection and group movement
- Web Map Editor naming and help
- Android/mobile layout
- keyboard nudging
- dark technical UI
- GitHub release package with MIT license and bilingual disclaimer
- Ardumower/Sunray project positioning

## Earlier releases
Earlier numbered releases established the standalone GeoJSON viewer/editor,
metric grid, point editing, start/end handling, mower preview, feature
navigation, two-map overlay/merge, Undo/Redo, and persistent comparison ghosts.
