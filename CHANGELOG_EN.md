# Changelog — English

## Release 050

Release 050 rebuilds the interface. Nothing about the map data changes:
import, export, geometry and every computation are untouched, and a file saved
with 049 is byte for byte the same as one saved with 050. What changes is
**where** the controls are - and that the map gets more room.

---

### 1. A menu bar instead of scattered buttons

A menu bar sits at the top with four menus: **File, View, Map, Help**. Open,
save, reset, the map windows and the help live there.

Each menu has a keyboard shortcut taken from the **first letter of its title** -
Alt+F, Alt+V, Alt+M, Alt+H in English, Alt+D, Alt+A, Alt+K, Alt+H in German.
The shortcuts therefore follow the language, and the underlined letter moves
with it on its own. F10 enters the bar without the Alt key; the arrow keys then
walk through every menu, Escape closes.

The header shrank from 1038 to 880 px minimum width and from 64 to 48 px high.

### 2. A toolbar on the left

Every tool sits vertically to the left of the map, in three groups, and the
grouping carries the most useful thing a toolbar can say: **what changes the
map and what does not.**

| Group | Tools |
|---|---|
| Select | pointer, box, lasso |
| Draw | exclusion, circle, rectangle, Search Wire, dock path |
| Check | measure, validate map |

The toolbar collapses to icon width, and the choice survives the next start.
In narrow windows it collapses on its own.

A blocked drawing tool now **says why** it is blocked - clicking it puts the
reason in the status bar. Before, "Search Wire" would stay greyed out
permanently because the map already has one, with nothing saying so.

### 3. An inspector on the right

The inspector **describes what is currently selected** and carries the
commands that go with it. It has a fixed header block that does not move as
you select, and below it, depending on the selection: the East/North fields of
a point, its role as start or end point, the area and point count of a
feature, and the selection actions "Delete selection" and "Clear selection".

Five collapsible blocks complete it: **Reshape** (straighten, reduce,
right-angle), **Map check**, **Feature navigation**, **Coordinate reference**
and the inventory. Collapsed, each carries the essentials in one line. They
never expand on their own - not even when a tool becomes available or the
check finds new problems.

The inspector collapses too, to a 34 px strip carrying its toggle; that choice
also survives the next start.

The reshaping tools are **always** present, even when they cannot run - with
the reason underneath. Showing them only once they work would never tell you
what to do to get there.

### 4. Legend and status bar at the bottom

The legend is a fixed row above the status bar, **always visible and no longer
collapsible**. Before, it sat collapsed above the map and was therefore absent
exactly when the colours were needed.

Below it, a two-line status bar gathers seven previously scattered outputs: file
name, scale, reference point and validation result on the left, selection count
and cursor coordinates on the right, and the most recent message across the
full width of line 2. Ten of the editor's fourteen output locations used to sit
in collapsible areas, and twice that had made messages invisible.

### 5. Three windows over the map

**Grid**, **mower preview** and **merge maps** are small windows opened from
the "Map" menu that leave the map in view while you adjust them. Closed, they
cost no space.

### 6. The sidebar is gone

It no longer exists. Its contents moved to where they are used: feature
navigation and the coordinate reference into the inspector, merging into its
own window, the dimension fields of the drawing tools into the inspector's
drawing state, and the selection toolbar off the map into the inspector. The
trash button on the map is now **"Delete selection"** in the inspector.

On a phone the toolbar, map and inspector are stacked and the page scrolls;
every command stays reachable from the menu bar. The former button that showed
and hid the control panel on small screens is gone with it.

### 7. More map area - especially in narrow windows

Measured in the same browser and with the same script as the baseline:

| Window | both bars open | both collapsed |
|---|---|---|
| 1920 x 1080 | -15.2 % | **+8.4 %** |
| 1440 x 900 | -20.0 % | **+13.5 %** |
| 1280 x 800 | -22.9 % | **+15.8 %** |

The real gain is at the in-between widths. At **940 x 800** - a width where the
toolbar is collapsed anyway - the map area grew from 147,616 to **371,676 px²,
that is by 151.8 %**. There the old grid reserved a column for a sidebar that
gave the map nothing back.

**To be honest about it:** with both bars open the area is smaller than before.
The rebuild is a gain in order; the area is gained by collapsing.

### 8. Smaller things

- The mouse cursor shows the active tool: crosshair while drawing, measuring
  and for box/lasso, otherwise the grab hand, and a move cursor over a point.
- The "move" button is gone - it merely duplicated the pointer.
- The point buttons are arranged in pairs: before/after, start/end; "Delete
  point" stands alone across the full width.
- An empty East/North field now says why it is empty.
- The map colours live in one place, and the legend pulls the same values as
  the rendering. Yellow now means **selection** and nothing else; the dock path
  is blue, the origin cross neutral, and the comparison line belongs to the
  before-ghosts.
- The help overlay describes the actual layout again.

---

## Release 049

> **Note for maps exported before release 048:** Up to and including release
> 047 the editor silently adopted the RTK reference point stored in a file when
> loading it - even when another map was already open. An export made
> afterwards could be shifted by the distance between the two reference points,
> with nothing in the file and no message indicating it. This affects only
> exports created while **two maps were loaded at the same time** and at least
> one of them carried a differing reference point. Compare such files with the
> original before using them. Maps exported with only one map loaded are not
> affected.

---

### 1. Format detection and scale

Mode detection relied on a precision test: it checked whether every coordinate
value multiplied by 111111 yields a whole number of centimetres, and accepted
the format at 98 % of hits. That is an accuracy test used as a unit test - two
freely placed points on a 100-point map were enough to tip it, and on small
maps a single one sufficed. The editor therefore failed to recognise its own
output.

The decision is now made from the **extent**: a WGS84 mowing map is inevitably
tiny in extent (200 m is 0.0018 degrees), a metric map inevitably large. The
magnitude then only separates absolute from relative. The mode is determined
**once** on loading and remembered with the map; editing can no longer tip it.

This also fixes a second fault that sat in front of it: absolute detection
looked only at the magnitude. A map whose numbers are simply metres therefore
counted as absolute WGS84 and was multiplied by 111111 on import - 200 m became
22,222,200 m.

**Behaviour changes on existing maps:**

| Map | previously | now |
|---|---|---|
| relative map with freely placed points | shown unscaled | correct in metres |
| metric map (8 m, 200 m, also offset) | read as degrees | metric (assumed) |
| relative map larger than 15 km | read as degrees | ambiguous, nothing is claimed |
| metric map smaller than 1 m | read as degrees | ambiguous, nothing is claimed |
| WGS84 map near 0/0 | shown unscaled | read as a relative map |

The last case is nominally worse and is a deliberate decision: an absolute map
at the origin cannot be distinguished numerically from a relative one. The
point lies in the middle of the Atlantic, the expectation "relative map" is
orders of magnitude more likely, and an ambiguity wide enough to cover this
case would catch every normal relative map.

**"Metric (assumed)" means assumed.** A large extent only proves the numbers
are not degrees - not that they are metres. They could be feet, centimetres or
a local grid.

**With an unclear scale, everything no conversion can rescue is locked:** snap
to grid, saving in absolute coordinates, and writing the additional fields
`referenceOrigin` and `coordinateScale`. An assurance the file does not honour
is not written. Tolerance, straightening and the mower preview stay usable and
are merely marked; lengths then read "units" instead of "m". A permanently
visible notice sits **in the map area** rather than in a collapsible section
and names both readings with their concrete size.

**New: the `coordinateScale` field** (`{metersPerUnit}`) on the
FeatureCollection, built like `referenceOrigin`. A value in the file beats any
heuristic, so the editor reliably recognises its own output. That CaSSAndRA's
import ignores additional top-level fields is verified against its source code,
but not against a running instance.

**Only the four CaSSAndRA types are editable.** Features with an unknown or
missing `properties.name` are still displayed and written back unchanged on
save, but they get no point markers, cannot be selected on the map and return
the same refusal in every tool. A name that is set but unknown is an **error**
(something was claimed that is not true); a name that is missing entirely is
only a **warning**, and all affected features are folded into one message.

**In map validation, a skipped check is not a passed check.** With an unknown
scale the area reads "could not be computed" instead of a number, and the
segment check states that only its relative part was applied.

### 2. Conflicting reference points

The RTK reference point of a loaded file used to be adopted silently. That is
the cause of the note at the top of this release.

- **It is adopted only when nothing else is loaded.** If the other map slot
  holds data, the active reference point stays and the contradiction is
  reported.
- Two reference points count as the same location when they are **less than
  1 cm** apart. The comparison is made in metres, not in degrees - a degree of
  longitude has a different length at every latitude.
- **While a contradiction exists, merging is locked and so is saving, in both
  output modes.** The relative path is not the harmless one but the quieter
  one: a relative map computed against the wrong point sits off by that
  distance on the robot, and the file contains not a single number that would
  reveal it.
- **Resolve it** by entering the file's reference point named in the warning.
  Warning and locks then disappear by themselves.
- **Changing the reference point re-bases converted maps.** Without that, the
  export after "resolving" would have been shifted by the difference - silently
  wrong despite the lock being gone. Visible consequence: the displayed
  East/North values then run against a new origin. The status line says so.
- The reference point is now part of the undo step. Otherwise undo restored the
  geometry but not the frame it was computed in.

### 3. Docking path: point count released

The former rule "exactly 3 points" was an **invention of this editor** and is
disproven against both sources.

- **CaSSAndRA** (`mapdata.py`, branch `master`) passes the docking path through
  as a plain `LineString` with all its coordinates, without counting.
  `check_dockpoints()` explicitly requires only **at least 2** points and works
  with the last two. When deleting a point, CaSSAndRA even exempts dockpoints
  from the 3-point rule that applies to figures.
- **Sunray** (`map.cpp`) refuses docking below 2 points. No assumption of
  "exactly 3" exists anywhere; `retryDocking()` compares against `numPoints-3`,
  which only makes sense with **more** than three points.

Consequently: **valid from 2 points, with no upper limit.** A count other than
3 now only produces a note about common practice, not an error. A single point
remains an error. Automatic completion after the third point is gone, the path
can be extended at its end, and individual points can be deleted as long as 2
remain.

**Not tested against running firmware or real hardware**, only against the
source code of both projects. Neither source states an upper limit - none was
added and none is claimed.

### 4. New tools

**Straighten line.** With exactly two points of the same line selected, the
points in between are projected perpendicularly onto the connecting line. The
two anchors stay put. On closed rings the shorter of the two ways is used.
Preview before applying, one undo step.

**Reduce points (Douglas-Peucker).** Works on the section between two selected
points or on a whole feature.

- Default tolerance **0.02 m**, the magnitude of RTK noise.
- Closed rings stay closed; the start point is always kept - a deliberate
  limitation the interface points out.
- If the tolerance is too large the operation is **refused rather than
  truncated**, and the largest tolerance that would still have worked is named.
- **Area changes on exclusions are reported** when they exceed 1 % *or* a
  square of the configured working width. Shrinking areas are coloured as a
  warning - they release area the mower is meant to avoid.
- Before applying, map validation runs over a preview copy. New errors abort.

**Circle and rectangle exclusions.** A single click sets the reference point,
the geometry follows from the entered dimensions. The result is an **ordinary
exclusion** - same ring closure, same `idx` assignment, no extra fields, fully
editable afterwards. Default 24 vertices: the deviation from the ideal circle
is then 8 mm at 1 m radius and 17 mm at 2 m, both below RTK noise; the actual
deviation is displayed. Snap to grid applies to the reference point, not to the
vertices.

**Extended map validation.** Four new findings, all **warnings**: exclusions
outside the perimeter, exclusions overlapping or nested inside each other,
self-intersecting rings and lines, and corridors narrower than the mower.

- The docking path is exempt from the perimeter check - in many setups it
  deliberately leads outside to the charging station.
- Overlaps are reported but not quantified.
- The corridor distance is computed **exactly**, not sampled. What is exact is
  the geometry, not the statement about passability: the measurement is against
  the working width, and turning circle, RTK tolerance and tracking error are
  not included. **No finding does not mean a corridor is passable** - the
  report says so too. With an unclear scale the check reports itself as
  skipped.
- Findings are aggregated per feature or per pair and name the feature and the
  segment. On very large maps an abort is reported explicitly.

**Right-angled corners.** Aligns the edges of a whole feature to a
right-angled grid. The preferred direction is estimated from the outline or
entered by hand; shown are the preferred direction, the **agreement in
percent**, the number of adjusted edges and the largest displacement of a
point. A low agreement means the shape was never meant to be rectilinear - it
is coloured as a warning, nothing is blocked. Edges beyond the tolerance
(default 15 degrees) are left untouched, and **no point is removed**. Alignment
follows the shape's own direction, not East/North; enter a fixed 0 degrees for
axis alignment.

### 5. Cleanup and corrections

- **Merging duplicated the docking path and the Search Wire.** There is only
  one of each per map; only exclusions and features of unknown type are now
  taken from the second map. Empty placeholders are dropped, a filled path wins
  regardless of which map it came from, and **two filled paths are a conflict**
  that locks merging - silently discarding one would be wrong. A docking path
  with a single point does not count as empty but as faulty, and enters the
  conflict.
- Features of unknown type are deliberately carried over from **both** maps
  rather than merged: the editor knows nothing about them, and discarding would
  be worse than duplicating.
- **Export does not renumber exclusion indices.** Loaded `idx` values are
  written back unchanged, gaps included. Renumbering happens only after
  structural changes. Saving must not silently change what nobody touched.
- A hint text in the "Reduce points" section was never translated because it
  had only been stored line by line.
- Test tooling: `tools/check-all.mjs` bundles the dependency-free checks, and
  ten browser tests exist alongside. They are deliberately not part of
  `check-all.mjs` and generate all their maps synthetically.

**Known open points of this release:** the dynamic titles of Undo/Redo stay
German in English mode, and an already rendered validation report is not
re-translated when the language is switched. Both are recorded in `CLAUDE.md`
and will be handled together during the next interface rework.

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
