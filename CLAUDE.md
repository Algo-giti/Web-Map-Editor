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
(~11.000 Zeilen: HTML, `<style>`-CSS, ein einziger inline `<script>`-Block).
Es gibt bewusst **keine** weiteren Build-Artefakte, kein `package.json` für
die App selbst, keine externen `<script src>`/`<link>`-Referenzen und keine
`fetch()`/`XMLHttpRequest`-Aufrufe – die Datei ist vollständig autark und
funktioniert auch über `file://`.

Der Script-Block (`index.html:2551` bis `index.html:11002`) ist intern in
nummerierte Abschnitte gegliedert (Kommentar-Header `N. TITEL`):

| Nr. | Abschnitt | Inhalt |
|---|---|---|
| 1 | Konfiguration und Anwendungszustand | globale `let`/`const`, DOM-Referenzen |
| 2 | Karten-Slots und Koordinaten-Hilfsfunktionen | Map A/B, Laden in Slot |
| 3 | Koordinaten- und Sunray-Hilfsfunktionen | `toWorld()`, `fromWorld()`, Sunray-Skalenerkennung |
| 4 | Kartenansicht / Zoom / Pan | `view`-Zustand, Fit, Zoom |
| 5 | Geometrie-Rendering | SVG-Gruppen zeichnen |
| 6 | Punkteditor | Auswahl, Verschieben, Einfügen/Löschen von Punkten |
| 7 | Raster | Snap-to-Grid, Rasterdarstellung |
| 8 | Zwei-Karten-Verbindung | Merge A+B |
| 9 | Feature-Navigation | Sidebar-Baum für Features/Punkte |
| 10 | Statistik und Ebenen | Flächen, Layer-Sichtbarkeit |
| 11 | Datei laden / exportieren / zurücksetzen | GeoJSON-Import/-Export |
| 12 | Event-Handler und Initialisierung | Maus/Touch/Keyboard-Bindings, Startup |
| 18 | Sprache / Language | i18n (siehe unten) |

Hinweis: Die Nummerierung springt von 12 auf 18 – Abschnitte 13–17 wurden im
Lauf der Zeit offenbar entfernt/verschoben, ohne die Nummerierung
anzupassen. Funktional unproblematisch, aber beim Navigieren per
Abschnittsnummer beachten.

### Zentrale Konzepte

- **Koordinaten:** Geladenes GeoJSON ist die Quelle der Wahrheit. Umrechnung
  ausschließlich über `toWorld(...)` / `fromWorld(...)` (Abschnitt 3). Keine
  eigene Umrechnungslogik an anderer Stelle einführen. Ein erkannter
  Sunray-Skalierungsfaktor (`SUNRAY_FACTOR`) ist nur eine
  Anzeige-/Bearbeitungstransformation – exportiert werden immer die
  geladenen Rohwerte.
- **Auswahlmodell:** Es existieren `selectedVertex` (einzelner Punkt) und
  `selectedVertices` (Mehrfachauswahl) parallel. Wenn Code eine einheitliche
  Quelle braucht, `getEffectiveSelectedVertices()` (`index.html:4577`)
  verwenden – sonst drohen Inkonsistenzen zwischen Anzeige und Lösch-Logik
  (siehe `CHANGELOG_EN.md`, Release 045/046: genau dieser Bug wurde zweimal
  gefixt).
- **i18n:** Deutsch ist Quellsprache und Default. Übersetzung läuft über
  einen Snapshot-Mechanismus (`I18N_EN`-Map + `I18N_PATTERNS`-Regex-Liste,
  ab `index.html:10676`), `translateGermanText()`,
  `translateDynamicElement()`, `setLanguage()`. Neuer sichtbarer Text muss
  **immer** in beiden Sprachen funktionieren (siehe Abschnitt 5).
- **Undo/Redo:** History-Snapshots pro abgeschlossener Operation (nicht pro
  `pointermove`-Event). Ein zusammenhängender Drag = ein Undo-Schritt.

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

Vor dieser Session gab es **keine** automatisierte Testinfrastruktur, nur
manuell in `AGENTS.md`/`docs/DEVELOPMENT.md` beschriebene Prüfschritte. Im
Verzeichnis [`tools/`](tools/) wurden diese Schritte als eigenständige,
**abhängigkeitsfreie** Node-Skripte automatisiert. Vor jeder Rückmeldung
"Änderung fertig" an den Nutzer sollten diese Prüfungen laufen.

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
  Dezimalzahlen, mehrfache `FeatureCollection`-Literale). Kein Beweis, aber
  ein schneller Alarm; vor jedem Release trotzdem `git diff` gegenlesen.

Diese drei Skripte einzeln aufrufbar (`node tools/check-syntax.mjs` etc.),
`check-all.mjs` bündelt sie nur.

### 4.2 Browser-Smoke-Test (optional, real gerendert)

**`tools/smoke-test.mjs`** öffnet `index.html` in einem echten Chromium via
[Playwright](https://playwright.dev) (`playwright-core`), prüft Titel,
Sichtbarkeit von `#svg`, Initial-Text von `#filename` ("Keine Karte
geladen"), dass der Sprachumschalter (`#languageToggle`) den Text tatsächlich
übersetzt, und dass keine `console.error`/uncaught page errors auftreten.

Das ist der automatisierte Ersatz für den in AGENTS.md geforderten
"Browser-Laufzeittest" bei strukturellen UI-Änderungen.

`playwright-core` ist **bewusst keine Abhängigkeit im Repo** (kein
`package.json`), um die Build-/Framework-Freiheit der Anwendung nicht zu
verletzen. Es wird nur benötigt, wenn du dieses Skript ausführst, und einmal
pro Umgebung separat installiert – z. B. im Scratchpad-Verzeichnis, **nicht**
im Projekt:

```bash
# einmalig, außerhalb des Repos, z. B. im Scratchpad:
npm init -y && npm install playwright-core
npx --yes playwright install chromium   # lädt einen passenden Chromium-Build

# danach aus dem Repo-Root heraus (NODE_PATH auf die obige Installation zeigen
# lassen, oder das Skript aus einem Ordner mit installiertem playwright-core
# ausführen):
CHROME_PATH=/pfad/zu/chrome node tools/smoke-test.mjs
```

Wenn `playwright-core` nicht verfügbar ist oder kein Browser startet, bricht
das Skript **nicht** mit Fehler ab, sondern gibt eine Anleitung aus und
beendet sich mit Exit-Code 0 (es ist ein optionaler Zusatz-Check, kein
Pflichtbestandteil von `check-all.mjs`).

In dieser Entwicklungsumgebung wurde verifiziert, dass ein bereits
gecachter Chromium-Build unter `~/.cache/ms-playwright/chromium-1208/`
funktioniert (`CHROME_PATH=~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`).
Das ist umgebungsspezifisch und nicht garantiert in jeder zukünftigen
Session identisch – ggf. neu prüfen mit
`ls ~/.cache/ms-playwright/`.

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

**Release-Nummerierung und -Packaging:** Baseline aktuell **Ausgabe 047**,
nächstes substantielles Release **Ausgabe 048**. Ausgabe 048 nicht anlegen,
bevor eine substantielle Änderung tatsächlich angefragt wurde. Release-ZIPs
und Release-Verzeichnisse werden **nicht** ins Git-Repository eingecheckt:
stattdessen den Release-Commit taggen (z. B. `v048`) und das ZIP an ein
GitHub Release hängen. Frühere Releases bleiben so über Tags/GitHub Releases
als Rollback-Punkte erhalten. Bei jedem Release beide Changelogs
(`CHANGELOG.md` und `CHANGELOG_EN.md`) pflegen.

**Vor jedem Release, mindestens:**
1. `node tools/check-syntax.mjs`
2. `node tools/check-dom-ids.mjs`
3. manuelle Stale-Reference-Suche (siehe oben)
4. `node tools/check-privacy.mjs` + Diff gegenlesen
5. echter Browser-/Laufzeittest bei strukturellen UI-Änderungen
   (`tools/smoke-test.mjs`, falls verfügbar, sonst manuell)

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

- **Abschnittsnummerierung im Script springt von 12 auf 18** (Abschnitte
  13–17 fehlen) – rein kosmetisch, aber verwirrend bei Navigation per
  Abschnittsnummer.
- **Vor dieser Session gab es keinerlei automatisierte Tests/CI.** Die in
  Abschnitt 4 beschriebene Testumgebung (`tools/*.mjs`) ist neu und wurde in
  dieser Session eingerichtet und gegen den aktuellen `index.html`-Stand
  verifiziert (alle drei statischen Checks sowie der optionale
  Playwright-Smoke-Test liefen erfolgreich durch).
- **`tools/check-privacy.mjs` ist nur heuristisch** – erkennt keine privaten
  Daten unter untypischen Schlüsselnamen. Ersetzt keine manuelle
  Diff-Prüfung vor einem Release.
- **`CHANGELOG.md` (deutsch) beginnt erst bei Ausgabe 047.** Die Historie der
  Ausgaben 001–046 existiert nur in `CHANGELOG_EN.md`. Neue Einträge ab
  jetzt bitte in beiden Dateien pflegen.
- Für das Packen eines Release-ZIPs (GitHub Release, siehe Abschnitt 5)
  existiert noch kein Automatisierungsskript in `tools/`. Bei Bedarf
  ergänzen, wenn Ausgabe 048 tatsächlich ansteht.

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
3. **Release-ZIPs gehören nicht ins Git-Repository.** Statt eines
   eingecheckten `web-map-editor-release-0XX/`-Verzeichnisses plus ZIP wird
   der Release-Commit getaggt und das ZIP an ein **GitHub Release** gehängt.
   `AGENTS.md` und `docs/DEVELOPMENT.md` wurden entsprechend angepasst.
4. **`tools/` ist legitimer Repo-Bestandteil.** Reine Entwicklungswerkzeuge
   ohne Einfluss auf `index.html` fallen nicht unter das
   Dependency-/Framework-Verbot. Ein klarstellender Absatz dazu steht jetzt
   im Architecture-Abschnitt von `AGENTS.md`.
