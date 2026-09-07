# Web Map Editor

**Deutsch:** Standalone, browserbasierter Editor für GeoJSON- und RTK-Karten.  
**English:** Standalone browser-based editor for GeoJSON and RTK maps.

> **Language / Sprache:** [Deutsch](#deutsch) · [English](#english)

---
<img width="2862" height="1344" alt="grafik" src="https://github.com/user-attachments/assets/a47a2f41-28af-4547-81cd-5773bfeeed79" />


https://algo-giti.github.io/Web-Map-Editor/


# Deutsch

## Überblick

**Web Map Editor** ist ein eigenständiger, browserbasierter Editor für GeoJSON-
und RTK-basierte Kartendaten. Die Anwendung läuft vollständig lokal im Browser
und benötigt weder Server, Datenbank noch Build-System.

Der Editor wurde insbesondere für die präzise Bearbeitung lokaler
East/North-Koordinaten, Polygon-Perimeter, Ausschlussflächen, Search Wire und
optionaler Docking-Pfade entwickelt.

## Ardumower / Sunray

Der Web Map Editor wurde in erster Linie für Karten aus dem
**Ardumower-/Sunray-Umfeld** entwickelt. Im Fokus stehen RTK-bezogene
GeoJSON-Karten mit lokalen East/North-Koordinaten, Perimetern und Exclusions.

Das Projekt ist **nicht offiziell mit Ardumower oder Sunray verbunden** und
stellt kein offizielles Werkzeug dieser Projekte dar.

Da der Editor grundsätzlich mit GeoJSON-Geometrien arbeitet, kann er auch für
andere Anwendungen, Roboter oder Kartendaten nützlich sein, sofern deren
Datenstruktur kompatibel ist. Eine vollständige Unterstützung beliebiger
GeoJSON- oder fremder RTK-Formate wird nicht zugesichert.

> **Wichtiger Hinweis:** Die Software kann Fehler enthalten. Bearbeitete Karten
> müssen vor dem Einsatz in realen Maschinen, Robotern oder anderen
> sicherheitsrelevanten Anwendungen unabhängig geprüft werden. Die Nutzung
> erfolgt auf eigenes Risiko. Siehe [DISCLAIMER.md](DISCLAIMER.md).

## Hauptfunktionen

### Karten laden und bearbeiten

- GeoJSON / JSON lokal im Browser öffnen
- Karte A und optional Karte B gleichzeitig laden
- aktive Karte bearbeiten, zweite Karte als Referenz anzeigen
- Kartenansicht einpassen, zoomen und verschieben
- lokales metrisches Raster mit frei einstellbarer Schrittweite
- optionales Snap-to-Grid
- Rohkoordinaten beim Export im geladenen Koordinatensystem erhalten

### Punkteditor

- einzelne Punkte auswählen und verschieben
- East-/North-Werte anzeigen
- Punkte vor oder nach einem vorhandenen Punkt einfügen
- Punkte löschen
- Polygonringe automatisch geschlossen halten
- Start- und Endpunkt eines geschlossenen Rings neu festlegen

### Auswahlwerkzeuge direkt auf der Karte

- Mauszeiger
- Rechteckauswahl
- Lasso
- Verschieben
- Papierkorb
- Auswahl aufheben
- `Strg + Klick` zum Ergänzen/Entfernen einzelner Punkte
- Auswahlzähler direkt in der Karten-Werkzeugleiste
- Mouseover-Tooltips
- Touch-Bedienung für mobile Browser

Wenn alle editierbaren Eckpunkte einer Exclusion ausgewählt sind, löscht der
Papierkorb die **komplette Exclusion**. Bei Teilselektionen werden nur die
ausgewählten Punkte gelöscht, sofern die Polygongeometrie gültig bleibt.

### Ganze Features verschieben und Exclusions duplizieren

- komplette Exclusion gemeinsam verschieben
- komplette Search Wire gemeinsam verschieben
- kompletten Docking-Pfad gemeinsam verschieben
- direktes Ziehen an der Feature-Geometrie
- Verschieben per Pfeiltasten um exakt einen Rasterabstand
- Exclusion duplizieren
- duplizierte Exclusion automatisch versetzen und vollständig auswählen
- Exclusion-Indizes automatisch neu nummerieren
- Undo / Redo für Änderungen

### Exclusions erstellen

- neue Exclusion direkt auf der Karte zeichnen
- mindestens 3 Eckpunkte
- Polygonring wird automatisch geschlossen
- `Backspace` entfernt den zuletzt gesetzten Punkt
- `Enter` beendet die Zeichnung
- `Esc` bricht ab

### Search Wire

- neue offene Search Wire zeichnen
- vorhandene Search Wire am Ende verlängern
- mindestens 2 Punkte für eine nichtleere Linie
- leere Search-Wire-Platzhalter werden unterstützt
- bestehende Punkte bleiben beim Verlängern geschützt
- komplette Search Wire löschen

### Docking

Docking ist **optional**.

- kein Docking-Pfad erforderlich
- leerer Docking-Platzhalter ist zulässig und erzeugt nur eine Warnung
- ein einzelner Punkt ist ein Fehler; ab 2 Punkten ist der Pfad gültig
- keine Obergrenze für die Punktzahl
- 3 Punkte (Anfahrt, Ausrichtung, Endpunkt) sind die übliche Praxis, keine
  Vorgabe – eine andere Anzahl erzeugt nur einen Hinweis
- maximal ein Docking-Feature pro Karte
- vorhandenen Pfad am Ende verlängern
- kompletter Docking-Pfad kann entfernt werden

### Mähroboter-Vorschau

- maßstäbliche Mäherdarstellung am ausgewählten Punkt
- Länge und Breite einstellbar
- Fahrtrichtung geometrisch aus der Punktfolge abgeleitet
- Mäher als Drag-Griff verwendbar
- ursprüngliche Position und Fahrtrichtung können nach Änderungen als Ghost
  sichtbar bleiben

### Messen

- zwei Positionen auf der Karte wählen
- Distanz in Metern
- ΔEast und ΔNorth
- Winkel in Grad
- Winkelkonvention: 0° = East, 90° = North

### Koordinatenbezug und CaSSAndRA

Der Editor liest und schreibt Karten im Format von
[CaSSAndRA](https://github.com/EinEinfach/CaSSAndRA) – sowohl in der relativen
Sunray-Darstellung als auch in absolutem WGS84.

- Feature-Typen werden im CaSSAndRA-Vokabular geführt (`perimeter`,
  `exclusion`, `search wire`, `dockpoints`); ein abweichender Anzeigename in
  `properties.label` bleibt beim Speichern erhalten
- **Koordinatenbezug:** RTK-Basisposition (lat/lon) in der Seitenleiste
  eintragen. Sie steht in CaSSAndRA unter *Settings → Robot* und ist nicht Teil
  der GeoJSON-Datei
- **Koordinaten beim Speichern:** wahlweise *wie geladen* oder
  *absolut WGS84 (CaSSAndRA)*
- absolute Karten werden beim Laden automatisch erkannt und in lokale
  East/North-Meter umgerechnet
- der Bezugspunkt wird im Browser gemerkt und zusätzlich in der Datei
  hinterlegt, ohne CaSSAndRAs Import zu stören

Nennt eine geladene Karte einen anderen RTK-Bezugspunkt als den aktiven,
behält der Editor den aktiven bei, weist deutlich darauf hin und sperrt
Verbinden sowie Speichern, bis der Widerspruch aufgelöst ist. So entsteht
keine Datei, die auf dem Roboter um den Abstand beider Basispunkte daneben
liegt.

Ohne eingetragenen Bezugspunkt verhält sich der Editor exakt wie zuvor: die
Umrechnung entspricht dann der reinen Relativdarstellung.

### Kartenprüfung

Die aktive Karte kann vor dem Export geprüft werden. Unter anderem werden
kontrolliert:

- GeoJSON-FeatureCollection-Struktur
- Perimeter-Typ, Schließung und Fläche
- Exclusion-Geometrien, Flächen und Indizes
- Docking-Struktur
- Search-Wire-Struktur
- leere bzw. unvollständige Geometrien
- doppelte aufeinanderfolgende Punkte
- auffällig große Segmente

Ein fehlender oder leerer Docking-Pfad ist **kein Fehler**, sondern höchstens
eine Warnung. Die automatische Prüfung vor dem Speichern ist standardmäßig
aktiviert.

### Karten verbinden

Zwei Perimeter können zu einem neuen geschlossenen Perimeter verbunden werden.

Der Editor verbindet:

- **A Ende → B Start**
- **B Ende → A Start**

Beide Karten müssen dasselbe lokale RTK-Koordinatensystem bzw. dieselbe
physische RTK-Basis verwenden. Der Editor kann die physische Basisidentität
nicht selbst verifizieren.

### Undo / Redo und Vergleich

- Undo / Redo per Button
- `Ctrl/Cmd + Z`
- `Ctrl + Y`
- `Ctrl/Cmd + Shift + Z`
- ein Drag-Vorgang entspricht einem Undo-Schritt
- ursprüngliche Positionen können bis zum Speichern als Vergleich sichtbar
  bleiben
- Speichern setzt einen neuen Vergleichs-/Reset-Checkpoint

### Deutsch / English

Die Oberfläche kann oben rechts zwischen **Deutsch** und **English**
umgeschaltet werden. Deutsch ist beim Start die Standardsprache.

### Desktop und Android

Die Oberfläche ist responsiv und für Desktop-Browser sowie Chrome unter
Android ausgelegt. Auf kleinen Displays kann die Bedienleiste separat
ein-/ausgeblendet werden.

## Datenschutz

Der Web Map Editor arbeitet vollständig lokal im Browser.

Beim Öffnen einer Karte werden die Kartendaten durch die Anwendung nicht
automatisch an einen Server übertragen.

Die veröffentlichte `index.html` enthält keine private Beispielkarte und keine
benutzerspezifischen RTK-Koordinaten.

## Lokal verwenden

Repository herunterladen oder klonen und anschließend `index.html` im Browser
öffnen. Ein Webserver ist nicht erforderlich.


## Lizenz

MIT License, siehe [LICENSE](LICENSE).

---

# English

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

### Selection tools directly on the map

- pointer
- rectangle selection
- lasso selection
- move
- trash/delete
- clear selection
- `Ctrl + click` to add or remove individual points
- selection counter directly in the map toolbar
- hover tooltips
- touch-friendly controls for mobile browsers

When all editable vertices of an exclusion are selected, the trash button
deletes the **entire exclusion feature**. Partial selections delete only the
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
  sidebar. In CaSSAndRA it lives under *Settings → Robot* and is not part of
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
Chrome on Android. On small screens, the control panel can be shown or hidden
separately.

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
