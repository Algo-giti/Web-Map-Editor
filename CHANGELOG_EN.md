# Changelog — English

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
