# CLAUDE.md

Arbeitsanleitung für Claude Code (und andere KI-Agenten) in diesem Repository.
Lies diese Datei vollständig, bevor du Änderungen vornimmst.

Ergänzend – und weiterhin gültig – ist [`AGENTS.md`](AGENTS.md), die
ursprünglich für ChatGPT/Codex geschrieben wurde. Die relevanten Inhalte
daraus sind unten eingearbeitet; bei Widersprüchen zwischen den beiden
Dateien gilt der Abschnitt "Offene Fragen / Rückfragen" am Ende dieser Datei.

---

## 1. Projektüberblick

**Web Map Editor** ist ein eigenständiger, browserbasierter Editor für
GeoJSON- und RTK-Kartendaten. Er läuft vollständig lokal im Browser, ohne
Server, Datenbank, Paketmanager oder Build-Schritt.

- **Zweck:** Bearbeiten von lokalen East/North-Koordinaten, Polygon-
  Perimetern, Ausschlussflächen (Exclusions), Search Wire und optionalen
  Docking-Pfaden.
- **Zielumfeld:** primär Karten aus dem **Ardumower-/Sunray-Ökosystem**
  (ESP32-Firmware). Das Projekt ist **nicht offiziell** mit Ardumower/Sunray
  verbunden – die einzige Kopplung ist die GeoJSON/RTK-Kartenstruktur, mit
  der die exportierten Dateien kompatibel bleiben müssen.
- **Deployment:** GitHub Pages, direkt aus `index.html` (siehe
  https://algo-giti.github.io/Web-Map-Editor/). Kein CI/Workflow im Repo.
- **Lizenz:** MIT (`LICENSE`), plus bilinguales `DISCLAIMER.md` (Nutzung auf
  eigenes Risiko, kein validiertes Navigations-/Sicherheitssystem).

Sicherheitsrelevant: Bearbeitete Karten werden von echten Mährobotern
verwendet. Fehler in Geometrie-Logik (Polygonschließung, Punktanzahl,
Docking-Struktur) können sich direkt auf reale Hardware auswirken – siehe
Abschnitt 5 (Domänenregeln) und `DISCLAIMER.md`.

---

## 2. Architektur

Das gesamte Projekt ist **eine einzige Datei**: [`index.html`](index.html)
(gut elftausend Zeilen: HTML, `<style>`-CSS, ein einziger inline
`<script>`-Block). Es gibt bewusst **keine** weiteren Build-Artefakte, kein
`package.json` für die App selbst, keine externen `<script src>`/`<link>`-
Referenzen und keine `fetch()`/`XMLHttpRequest`-Aufrufe – die Datei ist
vollständig autark und funktioniert auch über `file://`.

### Orientierung in der Datei

Der Script-Block ist in nummerierte Abschnitte mit Kommentar-Headern der Form
`N. TITEL` gegliedert. **Das maßgebliche Inhaltsverzeichnis steht im
Scriptkopf von `index.html`**, direkt über Abschnitt 1. Dort ist es
zusammen mit den Headern gepflegt und kann nicht auseinanderlaufen; eine
zweite Kopie hier würde beim nächsten Umbau wieder veralten.

Zum Finden einer Stelle nicht nach Zeilennummern suchen, sondern nach dem
Header-Titel (`6. PUNKTEDITOR`) oder direkt nach dem Funktionsnamen. Aus
demselben Grund nennt diese Datei durchgehend Bezeichner statt Zeilen:
`index.html` ist eine einzige große Datei, in der jede Änderung sämtliche
nachfolgenden Zeilennummern verschiebt.

Zwei Eigenheiten der Nummerierung sind bekannt und beabsichtigt stehen
gelassen: Abschnitt `2A` (Undo/Redo, Messen, Kartenprüfung, Auswahlmodell)
steht physisch vor Abschnitt `2`, und nach `12` folgt `18`. Der Scriptkopf
erklärt beides.

### Zentrale Konzepte

- **Koordinaten:** Geladenes GeoJSON ist die Quelle der Wahrheit. Umrechnung
  ausschließlich über `toWorld(...)` / `fromWorld(...)` (Abschnitt 3). Keine
  eigene Umrechnungslogik an anderer Stelle einführen. Ein erkannter
  Sunray-Skalierungsfaktor (`SUNRAY_FACTOR`) ist nur eine
  Anzeige-/Bearbeitungstransformation – exportiert werden immer die
  geladenen Rohwerte.
- **Auswahlmodell:** Es existieren `selectedVertex` (einzelner Punkt) und
  `selectedVertices` (Mehrfachauswahl) parallel. Wenn Code eine einheitliche
  Quelle braucht, `getEffectiveSelectedVertices()` verwenden – sonst drohen
  Inkonsistenzen zwischen Anzeige und Lösch-Logik
  (siehe `CHANGELOG_EN.md`, Release 045/046: genau dieser Bug wurde zweimal
  gefixt). Nicht verwechseln mit `getSelectedVertices()`: das liefert nur
  `selectedVertices` und fällt **nicht** auf `selectedVertex` zurück.
- **Feature-Typen (CaSSAndRA-kompatibel):** `properties.name` trägt
  **ausschließlich** den Typ im CaSSAndRA-Vokabular. Ein davon abweichender
  Anzeigename gehört nach `properties.label`. Details in Abschnitt 5a.
- **Koordinatenbezug:** Intern wird immer relativ in Metern gerechnet;
  absolutes WGS84 wird nur beim Import/Export umgerechnet. Details in
  Abschnitt 5b.
- **i18n:** Deutsch ist Quellsprache und Default. Übersetzung läuft über
  einen Snapshot-Mechanismus (`I18N_EN`-Map + `I18N_PATTERNS`-Regex-Liste
  in Abschnitt 18), `translateGermanText()`,
  `translateDynamicElement()`, `setLanguage()`. Neuer sichtbarer Text muss
  **immer** in beiden Sprachen funktionieren (siehe Abschnitt 5).
- **Undo/Redo:** History-Snapshots pro abgeschlossener Operation (nicht pro
  `pointermove`-Event). Ein zusammenhängender Drag = ein Undo-Schritt. Der
  Snapshot enthält neben beiden Kartenslots auch den `referenceOrigin`, weil
  umgerechnete Karten gegen ihn gerechnet sind (siehe Abschnitt 5b).

---

## 3. Wichtige Befehle

Es gibt **keinen Build-Schritt**. Lokale Nutzung:

```bash
# Variante 1: Datei direkt im Browser öffnen (funktioniert, da keine externen
# Ressourcen/fetch-Aufrufe existieren)
xdg-open index.html   # oder: im Browser per Datei-öffnen-Dialog

# Variante 2: lokaler Webserver (näher an GitHub-Pages-Auslieferung)
python3 -m http.server 8000
# dann im Browser: http://localhost:8000/index.html
```

Kein `npm install`, kein `package.json` für die Anwendung selbst – das ist
**Absicht** (siehe AGENTS.md: "framework-free, build-free, backend-free").
Führe **keine** Dependencies/Bundler/Frameworks für `index.html` ein, außer
explizit gewünscht.

Statische Prüfungen (siehe Abschnitt 4) laufen ausschließlich mit
Node-Bordmitteln, kein `npm install` nötig:

```bash
node tools/check-all.mjs
```

---

## 4. Testumgebung

Die früher nur in `AGENTS.md`/`docs/DEVELOPMENT.md` beschriebenen Prüfschritte
liegen im Verzeichnis [`tools/`](tools/) als eigenständige Node-Skripte.

Sie zerfallen in **zwei Stufen**, und diese Trennung ist beabsichtigt:

| Stufe | Skripte | Abhängigkeiten | Status |
|---|---|---|---|
| statisch | `check-all.mjs` (4.1) | keine | **Pflicht** vor jeder Rückmeldung "fertig" |
| Browser | `smoke-test.mjs`, `test-origin-conflict.mjs` (4.2) | `playwright-core` + Browser, beides außerhalb des Repos | optional, aber bei UI- oder Geometrieänderungen dringend empfohlen |

`check-all.mjs` läuft mit Node-Bordmitteln und muss das bleiben – es ist die
Stufe, die in **jeder** Umgebung ohne Vorbereitung durchläuft. Die
Browsertests sind bewusst **nicht** darin eingehängt.

### 4.1 Statische Prüfungen (immer ausführbar, keine Abhängigkeiten)

```bash
node tools/check-all.mjs
```

Führt nacheinander aus:

- **`tools/check-syntax.mjs`** – extrahiert den inline `<script>`-Block aus
  `index.html` und lässt `node --check` darüber laufen (JS-Syntaxprüfung).
- **`tools/check-dom-ids.mjs`** – sammelt alle `id="..."`-Attribute im HTML
  und alle Literal-`document.getElementById("...")`-Aufrufe im Script und
  meldet Referenzen auf nicht existierende IDs. Deckt genau die Bug-Klasse
  ab, die laut `AGENTS.md`/Changelog wiederholt Laufzeitfehler verursacht
  hat (stale Referenzen nach Entfernen von UI-Elementen).
- **`tools/check-privacy.mjs`** – heuristische Prüfung auf eingebettete
  private Kartendaten (`"coordinates":` als JSON-Key, hochpräzise
  Dezimalzahlen, mehrfache `FeatureCollection`-Literale). Meldet zusätzlich
  Kartendateien im Arbeitsverzeichnis: von git **getrackte** Karten sind ein
  Fehler, ungetrackte nur eine Warnung. Kein Beweis, aber ein schneller
  Alarm; vor jedem Release trotzdem `git diff` gegenlesen.
- **`tools/test-cassandra.mjs`** – Unit-Tests der CaSSAndRA-Kompatibilität:
  Typ-Bezeichner und deren Aliasse, Label-Vorrang bei der Anzeige,
  `cos(lat)`-Skalierung, verlustfreier Rundlauf relativ → absolut → relativ
  bei mehreren Breitengraden, Identität bei `lat0 = lon0 = 0`, Import- und
  Export-Pfad. Dazu die Bezugspunkt-Konflikte aus Abschnitt 5b: Toleranz,
  Adoptionsregel und die Exportsperre in beiden Modi. Liegt lokal eine Karte
  unter `test/` (nicht im Repository), wird zusätzlich ein Rundlauf damit
  gefahren; fehlt der Ordner, überspringt das Skript den Fall.

Die Skripte sind einzeln aufrufbar (`node tools/check-syntax.mjs` etc.),
`check-all.mjs` bündelt sie nur.

`tools/test-cassandra.mjs` nutzt `tools/extract-script.mjs`, um einzelne reine
Hilfsfunktionen aus dem Inline-Script von `index.html` zu extrahieren und in
Node auszuführen. Damit sind Unit-Tests möglich, ohne ein Build-System oder
Modulsystem in die Anwendung einzuführen.

Zwei Fallstricke dabei:

- Wird eine dort getestete Funktion umbenannt, muss der Name in der
  `NAMES`-Liste von `test-cassandra.mjs` mitgezogen werden – sonst bricht der
  Test mit "Deklaration nicht gefunden" ab. Nur **reine** Funktionen sind so
  testbar: greift eine Funktion auf `mapSlots` oder das DOM zu, gehört ihre
  Prüfung in einen Browsertest (Abschnitt 4.2). Deshalb sind
  `originConflict()` und `originsMatch()` parametrisiert, während die
  Slot-Varianten `getSlotOriginConflict()`/`getActiveOriginConflict()` es
  nicht sind.
- Das zurückgegebene Sandkasten-Objekt hält **Werte**, keine lebenden
  Bindungen. Eine mit `let` deklarierte Variable wie `referenceOrigin` zeigt
  dort weiterhin den Stand vom Zeitpunkt der Erzeugung, auch nachdem ein
  Setter sie neu zugewiesen hat. Für Zusicherungen über den aktuellen Stand
  den Accessor `app.getOrigin()` benutzen, nicht `app.referenceOrigin`.

### 4.2 Browsertests (optional, real gerendert)

Zwei Skripte öffnen `index.html` in einem echten Browser über eine
`file://`-URL – die Datei hat keine externen Ressourcen und keine
`fetch()`-Aufrufe, ein Webserver ist also nicht nötig.

**`tools/smoke-test.mjs`** – der breite Grundcheck: Titel, Sichtbarkeit von
`#svg`, Initial-Text von `#filename` ("Keine Karte geladen"), dass der
Sprachumschalter (`#languageToggle`) den Text tatsächlich übersetzt, und dass
keine `console.error`/uncaught page errors auftreten. Zusätzlich lädt er eine
**synthetische** absolute WGS84-Karte über `#fileInput` und prüft, dass sie
als ~40 × 50 m ankommt – damit ist die `cos(lat)`-Umrechnung über den
kompletten UI-Pfad abgedeckt.

**`tools/test-origin-conflict.mjs`** – das Szenario mit zwei Kartenslots und
widersprüchlichen RTK-Bezugspunkten (Abschnitt 5b): Warnanzeige, aufgeklappter
Bereich "Koordinatenbezug", unveränderter aktiver Bezugspunkt, Merge-Sperre,
Exportsperre in **beiden** Ausgabemodi, danach Auflösen über die
Eingabefelder und die Prüfung, dass der Export die ursprüngliche RTK-Basis
wieder exakt trifft. Diese Kette lässt sich ohne echtes DOM nicht sinnvoll
nachbilden, deshalb Browser statt Unit-Test.

**`tools/browser-harness.mjs`** ist kein Test, sondern der gemeinsame
Unterbau beider: es findet `playwright-core` und einen startbaren Browser.
Neue Browsertests binden diese Datei ein, statt die Suche zu duplizieren.

Zusammen sind die beiden der automatisierte Ersatz für den in `AGENTS.md`
geforderten "Browser-Laufzeittest" bei strukturellen UI-Änderungen.

#### Einrichtung

`playwright-core` ist **bewusst keine Abhängigkeit im Repo** (kein
`package.json`, kein `node_modules`), um die Build- und Frameworkfreiheit der
Anwendung nicht zu verletzen. Es wird einmal pro Umgebung **außerhalb** des
Projekts installiert:

```bash
cd "$SCRATCH" && npm init -y && npm install playwright-core
```

Danach aus dem Repo-Root, mit `PLAYWRIGHT_CORE_PATH` auf das Verzeichnis, das
`node_modules` enthält:

```bash
PLAYWRIGHT_CORE_PATH="$SCRATCH" node tools/smoke-test.mjs
PLAYWRIGHT_CORE_PATH="$SCRATCH" node tools/test-origin-conflict.mjs
```

Die Variable ist nötig, weil ESM-Importe `NODE_PATH` ignorieren. Sie erspart
den naheliegenden, aber falschen Ausweg, ein `node_modules` oder einen
Symlink ins Repository zu legen. Liegt `playwright-core` ohnehin im
Auflösungspfad, wird sie nicht gebraucht.

#### Browsersuche

**Konkrete Pfade und Versionsnummern gehören nicht in diese Datei** – sie
unterscheiden sich pro Rechner und veralten sofort. Die Suchreihenfolge steht
stattdessen als ausführbarer Code in `tools/browser-harness.mjs`:

1. `$CHROME_PATH`, falls gesetzt
2. ein installierter System-Browser (Chrome/Chromium, über `$PATH` und die
   üblichen festen Orte)
3. ein Build im `ms-playwright`-Cache, **ohne feste Versionsnummer**
4. der von `playwright-core` selbst verwaltete Browser

Fehlt alles, hilft `npx --yes playwright install chromium`.

**Wichtig:** Ein vorhandenes `ms-playwright`-Verzeichnis ist **keine**
Garantie für eine nutzbare Binary. Genau dieser Fall trat hier auf – das
Verzeichnis eines Chromium-Builds existierte, enthielt aber keine
ausführbare Datei, während gleichzeitig ein System-Chrome verfügbar war.
`browser-harness.mjs` prüft deshalb jeden Kandidaten wirklich auf
Ausführbarkeit, statt sich auf die Existenz eines Verzeichnisses zu
verlassen. Verlass dich beim Debuggen auf dieselbe Prüfung, nicht auf ein
`ls`.

Wenn `playwright-core` fehlt oder kein Browser startet, brechen beide
Skripte **nicht** mit Fehler ab, sondern geben eine Anleitung aus und beenden
sich mit Exit-Code 0. Fehlende Testinfrastruktur ist kein Testfehler – aber
sie ist auch kein bestandener Test: wenn du einen Browserlauf nicht wirklich
durchführen konntest, sag das ausdrücklich dazu, statt die Änderung als
getestet zu melden.

#### Hinweis für eigene Erweiterungen

Werte in eingeklappten `<details>`-Bereichen (z. B. `#widthStat`,
`#originStatus`) müssen mit `textContent` gelesen werden, `innerText` liefert
dort einen leeren String.

Testkarten erzeugen die Skripte immer selbst und synthetisch. Es liegt keine
Kartendatei im Repository und es wird keine gelesen.

### 4.3 Was NICHT automatisiert getestet werden kann

Mangels echter Hardware/Browser-Zugriff kann Folgendes nur simuliert,
gemockt oder manuell geprüft werden:

- **Echte ESP32-/Sunray-Firmware:** Es gibt keine Möglichkeit, exportierte
  GeoJSON-Dateien gegen eine echte Firmware oder einen echten Mähroboter zu
  validieren. `check-privacy.mjs`/Validierungslogik im Editor selbst sind
  der einzige automatisierte Schutz; letzte Prüfung bleibt Sache des
  Nutzers (siehe `DISCLAIMER.md`).
- **Nativer Datei-Auswahldialog:** Playwright kann `<input type="file">` per
  API befüllen, das ist aber nicht dasselbe wie ein echter Browser-Dialog.
  Der aktuelle `smoke-test.mjs` testet den Ladepfad über die Datei-Eingabe
  bewusst **nicht** – nur den Zustand ohne geladene Karte. Bei Änderungen am
  Lade-/Export-Code empfiehlt sich ein manueller Test mit einer
  **synthetischen** (nicht-privaten) Testkarte.
- **Echtes Touch-Verhalten auf Android/Chrome:** Playwright kann Touch-Events
  synthetisch auslösen, das ersetzt aber keinen echten Test auf einem
  Android-Gerät. Bei mobilen Layout-Änderungen den Nutzer um eine manuelle
  Rückmeldung bitten oder es explizit als ungetestet kennzeichnen.
- **GitHub Pages Deployment selbst:** kein Zugriff auf das echte gehostete
  Deployment; `python3 -m http.server` ist die beste lokale Näherung.

**Wichtig:** Wenn du eine Änderung als "erledigt" meldest, aber einer der
obigen Punkte nicht real geprüft werden konnte, sage das explizit dazu –
nicht stillschweigend als vollständig getestet ausgeben.

### 4.4 Manuelles Durchklicken (falls Browser verfügbar)

1. `index.html` öffnen (leer, "Keine Karte geladen").
2. Eine **synthetische** Testkarte laden (kleine, selbst gebaute
   FeatureCollection mit Perimeter + 1 Exclusion + Search Wire + Docking,
   **keine echten/privaten Koordinaten** verwenden).
3. Punkte auswählen/verschieben (Einzel- und Mehrfachauswahl per Rechteck,
   Lasso, Ctrl+Klick), Auswahlzähler in der Toolbar prüfen.
4. Exclusion vollständig auswählen und löschen → gesamte Exclusion muss
   verschwinden, verbleibende Exclusions neu nummeriert, Undo stellt sie
   wieder her.
5. Sprache umschalten (oben rechts) und Kernbereiche (Sidebar, Hilfe-Overlay,
   Statusmeldungen) auf Übersetzung prüfen.
6. "Karte prüfen" (Validierung) auslösen, Export testen.
7. Bei UI-Strukturänderungen: Browserfenster verkleinern / mobile Ansicht
   testen (Toolbar-Overflow, Touch-Zielgrößen).

---

## 5. Domänenregeln (aus AGENTS.md, weiterhin gültig)

Vollständige Details stehen in [`AGENTS.md`](AGENTS.md) und
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md); hier die für die tägliche
Arbeit wichtigste Zusammenfassung.

Die zweisprachige Dokumentation wird **paarweise** gepflegt: `README.md` mit
[`README_EN.md`](README_EN.md), `CHANGELOG.md` mit `CHANGELOG_EN.md`. Eine
Änderung nur auf einer Seite gilt als unvollständig.

**Privatsphäre:** Niemals private GeoJSON-Karten, RTK-Koordinaten,
Dateinamen oder persönliche Testdaten in versionierte Dateien einbetten. Die
Anwendung muss ohne eingebettete Karte starten. Vor jedem Release
`node tools/check-privacy.mjs` laufen lassen und Diff gegenlesen.

**Polygon-Semantik:** Geschlossene Ringe enthalten am Ende ein technisches
Duplikat des ersten Punkts – das ist **kein** eigenständiger editierbarer
Vertex. Ringschluss und Punktreihenfolge erhalten, mindestens 3
unterschiedliche Polygon-Vertices. Erster eindeutiger Punkt = Start, letzter
eindeutiger Punkt = Ende.

**Exclusion-Löschung:** Sind alle editierbaren Vertices einer Exclusion
ausgewählt (Rechteck, Lasso oder Ctrl+Klick), löscht der Papierkorb die
**komplette** Exclusion. Teilauswahl löscht nur die ausgewählten Punkte
(mind. 3 verbleibende Vertices). Nach vollständiger Löschung: verbleibende
Exclusions neu nummerieren, Undo muss funktionieren. Der frühere separate
"Exclusion löschen"-Button im Punkteditor wurde entfernt – nicht ohne
explizite Anfrage wiederherstellen.

**Ganze Features verschieben:** Unterstützt für Exclusion, Search Wire,
Docking (Ziehen direkt an der Geometrie). Der komplette Perimeter ist
absichtlich **nicht** direkt draggable, um versehentliches Verschieben zu
vermeiden – nicht ohne explizite Anfrage ändern.

**Docking:** Optional. Kein Docking-Feature oder leere Docking-LineString →
nur Warnung, kein Fehler. Nicht-leeres Docking mit 1, 2 oder >3 Punkten →
Fehler. Gültig = exakt 3 Punkte. Maximal ein Docking-Feature pro Karte.

**Search Wire:** Offene `LineString`. Gültige Zustände: leerer Platzhalter
oder nicht-leere Linie mit ≥2 Punkten.

---

## 5a. CaSSAndRA-Bezeichner und Anzeigename

Verifiziert gegen den CaSSAndRA-Quellcode
([`EinEinfach/CaSSAndRA`](https://github.com/EinEinfach/CaSSAndRA),
`src/backend/data/mapdata.py`, Funktion `export_geojson`).

`properties.name` trägt **ausschließlich** den Typ. Ein abweichender
Anzeigename gehört nach `properties.label` und wird beim Export nie
überschrieben.

| Interner Typ | `properties.name` beim Export |
|---|---|
| `perimeter` | `perimeter` |
| `exclusion` | `exclusion` (+ `idx` auf **Feature**-Ebene, nicht in `properties`) |
| `searchwire` | `search wire` (mit Leerzeichen) |
| `dockpoints` | `dockpoints` |

Regeln:

- **Typbestimmung nur über `getFeatureType(feature)`.** Diese Funktion ist die
  einzige Stelle, an der `properties.name` interpretiert wird. Keine neuen
  Ad-hoc-Vergleiche wie `name.toLowerCase() === "perimeter"` einführen – genau
  daraus waren zuvor uneinheitliche Alias-Listen entstanden.
- Die internen Typbezeichner sind identisch mit den Ebenennamen, deshalb ist
  `layerName()` nur noch ein dünner Wrapper um `getFeatureType()`.
- **Import** akzeptiert zusätzlich die Schreibvarianten `searchwire` und
  `dock points`; **Export** normalisiert über `cassandraNameForFeature()`
  wieder auf die kanonische Schreibweise.
- Features mit unbekanntem Namen behalten ihren Rohwert und werden nicht
  stillschweigend umbenannt.
- **`idx` steht auf Feature-Ebene**, nicht in `properties` – so liegt es auch
  in den vorhandenen Sunray-Dateien. `renumberExclusionsInCollection()`
  schreibt deshalb immer `feature.idx` und pflegt `properties.idx`
  **nur dann** mit, wenn der Schlüssel dort bereits vorhanden ist. Eine Karte,
  die den Index nur auf Feature-Ebene führt, bekommt also kein zusätzliches
  Feld in `properties`; eine Karte, die beides führt, bleibt konsistent.
  Beim Lesen gilt entsprechend `feature.idx ?? feature.properties?.idx`.
- **Anzeige** immer über `describeFeature()`: `properties.label` hat Vorrang,
  sonst wird der Name aus dem Typ abgeleitet ("Perimeter", "Exclusion #0", …).
  Ein Label wird nicht übersetzt, abgeleitete Namen schon.

Perimeter/Exclusion bleiben geschlossene Polygone, Dockpoints und Search Wire
offene LineStrings – das gilt bei CaSSAndRA genauso und wurde nicht verändert.

---

## 5b. Koordinatenbezug (relativ ↔ absolut WGS84)

CaSSAndRA verwendet dieselbe Näherung wie die Sunray-Firmware
(`coords_rel_to_abs` / `coords_abs_to_rel`):

```
lat = north / 111111             + lat0
lon = east  / (111111·cos(lat0)) + lon0
```

`lat0`/`lon0` ist die RTK-Basisposition. Sie steht bei CaSSAndRA unter
**Settings → Robot** und ist **nicht Teil der GeoJSON-Datei**.

**Getroffene Annahmen und Entscheidungen:**

- **Intern bleibt alles relativ in Metern.** Umgerechnet wird nur beim Import
  und Export. Grund: Raster, Messen, Mäherdarstellung und die gesamte
  Editier-Logik arbeiten in lokalen Metern; ein Umstieg auf Grad hätte all das
  gebrochen und der Vorgabe "Rohkoordinaten beim Export erhalten"
  widersprochen.
- **Der Bezugspunkt musste neu eingeführt werden** – im Projekt gab es vorher
  keinerlei WGS84-Bezug, der Ursprung war hart E=0/N=0. Er wird in der
  Sidebar unter "Koordinatenbezug" gepflegt, in `localStorage`
  (`webMapEditor.referenceOrigin`) gemerkt und zusätzlich als
  Nicht-Standard-Feld `referenceOrigin` auf der FeatureCollection
  mitgeschrieben. CaSSAndRAs Import wertet ausschließlich `features` aus und
  ignoriert dieses Feld nachweislich.
- **Rückwärtskompatibilität ist mathematisch garantiert:** mit
  `lat0 = lon0 = 0` ist `cos(lat0) = 1`, und die Formel degeneriert exakt zum
  bisherigen `scaleFactor`-Verhalten. Die vorliegende Beispielkarte ist genau
  so entstanden (CaSSAndRA-Export mit unkonfigurierter Basis) – deshalb sah
  sie bisher wie ein reines "Sunray-Relativformat" aus.
- **Erkennung:** `isAbsoluteWgs84Collection()` wertet Koordinaten mit einem
  Betrag > 0,05° als absolut. Relative Karten liegen dicht um den Nullpunkt,
  absolute praktisch nie (0/0 läge im Golf von Guinea).
- **Plausibilitätsprüfung:** `parseOrigin()` ist die einzige Stelle, an der
  ein Bezugspunkt aus Rohwerten entsteht – aus dem Eingabefeld, aus dem
  `localStorage` und aus dem Feld in der Datei. Sie verwirft alles, was nicht
  endlich ist oder außerhalb von ±90° Breite bzw. ±180° Länge liegt, und
  liefert dann `null`. Neue Quellen für Bezugspunkte müssen ebenfalls durch
  diese Funktion.
- **Eigenheit bei 0/0:** `hasReferenceOrigin()` wertet `lat = lon = 0` als
  *nicht gesetzt*. Das ist Absicht – es ist derselbe Zustand, den eine
  unkonfigurierte CaSSAndRA-Basis erzeugt, und die Umrechnung degeneriert dort
  zur Identität. Die Kehrseite: eine echte RTK-Basis exakt auf 0°/0° lässt
  sich nicht ausdrücken. Da dieser Punkt im Golf von Guinea liegt, ist das
  praktisch folgenlos, aber beim Lesen des Codes verwirrend genug, um es hier
  festzuhalten.
- **Import:** Absolute Karten werden einmalig in die interne
  Relativdarstellung umgerechnet. Ein in der Datei hinterlegter Bezugspunkt
  wird übernommen und **überschreibt die aktuelle Einstellung** (sonst wäre
  die Datei nicht korrekt interpretierbar). Fehlt er, dient der erste
  Kartenpunkt als Nullpunkt – der Rundlauf bleibt exakt, die angezeigten
  Meterwerte beziehen sich dann aber auf diesen Punkt statt auf die echte
  RTK-Basis.
- **Modus-Erkennung:** Umgerechnete Karten setzen `slot.convertedFromAbsolute`.
  `setModeFromData()` erzwingt dann `sunray-relative`, weil die
  Zentimeter-Heuristik von `detectSunray()` auf umgerechneten Werten nicht
  mehr greift.
- **Export:** Die Auswahl "Koordinaten beim Speichern" bietet *wie geladen*
  (Standard) und *absolut WGS84 (CaSSAndRA)*. "wie geladen" gibt eine
  ursprünglich absolute Karte wieder absolut aus. Die **Bezeichner-
  Normalisierung läuft dagegen immer**, ohne Modus.
- **Bezugspunkt ändern basiert umgerechnete Karten neu.** Eine aus absolutem
  WGS84 importierte Karte liegt intern gegen den beim Import gültigen
  Bezugspunkt gerechnet vor. `rebaseConvertedMaps()` rechnet sie bei jeder
  Änderung über den absoluten Zwischenschritt exakt auf den neuen Punkt um –
  beide Umrechnungen sind zueinander invers und behandeln die
  unterschiedliche `cos(lat)`-Skalierung beider Punkte korrekt. Betroffen sind
  `slot.data` **und** `slot.originalData`; die Vergleichs-Ghosts des Slots
  werden verworfen, weil sie Weltkoordinaten des alten Rahmens festhalten.
  **Folge für die Anzeige:** die East/North-Werte laufen danach gegen einen
  neuen Nullpunkt, ändern sich also sichtbar, obwohl die Geometrie unverändert
  ist. Die Statuszeile unter "Koordinatenbezug" sagt das.
- Weil umgerechnete Karten gegen den Bezugspunkt gerechnet sind, steckt
  `referenceOrigin` im Undo-Snapshot (`createWorkspaceSnapshot()`). Sonst
  holte ein Undo die Geometrie zurück, aber nicht den Rahmen.

### Widersprüchliche Bezugspunkte

`referenceOrigin` ist global, nicht pro Slot – richtig so, denn er beschreibt
die physische RTK-Basis, und der Merge setzt dieselbe Basis ohnehin voraus.
Das Problem war nie die Globalität, sondern das **stille Überschreiben**.

**Toleranz.** Zwei Bezugspunkte gelten als derselbe Standort, wenn sie weniger
als `ORIGIN_MATCH_TOLERANCE_METERS` (1 cm) auseinanderliegen. Verglichen wird
in **Metern, nicht in Grad**: ein Längengrad ist je nach Breite unterschiedlich
lang, zwei Gradschwellen wären deshalb in Ost-West-Richtung zu streng oder in
Nord-Süd-Richtung zu lasch. `originDistanceMeters()` nutzt dafür das
vorhandene `absoluteToMeters()` – keine eigene Trigonometrie – und liefert
nebenbei die Zahl für die Meldungstexte. 1 cm liegt unter der Genauigkeit
eines RTK-Fix und unter der Anzeigeauflösung des Editors, kann also keinen
echten Basiswechsel verschlucken; nach oben deckt es Rundungsrauschen aus
JSON-Rundläufen (~1e-5 m) und unterschiedlich genau eingetippte Basiswerte
(~1e-4 m) um Größenordnungen ab.

**Adoptionsregel.** Entscheidend ist nicht, *ob* ein Bezugspunkt gesetzt ist –
beim Start kommt er aus dem `localStorage` und ist womöglich veraltet –
sondern ob gerade etwas geladen ist, das sich durch eine Änderung verschieben
würde. `prepareImportedCollection()` bekommt das als `options.keepActiveOrigin`
vom Aufrufer; `parseGeoJsonFile()` setzt es auf "der *andere* Slot hält
Daten", weil der Zielslot von dieser Datei ohnehin überschrieben wird.

| Situation | Verhalten |
|---|---|
| Karte laden, anderer Slot leer | Bezugspunkt der Datei wird übernommen |
| Karte laden, anderer Slot geladen | aktiver Bezugspunkt bleibt, Warnung, Sperren |

**Abgeleitet, nicht gespeichert.** Der Konflikt wird bei jedem Aufruf neu aus
`slot.fileOrigin` gegen `referenceOrigin` berechnet (`originConflict()`,
`getSlotOriginConflict()`, `getActiveOriginConflict()`) und nirgends
zwischengespeichert. Dadurch bewertet er sich beim Umschalten der aktiven
Karte und nach jeder Änderung des Bezugspunktes automatisch neu – es gibt
keinen Aufräumpfad, der vergessen werden könnte. `slot.fileOrigin` merkt sich
den Bezugspunkt der Datei auch dann, wenn er *nicht* übernommen wurde; nur so
ist der Widerspruch später überhaupt erkennbar.

**Sperren.** Solange ein Widerspruch besteht:

- **Merge** ist gesperrt, sobald *einer* der beiden Slots dem aktiven
  Bezugspunkt widerspricht (`getMergeOriginIssue()`). Zwei Karten mit
  tatsächlich verschiedenen RTK-Basen bleiben damit dauerhaft gesperrt – egal
  welchen Wert man einträgt, der jeweils andere widerspricht dann. Das ist
  beabsichtigt: solche Karten lassen sich physisch nicht sinnvoll verbinden.
- **Export ist in beiden Ausgabemodi gesperrt**, nicht nur im absoluten. Der
  relative Pfad ist dabei nicht der harmlosere, sondern der **leisere**: eine
  gegen X gerechnete Relativkarte liegt auf einem Roboter mit Basis Y um X−Y
  daneben, und die Datei enthält keine einzige Zahl, an der sich das erkennen
  ließe – der Fehler fällt erst auf echter Hardware auf. Beim absoluten Export
  steckt die Basis wenigstens in den Koordinaten. `buildExportCollection()`
  liefert deshalb `null`, statt zu schreiben.

**Auflösen.** Der Nutzer trägt den in der Warnung genannten Bezugspunkt der
Datei in die Felder unter "Koordinatenbezug" ein und klickt "Übernehmen".
Weil der Konflikt abgeleitet ist, verschwinden Warnung und Sperren dadurch von
selbst – und tauchen ebenso von selbst wieder auf, wenn der Wert erneut
abweicht. Für umgerechnete Karten greift dabei `rebaseConvertedMaps()`; ohne
diese Neubasierung wäre der Export nach dem "Auflösen" um die Differenz beider
Punkte verschoben gewesen, also still falsch trotz gefallener Sperre.

`tools/test-origin-conflict.mjs` fährt genau diese Kette im echten Browser ab.

---

**Mäher-Orientierung:** Wird geometrisch aus der Punktfolge abgeleitet, nicht
aus einem gespeicherten Heading-Wert (außer ein zukünftiges Format enthält
das explizit). Konvention: 0° = East, 90° = North.

**Undo/Redo:** Ein zusammenhängender Drag = ein Undo-Schritt, nicht ein
Schritt pro `pointermove`. Tastatur-Nudging ebenfalls sinnvoll gruppieren.

**Sprache:** Deutsch ist Quelle/Default. Bei jeder sichtbaren Textänderung:
(1) deutschen Quelltext ändern, (2) englische Übersetzung ergänzen/anpassen,
(3) ggf. `I18N_PATTERNS`-Regex anpassen, (4) beide Sprachen testen. Das
Übersetzungssystem nicht ohne konkreten Grund umbauen.

**Mobile/Android:** Chrome-auf-Android-Kompatibilität erhalten – Touch-
Zielgrößen, Seiten-Scrolling, Karteninteraktion, Toolbar-Overflow,
Formulargrößen. Desktop-Verhalten dabei nicht brechen.

**UI-Element entfernen – Pflichtsuche:** Beim Entfernen jedes UI-Elements
**immer** im gesamten Script suchen nach: Element-ID, verwandte
Variablennamen, Event-Listener, Init-Code, Enable/Disable-Zuweisungen,
Status-Update-Referenzen. Reine Syntaxprüfung erkennt diese Fehlerklasse
**nicht** – dafür existiert jetzt `tools/check-dom-ids.mjs`, aber eine
manuelle Grep-Suche nach Variablennamen bleibt zusätzlich nötig, da das
Skript nur IDs, keine Variablennamen prüft.

**Release-Nummerierung und -Packaging:** Baseline aktuell **Ausgabe 048**,
nächstes substantielles Release **Ausgabe 049**. Ausgabe 049 nicht anlegen,
bevor eine substantielle Änderung tatsächlich angefragt wurde.

**Es gibt keine Release-ZIPs.** Kein Archiv bauen, keines einchecken, keines
an ein GitHub Release hängen. Die Anwendung ist eine einzige `index.html`, die
direkt aus dem Repository und über GitHub Pages läuft – ein Archiv enthielte
dieselbe Datei nur ein zweites Mal. Entwickelt wird laufend auf `main` weiter.

Ein Release besteht damit aus: Versionsnummer in `index.html` hochziehen,
beide Changelogs (`CHANGELOG.md` **und** `CHANGELOG_EN.md`) pflegen, die
Baseline in `AGENTS.md`, `docs/DEVELOPMENT.md` und dieser Datei nachziehen,
Prüfungen aus Abschnitt 4 laufen lassen, committen und den Commit taggen
(`v048`, `v049`, …). Die Tags sind der Rollback-Mechanismus – jeder frühere
Stand bleibt auscheckbar, ohne Binärdateien in der Git-Historie.

**Vor jedem Release, mindestens:**
1. `node tools/check-all.mjs` (Syntax, DOM-IDs, Privacy, CaSSAndRA-Unit-Tests)
2. manuelle Stale-Reference-Suche (siehe oben) – `check-dom-ids.mjs` findet
   verwaiste Variablen- und Funktionsnamen nicht
3. `git diff` gegenlesen, insbesondere auf versehentlich eingebettete
   Kartendaten
4. echter Browser-/Laufzeittest bei strukturellen UI-Änderungen
   (`tools/smoke-test.mjs` und `tools/test-origin-conflict.mjs`, siehe
   Abschnitt 4.2; falls nicht durchführbar, ausdrücklich als ungetestet melden)
5. beide Changelogs (`CHANGELOG.md` **und** `CHANGELOG_EN.md`) sowie bei
   sichtbaren Funktionsänderungen `README.md` **und** `README_EN.md` pflegen

---

## 6. Coding-Konventionen

Aus dem bestehenden Code abgeleitet (nicht überall in AGENTS.md
dokumentiert, aber im Code konsistent sichtbar):

- 2-Leerzeichen-Einrückung, Semikolons, überwiegend doppelte
  Anführungszeichen für Strings.
- `const`/`let`, keine `var`. Viele kleine, fokussierte Hilfsfunktionen statt
  großer Monolithen.
- Kommentare auf Deutsch, JSDoc-artige Blockkommentare (`/** ... */`) für
  Funktionen/Konstanten mit nicht-offensichtlichem Zweck; einzeilige
  Kommentare für Detailhinweise.
- Zentrale Konvertierungslogik (`toWorld`/`fromWorld`) statt dupliziertem
  Rechnen an mehreren Stellen.
- Defensive Prüfungen um DOM-Zugriffe (viele Elemente werden über
  `document.getElementById` geholt und teils auf Existenz geprüft, bevor sie
  benutzt werden).
- Klare Undo-Grenzen: Operationen werden als eine Einheit ins
  Undo-/Redo-System eingetragen, nicht pro Zwischenevent.

**Vermeiden** (explizit aus AGENTS.md): duplizierte Koordinatenumrechnung,
unerklärte globale Zustandsänderungen, verwaiste DOM-Referenzen, unnötige
Frameworks/Bundler, versteckte private Testdaten in Kommentaren oder Code.

---

## 7. Bekannte offene Punkte

- **Abschnitt `2A` steht physisch vor Abschnitt `2`, und nach `12` folgt
  `18`.** Rein kosmetisch; ein Umnummerieren würde jeden Abschnitt anfassen,
  ohne etwas zu verbessern. Der Scriptkopf erklärt beides – deshalb dort
  nachsehen und nicht nach Abschnittsnummern raten.
- **Abschnitt `2A` enthält deutlich mehr als Undo/Redo** – unter anderem
  Messwerkzeug, Kartenprüfung, Feature-Erstellung und das komplette
  Auswahlmodell. Der Titel führt in die Irre; eine Aufteilung wäre sinnvoll,
  ist aber ein großer Diff ohne Funktionsgewinn.
- **`tools/check-privacy.mjs` ist nur heuristisch** – erkennt keine privaten
  Daten unter untypischen Schlüsselnamen. Ersetzt keine manuelle
  Diff-Prüfung vor einem Release.
- **`tools/check-dom-ids.mjs` prüft nur IDs, keine Variablen- oder
  Funktionsnamen.** Verwaister Code nach dem Entfernen eines UI-Elements
  bleibt dadurch unentdeckt – genau so hatte `deleteSelectedExclusion()` den
  in Ausgabe 043 entfernten Button um mehrere Ausgaben überlebt. Die manuelle
  Volltextsuche aus Abschnitt 5 ("UI-Element entfernen") bleibt deshalb Pflicht.
- **Die dynamischen Titel von `undoBtn` und `redoBtn` sind unübersetzt.**
  `undoButton.title` (`Rückgängig: <Marke>`) und `redoButton.title`
  (`Wiederholen: <Marke>`) werden in `updateHistoryButtons()` zur Laufzeit
  gesetzt und haben kein `I18N_PATTERNS`-Muster; im englischen Modus bleiben
  sie deutsch. Nur die statischen Fälle ("Keine Änderung zum
  Rückgängigmachen") sind übersetzt. Ein Muster `^Rückgängig: (.+)$` allein
  hilft nicht: es würde die deutsche Historienmarke unverändert einsetzen.
  Nötig wäre zusätzlich, dass **alle** Marken aus `createWorkspaceSnapshot()`
  übersetzbar sind - also eine Inventur über sämtliche Aufrufstellen, kein
  Nachtrag von einer Zeile. Wird beim UI-Umbau in Ausgabe 050 miterledigt,
  wo die Beschriftungen ohnehin angefasst werden. Es sind die einzigen beiden
  dynamisch gesetzten `title`-Attribute ohne Muster.
- **`CHANGELOG.md` (deutsch) beginnt erst bei Ausgabe 047.** Die Historie der
  Ausgaben 001–046 existiert nur in `CHANGELOG_EN.md`. Neue Einträge ab
  jetzt bitte in beiden Dateien pflegen.
- **Falls ein Ordner `test/` existiert, enthält er echte private
  Nutzerkarten.** Er ist über `.gitignore` ausgeschlossen und darf niemals
  committet werden; `check-privacy.mjs` warnt zusätzlich, falls doch einmal
  eine Kartendatei von git getrackt wird. Der Ordner ist **nicht** Teil eines
  frischen Checkouts – `tools/test-cassandra.mjs` überspringt den
  entsprechenden Testfall dann stillschweigend, das ist kein Fehler.
- Die CaSSAndRA-Anbindung ist gegen den Quellcode und eine reale Beispielkarte
  verifiziert, aber **nicht gegen eine echte CaSSAndRA-Instanz oder Firmware**
  getestet. Insbesondere ein Export mit gesetztem `lat0`/`lon0` wurde noch nie
  von CaSSAndRA eingelesen.
- **Ein relativer Export schreibt weiterhin den aktiven `referenceOrigin` in
  die Datei.** Das ist korrekt, solange kein Konflikt besteht – und ein
  Konflikt sperrt den Export inzwischen vollständig. Bleibt als Merkposten,
  falls die Sperre je gelockert wird.

---

## 8. Getroffene Entscheidungen (Rückfragen geklärt)

Diese vier Punkte waren zunächst unklar bzw. standen im Konflikt mit den
Vorgaben aus `AGENTS.md`. Sie wurden vom Nutzer entschieden – **so umsetzen,
nicht erneut aufrollen**:

1. **Nicht existierende Dateireferenzen entfernt.** `docs/code-documentation.md`,
   `docs/code-documentation-en.md` und `.nojekyll` haben nie im Repository
   existiert; die Verweise darauf wurden aus `AGENTS.md` und
   `docs/DEVELOPMENT.md` gestrichen. Statt der fehlenden deutschen
   Versionshistorie wurde `CHANGELOG.md` neu angelegt – beginnend beim
   aktuellen Stand (Ausgabe 047), ohne Rekonstruktion der Ausgaben 001–046.
2. **Playwright bleibt optional und außerhalb des Repos.** Kein
   `package.json`, kein `playwright-core` als Projekt-Dependency.
   `tools/smoke-test.mjs` bleibt wie in Abschnitt 4.2 beschrieben: manuell
   pro Umgebung zu installieren, bricht ohne Playwright nicht fehl.
3. **Release-ZIPs entfallen ersatzlos.** Ursprünglich sollte das ZIP an ein
   GitHub Release gehängt werden; seit Ausgabe 048 gibt es überhaupt kein
   Archiv mehr. Der Release-Commit wird getaggt, und damit ist der Release
   fertig – entwickelt wird laufend weiter. `AGENTS.md` und
   `docs/DEVELOPMENT.md` sind entsprechend angepasst.
4. **`tools/` ist legitimer Repo-Bestandteil.** Reine Entwicklungswerkzeuge
   ohne Einfluss auf `index.html` fallen nicht unter das
   Dependency-/Framework-Verbot. Ein klarstellender Absatz dazu steht jetzt
   im Architecture-Abschnitt von `AGENTS.md`.

5. **Lokale Testkarten bleiben aus dem Repository heraus.** Der Ordner `test/`
   – falls vorhanden, er gehört nicht zum Checkout – enthält echte private
   Nutzerkarten und ist auf Wunsch des Projektinhabers über `.gitignore`
   ausgeschlossen. Eigene Testkarten gehören dorthin oder ins Scratchpad –
   niemals in versionierte Dateien. Die Browsertests aus Abschnitt 4.2
   erzeugen ihre Karten stattdessen synthetisch im Skript.
