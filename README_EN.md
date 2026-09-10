# Web Map Editor


## Overview

**Web Map Editor** is a standalone, browser-based editor for GeoJSON and
RTK-related map data. The application runs entirely locally in the browser and
does not require a server, database, package manager, or build system.

It is designed for precise editing of local East/North coordinates, polygon
perimeters, exclusion areas, Search Wire geometry, and optional docking paths.

## Ardumower / Sunray

Web Map Editor was primarily developed for maps used in the
**Ardumower / Sunray ecosystem**. Its main focus is RTK-related GeoJSON data
using local East/North coordinates, perimeters, and exclusions.

The project is **not officially affiliated with Ardumower or Sunray** and is
not an official tool of either project.

Because the editor works with GeoJSON geometry in general, it may also be
useful for other robots, applications, or mapping workflows whose data
structures are compatible. Full support for arbitrary GeoJSON variants or
third-party RTK formats is not guaranteed.

> **Important:** The software may contain bugs. Edited maps must be verified
> independently before use with real machines, robots, or other
> safety-relevant systems. Use is at your own risk. See
> [DISCLAIMER.md](DISCLAIMER.md).

## Main features

### Load and edit maps

- open GeoJSON / JSON files locally in the browser
- load Map A and optionally Map B at the same time
- edit the active map while displaying the other map as a reference
- fit, zoom, and pan the map view
- local metric grid with configurable spacing
- optional snap-to-grid
- preserve raw coordinates in the loaded coordinate system when exporting

### Point editor

- select and move individual vertices
- display East/North values
- insert points before or after an existing point
- delete points
- keep polygon rings closed automatically
- redefine the start and end vertices of a closed ring

### Selection tools

In the toolbar on the left, group "Auswählen" (Select):

- pointer
- box
- lasso

In the inspector on the right, as soon as something is selected:

- delete selection
- clear selection

In addition:

- `Ctrl + click` to add or remove individual points
- selection counter in the status bar at the bottom
- hover tooltips
- touch-friendly controls for mobile browsers

When all editable vertices of an exclusion are selected, "Delete selection"
removes the **entire exclusion feature**. Partial selections delete only the
selected vertices, provided the resulting polygon remains valid.

### Move whole features and duplicate exclusions

- move an entire exclusion as one object
- move an entire Search Wire
- move an entire docking path
- drag directly on feature geometry
- move selections by exactly one grid step using the arrow keys
- duplicate an exclusion
- automatically offset and fully select the duplicated exclusion
- automatically renumber exclusion indices
- Undo / Redo support

### Create exclusions

- draw a new exclusion directly on the map
- minimum of 3 vertices
- polygon ring is closed automatically
- `Backspace` removes the most recently added point
- `Enter` finishes drawing
- `Esc` cancels drawing

### Straighten line

- select exactly two points of the same line
- the points in between are projected perpendicularly onto the connecting line
- the two selected points stay where they are
- on closed rings the shorter of the two ways is used
- preview before applying, one undo step

### Right-angled corners

- select one point of the feature; the tool works on the whole feature
- the preferred direction is estimated from the outline or entered by hand
- shown are the preferred direction, the agreement in percent, the number of
  adjusted edges and the largest displacement of a single point
- a low agreement means the shape was never meant to be rectilinear
- edges beyond the tolerance (default 15 degrees) are left untouched
- alignment follows the shape's own direction; enter 0 degrees for axis alignment
- no point is removed
- the preview follows the selection, one undo step

### Extended geometry validation

Map validation additionally reports:

- exclusions outside the perimeter or extending beyond its boundary
- exclusions overlapping each other or nested inside each other
- rings and lines that intersect themselves
- corridors narrower than the mower

All four are warnings, not errors - nothing is blocked or changed. Every
message names the feature and the segment.

The docking path is exempt from the perimeter check because in many setups it
deliberately leads to a charging station outside.

The corridor check measures against the configured working width. Turning
circle, RTK tolerance and tracking error are not included: **no finding does
not mean a corridor is passable.** With an unknown scale the check is skipped
and says so explicitly.

### Circle and rectangle exclusions

- circle: enter radius in metres and vertex count, then click the centre
- the actual deviation from the ideal circle is displayed
- rectangle: enter width, height and rotation, then click the reference point
- the click point is either the centre or a corner
- angle convention 0 degrees = East, 90 degrees = North
- the preview follows the mouse pointer
- snap to grid applies to the reference point, not to the vertices
- the result is an ordinary exclusion and remains fully editable
- one undo step

### Search Wire

- draw a new open Search Wire
- extend an existing Search Wire from its end
- minimum of 2 points for a non-empty line
- empty Search Wire placeholders are supported
- existing points remain protected while extending
- delete the complete Search Wire feature

### Docking

Docking is **optional**.

- no docking path is required
- an empty docking placeholder is allowed and produces only a warning
- a single point is an error; from 2 points on the path is valid
- no upper limit on the number of points
- 3 points (approach, alignment, end point) are common practice, not a
  requirement - a different count only produces a note
- at most one docking feature per map
- extend an existing path at its end
- delete the complete docking path

### Mower preview

- to-scale mower preview at the selected point
- configurable mower length and width
- travel direction derived geometrically from the point sequence
- mower preview can be used as a drag handle
- original position and heading can remain visible as a ghost after edits

### Measurement

- select two positions on the map
- distance in metres
- ΔEast and ΔNorth
- angle in degrees
- angle convention: 0° = East, 90° = North

### Coordinate reference and CaSSAndRA

The editor reads and writes maps in the format used by
[CaSSAndRA](https://github.com/EinEinfach/CaSSAndRA), both in the relative
Sunray representation and in absolute WGS84.

- feature types use CaSSAndRA's vocabulary (`perimeter`, `exclusion`,
  `search wire`, `dockpoints`); a different display name in
  `properties.label` is preserved when saving
- **Coordinate reference:** enter the RTK base position (lat/lon) in the
  inspector under "Koordinatenbezug". In CaSSAndRA it lives under *Settings → Robot* and is not part of
  the GeoJSON file
- **Coordinates on save:** either *as loaded* or *absolute WGS84 (CaSSAndRA)*
- absolute maps are detected on load and converted to local East/North metres
- the reference point is remembered in the browser and additionally stored in
  the file without disturbing CaSSAndRA's import

If a loaded map declares an RTK reference point that differs from the active
one, the editor keeps the active point, says so clearly, and blocks both
merging and saving until the contradiction is resolved. This prevents writing
a file that would sit on the robot off by the distance between the two bases.

With no reference point configured the editor behaves exactly as before: the
conversion then equals the plain relative representation.

### Reduce points

Points that sit too closely together can be thinned out using the
Douglas-Peucker algorithm.

- applies to a whole feature or to the section between two selected points
- tolerance in metres is freely configurable, default 0.02 m (the magnitude of
  RTK noise)
- preview of the new geometry and of the points that would be dropped
- point count before/after directly in the inspector
- perimeter, exclusion, Search Wire and docking path
- closed rings stay closed; polygons keep at least 3 vertices, open lines at
  least 2
- a notable area change on exclusions is reported
- one undo step

### Map validation

The active map can be validated before export. Checks include:

- GeoJSON FeatureCollection structure
- perimeter type, closure, and area
- exclusion geometry, areas, and indices
- docking structure
- Search Wire structure
- empty or incomplete geometry
- consecutive duplicate points
- unusually large segments

A missing or empty docking path is **not an error**; at most it produces a
warning. Automatic validation before saving is enabled by default.

### Merge maps

Two perimeters can be merged into a new closed perimeter.

The editor connects:

- **A End → B Start**
- **B End → A Start**

Both maps must use the same local RTK coordinate system / physical RTK base.
The editor cannot independently verify that both files actually refer to the
same physical base.

### Undo / Redo and comparison

- Undo / Redo buttons
- `Ctrl/Cmd + Z`
- `Ctrl + Y`
- `Ctrl/Cmd + Shift + Z`
- one drag operation equals one Undo step
- original positions can remain visible for comparison until saving
- saving establishes a new comparison/reset checkpoint

### German / English

The interface can be switched between **Deutsch** and **English** using the
toggle in the upper-right corner. German is the default language at startup.

### Desktop and Android

The interface is responsive and designed for desktop browsers as well as
Chrome on Android. On small screens the toolbar, map and inspector are stacked
and the page scrolls; every command stays reachable from the menu bar. On the
desktop the toolbar and the inspector collapse independently of each other.

## Privacy

Web Map Editor works entirely locally in the browser.

Opening a map does not cause the application to automatically upload map data
to a server.

The published `index.html` does not contain a private example map or
user-specific RTK coordinates.

## Local use

Download or clone the repository and open `index.html` in a browser. A web
server is not required.

## License

MIT License. See [LICENSE](LICENSE).

## Safety and liability

Please also read the bilingual [DISCLAIMER.md](DISCLAIMER.md). It contains the
German and English safety, warranty, and liability notice.
