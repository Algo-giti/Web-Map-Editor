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

  **Beide gehören zum Kartenslot, nicht nur zum globalen Zustand.** `mapSlots`
  führt `selectedVertex` *und* `selectedVertices`; wer eine der beiden Größen
  irgendwo sichert oder zurückholt, muss die andere mitziehen. Vorher hielt der
  Slot nur den einzelnen Punkt, und `activateMap()` baute die Gruppe daraus neu
  auf – eine Auswahl von zwölf Punkten kam nach einem Wechsel auf Karte B und
  zurück als ein einzelner Punkt wieder. Betroffen sind sieben Stellen: die
  beiden Slot-Literale, das Merge-Ergebnis, `syncActiveSlotFromGlobals()`,
  `activateMap()`, der Ladepfad, der Checkpoint nach dem Speichern und das
  Zurücksetzen. `tools/test-map-switch.mjs` deckt das ab.

  Ein einfacher Klick auf einen bereits markierten Punkt **hebt die Gruppe
  nicht auf** – sie bleibt bestehen, damit man sie ziehen kann. Das ist
  gewolltes Verhalten und beim Schreiben von Tests leicht zu übersehen.
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

  **Übersetzt wird nur in eine Richtung, Deutsch nach Englisch.** Beim
  Zurückschalten braucht es das deutsche Original. Für Text vom Seitenaufbau
  liefert es der Schnappschuss; für Text, der erst zur Laufzeit entsteht, gibt
  es genau zwei zulässige Wege, und die Wahl zwischen ihnen ist keine
  Geschmacksfrage:

  - **Ableitbarer Inhalt** – alles, was sich aus dem Zustand neu berechnen
    lässt (Prüfbericht, Feature-Navigation, Buttontitel, jede Statuszeile eines
    Werkzeugs): gehört in `refreshDerivedUi()` und wird beim Sprachwechsel
    schlicht **neu aufgebaut**. Keine zweite Quelle, nichts, was veralten kann.
  - **Einmalmeldungen** – Text, den niemand nachrechnen kann ("3 Punkte
    entfernt"): über `setLocalizedText(element, deutsch)`. Die Funktion legt das
    deutsche Original als `data-i18n-de` am Element ab; `applyI18nSnapshot()`
    wendet es beim Wechsel in beide Richtungen wieder an.

  **`refreshDerivedUi()` wird NACH `startI18nObserver()` aufgerufen.** Der
  Neuaufbau erzeugt deutsche Knoten; übersetzt werden sie erst durch den
  Beobachter. Läuft er noch nicht, bleibt alles deutsch. Genau dieser Fehler
  steckte im ersten Entwurf und wurde erst vom Browsertest gefunden – die
  Reihenfolge nicht umdrehen.

  **Kein Schlüssel steht zweimal in `I18N_EN`.** Ein Objektliteral nimmt
  denselben Schlüssel klaglos zweimal an, und der **spätere** gewinnt; die
  fertige Map zeigt davon nichts. Drei solche Paare standen unbemerkt in der
  Liste. `tools/test-cassandra.mjs` liest dafür den Quelltext, nicht die Map.

  **In `I18N_PATTERNS` steht das speziellere Muster vor dem allgemeineren.**
  Die Liste wird von oben nach unten durchsucht und beim ersten Treffer
  abgebrochen. Stand `/^(\d+) Fehler$/` vor `/^1 Fehler$/`, wurde aus „1
  Fehler" ein „1 errors" – an der sichtbarsten Stelle der englischen
  Oberfläche. `tools/test-cassandra.mjs` prüft die ganze Liste jetzt
  automatisch darauf: für jedes Muster wird ein Beispieltext erzeugt und
  gesucht, ob ein früheres, allgemeineres ihn abfängt. 101 der 125 Muster sind
  so erfassbar; die übrigen 24 sind lange Meldungen mit eindeutigem Präfix und
  wurden von Hand durchgesehen.

  **Zusammengesetzte Texte** kann ein `I18N_PATTERNS`-Muster nicht übersetzen:
  ein Ersetzungsmuster setzt `$1` unverändert ein, der eingebettete Teil bliebe
  deutsch. Dafür gibt es `I18N_LABEL_PREFIXES` und `translateHistoryLabel()` –
  der Rest hinter dem Präfix wird noch einmal durch die Übersetzung geschickt.
  Alle Historienmarken aus `createWorkspaceSnapshot()` sind deshalb einzeln
  übersetzbar; wer eine neue Marke einführt, trägt sie in `I18N_EN` nach.

  **`value`-Attribute werden bewusst nicht übersetzt.** Dort stehen Zahlen,
  keine Sprache. `translateDynamicElement()` fasst nur `title`, `aria-label` und
  `placeholder` an. Nicht ergänzen – sonst versucht der Mechanismus, „0,02" zu
  übersetzen. `<option>`-Beschriftungen laufen dagegen über den normalen Weg
  und funktionieren; beides ist in `tools/test-i18n-dynamic.mjs` festgehalten.
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
| Browser | siebzehn Skripte (4.2) | `playwright-core` + Browser, beides außerhalb des Repos | optional, aber bei UI- oder Geometrieänderungen dringend empfohlen |

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
- **`tools/check-dom-ids.mjs`** – sammelt alle `id`-Literale der Datei (im
  Markup, in Vorlagen und aus `element.id = "..."`) sowie alle
  Literal-`document.getElementById("...")`-Aufrufe im Script und meldet
  Referenzen auf nicht existierende IDs. Zusätzlich meldet es **jede aus einer
  Variablen gebildete `id`** als Fehler, weil eine solche für die Textsuche
  unsichtbar wäre – siehe die Regel in Abschnitt 6. Deckt genau die Bug-Klasse
  ab, die laut `AGENTS.md`/Changelog wiederholt Laufzeitfehler verursacht
  hat (stale Referenzen nach Entfernen von UI-Elementen).

  Dazu Prüfungen auf **stille Doppelungen**, aus konkreten Fehlern entstanden
  und unsichtbar für die Syntaxprüfung. Sie bleiben dauerhaft – gemeinsam
  decken sie mit der Schlüsselprüfung in `test-cassandra.mjs` die drei Orte
  ab, an denen diese Einzeldatei still doppelt vergeben kann: Markup, Skript
  und Wörterbuch:

  - **Eine `id` darf im Markup nur einmal vorkommen.** `getElementById()`
    liefert sonst das erste Vorkommen, das zweite ist totes Markup, und im
    Browser sehen beide gleich aus. Beim Umzug der Knöpfe in den Inspektor
    entstanden so fünf Doppelungen, weil kopiert statt verschoben wurde.
    Betrachtet wird nur das Markup: eine Vorlage im Skript darf dieselbe `id`
    tragen wie das Markup, das sie ersetzt.
  - **Ein Funktionsname am Zeilenanfang darf nur einmal vorkommen.** Eine
    zweite Deklaration überschreibt die erste lautlos. `isWholeFeatureSelected()`
    bekam beim Bau des Inspektors eine zweite Fassung mit anderer Signatur –
    die spätere gewann, der Zustand „ganzes Feature" wurde nie erreicht, und
    kein Werkzeug meldete etwas. Geprüft werden nur Deklarationen ohne
    Einrückung: die sind im inline Script alle global.
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

Siebzehn Skripte öffnen `index.html` in einem echten Browser über eine
`file://`-URL – die Datei hat keine externen Ressourcen und keine
`fetch()`-Aufrufe, ein Webserver ist also nicht nötig.

| Skript | Gegenstand |
|---|---|
| `smoke-test.mjs` | Grundcheck: Start, Sprachumschalter, WGS84-Import |
| `test-origin-conflict.mjs` | widersprüchliche RTK-Bezugspunkte (Abschnitt 5b) |
| `test-straighten.mjs` | Linie begradigen |
| `test-dockpath.mjs` | Docking-Pfad mit freier Punktzahl |
| `test-reduce.mjs` | Punkte reduzieren, beide Betriebsarten |
| `test-scale.mjs` | Maßstabserkennung, Sperren, Rundlauf |
| `test-merge.mjs` | Verbinden, Singletons, Slot-Trennung |
| `test-shapes.mjs` | Kreis- und Rechteck-Exclusions |
| `test-validation.mjs` | erweiterte Geometrieprüfung |
| `test-rectify.mjs` | Ecken rechtwinklig |
| `test-map-switch.mjs` | Wechsel zwischen Karte A und B |
| `test-i18n-dynamic.mjs` | Sprachwechsel bei Laufzeitinhalten |
| `test-statusbar.mjs` | Legende und Statuszeile am unteren Rand |
| `test-toolbar.mjs` | Werkzeugleiste: Gruppen und Breitenstufen |
| `test-placeholders.mjs` | was als leerer Platzhalter gilt |
| `test-inspector.mjs` | Inspektor: alle sieben Zustände, Behälter, Tastatur |
| `test-menu.mjs` | Menüleiste: Tastaturvertrag, Escape-Rangfolge, die beiden Fenster |

Zwei davon lohnen eine genauere Beschreibung, weil sie nicht an einem einzelnen
Werkzeug hängen:

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
Unterbau aller: es findet `playwright-core` und einen startbaren Browser.
Neue Browsertests binden diese Datei ein, statt die Suche zu duplizieren.

Zusammen sind sie der automatisierte Ersatz für den in `AGENTS.md` geforderten
"Browser-Laufzeittest" bei strukturellen UI-Änderungen.

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

#### Der Test prüft die Wirkung, nicht die Absicht

Zwei Fehlerklassen, die dieselbe Wurzel haben und beide schon zugeschlagen
haben:

**Sichtbarkeit wird über den BERECHNETEN Stil geprüft, nie über ein Attribut
oder eine Klasse.** `element.hidden` und `classList.contains(...)` beschreiben,
was gemeint war – nicht, was der Browser daraus macht. Beim Inspektor standen
beide Zustandsblöcke gleichzeitig da, während `element.hidden` brav `true`
meldete: eine Klassenregel mit `display:flex` schlägt die Browser-Vorgabe
`[hidden]{display:none}`. Richtig ist
`getComputedStyle(el).display !== "none"`.

Dasselbe gilt für „ist der Knopf gesperrt?": seit die Zeichenknöpfe über
`aria-disabled` sperren, sagt `element.disabled` nichts mehr.

**Und `display` ist nicht das letzte Wort: was über seinen Container
hinausragt, wird zusätzlich auf Trefferbarkeit geprüft.**
`getComputedStyle(el).display` prüft eine Eigenschaft **des Elements selbst** –
ein abschneidender Vorfahr sitzt eine Ebene höher und bleibt dabei unsichtbar.
`display` beantwortet „will sichtbar sein", die Trefferprüfung „ist sichtbar":
`document.elementFromPoint()` liefert, was der Browser an dieser Stelle
tatsächlich zeichnet.

Gefunden hat das nicht der Test, sondern ein Bildschirmabzug: die Kopfzeile
trug `overflow:hidden`, die Menüpanels hängen unter ihr. Sie waren gerechnet
da – Rechteck, Höhe, `display:flex` –, sichtbar und anklickbar nicht, und
`elementFromPoint()` lieferte an ihrer Stelle die Werkzeugleiste. Alle
Menütests waren grün, während das Menü unsichtbar war. Die Kopfzeile trägt
deshalb jetzt `overflow-x:clip` mit `overflow-y:visible` – `clip` ist der eine
Wert, der sich mit `visible` auf der anderen Achse verträgt, `hidden` erzwänge
dort `auto`.

`elementGetroffen(page, selektor)` in `tools/browser-harness.mjs` ist dafür da.
**Jedes Element, das absichtlich über seinen Container hinausragt, bekommt
diese Zusicherung**: die vier Menüpanels, die schwebenden Fenster über der
Karte, jedes künftige Overlay.

**Die klemmenden Vorfahren sind gemessen, nicht vermutet.** Über der
Menüleiste liegen `header` (`clip`/`visible`, schneidet also senkrecht nicht),
darüber `.app`, `body` und `html` mit je `overflow:hidden`. Die drei schneiden
wirklich, haben aber Platz: unter dem längsten Panel („Ansicht", 351 px)
bleiben bei 1280 × 800 noch 402 px. Wer ein Fenster **über der Karte**
platziert, hat dagegen `.viewer` mit `overflow:hidden` über sich – dort ist
die Grenze eng, und ein Fenster muss innerhalb der Kartenfläche bleiben.

#### Eine Zusicherung über ein Ausbleiben beweist nichts

**Jeder Test, der einen Auslöser prüft, braucht mindestens eine Zusicherung,
die nur bei tatsächlicher Wirkung gelingt.**

Eine Zusicherung, die prüfen soll, dass etwas NICHT passiert, besteht auch
dann, wenn die Funktion gar nicht existiert. Das ist keine Theorie:
`tools/test-dockpath.mjs` drückte Enter mit einem Punkt und prüfte, dass die
Meldung „mindestens 2" enthält. Das tat auch die Startmeldung „Docking-Pfad:
mindestens 2 Punkte anklicken", die ohnehin noch stand. Der Test bestand über
mehrere Ausgaben hinweg, obwohl Enter für den Dockpfad überhaupt nichts tat –
gefunden hat es der Nutzer, nicht der Test.

Praktisch heißt das: nach einem Klick oder Tastendruck nicht nur den
unveränderten Zustand prüfen, sondern **einen Text oder Zustand, den es ohne
die Verarbeitung nicht gäbe**. Bei einer begründeten Ablehnung ist das der
Ablehnungstext selbst – aber nur, wenn er sich von jeder Meldung
unterscheidet, die vorher schon dort stand.

**Bekannte Stellen, die diese Regel noch nicht erfüllen** (erfasst, nicht
repariert – sie werden mitgezogen, wenn die betroffenen Tests ohnehin
angefasst werden):

| Datei | Zusicherung |
|---|---|
| `test-merge.mjs` | „Kartenprüfung sieht nur einen Perimeter" |
| `test-merge.mjs` | „Kartenprüfung meldet kein doppeltes Docking" |
| `test-merge.mjs` | „Kartenprüfung meldet danach keine doppelten Features" |
| `test-reduce.mjs` | „Ring ist nach dem Reduzieren noch geschlossen" |
| `test-dockpath.mjs` | „drei Punkte erzeugen keinen Docking-Befund" |

Alle fünf lesen einen Prüfbericht oder einen Knopfzustand, nachdem sie einen
Auslöser gefeuert haben, und würden auch bei einem leeren Bericht bzw. einem
wirkungslosen Klick bestehen.

Die sechste ist mit Etappe 5b erledigt: `test-shapes.mjs` prüfte „Werkzeug
startet nicht" nach einem Klick mit Radius 0 – das bestand auch, wenn der
Klick gar nichts auslöste. Geprüft wird jetzt die Wirkung: der Abschluss ist
gesperrt, der Grund steht sichtbar da, ein gültiger Wert gibt ihn wieder frei,
und danach entsteht die Form wirklich. Eine reine Verneinung ohne Auslöser – etwa
`!pointInRing(...)` in `test-geometry.mjs` – ist davon nicht betroffen: dort
gibt es keinen Auslöser, dessen Verarbeitung ausbleiben könnte.

#### Hinweis für eigene Erweiterungen

**Einklappbare Bereiche zuerst öffnen.** Seit Etappe 5 sind „Umformen" und
„Kartenprüfung" im Inspektor `<details>` und beim ersten Start **zu** – ein
Klick auf einen Knopf darin läuft sonst in einen Playwright-Timeout
("element is not visible"). Die betroffenen Tests öffnen deshalb
`#sidebar details, .inspector-fold`; genau das tut auch ein Nutzer.

**Die Zoom-Leiste liegt über der Karte** (`.map-view-toolbar`, oben rechts).
Ein Punktmarker darunter lässt sich nicht anklicken – Playwright meldet
"subtree intercepts pointer events". Testpunkte deshalb nicht in die obere
rechte Ecke der Karte legen.

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

**Kreis- und Rechteck-Exclusions:** Ein Klick setzt den Bezugspunkt, Ziehen
zieht die Form auf, und **erzeugt wird erst beim Abschließen**. Die Geometrie
folgt aus den eingestellten Maßen. Beide laufen über dieselbe
Zeichenmechanik wie Exclusion und Search Wire (`SHAPE_MODES`,
`isShapeMode()`), damit Abbrechen, Escape, Statuszeile und Undo-Grenze
unverändert gelten. Vorschau und Erzeugung holen die Punkte aus derselben
Funktion `shapePointsAt()` – sie können nicht auseinanderlaufen. **Der Test
vergleicht die Vorschau Punkt für Punkt mit der erzeugten Geometrie.** Das ist
die Zusicherung, die den ganzen Punkt trägt: sie fällt sofort um, wenn jemand
später einen zweiten Rechenweg einbaut.

Das Ergebnis ist eine **gewöhnliche Exclusion**: derselbe Erzeugungsweg über
`createExclusionFeatureFromWorldPoints()`, also gleicher Ringschluss, gleiche
`idx`-Vergabe, keine zusätzlichen `properties`. Danach wie jede andere
editierbar.

- **Vorgabe 24 Ecken.** Die Sehnenabweichung eines n-Ecks vom Kreis ist
  `r·(1−cos(π/n))` – bei 24 Ecken 8 mm für 1 m Radius und 17 mm für 2 m, also
  unter dem RTK-Rauschen. Weil der passende Wert vom Radius abhängt, zeigt die
  Oberfläche die tatsächliche Abweichung an, statt die Vorgabe als richtig
  auszugeben. Grenzen: 3 bis 720 Ecken.
- **Snap-to-Grid wirkt auf den Bezugspunkt, nicht auf die Eckpunkte.** Das
  ergibt sich von selbst, weil `addFeatureDrawPoint()` den Klick rastet und die
  Form anschließend aus dem gerasteten Punkt berechnet wird.

**Aufziehen und Eingeben sind gleichberechtigt.** Die numerische Eingabe ist
keine Rückfallebene: für bekannte Maße ist sie genauer als jede Geste, und bei
einer Sperrfläche um einen Baumstamm ist „grob setzen, Zahl eintippen" der
wahrscheinlichere Weg. Daraus folgt der ganze Ablauf:

| Schritt | Verhalten |
|---|---|
| `pointerdown` | Bezugspunkt setzen (gerastet), Ziehzustand starten |
| `pointermove` | Maß aus dem Ziehvektor → **ins Eingabefeld** → Vorschau |
| `pointerup` | Ziehen endet, **die Vorschau bleibt stehen** |
| Feld tippen | ändert dieselbe wartende Form |
| Abschließen / Enter | jetzt erst entsteht die Exclusion |
| Escape | verwirft, ohne Spur |

**Der Weg ist einbahnig: Geste → Feld → `readShapeSettings()` →
`shapeSettings` → `shapePointsAt()`.** `applyShapeMeasure()` schreibt deshalb
**nur** ins Eingabefeld und nicht zusätzlich in `shapeSettings` – das wäre ein
zweiter Weg zum selben Wert. So endet das Ziehen an genau derselben Stelle wie
das Tippen.

**Gerastet wird das MASS, nicht der gezogene Punkt.** Zwei gerasterte Punkte
haben bei diagonalem Ziehen einen krummen Abstand (1,41 statt 1,00); ein
gerastetes Maß ist das, was der Nutzer im Feld liest. Bleibt das Maß unter
einem Rasterschritt, wird gar nichts geschrieben – eine 0 im Feld erzeugte
einen ungültigen Zustand, in dem die Vorschau etwas anderes zeigt als das Feld.

**Die Maßfelder stehen im Zeichenzustand des Inspektors**, nicht mehr in der
Seitenleiste. Ein Feld, das man erst in einem eingeklappten
Seitenleistenabschnitt suchen muss, ist schlechter als eine Rückfallebene.
Verschoben, nicht kopiert; die ids sind unverändert. Sie sind damit erst
erreichbar, wenn das Werkzeug läuft – die Reihenfolge ist also: Werkzeug
starten, Maße setzen, Bezugspunkt klicken, abschließen.

**Ein weiterer Klick verschiebt den Bezugspunkt.** Er verwirft nicht und
erzeugt nicht. Das ist keine Sonderregel, sondern die vorhandene: ein Klick
heißt „setz hier einen Punkt", und eine Form hat genau **einen** – „einen
Punkt setzen, wo schon einer ist" heißt dort zwangsläufig „den Punkt
verschieben". Erzeugen wäre eine versteckte zweite Abschlussgeste.

**Ungültige Maße sperren den Abschluss.** Seit die Felder im Zeichenzustand
stehen, kann ein ungültiger Wert erst *während* des Zeichnens entstehen;
`canFinishFeatureDrawing()` prüft deshalb bei Formen zusätzlich
`readShapeSettings()`. Ohne das gäbe ein Knopf frei, was das Werkzeug
anschließend ablehnt – derselbe Fehler wie bei der Search-Wire-Zählung.

**Der Drehwinkel bleibt aus dem Feld, aber das Ziehen folgt der eigenen
Achse.** Größe und Drehung mit einer Geste zu setzen machte beide unpräzise.
Der Ziehvektor wird deshalb um −Winkel zurückgedreht, bevor Breite und Höhe
abgelesen werden; `rectanglePolygonPoints()` bleibt unverändert. Bei 90° wird
aus „6 m nach Norden gezogen" die **Breite**, nicht die Höhe.

**Schwelle Klick gegen Ziehen: 4 px mit der Maus, 10 px mit dem Finger.**
Android nennt in `ViewConfiguration` eine Touch-Slop von 8 dp – so weit darf
ein Finger wandern und gilt dem System noch als Tipper. Mit 4 px läge unsere
Schwelle unter der des Betriebssystems: ein Tipper, den Android noch als
Tipper zählt, hätte bei uns schon den Radius verstellt.

**Nachgemessen wurde nur die untere Schranke.** Ein synthetischer Tipper in
Playwright erzeugt exakt 0 px Bewegung; er beweist damit nur, dass die
Schwelle dort nicht fälschlich auslöst. Echtes Fingerwackeln ist hier nicht
messbar (Abschnitt 4.3) – die 10 px stammen aus der Plattformvorgabe, nicht
aus einer eigenen Messung. **Beim nächsten echten Android-Test bitte prüfen.**

**Escape wirkt auch aus einem Eingabefeld heraus** – als einzige Taste. Der
Tastaturhandler ignoriert sonst alles, was aus einem Feld kommt, damit Ctrl+Z,
Entf und die Pfeiltasten eine Texteingabe nicht anfassen. Escape ist aber
keine Texteingabe, sondern die durchgehende Abbruchgeste, und seit die
Maßfelder im Zeichenzustand stehen, ist „tippen und dann doch abbrechen" der
normale Ablauf. Vorher lag der Cursor beim Zeichnen praktisch nie in einem
Feld, deshalb war die Lücke nicht zu sehen. Der Fokus wird dabei aus dem Feld
genommen, damit sichtbar ist, dass die Taste angekommen ist.

**Bis zum Abschluss steht nichts in `data`.** Escape hinterlässt deshalb
keinen Undo-Eintrag, und ein abgeschlossenes Aufziehen ist **genau ein**
Undo-Schritt, unabhängig davon, wie oft die Vorschau während des Ziehens lief.
Nachgemessen an `undoStack.length`.
- Winkelkonvention wie beim Messen: 0° = East, gegen den Uhrzeigersinn.
- Der Klickpunkt des Rechtecks ist wahlweise Mittelpunkt oder Ecke.

**Erweiterte Geometrieprüfung:** Vier Befunde in `collectGeometryFindings()`,
alle **Warnungen, keine Fehler** – jeder der Fälle kann gewollt sein, und der
Editor weiß zu wenig über die Absicht des Nutzers, um eine Karte deswegen
abzulehnen. Die Rechenarbeit liegt in reinen Funktionen des Geometrieblocks.

- **Exclusion außerhalb des Perimeters.** Unterschieden werden vollständig
  außerhalb, über den Rand ragend und den Perimeter umschließend. Bei mehreren
  Perimetern genügt „innerhalb mindestens eines". Ausgewertet wird nur der
  äußere Ring, wie überall sonst auch.

  **Docking-Pfad und Search Wire sind ausgenommen.** Ein Docking-Pfad führt in
  vielen Aufbauten bewusst über den Perimeterrand hinaus zur Ladestation; eine
  Warnung, die auf normalen Karten immer erscheint, liest niemand mehr.
- **Überlappende Exclusions.** Gemeldet wird nur, **dass** sie sich überlappen,
  nicht um wie viel. Die Überlappungsfläche zu berechnen bräuchte echtes
  Polygon-Clipping – Sutherland-Hodgman greift nur bei konvexem Clip-Polygon,
  Greiner-Hormann bricht an Berührpunkten. Nicht nachrüsten, ohne dass jemand
  den Wert wirklich braucht.
- **Selbstüberschneidung** geschlossener Ringe und offener Linien. Gemeldet
  werden nur **echte Kreuzungen**: Berührungen in einem Punkt und kollineare
  Überlappungen entstehen bei RTK-Daten fast immer durch Rundung.
  `GEOMETRY_EPSILON_AREA` ist die Rauschgrenze des Kreuzprodukts.
- **Enge Korridore**, siehe unten.

Befunde werden **je Feature bzw. je Paar zusammengefasst** – ein verhedderter
Ring erzeugte sonst dutzende Zeilen, in denen die echten Befunde untergehen.
Jede Meldung nennt die Fundstelle als Feature und Segment.

**Enge Korridore – Verfahren und Grenze:** `segmentDistance()` liefert den
kleinsten Abstand zweier Strecken in geschlossener Form, **nicht abgetastet**.
Für zwei sich nicht schneidende Strecken liegt das Minimum immer an einem der
vier Endpunkte; läge es bei beiden im Inneren, wären sie parallel oder sie
schnitten sich. Der geometrische Wert ist damit exakt – es gibt keine
Abtastweite, an der etwas durchrutschen könnte.

Gezählt wird eine enge Stelle nur, wenn die Mitte der kürzesten Verbindung im
**mähbaren Bereich** liegt (`pointIsMowable()`: innerhalb eines Perimeters,
außerhalb jeder Exclusion). Ohne diesen Filter meldete jede schmale
Ausbuchtung innerhalb einer Exclusion einen Korridor, den der Mäher nie befährt.

**Die Schwelle ist `mowerWidth` und damit eine untere Schranke.** Der Mäher
braucht real mehr: Wendekreis, RTK-Toleranz, Spurabweichung. **Kein Befund
bedeutet nicht, dass ein Korridor befahrbar ist** – das steht so auch im
Prüfbericht, nicht nur hier. Bei unbekanntem Maßstab ist die Prüfung gesperrt
und meldet sich als übersprungen; die übrigen drei sind rein topologisch und
laufen bei jedem Maßstab.

**Aufwandsgrenze:** `GEOMETRY_CHECK_PAIR_BUDGET` begrenzt die Kantenpaare pro
Prüfung. Das Budget wird **vor** dem Hüllen-Vorfilter verbraucht, sonst
begrenzte es nur die teuren Fälle, während die Schleife selbst unbegrenzt
weiterläuft. Der Wert ist gemessen: eine großzügige reale Karte (1000
Perimeterpunkte, 20 Exclusions à 60 Punkte) läuft vollständig durch, nach oben
ist der Aufwand auf rund 70 ms begrenzt. Das zählt, weil „Punkte reduzieren"
die Kartenprüfung je Anwendung zweimal über eine Vorschaukopie laufen lässt.
Ein Abbruch wird ausdrücklich gemeldet – ein unvollständiges Ergebnis darf
nicht wie ein sauberes aussehen.

**Ecken rechtwinklig machen:** Arbeitet **nur auf einem ganzen Feature**.
Ein Abschnitt wird bewusst nicht angeboten – die Vorzugsrichtung ist eine
Eigenschaft des ganzen Umrisses und wäre aus vier Kanten geschätzt
unzuverlässig. Die Auswahl kommt aus `getWholeFeatureTarget()`, derselben
Funktion, die auch das Reduzieren benutzt, wenn kein Abschnitt vorliegt.

- **Vorzugsrichtung** über `dominantOrientation()`. Ein einfacher Mittelwert
  über die Kantenwinkel wäre falsch, weil sie zyklisch sind: 89° und 1° liegen
  2° auseinander, nicht 88°. Gerechnet wird deshalb der zirkuläre Mittelwert
  über den **vierfachen** Winkel – dadurch wird aus „modulo 90°" ein voller
  Kreis. **Gewichtet mit der Kantenlänge**, weil die langen Kanten den Umriss
  definieren und die kurzen Messrauschen sind.
- **Die Länge der Resultierenden** (geteilt durch die Gesamtkantenlänge) sagt,
  wie rechtwinklig die Form überhaupt ist: ein Rechteck liegt bei 1, ein Kreis
  nahe 0. Der Wert steht als Prozentzahl in der Oberfläche und wird unter 50 %
  als Warnung gefärbt. Entschieden wird trotzdem vom Nutzer – es wird nichts
  gesperrt, nur gesagt, was Sache ist.
- **Die Punkte werden über ein Gleichungssystem gesetzt**, nicht Ecke für Ecke:
  sonst hinge das Ergebnis von der Reihenfolge ab. In den θ-Rahmen drehen, jede
  Kante als waagerecht oder senkrecht einstufen, die betroffenen Koordinaten
  per Union-Find gleichsetzen, Gruppenmittelwert, zurückdrehen. Zwei Fälle
  gehen dadurch von selbst auf: zwei aufeinanderfolgende gleichgerichtete
  Kanten landen sauber auf einer Linie, und eine Ecke, an der beide Kanten
  übergangen wurden, bewegt sich gar nicht.
- **Toleranz 15°** (0 bis 45 einstellbar). Kanten, die weiter von der nächsten
  Achse abweichen, bleiben unangetastet und werden gezählt. Eine 45°-Kante ist
  von beiden Achsen gleich weit entfernt; sie zu zwingen zerstörte die Form.
- **Die Vorzugsrichtung ist überschreibbar.** Wer einen festen Winkel eintippt,
  schaltet damit automatisch auf „fester Winkel" um – einen Wert einzugeben und
  ihn dann nicht zu verwenden wäre eine Falle.
- **Es wird kein Punkt entfernt**, auch wenn drei Punkte kollinear werden.
  Ausdünnen ist Aufgabe von „Punkte reduzieren"; zwei Werkzeuge, die beide
  Punkte löschen, wären eine Falle.
- **Ausgerichtet wird auf die eigene Vorzugsrichtung, nicht auf East/North.**
  Ein leicht schief gezeichnetes Rechteck bleibt danach leicht schief – aber
  rechtwinklig. Wer Achsparallelität will, gibt 0° als festen Winkel vor.
- **Maßstabsunabhängig:** Winkel bleiben unter der gleichmäßigen Skalierung von
  `toWorld()` erhalten, das Werkzeug läuft also auch bei unklarem Maßstab. Nur
  die gemeldete Verschiebung trägt dann „Einheiten" statt „m".
- Wie beim Reduzieren läuft das Ergebnis vor dem Anwenden durch
  `newValidationErrors()`. Eine Anwendung ist ein Undo-Schritt.

**Abgeleitet oder flüchtig – die Kategorie jeder Statusquelle.** Bevor eine
neue Ausgabe irgendwo eingebaut wird, gehört sie in genau eine der beiden
Klassen. Die Entscheidung bestimmt, wie sie übersetzt und wie sie angezeigt
wird, und sie ist an mehreren Stellen dieselbe:

- **Abgeleitet** heißt: der Text lässt sich jederzeit aus dem Zustand neu
  berechnen. Er wird typischerweise bei *jeder* Änderung neu geschrieben, auch
  wenn sich nichts Sichtbares getan hat. Beispiele: der Zeichenstatus, der
  Auswahlhinweis, die vier linken Felder der Statuszeile, der Prüfbericht, die
  Feature-Navigation, die Titel von Zurück/Vor.

  Für die **Übersetzung** bedeutet das: nicht zwischenspeichern, sondern beim
  Sprachwechsel neu aufbauen (`refreshDerivedUi()`).
  Für die **Anzeige** bedeutet es: eine abgeleitete Quelle darf einen
  gemeinsamen Platz nicht an sich reißen – sie würde eine gerade erschienene
  Meldung überschreiben, ohne selbst etwas Neues zu sagen.

- **Flüchtig** heißt: eine Einmalmeldung, die ein Ereignis beschreibt und die
  niemand nachrechnen kann. „3 Punkte entfernt", „Speichern abgebrochen".

  Für die **Übersetzung**: über `setLocalizedText()`, das deutsche Original
  bleibt als `data-i18n-de` am Element.

  **Ein `$1` in einem Ersetzungsmuster bleibt unübersetzt** – das ist bei
  Feature-Namen richtig so: `describeFeature()` liefert entweder etwas
  Sprachneutrales („Perimeter", „Exclusion #0", „Dockpoints") oder ein vom
  Nutzer vergebenes `properties.label`, und ein Label wird nicht übersetzt.
  Für Texte, deren eingebetteter Teil wirklich deutsch ist, gibt es
  `I18N_LABEL_PREFIXES`.
  Für die **Anzeige**: sie gewinnt den gemeinsamen Platz, die jüngere vor der
  älteren.

Die Verwechslung der beiden ist kein Schönheitsfehler: eine abgeleitete Quelle,
die wie eine flüchtige behandelt wird, löscht Meldungen in dem Moment, in dem
sie erscheinen. Genau das ist beim Bau der Statuszeile zweimal passiert und
wurde beide Male erst vom Browsertest gefunden.

**Statuszeile:** Volle Breite, immer sichtbar, **nie einklappbar**. Sie fasst
sieben zuvor verstreute Ausgaben zusammen; zehn der vierzehn Ausgabestellen des
Editors lagen in einklappbaren Bereichen, und genau daran waren zweimal
Meldungen unsichtbar geworden. Gegliedert wird nach **Beständigkeit**, nicht
nach Herkunft:

**Zwei Zeilen.** Zeile 1 trägt die dauerhaften Angaben links und die beiden
ständig wechselnden rechts; Zeile 2 gehört über die volle Breite der flüchtigen
Meldung:

| Zeile | Zone | Inhalt | Verhalten |
|---|---|---|---|
| 1 | links, feste Plätze | Dateiname, Maßstab, Bezugspunkt, Prüfergebnis | ändert sich selten, immer da |
| 1 | rechts außen | Auswahlzähler, Cursor-Koordinaten | ändert sich ständig, fester Ort |
| 2 | volle Breite | `editStatus`, `drawFeatureStatus`, `multiSelectionStatus` | genau eine davon sichtbar |

**Zeile 2 bleibt immer bestehen, auch ohne Meldung.** Eine Zeile, die je nach
Meldungslänge auftaucht und verschwindet, ließe die Karte springen – das wäre
schlimmer als die 28 px, die sie dauerhaft kostet.

Vorher lag die Meldung als fünfte Spalte zwischen den dauerhaften Feldern und
dem Zähler. Dort blieb ihr auf einem 1280 px breiten Fenster kaum Platz: die
längste Meldung des Editors hat 114 Zeichen, 27 liegen über 60. Sie wurde
abgeschnitten, ohne dass man es dem Text ansah.

**Zähler und Koordinaten stehen fest in den letzten beiden Spalten.** Ohne die
Festlegung rutschte der Zähler in die Dehnspalte und klebte an den dauerhaften
Feldern, sobald die Meldung in Zeile 2 umzog.

**Die vier linken Angaben sind Kurzformen, und das ist wörtlich gemeint.** Wird
eine länger als eine Zeile, ist es keine Kurzform mehr – der ausführliche Text
bleibt, wo er hingehört: der Prüfbericht in der Seitenleiste, der
Maßstabshinweis im Kartenfeld, der Bezugspunkt unter „Koordinatenbezug".
`tools/test-statusbar.mjs` prüft die Länge mit.

**Der gemeinsame Platz: die jüngere Meldung gewinnt – mit einer Ausnahme.**
Zwei der drei Quellen sind nämlich gar nicht flüchtig, sondern **abgeleitet**:

- `drawFeatureStatus` wird bei **jeder** Geometrieänderung neu geschrieben,
  auch wenn nicht gezeichnet wird. Ohne Sonderregel überschriebe sein
  Leerlauftext jede Erfolgsmeldung genau in dem Moment, in dem sie erscheint –
  `setEditStatus()` schreibt, unmittelbar danach läuft `afterGeometryEdit()`.
- Der Auswahlhinweis aus `resetMultiSelectionStatus()` („1 Punkt ausgewählt.")
  wird bei jeder Auswahländerung neu geschrieben und sagt nichts, was der
  Zähler rechts nicht schon zeigt. Er verdrängte damit die Beschreibung des
  gerade gewählten Punktes.

`showTransientStatus(id, {derived, force})` löst beides: eine abgeleitete
Quelle nimmt den Platz nur, wenn sie ihn ohnehin schon hält oder `force`
gesetzt ist. Für den Zeichenstatus heißt `force`: es wird tatsächlich
gezeichnet. **Nicht vereinfachen** – ohne diese Regel ist die Zusammenlegung
ein Rückschritt.

**Bewusst in Kauf genommen:** die Bestandsmeldungen des Zeichenbereichs
(„Search Wire vorhanden (5 Punkte).") erscheinen nach der ersten
Einmalmeldung nicht mehr in der Zeile. Sie sind Bestandsangaben, keine
Meldungen, und ziehen mit Etappe 5 in den Inspektor.

**Ausblendreihenfolge bei schmalem Fenster**, und der Grund dafür: Zuerst
verschwinden die Beschriftungen der linken Felder (ab 1180 px), dann
Bezugspunkt und Prüfung (ab 900 px). Zuletzt weichen würden Dateiname und
Maßstab; die flüchtige Meldung und die beiden rechten Anzeigen bleiben immer.

Maßgeblich ist die **Nachschlagbarkeit**: Bezugspunkt und Prüfergebnis stehen
vollständig in der Seitenleiste, wer sie braucht, findet sie dort wieder. Die
flüchtige Meldung ist nirgends nachschlagbar – sie ist weg, sobald die nächste
kommt, und wer sie verpasst, kann sie nicht wiederholen. Der Auswahlzähler und
die Cursor-Koordinaten beschreiben, was gerade passiert; sie sind ohne die
Zeile gar nicht zu haben. Deshalb weicht immer das Nachschlagbare zuerst.

**Der Umbau ist ein Ordnungsgewinn, kein Flächengewinn.** Dieser Satz steht
hier, damit ihn niemand noch einmal nachrechnet und das Ergebnis für einen
Fehler des Umbaus hält.

**Eine Flächenrechnung wird für alle drei Fenstergrößen gemacht, nie nur für
die größte.** Im schmalsten Fenster entscheidet sich, ob ein Layout trägt: bei
Etappe 4 hatte ich −17 % geschätzt, weil ich nur 1920 × 1080 gerechnet hatte –
bei 1280 × 800 waren es tatsächlich −42 %.

**Und der Ausgangswert wird gemessen, nicht erinnert.** Die früher hier
stehende Baseline (1 485 120 / 833 760 / 618 240 px²) war zu niedrig. Die
Zahlen unten stammen aus einem Lauf gegen `git show main:index.html` im selben
Browser und mit demselben Skript wie die aktuellen – nur so sind sie
vergleichbar:

| Fenster | Kartenfläche vor dem Umbau |
|---|---|
| 1920 × 1080 | 1 560 × 1016 = **1 584 960 px²** |
| 1440 × 900 | 1 080 × 836 = **902 880 px²** |
| 1280 × 800 | 920 × 736 = **677 120 px²** |

**Stand nach Etappe 5 D**, gemessen. Der obere Block ist der *Zwischenstand*:
Seitenleiste **und** Inspektor stehen gleichzeitig, was mit Etappe 6 endet.

| Fenster | alles offen | Leiste zu | Inspektor zu | beide zu |
|---|---|---|---|---|
| 1920 × 1080 | −36,5 % | −29,9 % | −19,5 % | −12,9 % |
| 1440 × 900 | −50,2 % | −40,8 % | −26,2 % | −16,8 % |
| 1280 × 800 | −58,0 % | −47,1 % | −30,1 % | −19,2 % |

**Vorschau auf Etappe 7**, wenn die Seitenleiste verschwindet und nur noch
Werkzeugleiste, Karte und Inspektor nebeneinanderstehen – gemessen, indem die
Seitenleiste eingeklappt wird. Die Zahlen sind unverändert die aus der Messung
zu Etappe 5 D; sie sind **nicht** neu gerechnet, nur der Etappe zugeordnet, in
der sie eintreten:

| Fenster | Leiste offen, Inspektor offen | Leiste zu, Inspektor offen | beide zu |
|---|---|---|---|
| 1920 × 1080 | −15,2 % | −8,5 % | **+8,4 %** |
| 1440 × 900 | −20,0 % | −10,6 % | **+13,5 %** |
| 1280 × 800 | −22,9 % | −12,0 % | **+15,8 %** |

**Geändert gegenüber der ursprünglichen Etappenplanung: „Seitenleiste
auflösen" und die Schlussmessung rücken von Etappe 6 nach Etappe 7.** Etappe 6
füllt die vier Menüs, aber „Karten verbinden" hat noch kein Ziel – es wird mit
Etappe 7 ein Werkzeug der Leiste. Solange bleibt seine Hülle stehen, und mit
ihr zwei weitere Abschnitte (siehe unten). Die Hülle zu entfernen und das
Verbinden dabei zu verlieren wäre schlechter als eine Etappe mit einem
sichtbaren Rest. Die Schlussmessung wird in Etappe 7 gemacht, im selben Browser
und mit demselben Skript wie die Ausgangswerte.

**Nach Etappe 6 stehen in der Seitenleiste noch genau drei Abschnitte:**
Karten verbinden, Feature-Navigation, Koordinatenbezug.

**Feature-Navigation und Koordinatenbezug ziehen NICHT vorzeitig in den
Inspektor**, obwohl sie thematisch dorthin gehören. Drei Gründe, alle drei
zählen:

- Die Hülle bleibt wegen „Karten verbinden" ohnehin stehen. Der Umzug brächte
  also keinen Abschnitt weniger, nur einen Umzug mehr.
- Zwei weitere Faltblöcke kosten den Inspektor mindestens 42 px plus Lücken.
  Das reißt die **20 px Reserve bei 900 px**, die oben als verbindlich stehen.
- Die Höhenentscheidung wird in Etappe 7 **einmal mit allen Blöcken** getroffen,
  nicht zweimal mit halbem Bestand. Zweimal messen heißt, die erste Messung
  wegzuwerfen.

**„Karten verbinden" zieht mit Etappe 7 in die Werkzeugleiste** – es ist ein
Modus (Start/Ende beider Perimeter festlegen), kein Menübefehl. Bis dahin steht
es unverändert in der Seitenleiste, und im Menü „Karte" steht **kein grauer
Eintrag** dafür: ein deaktivierter Eintrag mit dem Grund „zieht später um"
behauptet Unerreichbarkeit, während der Befehl zehn Zentimeter weiter links
funktioniert. Dieselbe Regel hält Zoom, Einpassen und „Karte prüfen" aus den
Menüs heraus, und sie verbietet einen Platzhalter für die noch ungebaute
Mähbahnen-Vorschau.

**`#mobilePanelBtn` bleibt ebenfalls bis Etappe 7.** Unter 760 px steht die
Seitenleiste auf `display:none`, und **nur** dieser Knopf setzt
`aside.mobile-open`. Nachgemessen bei 400 × 800: ohne ihn sind die drei
verbliebenen Abschnitte auf einem Telefon nicht erreichbar. Er geht mit der
Hülle, nicht vorher – zusammen mit `.mobile-panel-btn` und der Mobilausnahme
der Seitenleiste.

Erst mit beiden eingeklappten Leisten liegt die Fläche **über** dem
Ausgangswert. Das ist der ehrliche Stand: **wer mehr erwartet, erwartet das
Falsche vom Umbau.** Was er tatsächlich gewinnt, ist Ordnung und
**Überdeckung** – die schwebenden Fenster auf der Karte sind von 25 950 px²
auf 21 870 px² geschrumpft, und die Auswahlleiste ist seit Etappe 5 ganz von
der Karte verschwunden.

**Gemessen nach Etappe 6, gegen den Stand unmittelbar davor** (`37f71f5`),
im selben Browser und mit demselben Skript – die Zahlen unten sind die
gemessenen, nicht die vorhergesagten:

| Fenster | Kopfzeile vorher | nachher | Höhe | Statuszeile | Felder | Kartenfläche |
|---|---|---|---|---|---|---|
| 1920 × 1080 | 1038 px nötig | **880 px** | 48 px, unverändert | 63 px, unverändert | 4 → 5 | 1 006 608 px², unverändert |
| 1440 × 900 | 1038 px nötig | **880 px** | 48 px, unverändert | 63 px, unverändert | 4 → 5 | 449 328 px², unverändert |
| 1280 × 800 | 1038 px nötig | **880 px** | 48 px, unverändert | 63 px, unverändert | 4 → 5 | 284 688 px², unverändert |

„Nötig" ist die Summe der Eigenbreiten der Kopfzeilenkinder plus Lücken plus
Polsterung, gemessen an Klonen mit `width:max-content`. `scrollWidth` taugt
dafür nicht: die Kopfzeile trägt `overflow-x:clip` und verbirgt eine Stauchung.

**−158 px in der Kopfzeile, 0 px Zuwachs durch das sechste Statusfeld, und die
Kartenfläche ist in allen drei Größen unverändert.** Das Menü kostet 256 px
und ersetzt 402 px an Knöpfen (speichern 170, zurücksetzen 173, Hilfe 59); das
Statusfeld nimmt seine 104 px aus der Dehnspalte, die bei 1280 px danach noch
86 px hat. Der Dateiname wird ab 1000 px Breite gekappt – das war vorher schon
so und ist von diesem Umbau unberührt.

Die Kartenfläche kostet: **93 px Höhe** für Legende (30) und die zweizeilige
Statuszeile (63), 168 px Breite für die ausgeklappte Werkzeugleiste, 320 px
für den Inspektor. Zurückgeholt wurden 16 px Höhe (Kopfzeile von 64 auf 48),
112 px Breite (Leiste einklappbar) und seit Etappe 5 D weitere **286 px**
(Inspektor einklappbar, 320 → 34).

**Der Inspektor klappt nach rechts ein – dieselbe Mechanik wie die
Werkzeugleiste, aber MIT `localStorage`** (`webMapEditor.inspectorCollapsed`).
Anders als beim Behelfsschalter der Seitenleiste ist das ein dauerhafter
Wunsch: wer breit arbeiten will, will das auch nach dem nächsten Start.

Zwei Unterschiede zur Leiste, beide beabsichtigt:

- **Keine erzwungene Enge.** Die Leiste klappt unter 1000 px von selbst ein,
  weil sie dann nur noch Symbole zeigt. Der Inspektor trägt Eingabefelder und
  Knöpfe, die nicht auf Symbolgröße schrumpfen können – er bleibt allein die
  Entscheidung des Nutzers.
- **Eingeklappt bleibt ein 34-px-Streifen mit dem Umschalter**, statt ihn ganz
  auszublenden. Der Knopf müsste sonst anderswo auftauchen, und ein
  Bedienelement, das den Ort wechselt, ist schwerer zu finden als eines, das
  bleibt. Der Umschalter sitzt aus demselben Grund im Kopfblock und nicht am
  Rand: er behält beim Einklappen seinen Platz.

Ausgeblendet wird der **Inhalt**, nicht nur die Breite – eine schmale Spalte,
die ihren Inhalt überlaufen lässt, zeigte ihn weiterhin an. Der Test sichert
zu, dass im eingeklappten Zustand genau **ein** Tabstopp übrig bleibt: der
Umschalter selbst.

**Die drei festen Rasterspalten stehen als Variablen an `.app`**
(`--sidebar-col`, `--rail-col`, `--inspector-col`), nicht als eigene Regel je
Kombination. Mit drei unabhängig einklappbaren Bereichen gäbe es sonst acht
Regeln, die alle dasselbe Raster wiederholen – und die achte vergisst
irgendwann jemand. `main` hat damit genau **eine** Rastervorlage; die
Seitenleiste braucht weiterhin eine zweite mit **drei** Spalten, weil
`display:none` sie aus der Rasterzuordnung nimmt und die übrigen sonst eine
Spalte nach vorn rutschen.

**Die Rasterspalten sind fest, nicht `auto`.** Ein `auto`-Track nimmt sich
seine max-content-Breite, sobald Platz frei wird – beim Einklappen der
Seitenleiste wuchs die Spalte der Werkzeugleiste von 168 auf 659 px und fraß
den Gewinn auf.

**Zwischenstand-Schalter der Seitenleiste:** `#sidebarToggle` ist der Behelf
für die Zeit, in der Seitenleiste und Inspektor gleichzeitig stehen, und
**entfällt mit Etappe 6**. Bewusst **ohne** `localStorage`: der Zustand ist
vorübergehend und soll nicht in eine spätere Ausgabe überleben.

**Werkzeugleiste:** Senkrecht links neben der Karte, Icon **und** Text. Drei
Gruppen, und die Trennung trägt die nützlichste Information, die eine
Werkzeugleiste überhaupt transportieren kann: **was die Karte verändert und was
nicht.**

| Gruppe | Inhalt |
|---|---|
| Auswählen | Zeiger, Rahmen, Lasso |
| Zeichnen | Exclusion, Kreis, Rechteck, Search Wire, Dockpfad |
| Prüfen | Messen, Karte prüfen |

„Prüfen" bleibt eine eigene Gruppe, auch mit nur zwei Einträgen – Messen gehört
nicht zu „Zeichnen", weil es die Karte nicht anfasst. Die Gruppe füllt sich,
sobald die Mähbahnen-Vorschau kommt.

**Die Beschriftungen sind kurz, weil die Gruppenüberschrift das Verb trägt:**
unter „Zeichnen" heißt der Knopf „Exclusion", nicht „Exclusion zeichnen". Der
vollständige Satz steht weiterhin im `title`. Das ist die eine Umbenennung mit
Gewinn; sonst gilt weiterhin, dass Beschriftungen beim Umzug wortgleich
bleiben.

**Nicht in der Leiste:** Begradigen, Reduzieren und Rechtwinklig. Sie hängen an
der Auswahl und gehören in den Inspektor. Bis Etappe 5 liegen die drei
vorhandenen Knöpfe weiter auf der Karte – ein Zwischenstand muss benutzbar
bleiben.

**Breitenstufen, und warum sie so aussehen:** Eine senkrechte Leiste ist immer
so breit wie ihre **längste Beschriftung**. Einer einzelnen Gruppe den Text zu
nehmen spart deshalb keine Breite, sondern Höhe. Daraus folgen drei Stufen:

| ab | Verhalten | Breite |
|---|---|---|
| 1100 px | alles mit Text | 168 px |
| 1000 px | Auswahlwerkzeuge als waagerechte Dreierreihe ohne Text | 168 px |
| darunter | alles nur Symbole | 56 px |

Die Auswahlwerkzeuge verlieren ihren Text zuerst, weil sie **Modi** sind, die
man dauerhaft sieht und schnell wechselt – die kennt man nach einer Woche am
Symbol. Die Zeichenwerkzeuge benutzt man selten und muss sie treffen. Der
`title` bleibt in jeder Stufe erhalten: verschwinden darf der Platz der
Erklärung, nicht die Erklärung.

**Gesperrt wird mit Grund, nicht mit `disabled`.** Die fünf Zeichenknöpfe der
Leiste tragen kein natives `disabled`, sondern `aria-disabled`, die Klasse
`is-unavailable` und ihren Ablehnungsgrund in `data-blocked-reason`;
`runToolAction()` gibt ihn beim Klick in die flüchtige Meldungszeile aus.

Der Grund ist gemessen, nicht vermutet: ein deaktivierter Knopf schluckt jedes
Zeigerereignis – weder `click` noch `pointerdown` erreichen ihn oder seinen
Container –, sein `title` erscheint auf Touch nie und am Desktop erst nach
Verzögerung. Genau das war der Befund beim Durchklicken von Etappe 3: „Search
Wire zeichnen" blieb dauerhaft grau, weil die Karte bereits eine hat, und
nichts sagte das. **Die Freigabelogik war dabei korrekt** – nachgemessen über
vier Kartenvarianten; kaputt war nur die Erklärung, seit der Knopf ohne seine
Nachbarn „verlängern" und „löschen" in der Leiste steht.

Die Knöpfe der Seitenleiste behalten das native `disabled`: sie stehen in
ihrer Gruppe, dort erklärt sich der Zustand aus den Nachbarn.

**Abschließen hat EINE Bedingung: `canFinishFeatureDrawing()`.** Sie versorgt
den Abschluss-Knopf, Enter und den Doppelklick. Vorher zählte der Enter-Pfad
die Modi einzeln auf (`"exclusion"` oder `"searchwire"`) – der Docking-Pfad
fehlte dort seit dem ersten Upload. Wirksam wurde die Lücke erst, als Etappe 1b
die automatische Fertigstellung nach dem dritten Punkt entfernte; sichtbar
wurde sie, als Etappe 3 den Startknopf in die Leiste holte und den Abschluss in
der Seitenleiste zurückließ. **Keine Modus-Aufzählung mehr einführen** – sie
kann einen künftigen Modus wieder vergessen.

**Eine Zeichnung endet auf drei Wegen**, und alle drei laufen über
`finishFeatureDrawing()`:

- **Enter** – jederzeit, ohne Modus-Aufzählung.
- **Doppelklick auf die Karte** – sonst passt der Doppelklick die Ansicht ein.
  Der zweite Klick der Geste hat da schon einen Punkt gesetzt; er wird im
  `dblclick`-Handler wieder entfernt. **Ihn beim Klicken zu unterdrücken
  funktioniert nicht:** Punkte entstehen auf `pointerdown`, und
  `PointerEvent.detail` ist in Chrome 0 – eine Abfrage auf `detail >= 2` greift
  dort nie. Nachgemessen, nicht vermutet. Beim Verlängern bleibt der Bestand
  unangetastet.
- **Klick auf den ersten Punkt** – **nur bei der Exclusion**, und erst ab drei
  Punkten. Search Wire und Docking-Pfad sind offene Linien; dort wäre ein
  geschlossener Ring falsch, und ein Treffer auf den ersten Punkt setzt
  bewusst einfach einen weiteren Punkt. Das ist eine Entscheidung, keine
  Auslassung.

  Der Fangabstand `DRAW_CLOSE_SNAP_PIXELS` (12) gilt in **Bildschirmpixeln**,
  nicht in Metern: ein Fangradius in Metern wäre beim Hineinzoomen unbedienbar
  groß und beim Herauszoomen nicht zu treffen. Dafür gibt es `worldToScreen()`
  als Umkehrung von `screenToWorld()`.

**Ausgeblendet wird über `hidden`, und `[hidden]` trägt `!important`.** Die
Browser-Vorgabe `[hidden]{display:none}` hat dieselbe Spezifität wie eine
Klassenregel, und Autorenregeln gewinnen gegen die Vorgabe: eine harmlose Zeile
wie `.inspector-block { display:flex; }` macht einen ausgeblendeten Block
wieder sichtbar, **während `element.hidden` weiterhin `true` meldet**. Genau das
ist beim Bau des Inspektors passiert – beide Zustandsblöcke standen
gleichzeitig da.

Daraus folgen zwei Regeln: die globale `!important`-Zeile nicht entfernen, und
**Sichtbarkeit im Test immer über den berechneten Stil prüfen, nie über das
Attribut**. Eine Zusicherung auf `element.hidden` hätte den Fehler nicht
gesehen – dieselbe Klasse wie „eine Zusicherung über ein Ausbleiben beweist
nichts".

**Der Kopfblock ist in jedem Zustand vorhanden, gleich hoch und am selben
Ort.** Er ist der Anker, der beim Auswählen nicht wandert; ohne ihn springt der
ganze Inspektor bei jedem Klick auf die Karte. Der Test sichert Höhe und
Position über den Zustandswechsel hinweg zu.

**Die Punktnummer ist behälterlokal.** `getVertexContainerInfo()` zählt
innerhalb eines Rings bzw. einer Linie, nicht über das ganze Feature. Deshalb
nennt die zweite Kopfzeile den Behälter – aber **nur, wenn es mehr als einen
gibt** (`describeVertexContainer()`): „Exclusion #0 · Ring 2 von 2",
„Search Wire · Linie 2 von 3", „Exclusion #0 · Teil 2 von 3, Ring 1". Bei einem
gewöhnlichen Polygon steht schlicht „· Polygon".

Eine durchgehende Nummerierung über das Feature wäre die schlechtere Wahl: die
Indizes, mit denen der Editor rechnet, sind behälterlokal, und eine Anzeige,
die anders zählt als der Code, ist eine Falle.

**Tastaturbedienung beim Verschieben von Markup:** Der Enter-Handler der
E/N-Felder hängt an den IDs, nicht am Ort, und überlebt den Umzug – die Datei
enthält kein `<form>` und **kein einziges `tabindex`**, die Tab-Reihenfolge
folgt also reiner DOM-Reihenfolge. Sie ändert sich durch den Umbau gewollt:
Kopfzeile → Werkzeugleiste → Karte → Inspektor → Seitenleiste. Der Test
sichert Enter, die Reihenfolge innerhalb des Blocks und die Abwesenheit von
Tabstopps im ausgeblendeten Block zu.

**Der Inspektor ist festes Markup mit stabilen IDs.** Abgeleitet ist nur,
**welcher Zustandsblock sichtbar ist**, und der veränderliche Text darin – der
Zustand selbst wird bei jedem Aufruf neu berechnet, wie `getSelectedSection()`
und `getActiveOriginConflict()`, und nirgends zwischengespeichert.

**Sieben Zustände, und die Reihenfolge der Prüfungen in `getInspectorState()`
ist die Rangfolge:** ein laufendes Werkzeug schlägt jede Auswahl.

| Zustand | Bedingung | sichtbare Blöcke |
|---|---|---|
| `drawing` | `featureDrawState` gesetzt | `#inspectorDraw` |
| `measuring` | Messung läuft oder hält Punkte | `#inspectorMeasure` |
| `empty` | keine Auswahl | `#inspectorEmpty` |
| `mixed` | Punkte aus mehreren Features | `#inspectorMixed` + `#inspectorSelection` |
| `single` | **genau ein** Punkt | `#inspectorPoint` + `#inspectorSelection` |
| `feature` | alle Punkte genau eines Features | `#inspectorMulti` + `#inspectorFeature` + `#inspectorSelection` |
| `multi` | mehrere Punkte eines Features | `#inspectorMulti` + `#inspectorSelection` |

`#inspectorTransform` (Umformen) und `#inspectorValidation` (Kartenprüfung)
stehen in **jedem** Zustand. Das ist Absicht: wer die drei Umformwerkzeuge nur
sähe, wenn sie schon gehen, erführe nie, was er dafür tun müsste. Jedes trägt
deshalb seinen Grund in einem eigenen `.tool-reason`-Feld unter sich.

**Vorhanden zu sein und ausgeklappt zu sein sind zwei verschiedene Dinge.**
Beide Blöcke sind `<details>` und **standardmäßig zu**. Dauerhaft offen
brauchten sie zusammen mehr Höhe, als die 320-px-Spalte bei 1000 px
Fensterhöhe hat – die Spalte musste scrollen, und das ist schlechter als
beides. Die Regel „in jedem Zustand sichtbar" richtete sich gegen das
*Verschwinden*, nicht gegen das Einklappen.

Zugeklappt trägt die Kopfzeile das Wichtigste in einer Zeile:

| Block | Kopfzeile zugeklappt |
|---|---|
| Umformen | welche der drei Werkzeuge gerade gehen (`updateTransformShortText()`) |
| Kartenprüfung | die Kurzform aus `validationShortText()`, dieselbe Quelle wie die Statuszeile |

**Sie klappen NIE von selbst auf.** Wird ein Werkzeug ausführbar oder findet
die Prüfung neue Fehler, ändert sich die Kopfzeile – der Block bleibt zu.
Selbsttätiges Aufklappen wäre genau die Unruhe, gegen die der feste Kopfblock
gebaut wurde. Der Auf-/Zu-Wunsch steht in `localStorage`
(`webMapEditor.inspectorTransformOpen`, `webMapEditor.inspectorValidationOpen`),
damit man ihn einmal einstellt.

`restoreInspectorFolds()` läuft **einmal beim Start, nicht in `initialize()`** –
die Funktion hängt Listener an, und `initialize()` wird beim Dateiladen und
beim Zurücksetzen erneut aufgerufen.

**Die Kurzform „Umformen" besteht aus einzelnen Marken, nicht aus einem
zusammengesetzten Satz.** „Begradigen · Reduzieren" als ein Textknoten wäre
für die Übersetzung ein Ersetzungsmuster mit deutschem `$1`; als eigene
`<span>`-Elemente wird jede Marke ganz normal übersetzt. Das Trennzeichen setzt
CSS über den allgemeinen Geschwisterwähler, damit nie ein führendes „·"
dasteht.

**Gemessen (1600 px breit), Spaltenhöhe gegen Inhalt**, ungünstigster Fall des
Punktzustands (Startpunkt, Rolle also sichtbar):

| Fensterhöhe | ausgeklappte Blöcke, Etappe 5 B | + `#pointMeta` gekürzt | + Knöpfe zweispaltig |
|---|---|---|---|
| 1000 px | passt | passt | **passt** |
| 900 px | scrollt (+36) | passt | **passt** |
| 800 px | scrollt (+136) | scrollt (+76) | **passt** |

Zwei Schritte, beide ohne Informationsverlust: die Kürzung von `#pointMeta`
brachte 60 px, die zweispaltigen Knöpfe weitere 76.

**Das Höhenziel lautet: bis 900 px Fensterhöhe scrollfrei, darunter darf die
Spalte scrollen.** Nicht „keine Fenstergröße scrollt" – das war die Fassung bis
Etappe 6 b3 und ist mit der Fahrtrichtung im Punktzustand aufgegeben worden.
Der Überlauf bei 800 px ist damit der **zugelassene** Fall, kein Zielverlust.

**Der verbindliche Wert ist: 20 px Reserve bei 900 px.** Das ist die Zahl, die
der nächste Block schlagen muss, der in den Punktzustand will. Gemessen mit
ausgewähltem Startpunkt (Rolle sichtbar), 1600 px breit, deutsch und englisch
identisch:

| Fensterhöhe | Spalte | Inhalt | Reserve |
|---|---|---|---|
| 1000 px | 859 | 739 | 120 px |
| 900 px | 759 | 739 | **20 px** |
| 800 px | 659 | 739 | −80 px, zugelassen |

**Gemessen wird als Summe der Blöcke plus Lücken plus Polsterung – nicht über
`scrollHeight`.** `scrollHeight` wird auf `clientHeight` geklemmt, solange der
Inhalt passt, und meldet dann fälschlich „Reserve 0". Wer damit misst, hält
eine Spalte mit 120 px Luft für randvoll.

**Die Fahrtrichtung des ausgewählten Punktes steht im Punktzustand, die
Mähergröße im Mäherfenster** – die Box aus der Seitenleiste ist mit Etappe 6 b3
geteilt worden. Erwogen und verworfen war, sie ganz im Fenster zu lassen: das
hätte das 800-px-Ziel gerettet, aber die Beschreibung des Ausgewählten von dem
Ort getrennt, an dem das Ausgewählte beschrieben wird. Das Ziel verlangt diesen
Preis nicht – es lautet „bis 900 px", und dort passt es. Die id blieb beim
Richtungsteil, weil sie ihn benennt (`mowerOrientationInfo`); die Größe hat
eine eigene bekommen (`mowerSizeInfo`) statt einer geerbten.

Der Fall „beide Faltblöcke aufgeklappt" ist ausdrücklich **kein** Ziel: wer
beide öffnet, will ihren Inhalt sehen und scrollt dafür. Genau deshalb sind
sie einklappbar.

**Der Tooltip erklärt, er benennt nicht.** „Linie begradigen" als `title` auf
einem Knopf, der „Linie begradigen" heißt, sagt nichts – wer den Knopf sieht,
hat die Beschriftung schon gelesen. Die drei Umformwerkzeuge tragen deshalb in
`TRANSFORM_TOOL_HELP` je einen Satz, der die **Wirkung** beschreibt: welche
Punkte sich bewegen, welche bleiben, und was ausdrücklich *nicht* geschieht
(kein Punkt entfernt, keine Ausrichtung auf East/North).

**Der Tooltip ist immer derselbe, auch wenn das Werkzeug gesperrt ist.** Der
Ablehnungsgrund steht stattdessen sichtbar unter dem Knopf im
`.tool-reason`-Feld – im Tooltip erschiene er auf einem Touchgerät nie.
Dieselbe Regel gilt seit Etappe 3 für die Zeichenknöpfe der Werkzeugleiste.

**Ein Block kann zu mehreren Zuständen gehören.** `INSPECTOR_BLOCKS` ist
deswegen eine Liste aus `{id, states}` und keine Zuordnung Zustand → Block:
die Auswahlaktionen („Auswahl löschen", „Auswahl aufheben") gelten in allen
vier Auswahlzuständen, und sie zu kopieren wäre eine doppelte id.

**Der Kopfblock darf nie etwas anderes sagen als der Block darunter.** Bis
Etappe 5 war `getInspectorState()` schlicht `selectedVertex ? "single" :
"empty"` – und weil `selectedVertex` bei einer Gruppe weiterhin den zuletzt
angeklickten Punkt hält, behauptete der Kopf „Punkt 138 von 208", während
darunter „2 Punkte ausgewählt" stand. Deshalb gilt: **`single` heißt genau ein
Punkt**, und die Quelle ist `getEffectiveSelectedVertices()`, nicht
`selectedVertex`.

**Weglassen oder Gedankenstrich – zwei verschiedene Fälle, und die
Unterscheidung ist der eigentliche Inhalt der Regel.** Wer sie zu „nie einen
Strich zeigen" verkürzt, macht die Anzeige wieder unehrlich:

| Fall | Anzeige | Beispiele |
|---|---|---|
| Der Wert **existiert für diesen Typ nicht** | **Zeile weglassen** | `idx` bei einem Perimeter, Fläche bei einer Linie, „Exclusion duplizieren" bei einem Nicht-Exclusion, Punktrolle „Zwischenpunkt" |
| Der Wert **existiert, ist aber gerade nicht zu ermitteln** | **„–"** | Fläche bei unbekanntem Maßstab, Maßstab ohne geladene Karte |

Ein Gedankenstrich ist eine Aussage: „hier gehört ein Wert hin, den ich dir
gerade nicht nennen kann." Bei einem Perimeter gehört dort kein `idx` hin –
die Zeile zu zeigen behauptete eine Lücke, wo keine ist. Umgekehrt wäre es
genauso falsch, eine Flächenzeile bei unbekanntem Maßstab wegzulassen: die
Fläche gibt es, sie ist nur nicht berechenbar, und das Verschwinden der Zeile
verschwiege die Einschränkung.

Betroffen sind `#featureAreaRow`, `#featureIdxRow`, `#duplicateFeatureBtn` und
`#pointMeta`; das Prinzip gilt für jede künftige Kennzahl.

Das widerspricht dem festen Kopfblock nicht: **der Kopfblock bleibt fest, die
Kennzahlen darunter dürfen sich in der Zahl unterscheiden.**

**Die Punktknöpfe stehen zweispaltig, „Punkt löschen" allein.** Davor/danach
und Start/Ende sind **Paare**; fünf gleich breite Zeilen behaupteten dagegen
fünf gleichrangige Aktionen. Löschen bleibt einzeln über die volle Breite,
weil es die einzige zerstörende Aktion im Block ist und nicht wie ein
Paarpartner aussehen soll.

**Zweispaltig unabhängig von der Fensterhöhe.** Eine Anordnung, die nur unter
900 px erschiene, würde nie durchgeklickt und beim nächsten Umbau vergessen.

Die **Tab-Reihenfolge folgt den Paaren** – davor, danach, Start, Ende, löschen
–, weil sie bei einem zweispaltigen Raster die DOM-Reihenfolge ist. Genau das
kann eine spätere Umsortierung im Markup oder ein `order`/`grid-area` in CSS
lautlos zerreißen; der Test hält die Kette fest.

**Die Spalte ist 139 px breit** – gemessen, nicht gerechnet: 320 minus
Polsterung, minus 12 px Rollbalken, minus Abstand, halbiert. Der schmale Fall
(mit Rollbalken) ist der, der halten muss.

Zwei Schritte waren nötig, damit die **deutschen** Beschriftungen
hineinpassen – Knöpfe tragen `white-space:nowrap`, ein zu langer Text liefe
still über den Rand:

1. **Beschriftungen gekürzt** – „Punkt davor einfügen" → „Davor einfügen",
   „Punkt danach einfügen" → „Danach einfügen", „Als Startpunkt setzen" →
   „Startpunkt setzen", „Als Endpunkt setzen" → „Endpunkt setzen". Das Wort
   „Punkt" stand viermal da, wo ohnehin nur ein Punkt gemeint sein kann. Der
   Erklärtext, der den Knopf beim Namen nennt, ist mitgezogen.
2. Das reichte nicht: bei der geerbten Schriftgröße von 16 px fehlten
   weiterhin 4 bis 8 px. **Diese vier Knöpfe tragen deshalb 14 px**, „Punkt
   löschen" behält die normale Größe. Das kostet keine Information, während
   die naheliegende Alternative („Start setzen" statt „Startpunkt setzen")
   einen im Editor definierten Begriff verwässert hätte – „Startpunkt" steht
   so in der Legende und in der Rollenanzeige.

Bei 14 px bleiben 8 bis 23 px Luft, englisch 32 bis 51; Englisch passte schon
bei 16 px. **Der Test misst die Eigenbreite einer Kopie mit
`width:max-content`** und vergleicht sie mit der tatsächlichen Breite –
`scrollWidth` meldet den Überlauf bei `overflow:visible` nicht, und eine Kopie
außerhalb von `#inspectorPoint` muss Schrift und Polsterung vom Original
übernehmen, sonst misst man 16 px statt der echten 14.

**`#pointMeta` trägt nur noch die Punktrolle.** Bis Etappe 5 wiederholte es
Punktnummer, Feature und Geometrietyp – also genau das, was der feste
Kopfblock seit Etappe 4 sagt; ihn einzuführen und die Wiederholung stehen zu
lassen war ein halber Umbau. Übrig bleibt eine Zeile, und die nur für
**Startpunkt und Endpunkt** (`SHOWN_POINT_ROLES`): das sind die beiden Rollen,
die der Editor tatsächlich anders behandelt – grün bzw. rot auf der Karte,
eigene Knöpfe zum Neuvergeben. „Zwischenpunkt" ist der Normalfall,
„Einzelpunkt" steht bereits als „· Punktmenge" im Kopfblock.

**Ein leeres Feld sagt, warum es leer ist.** Die E/N-Felder werden bei einer
Mehrfachauswahl bewusst geleert und gesperrt – das ist richtig, sah aber wie
ein Fehler aus, weil der Grund nur weiter unten in `#pointMeta` stand. Sie
tragen jetzt einen `placeholder` („mehrere Punkte ausgewählt", „kein Punkt
ausgewählt"), der beim Auswählen eines einzelnen Punktes wieder verschwindet.

**Der Prüfbericht liegt im Inspektor, die Kurzform in der Statuszeile.** Ein
Befund, dem sich ein Feature zuordnen lässt, ist ein `<button>` und springt es
an (`selectWholeFeature()`); die übrigen bleiben `<div>`. Knöpfe statt divs mit
Klick-Handler, damit sie mit der Tastatur erreichbar sind.

Die Zuordnung entsteht in `findValidationTarget()` **aus dem Text**, und das ist
eine Abwägung: die Prüfung hat 49 Fundstellen, die alle Zeichenketten liefern,
und jede um eine Feature-Nummer zu erweitern hieße, die durchgerechnete
Geometrieprüfung für eine Anzeigefrage anzufassen. Erkannt werden die drei
Schreibweisen, die tatsächlich vorkommen: „Feature 7: …", „Perimeter 2: …" und
der Anzeigename aus `describeFeature()`. **Ein Anzeigename zählt nur, wenn er
eindeutig ist** – lieber kein Sprung als der falsche.

**Das Markup wird NICHT bei jedem Auswahlwechsel neu erzeugt.** Die
Eingabefelder ziehen aus der Seitenleiste in den Inspektor um – verschoben,
nicht kopiert, damit keine ID doppelt existiert –, und ein Neuaufbau würde sie
bei jedem Klick zerstören: der Fokus ginge mitten im Tippen verloren, ohne dass
irgendetwas gewonnen wäre. Die i18n-Wege aus Etappe 0 gelten unverändert für
die dynamischen Texte.

**Der Mauszeiger zeigt das aktive Werkzeug** (`updateMapCursor()`): Fadenkreuz
für alles, was auf die Karte zielt – Rahmen, Lasso, jedes Zeichenwerkzeug,
Messen –, sonst die Greifhand, weil sich die Karte mit dem Zeiger überall
schieben lässt. Über einem Punktmarker ein Verschiebe-Zeiger; beim Zeichnen
gewinnt das Fadenkreuz auch dort. Vorher stand fest `cursor:grab` am `svg`, die
Karte sah also mitten im Zeichnen nach „schieben" aus.

**Kein `not-allowed` über nicht bearbeitbaren Features.** Das war erwogen und
nach Prüfung verworfen: seit Etappe 1a haben sie weder Marker noch
Trefferfläche, man kann sie nur ansehen. Ein Verbotszeichen würde einen
Fehlerzustand behaupten, wo keiner ist.

**Gedämpft wird nur, was nicht aktiv ist.** Ein laufendes Werkzeug ist
gleichzeitig `active` und gesperrt – man soll es nicht neu starten können –,
und `opacity:.4` fraß seine Hervorhebung auf. Deshalb wirkte „Rahmen" kräftig
und ein laufendes Zeichenwerkzeug blass. Die Dämpfungsregeln tragen jetzt
`:not(.active)`, in der Leiste **und** bei den Seitenleistenknöpfen: „Search
Wire verlängern" und „Docking-Pfad verlängern" sind während des Verlängerns
ebenfalls beides zugleich.

**Nie `button.textContent` auf einem Knopf mit Symbol.** Das löscht das SVG
mitsamt der Beschriftung. `updateMeasurementUi()` tat genau das und hat den
Knopf beim Umzug entkernt; geschrieben wird jetzt in `.tool-label`. Gefunden
hat es der Browsertest, nicht die Syntaxprüfung.

**Entfallen:** der Knopf „Verschieben" auf der Karte. Er rief nur
`setSelectionTool("pointer")` und war damit reine Doppelung des Zeigers.

**Die Auswahlleiste liegt seit Etappe 5 nicht mehr auf der Karte.**
`#straightenSelectionBtn`, `#deleteMultiSelectionBtn` und
`#clearMultiSelectionBtn` sind in den Inspektor gezogen, `.map-selection-toolbar`
ist ersatzlos entfallen. Auf der Karte bleibt nur die Zoom-/Einpassen-Leiste –
die eine Gruppe ändert die Karte, die andere nur den Bildausschnitt. Ebenfalls
umgezogen: `#finishDrawBtn`, `#undoDrawPointBtn`, `#cancelDrawBtn`,
`#reduceApplyBtn`, `#rectifyApplyBtn`, `#clearMeasureBtn`, `#measureStatus`,
`#validationSummary` und `#validationReport`. **Verschoben, nicht kopiert** –
beim ersten Anlauf waren fünf ids doppelt vorhanden.

**Der Behelf in `startFeatureDrawing()` ist entfallen.** Er klappte den
Seitenleistenabschnitt „Features erstellen" auf, weil „Zeichnung abschließen"
und „Abbrechen" dort lagen, während die Zeichnung aus der Werkzeugleiste
startete. Seit Etappe 5 stehen die Knöpfe im Inspektor, direkt dort, wo
gearbeitet wird – der Behelf klappte danach einen Abschnitt auf, der mit dem
Zeichnen nichts mehr zu tun hat. Die dadurch verwaiste id
`featureCreateSection` ist ebenfalls weg.

**Der Zeichenzustand des Inspektors zeigt den Fortschritt**
(`describeDrawProgress()`), und zwar für alle vier Betriebsarten getrennt:

| Art | Fortschritt | Kopfblock |
|---|---|---|
| Exclusion | „2 von mindestens 3 Punkten gesetzt." | „2 Punkte gesetzt" |
| offene Linie, neu | dieselbe Form, Mindestzahl aus `OPEN_LINE_MODES` | ebenso |
| offene Linie, verlängern | „5 vorhandene + 2 neue Punkte." | ebenso |
| Kreis / Rechteck | „Mittelpunkt auf der Karte anklicken." | „Bezugspunkt setzen" |

**Formwerkzeuge zählen keine Punkte.** Ein Klick setzt den Bezugspunkt, die
Form entsteht sofort aus den Maßen – „0 Punkte gesetzt" wäre dort eine
Zählung, die nie über 0 hinauskommt.

**Die Mindestpunktzahl kommt aus `OPEN_LINE_MODES`, nicht aus einer zweiten
Aufzählung.** Eine Zahl, die an zwei Stellen steht, läuft auseinander; genau
daran hing schon einmal ein Knopf, der freigab, was das Werkzeug anschließend
ablehnte.

**Einklappen:** Der Umschalter oben in der Leiste schaltet zwischen 168 und
56 px; der Wunsch steht in `localStorage` unter
`webMapEditor.toolRailCollapsed`. **Denselben Zustand erzwingt ein Fenster
unter 1000 px**, und beide Wege laufen über dieselbe Klasse `.is-collapsed` –
es gibt deshalb nur eine Beschreibung des eingeklappten Aussehens und nicht
zwei, die auseinanderlaufen. Gesetzt wird sie in `applyToolRailState()`, nicht
per Medienregel.

Bei erzwungener Enge ist der Umschalter **gesperrt statt wirkungslos**, mit dem
Grund im Tooltip: ein Knopf, der sich drücken lässt und nichts tut, ist
schlimmer als einer, der sagt, warum er gerade nicht geht.

**Die Tooltips bleiben in jedem Zustand.** Verschwinden darf der Platz der
Erklärung, nicht die Erklärung.

**Zoom und Einpassen liegen bewusst in einer eigenen Leiste** an der Karte, nicht
zusammen mit Begradigen/Löschen/Auswahl-aufheben: die eine Gruppe ändert die
Karte, die andere nur den Bildausschnitt – dieselbe Trennung, die in der
Werkzeugleiste die Gruppen bildet. Dazu verschwindet die Auswahlleiste mit
Etappe 5 ganz von der Karte; eine Zusammenlegung wäre dann wieder
aufzutrennen. Sie trägt stattdessen nur noch Symbole.

## Kartenfarben

**Keine Farbe trägt zwei Bedeutungen.** Das ist die Regel, an der die ganze
Zuordnung hängt. Eine Farbe, die zweierlei heißen kann, ist keine Information
mehr – der Nutzer muss dann raten, und genau das soll eine Karte ihm abnehmen.

**Alle Kartenfarben stehen als Variablen an einer Stelle** (`:root`, Block
„KARTENFARBEN"), und **die Legende zieht dieselben Variablen wie die
Darstellung**. Vorher standen dieselben Farben zweimal: als Variable in der
Darstellung, als fester Hex-Wert im `style`-Attribut der Legende. Zwei Quellen
für dieselbe Farbe laufen auseinander, sobald jemand nur eine davon anfasst –
und eine falsche Legende ist schlimmer als gar keine.

`tools/test-statusbar.mjs` sichert das ab, und zwar über die **berechneten**
Werte: es liest den Farbtupfer der Legende und wendet daneben die zugehörige
Kartenregel auf ein Probe-Element an. Ein Vergleich der Quelltexte („beide
sagen `var(--map-perimeter)`") bewiese nichts – er ginge auch auf, wenn die
Variable gar nicht existiert. Welche Eigenschaft die Bedeutung trägt, steht am
Legendeneintrag (`data-legend`, `data-legend-prop`): bei den Formen der Strich,
bei den Punktrollen die Füllung. Sie zu raten ginge schief, denn der dunkle
Rand eines Startpunktes ist auch eine Farbe, nur nicht die gemeinte.

| Variable | Wert | Bedeutung |
|---|---|---|
| `--map-perimeter` | `#43df84` | Perimeter |
| `--map-exclusion` | `#ff6c78` | Exclusion |
| `--map-dock` | `#5fb3ff` | Docking-Pfad |
| `--map-searchwire` | `#ba8cff` | Search Wire |
| `--map-other` | `#5db9ff` | nicht unterstützter Typ |
| `--map-start` | `#5ee58a` | Startpunkt |
| `--map-end` | `#ff7474` | Endpunkt |
| `--map-selection` | `#ffd166` | **Auswahl**, und nur das |
| `--map-selection-group` | `#61d8ff` | weitere Punkte derselben Auswahl |
| `--map-ghost` | `#b9cce1` | Stand seit dem letzten Speichern |
| `--map-origin` | `#95a7bf` | Ursprungskreuz – fester Bezug, kein Zustand |

### Angleichung an MapmakerBT

Perimeter, Exclusion und Docking-Pfad sind aus
[`Algo-giti/MapmakerBT`](https://github.com/Algo-giti/MapmakerBT) übernommen,
Datei `styles.css` auf dem Default-Branch **`main`**. Beim Nachschlagen
beachten: dort stehen **drei** `:root`-Blöcke übereinander (hell,
`prefers-color-scheme: dark`, und ein unbedingtes „v6 — technical dark
field-console theme"), und die Kartenregeln überschreiben die Variablen danach
noch einmal mit festen Werten. **Maßgeblich ist der letzte Block, nicht der
erste.**

Zwei bewusste Abweichungen – **Entscheidungen, keine Versäumnisse:**

- **Search Wire bleibt violett** (`#ba8cff`), MapmakerBT verwendet Amber
  `#d7a24a`. Amber liegt im selben Farbton wie unser Auswahlgelb `#ffd166`;
  wir tauschten eine Doppelbelegung gegen die nächste. Violett ist im ganzen
  Editor sonst nirgends vergeben. Wer Amber will, muss vorher die Auswahlfarbe
  von Gelb wegnehmen – das ist eine eigene Entscheidung.
- **Die Punktfüllung bleibt hell.** MapmakerBT füllt Punkte dunkel (`#071012`)
  und färbt nur den Ring. Bei uns trägt die **Füllung** die Punktrolle –
  Startpunkt grün, Endpunkt rot, sonst weiß. Mit dunkler Füllung wäre diese
  Unterscheidung weg, und MapmakerBT kennt kein Start/Ende, kann uns dazu also
  nichts sagen.

**Startpunkt, Endpunkt und der ausgewählte Mäher lassen sich nicht
angleichen** – diese Begriffe existieren in MapmakerBT nicht. Dafür werden
keine „MapmakerBT-Werte" erfunden.

### Wie die Dreifachbelegung von Gelb aufgelöst wurde

Gemessen, nicht geschätzt: ein Browserlauf hat alle gelb gezeichneten Elemente
im SVG aufgelistet. Gelb `#ffd166` trug **sechs** Bedeutungen, nicht drei:
Docking-Pfad, Ursprungskreuz, Vergleichslinie, Mäher, Auswahlring und das
Glühen eines ganz ausgewählten Features.

| Bedeutung | vorher | jetzt |
|---|---|---|
| Docking-Pfad | gelb | **blau** `--map-dock` |
| Ursprungskreuz | gelb | **neutral** `--map-origin` |
| Vergleichslinie | gelb | **Ghost-Familie** `--map-ghost` |
| Auswahlring, Feature-Glühen, Mäher | gelb | gelb – *eine* Bedeutung |

**Auswahlring und Mäher dürfen dieselbe Farbe tragen, weil sie nie
gleichzeitig erscheinen.** Die Mähervorschau **ersetzt** den Marker des
ausgewählten Punktes (`mowerReplacesPoint` in `renderGeometry()`); ist sie an,
existiert kein `circle.selected`. Nachgemessen: mit Mäher null gelbe
Auswahlringe, ohne Mäher genau einer. Sie sind zwei Darstellungen **derselben**
Bedeutung „hier ist die Auswahl", nicht zwei Bedeutungen.

Die reale Überlagerung war eine andere und ist jetzt weg: ein **ausgewählter
Dock-Punkt** setzte den gelben Mäher exakt auf die gelbe Dock-Linie – gleiche
Farbe, gleiche Stelle, zwei verschiedene Dinge.

### Offen, Farbrunde 2

- **Die Gruppe „gerade in Arbeit" borgt sich weiterhin die Auswahlfarben.**
  Betroffen sind der zweite Messpunkt, die Zeichenvorschau und die
  Merge-Vorschau (gelb) sowie Messlinie und Vorschau-Zeiger (cyan). Das
  verstößt gegen die Regel oben. Sie stehen deshalb bewusst weiter als feste
  Hex-Werte im CSS, mit einem Kommentar an der Stelle – eine Variable würde die
  Frage für beantwortet ausgeben. **Vorschlag:** ein eigener Ton für „in
  Arbeit", oder die Vorschau nimmt die Farbe des Typs an, der gerade entsteht,
  und das „in Arbeit" trägt allein die Strichelung. Beides ist eine
  Entscheidung, keine Ableitung.
- **Strichbreiten und Leuchten:** MapmakerBT zeichnet etwa doppelt so kräftig
  (Perimeter 5, Exclusion 4, Dock 5, Search Wire 4, Punktrand 4 gegen unsere
  2,2 / 2,0 / 2,6 / 2,4 / 1,4) und legt auf jede Form ein
  `filter: drop-shadow(...)` in ihrer eigenen Farbe. Zurückgestellt: das ist
  eine Frage des Erscheinungsbildes, keine der Bedeutung.
- **Strichbreiten und Leuchten** siehe oben – zurückgestellt.

### Gestrichelt heißt: existiert physisch nicht

**Die Search Wire ist gestrichelt, der Docking-Pfad ist durchgezogen** – und
das ist die Bedeutung dahinter:

| Linie | Darstellung | warum |
|---|---|---|
| Search Wire | gestrichelt `7 5` | ein **virtueller** Draht. Er liegt nirgends im Garten; CaSSAndRA benutzt ihn nur für die Wegfindung, und in der Sunray-Firmware kommt er überhaupt nicht vor (belegt in Abschnitt 5, „Warum es nur EINE Search Wire gibt"). |
| Docking-Pfad | durchgezogen | ein Weg, den der Mäher **tatsächlich abfährt**. |
| Perimeter, Exclusion | durchgezogen | reale Grenzen im Garten. |

**MapmakerBT macht es genau umgekehrt** (Docking-Pfad gestrichelt `12 9`,
Search Wire gestrichelt `5 8` – dort ist beides gestrichelt). Wir übernehmen
das **nicht**. Nicht übernehmen, was anders ist, nur weil es anders ist: die
Regel oben trägt eine Information, und die geben wir nicht auf, um einer
fremden Datei zu gleichen.

**Zur Ehrlichkeit dazu: die Regel war nicht dokumentiert und ist auch nicht
rekonstruiert.** Die Strichelung steht seit dem allerersten Upload
(`e3da676`) unverändert in der Datei, ohne Kommentar und ohne Erwähnung in
irgendeiner Doku – nachgesehen in CLAUDE.md, AGENTS.md, beiden Changelogs,
beiden READMEs und der Git-Historie. Sie ist also **nicht** als Begründung
vorgefunden worden, sondern **hier und jetzt entschieden**; sie erklärt den
Bestand gut, aber niemand hat ihn damals so gemeint. Wer sie später ändern
will, ändert damit eine Entscheidung, nicht einen Zufall.

Daraus folgt für neue Linienarten: **durchgezogen, wenn es das Ding im Garten
gibt; gestrichelt, wenn es nur in der Software existiert.**

**`vector-effect: non-scaling-stroke` gilt jetzt auch für die Formen**, nicht
nur für Punkte und Mäher. Ohne das wächst die Strichbreite beim Hineinzoomen
mit, und zwei gleich dicke Linien sehen bei verschiedenem Zoom verschieden
dick aus – das ist ein Fehler, keine Geschmacksfrage.

---

**Legende:** Eine Reihe über die volle Breite, direkt über der Statuszeile,
**immer offen und kein `<details>`**. Vorher lag sie eingeklappt über der Karte
und war damit genau dann nicht da, wenn man die Farben braucht.

Feste Höhe (30 px), damit eine schmale Ansicht das Kartenfeld nicht
verschiebt. Wird es zu eng, **schiebt sich die Reihe waagerecht statt
umzubrechen** – ein Umbruch würde die Karte um eine weitere Zeile
verkleinern, und zwar dauerhaft, nicht nur solange man hinsieht. Zusammen mit
der Statuszeile kostet der untere Rand 64 px.

**Verbinden und Singletons:** Docking-Pfad und Search Wire gibt es pro Karte
nur einmal. Beim Verbinden werden aus Karte B **nur** Exclusions und Features
unbekannten Typs angehängt; die beiden Singletons laufen über
`mergeSingletonFeatures()`. Leere Platzhalter entfallen, ein befüllter Pfad
gewinnt unabhängig davon, aus welcher Karte er stammt, und **zwei befüllte
Pfade sind ein Konflikt**, der das Verbinden sperrt – still einen wegzuwerfen
wäre falsch. Aufgelöst wird er, indem der Nutzer einen der beiden vorher
löscht.

„Leer" heißt dabei genau das, was die Kartenprüfung als Platzhalter durchgehen
lässt: keine oder null Koordinaten. Ein Docking-Pfad mit einem einzigen Punkt
ist nicht leer, sondern fehlerhaft, und geht deshalb in den Konflikt – so sieht
der Nutzer den Fehler, statt ihn zu verlieren.

Features unbekannten Typs werden bewusst aus beiden Karten angehängt statt
zusammengeführt: der Editor weiß nichts über sie, und Wegwerfen wäre schlimmer
als Verdoppeln.

**Ganze Features verschieben:** Unterstützt für Exclusion, Search Wire,
Docking (Ziehen direkt an der Geometrie). Der komplette Perimeter ist
absichtlich **nicht** direkt draggable, um versehentliches Verschieben zu
vermeiden – nicht ohne explizite Anfrage ändern.

**Docking-Pfad:** Optional, offener `LineString`, maximal einer pro Karte.
Kein Docking-Feature oder leerer Platzhalter → nur Warnung. **Ein einzelner
Punkt → Fehler. Ab 2 Punkten gültig, ohne Obergrenze.** Eine Punktzahl
ungleich 3 erzeugt lediglich einen Hinweis auf die übliche Praxis, keinen
Fehler – die Karte ist nicht mangelhaft. Ein vorhandener Pfad kann wie die
Search Wire am Ende verlängert werden; einzelne Punkte lassen sich wie bei
jeder anderen Linie löschen, solange 2 übrig bleiben.

Die frühere Regel „exakt 3 Punkte" war eine **Eigenerfindung des Editors**.
Sie ist gegen beide Quellen widerlegt:

- **CaSSAndRA**, `CaSSAndRA/src/backend/data/mapdata.py` (Branch `master`):
  Import und Export reichen den Dockpfad als einfachen `LineString` mit allen
  Koordinaten durch, ohne Zählung. `check_dockpoints()` verlangt ausdrücklich
  nur **mindestens 2** Punkte (`if len(dockpoints) < 2: … adjustment not
  possible`) und rechnet ausschließlich mit den letzten beiden. Beim Löschen
  eines Punktes nimmt CaSSAndRA Dockpoints sogar **von der 3-Punkte-Regel für
  Figuren aus** (`… <= 2 and self.selected_name != 'dockpoints'`).
- **Sunray**, `sunray/map.cpp`: `getDockingPos()` und `setIsDocked()`
  verweigern das Andocken bei `dockPoints.numPoints < 2`. Eine Annahme „genau
  3" existiert nirgends; `retryDocking()` vergleicht gegen
  `dockPoints.numPoints-3`, was nur bei **mehr** als drei Punkten überhaupt
  Sinn ergibt.

Eine Obergrenze gibt es in keiner der beiden Quellen – keine einbauen und
keine behaupten. **Nicht gegen laufende Firmware oder echte Hardware
getestet**, nur gegen den Quelltext.

**Search Wire:** Offene `LineString`. Gültige Zustände: leerer Platzhalter
oder nicht-leere Linie mit ≥2 Punkten.

**Warum es nur EINE Search Wire und EINEN Docking-Pfad gibt** – belegt gegen
den Quelltext, nicht aus dem Editor heraus begründet:

- **CaSSAndRA** (`CaSSAndRA/src/backend/data/mapdata.py`, Branch `master`):
  Zeile 31 führt `search_wire: LineString` – Einzahl, kein `List`. Der Import
  sammelt zwar alle Features dieses Namens (Zeile 520–522), wandelt dann aber
  nur `search_wire['geometry'].iloc[0]` um (Zeile 557). **Jede weitere Search
  Wire geht ohne Meldung verloren.** Für `dockpoints` steht dasselbe in
  Zeile 553. Exclusions dagegen werden durchiteriert
  (`for i, exclusion in exclusions.iterrows()`) – deshalb sind dort mehrere
  erlaubt.

  Sie werden also **nicht zu einer durchgehenden Linie verbunden**, wie man
  vermuten könnte, sondern verworfen. Der Ablehnungsgrund im `title` nennt
  deshalb die Ursache und nicht nur die Tatsache.

- **Sunray** (`sunray/map.h`, Branch `master`): kennt `Polygon
  perimeterPoints`, `Polygon mowPoints`, `Polygon dockPoints` – jeweils
  Einzahl – und `PolygonList exclusions` als Liste. **Eine Search Wire kommt in
  Sunray überhaupt nicht vor**; der einzige Treffer auf „search" ist ein
  Kommentar zum A\*-Algorithmus. Sie ist ein reines CaSSAndRA-Konzept für
  dessen Wegfindung (`mapdata.py` Zeile 201). Das erklärt, warum die Firmware
  dazu schweigt – eine Frage, die sonst jede künftige Session neu stellt.

**Leere Platzhalter sind reguläre CaSSAndRA-Ausgabe, kein Fehler.** Der Export
schreibt beide Features **immer**, auch ohne Punkte (Zeile 358–360). Ein
`{"type":"LineString","coordinates":[]}` ist damit der Normalfall und darf das
zugehörige Zeichenwerkzeug nicht sperren.

**Wie viele Punkte hat eine Linie? Nur `countLineFeaturePoints()` antwortet
darauf.** Ein Eintrag in `coordinates` zählt nur, wenn er ein Paar endlicher
Zahlen ist (`isUsableCoordinate()`). `coordinates.length` ist die falsche
Antwort: ein leerer Ring `[[]]` ist ein Eintrag **ohne** Punkt.

Diese Annahme steckte an fünf Stellen, und jede hatte eine eigene Auswirkung:

| Stelle | Auswirkung des Fehlers |
|---|---|
| Freigabe der Zeichenknöpfe | Platzhalter galt als befüllt, Zeichnen gesperrt |
| Wiederverwendungs-Sperre in `startFeatureDrawing()` | Knopf frei, Werkzeug lehnte trotzdem ab |
| `isEmptyLineFeature()` (Verbinden) | Platzhalter erzeugte einen Merge-Konflikt |
| `ringPath()` / `linePath()` und die Faktor-Varianten | `d="M NaN NaN"` im SVG |
| `enumerateEditableVertices()` | Punktmarker mit `cx="NaN"` |

Die beiden letzten waren stille Konsolenfehler – sichtbar wurde das erst, als
`tools/test-placeholders.mjs` alle Formen durchspielte. **Keine sechste
Zählweise einführen.**

Die Kartenprüfung zählt weiterhin Einträge (`coords.length`) und meldet einen
entarteten Eintrag als „genau 1 Punkt ist keine gültige Linie". Das ist
absichtlich so gelassen: die Datei IST fehlerhaft, und die Prüfung soll das
sagen, während die Werkzeuge trotzdem benutzbar bleiben.

**Punkte reduzieren (Douglas-Peucker):** Arbeitet auf dem Abschnitt zwischen
zwei ausgewählten Punkten oder auf einem ganzen Feature. Die Auswahl kommt aus
`getSelectedSection()` – derselben Funktion, die das Begradigen benutzt.

- Kernfunktion ist `douglasPeuckerThresholds()`: sie liefert je Punkt die
  Toleranz, ab der er verschwindet. `douglasPeuckerKeepIndices()` filtert nur
  noch. Die `min`-Fortpflanzung entlang der Rekursion ist dabei zwingend, sonst
  entspricht das Filtern nicht mehr dem klassischen Verfahren.
- Dadurch ist auch die Frage „welche Toleranz hätte noch funktioniert?" exakt
  beantwortbar (`largestToleranceKeeping()`) – ohne Toleranzen durchzuprobieren.
- **Geschlossene Ringe** werden als offene Folge `[0 … n-1, 0]` behandelt.
  Das hält den Ring geschlossen und erhält die Start-/Endpunkt-Semantik.
  **Punkt 0 bleibt dadurch immer erhalten** – eine bewusste Einschränkung, auf
  die auch die Oberfläche hinweist.
- Vor dem Anwenden läuft `validateMapData()` über eine **Vorschaukopie**.
  Verglichen werden die Befunde selbst, nicht ihre Anzahl – sonst bliebe
  unbemerkt, wenn ein Fehler verschwindet und dafür ein anderer entsteht.
  Neue Fehler brechen die Reduktion ab. Jede künftige Validierungsregel gilt
  damit automatisch auch hier.
- Vorgabetoleranz **0,02 m**: Größenordnung des RTK-Rauschens. Darüber beginnt
  man, echte Form wegzuwerfen statt Messrauschen.
- **Flächenänderung bei Exclusions** wird gemeldet, wenn sie 1 % **oder** ein
  Quadrat der eingestellten Arbeitsbreite (`mowerWidth²`, Vorgabe 0,12 m²)
  überschreitet. Das ODER ist nötig, weil eine rein relative Schwelle große
  Flächen übersieht: 1 % von 200 m² sind knapp 2 m². Nur **schrumpfende**
  Flächen werden als Warnung gefärbt – sie geben Fläche frei, die der Mäher
  meiden soll. Wachsende werden gemeldet, aber neutral.
- Die Fläche kommt aus `polygonAreaMeters()`, derselben Funktion wie in der
  Kartenprüfung. Es gibt bewusst keine zweite Flächenformel.
- Unterschreitet das Ergebnis die Mindestpunktzahl (3 im Ring, 2 auf der
  Linie), wird **nicht angewendet**, sondern abgelehnt. Bei 3 Punkten
  anzuhalten wäre eine stille Korrektur der eingegebenen Toleranz.

**Maßstab und Metermaße:** Toleranz, Rasterweite, Begradigen, Messen und die
Mäher-Vorschau rechnen in Weltkoordinaten. Die sind nur dann Meter, wenn der
Maßstab bekannt ist – `hasKnownScale()` beantwortet das. Bei `"ambiguous"`
gelten folgende Regeln:

- **Gesperrt**, weil keine Umrechnung sie rettet: Rasterfang
  (`snapWorldCoordinate()` bleibt untätig, der Schalter ist deaktiviert),
  absolutes Speichern, und das Schreiben von `referenceOrigin` bzw.
  `coordinateScale` in die Datei. **Eine Zusicherung, die die Datei nicht
  einlöst, wird nicht geschrieben.**
- **Nur gekennzeichnet**, weil dort höchstens Fehlalarme entstehen:
  Reduzieren-Toleranz, Begradigen-Schwellwert, Mäher-Vorschau. Längenangaben
  tragen dann „Einheiten" statt „m" (`scaleUnitLabel()`).
- Ein dauerhaft sichtbarer Hinweis liegt **im Kartenbereich**, nicht in einem
  einklappbaren Seitenleistenabschnitt – dort war er beim Koordinatenbezug
  schon einmal übersehen worden. Er nennt beide Lesarten mit ihrer konkreten
  Größe, damit sofort erkennbar ist, welche stimmt.

**In der Kartenprüfung gilt: eine übersprungene Prüfung ist nicht bestanden.**
Bei unbekanntem Maßstab meldet die Flächenangabe „konnte nicht berechnet
werden" statt einer Zahl, und die Segmentprüfung sagt, dass nur ihr relativer
Anteil (75 % der Kartendiagonale) angewendet wurde – die absolute Untergrenze
von 50 m setzt Meter voraus und lief vorher still ins Leere.

Eine vollständige Durchsicht von `validateMapData()` hat genau diese beiden
maßstabsabhängigen Stellen ergeben. Alle übrigen Prüfungen sind strukturell
(Geometrietyp, Ringschluss, Punktzahlen, Duplikate, `idx`) oder vergleichen
nur gegen null (`Fläche ist 0 oder ungültig`) und gelten bei jedem Maßstab.

---

## 5a. CaSSAndRA-Bezeichner und Anzeigename

Verifiziert gegen den CaSSAndRA-Quellcode
([`EinEinfach/CaSSAndRA`](https://github.com/EinEinfach/CaSSAndRA),
Datei `CaSSAndRA/src/backend/data/mapdata.py` auf dem Default-Branch
`master` – beachte das zusätzliche Verzeichnis `CaSSAndRA/` und dass der
Branch nicht `main` heißt, Funktion `export_geojson`).

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
  stillschweigend umbenannt. **Sie sind aber nicht bearbeitbar**: der Editor
  unterstützt ausschließlich die vier oben genannten Typen. Solche Features
  werden weiterhin angezeigt und beim Export unverändert zurückgeschrieben –
  sie bekommen nur keine Punktmarker, sind räumlich nicht auswählbar und
  liefern in jedem Werkzeug denselben Ablehnungsgrund
  (`unsupportedFeatureText()`).
- **`featureTypeState()` unterscheidet zwei Fälle**, und die Validierung
  behandelt sie verschieden:
  - `"unknown-name"` – ein Name ist gesetzt, gehört aber zu keinem der vier
    Typen. Jemand hat etwas behauptet, das nicht stimmt → **Fehler**, mit dem
    gefundenen Namen im Text.
  - `"missing-name"` – `properties` oder `properties.name` fehlt ganz. Es
    wurde nichts Falsches behauptet, es fehlt nur eine Angabe → **Warnung**,
    und alle betroffenen Features werden zu **einer** Meldung mit Anzahl
    zusammengefasst, damit echte Befunde nicht in Dutzenden identischer Zeilen
    untergehen.

  Beide Fälle sind gleichermaßen nicht bearbeitbar. Die Unterscheidung steht
  nur in `featureTypeState()`; `isSupportedFeature()` ist der dünne Wrapper
  darüber. Nicht an den Werkzeugstellen nachbilden.
- Ein Validierungs**fehler** blockiert den Export nicht hart: `exportGeoJson()`
  fragt lediglich per `confirm()` nach. Der Roh-Durchreichen-Pfad bleibt damit
  intakt – niemand verliert ein Feature, nur weil sein Typ unbekannt ist.
- Die Ebene „Sonstiges" (`#tOther`) **bleibt bestehen**. Sie zeigt die nicht
  unterstützten Features – und das Ursprungskreuz der Karte trägt
  `dataset.layer = "other"`, hängt also mit an dieser Checkbox. Wer die Ebene
  entfernt, blendet unbemerkt auch das Ursprungskreuz dauerhaft aus.
- **`idx` steht auf Feature-Ebene**, nicht in `properties` – so liegt es auch
  in den vorhandenen Sunray-Dateien. `renumberExclusionsInCollection()`
  schreibt deshalb immer `feature.idx` und pflegt `properties.idx`
  **nur dann** mit, wenn der Schlüssel dort bereits vorhanden ist. Eine Karte,
  die den Index nur auf Feature-Ebene führt, bekommt also kein zusätzliches
  Feld in `properties`; eine Karte, die beides führt, bleibt konsistent.
  Beim Lesen gilt entsprechend `feature.idx ?? feature.properties?.idx`.

  **Der Export vergibt Indizes nicht neu.** Geladene `idx`-Werte werden
  unverändert zurückgeschrieben, **einschließlich Lücken** – eine Karte mit
  den Indizes 0 und 7 wird auch wieder mit 0 und 7 gespeichert. Umnummeriert
  wird ausschließlich nach strukturellen Änderungen, also aus
  `deleteExclusionFeature()`, `duplicateExclusionFeature()` und
  `mergeMapSlots()` heraus. Das ist Absicht: Speichern soll nichts still
  verändern, was der Nutzer nicht angefasst hat. Beim Umnummeriern zählt der
  Index nur über Exclusions hoch; dazwischenliegende Features anderer Typen
  werden übersprungen und bekommen kein `idx`.
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
- **Der Maßstab steht optional in der Datei.** `coordinateScale`
  (`{metersPerUnit: 111111 | 1}`) ist ein Nicht-Standard-Feld auf der
  FeatureCollection, gleiche Machart wie `referenceOrigin`. **Ein Wert in der
  Datei schlägt jede Heuristik**, damit der Editor seine eigene Ausgabe immer
  wiedererkennt. Gelesen über `readEmbeddedScale()`, geprüft über
  `parseScale()` (endlich, > 0) analog zu `parseOrigin()`. Geschrieben wird das
  Feld nur bei bekanntem Maßstab.
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
- **Erkennung:** `classifyCoordinateScale()` entscheidet in einem Durchgang
  zwischen vier Lesarten. **Maßgeblich ist die Ausdehnung, nicht der Betrag:**
  eine WGS84-Mähkarte ist zwangsläufig winzig ausgedehnt (200 m = 0,0018°),
  eine Meterkarte zwangsläufig groß. Der Betrag trennt danach nur noch absolut
  von relativ – beide sind klein ausgedehnt und unterscheiden sich im Versatz.

  ```
  Ausdehnung ≥ 1                → "metric-assumed"  (keine Grad möglich)
  0,14 ≤ Ausdehnung < 1         → "ambiguous"       (keine Lesart plausibel)
  Ausdehnung < 0,14, Betrag > 0,05 → "absolute"
  Ausdehnung < 0,14, Betrag ≤ 0,05 → "sunray-relative"
  ```

  Die untere Schwelle liegt bei **0,14 statt 0,05**, damit eine Relativkarte
  von 5 km Ausdehnung (0,064) sicher erkannt bleibt; der Zweifelsfall beginnt
  dadurch erst bei etwa 15 km Kartengröße.

- **`"metric-assumed"` heißt bewusst „angenommen".** Eine Ausdehnung ≥ 1
  beweist nur, dass die Zahlen keine Grad sind – nicht, dass es Meter sind. Es
  könnten Fuß, Zentimeter oder ein lokales Gitter sein. Der Modus wird deshalb
  überall als Annahme benannt, nie als Feststellung.

- **Bewusst in Kauf genommene Blindstelle: Golf von Guinea.** Eine echte
  WGS84-Karte nahe 0°/0° ist von einer Relativkarte **numerisch nicht
  unterscheidbar** – beide haben kleine Beträge und kleine Ausdehnung. Sie wird
  als relativ gelesen und dadurch mit 111111 multipliziert.

  Das ist eine Entscheidung, keine Lücke. Vorher lag derselbe Fall im
  `raw`-Modus und wurde gar nicht gerechnet, was nominell harmloser war. Der
  Tausch wurde angenommen, weil der Punkt mitten im Atlantik liegt (nächste
  Landmasse São Tomé) und die Erwartung „Relativkarte" um Größenordnungen
  wahrscheinlicher ist als „Mähkarte im Golf von Guinea". Wer das ändern will,
  muss dafür jede normale Relativkarte in den Zweifelsfall schicken – das wurde
  geprüft und verworfen. Ein `coordinateScale` in der Datei löst den Fall
  ohnehin.

- **Der frühere Präzisionstest ist ersetzt.** `detectSunray()` prüfte, ob jeder
  Wert nach Multiplikation mit 111111 ein Zentimeter-Vielfaches ergibt, und
  erkannte ab 98 % Treffern. Das war ein Genauigkeitstest, der als Einheitentest
  benutzt wurde: **zwei frei gesetzte Punkte auf einer 100-Punkte-Karte kippten
  ihn** (Score 0,98), bei kleinen Karten genügte einer. Der Editor erkannte
  damit seine eigene Ausgabe nicht wieder. Die Funktion ist ersatzlos entfallen.

- **Der Modus wird beim Laden einmal bestimmt** und in `slot.scaleMode`
  gespeichert, nicht bei jedem Aufruf neu abgeleitet. Bearbeiten kann ihn damit
  strukturell nicht mehr kippen.
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

**Release-Nummerierung und -Packaging:** Baseline aktuell **Ausgabe 049**,
nächstes substantielles Release **Ausgabe 050**. Ausgabe 050 nicht anlegen,
bevor eine substantielle Änderung tatsächlich angefragt wurde.

**Es gibt keine Release-ZIPs.** Kein Archiv bauen, keines einchecken, keines
an ein GitHub Release hängen. Die Anwendung ist eine einzige `index.html`, die
direkt aus dem Repository und über GitHub Pages läuft – ein Archiv enthielte
dieselbe Datei nur ein zweites Mal. Entwickelt wird laufend auf `main` weiter.

**Die Ausgabenummer steht in `index.html` an genau EINER Stelle:** der
Versionszeile im Hilfe-Menü (`.menu-note`, „Ausgabe 050"). Sie stand vorher
zusätzlich im Dateikopf und im Kopf des Script-Blocks – drei Stellen, von
denen zwei niemand sieht und die beim Taggen auseinanderlaufen. Beim Taggen
wird sie **dort** hochgesetzt, sonst nirgends in der Datei; die Baseline in
`AGENTS.md`, `docs/DEVELOPMENT.md` und dieser Datei zieht wie bisher nach.

Ein Release besteht damit aus: Versionszeile im Hilfe-Menü hochsetzen,
beide Changelogs (`CHANGELOG.md` **und** `CHANGELOG_EN.md`) pflegen, die
Baseline in `AGENTS.md`, `docs/DEVELOPMENT.md` und dieser Datei nachziehen,
Prüfungen aus Abschnitt 4 laufen lassen, committen und den Commit taggen
(`v049`, `v050`, …). Die Tags sind der Rollback-Mechanismus – jeder frühere
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
- **Eine Punktzahl ist nie `coordinates.length`.** Ein Eintrag zählt nur, wenn
  er ein Paar endlicher Zahlen ist – dafür gibt es `isUsableCoordinate()` und
  `countLineFeaturePoints()`. Die Abkürzung steckte an fünf Stellen; zwei davon
  erzeugten `NaN` im SVG (`d="M NaN NaN"`, `cx="NaN"`) und blieben als stille
  Konsolenfehler unbemerkt, bis ein Test alle Platzhalterformen durchspielte.
  Details in Abschnitt 5 unter „Search Wire".
- **Ein Bezeichner wird nur einmal deklariert – und das ist in dieser Datei
  eine strukturelle Gefahr, keine Nachlässigkeit.** Zwei
  `function foo()` auf oberster Ebene sind **gültiges JavaScript**: die
  spätere überschreibt die frühere lautlos, ohne Warnung, ohne Fehler, und die
  Syntaxprüfung hat nichts zu beanstanden. Dasselbe gilt für einen doppelten
  Schlüssel in einem Objektliteral (`I18N_EN`).

  In `index.html` ist das **wahrscheinlich, nicht unwahrscheinlich**: rund
  17 000 Zeilen und über 330 globale Funktionen liegen in einem einzigen
  Gültigkeitsbereich, ohne Module, ohne Namensräume. Wer eine Hilfsfunktion
  schreibt, sieht die 9 000 Zeilen weiter unten nicht, und naheliegende Namen
  (`isWholeFeatureSelected`, `describeFeature`, `updateX`) sind genau die, die
  jemand schon vergeben hat. Die Datei hat keinen Mechanismus, der davor
  schützt – deshalb muss der Prüfschritt es tun.

  Der konkrete Fall: `isWholeFeatureSelected()` bekam beim Bau des Inspektors
  eine zweite Fassung mit **anderer Signatur** (`descriptors` statt
  `featureIndex`). Die spätere gewann, der Aufruf übergab ein Array an eine
  Funktion, die eine Zahl erwartete, das Ergebnis war immer `false`, und der
  Inspektorzustand „ganzes Feature" wurde **nie** erreicht. Kein Fehler in der
  Konsole, kein fehlgeschlagener Test, keine Meldung. Gefunden hat es erst ein
  Browsertest, der die *Menge* der sichtbaren Blöcke prüfte statt einzelner.

  **Vor dem Anlegen einer neuen globalen Funktion den Namen im Dateitext
  suchen.** `tools/check-dom-ids.mjs` meldet den Fall inzwischen, aber erst
  nach dem Schreiben.

- **Jede `id` ist ein Zeichenketten-Literal.** Zulässig sind drei
  Schreibweisen: `id="..."` im Markup, `id="..."` in einer Vorlage im Skript,
  und `element.id = "..."` bzw. `setAttribute("id", "...")` für programmatisch
  erzeugte SVG-Gruppen, die kein Markup haben. **Nicht zulässig ist eine aus
  einer Variablen oder per Zeichenkettenkette gebildete `id`.**

  Der Grund ist die Prüfbarkeit: `tools/check-dom-ids.mjs` durchsucht den
  Dateitext, nicht das aufgebaute DOM. Ein Literal findet es überall – auch in
  dynamisch erzeugtem Markup, das der Oberflächenumbau in großer Menge
  erzeugen wird. Eine zusammengesetzte `id` steht dagegen nirgends im Text; der
  Abgleich hielte eine später verwaiste Referenz dann für gültig, weil er sie
  gar nicht kennt. Das Skript meldet diesen Fall seit Ausgabe 049 als Fehler.

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
- **Eine vierte statische Prüfung fehlt: verwaiste CSS-Regeln ohne Markup.**
  Eintragen, nicht bauen – sie ist hier als offener Punkt vermerkt, damit sie
  nicht ein viertes Mal von Hand gefunden werden muss.

  Der Befund ist gemessen, nicht vermutet: in Etappe 6 b1, b2 und b3 blieben
  **dreimal** Regeln stehen, deren einziges Markup gerade entfernt worden war –
  `.file-btn` und zwei `.toolbar-btn-*` in b1, `.map-slots` und
  `.map-slot-button` in b2, `.grid-controls`, `.robot-settings`,
  `.editor-grid`, `.validation-panel` (zweimal), `.multi-select-panel` und fünf
  `.section-accent-*` in b3. Dazu `.map-info-window` samt Unterregeln, die
  schon seit Etappe 4 verwaist war und keiner Prüfung auffiel.

  Kein Laufzeitfehler, aber genau die Klasse, gegen die `check-dom-ids.mjs`
  gebaut wurde: tote Verweise, die niemand sieht. Machbar mit Bordmitteln –
  Klassenselektoren aus dem `<style>`-Block sammeln, gegen die
  `class="…"`-Literale des Markups halten, dynamisch gesetzte Klassen
  (`classList.add("…")`) mitzählen. Fehlalarme sind zu erwarten, deshalb eher
  als Warnung denn als Fehler.

- **`tools/check-dom-ids.mjs` prüft IDs und doppelte Funktionsnamen, aber
  keine Variablennamen und keine verwaisten Funktionen.** Verwaister Code nach
  dem Entfernen eines UI-Elements bleibt dadurch unentdeckt – genau so hatte
  `deleteSelectedExclusion()` den in Ausgabe 043 entfernten Button um mehrere
  Ausgaben überlebt. Die manuelle Volltextsuche aus Abschnitt 5 ("UI-Element
  entfernen") bleibt deshalb Pflicht.
- **Das Hilfe-Overlay beschreibt die Anordnung in Prosa und veraltet mit
  jeder Etappe des Oberflächenumbaus.** Es wird in Etappe 9 vollständig neu
  geschrieben, wenn die Anordnung feststeht – vorher wäre es zweimal Arbeit.
  Damit dort keine Neulektüre nötig ist, hier die Sätze, die **jetzt schon
  falsch** sind. Die Fundstelle ist der Abschnitt des Overlays plus die
  ersten Worte des Satzes – Zeilennummern verschieben sich mit jeder Änderung
  und wären hier bereits beim Aufschreiben veraltet.

  **Alle sechs sind in Ausgabe 050 falsch geworden**, also im laufenden,
  noch nicht veröffentlichten Umbau; in Ausgabe 049 stimmte jeder von ihnen.
  Die Etappe steht dabei, weil sie die Stelle genauer benennt als die Ausgabe:

  | Abschnitt | Satz beginnt mit | falsch seit | warum |
  |---|---|---|---|
  | Exclusions & Features | „Exclusion löschen: alle Eckpunkte …" | 050, Etappe 5 | nennt „den Papierkorb in der Karten-Werkzeugleiste"; die Auswahlleiste ist ganz von der Karte verschwunden, der Papierkorb steht im Inspektor |
  | Mehrfachauswahl | „Rechteck / Lasso: mehrere Punkte …" | 050, Etappe 3 | verweist auf „Punkt / Verschieben"; diesen Knopf gibt es nicht mehr, er war reine Doppelung des Zeigers |
  | Mobil / Android | „Bedienung: auf kleinen Displays …" | 050, Etappe 3 | sagt, der Knopf blende „die Werkzeugleiste" ein; er öffnet die **Seitenleiste**, und eine Werkzeugleiste gibt es seit Etappe 3 als eigenes, anderes Ding |
  | Ansicht & Speichern | „Karteninfo: Abmessungen und Hinweise …" | 050, Etappe 4 | die Karteninfo ist kein Fenster auf der Karte mehr, sie steht im Inspektor |
  | Ansicht & Speichern | „Auswahl-Werkzeugleiste: Mauszeiger, Rechteck …" | 050, Etappe 5 | auf der Karte liegt keine Auswahlleiste mehr; die Auswahlwerkzeuge stehen in der Werkzeugleiste, Löschen, Auswahl aufheben und Begradigen im Inspektor |
  | Ansicht & Speichern | „Sidebar: Direkt unter ‚Karten' …" | 050, Etappe 6 | weder „Karten" noch „Messen & Prüfen" existiert noch als Abschnitt; übrig sind Karten verbinden, Feature-Navigation, Koordinatenbezug |
  | Ansicht & Speichern | „Karteninfo & Legende: liegen direkt untereinander …" | 050, Etappe 2 | die Legende ist ein fester Streifen und lässt sich nicht mehr aufklappen |

  **Zwei Einträge dieser Liste waren zu streng und sind zurückgenommen:**
  „Einpassen / Zoom: Kartenansicht anpassen." und „Raster: Schrittweite frei
  einstellen; Snap-to-Grid kann beim Ziehen verwendet werden." nennen gar
  keinen Ort. Beide Sätze stimmen weiterhin – falsch war nicht der Satz,
  sondern die frühere Behauptung über ihn. Eine Liste bekannter Fehler, die
  Richtiges enthält, ist beim nächsten Lesen genauso teuer wie eine
  unvollständige.

  Die Liste beim Fortschreiten der Etappen ergänzen, statt am Ende alles neu
  zu lesen.
- **31 Statustexte haben keine englische Fassung.** Sie wurden beim Umzug der
  Ausgaben in die Statuszeile systematisch erfasst: literale Argumente von
  `setEditStatus()`, `setMultiSelectionStatus()`, `setReduceStatus()`,
  `setRectifyStatus()` und `updateGridStatus()`, die weder in `I18N_EN` stehen
  noch auf ein Muster passen. Es sind überwiegend Fehlermeldungen seltener
  Fälle („Polygonring konnte nicht neu aufgebaut werden.") sowie zwei
  Rastertexte. Sie laufen alle über `setLocalizedText()` und wechseln damit
  sauber hin und her – es gibt nur nichts zu wechseln. Nachzutragen, wenn die
  betroffenen Bereiche im weiteren Umbau ohnehin angefasst werden; einzeln
  nachzupflegen lohnt nicht.
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
  von CaSSAndRA eingelesen. Dasselbe gilt für die beiden Nicht-Standard-Felder
  `referenceOrigin` und `coordinateScale`: dass CaSSAndRAs Import sie ignoriert,
  ist am Quelltext belegt (er greift ausschließlich auf `features` zu), aber
  nicht gegen eine laufende Instanz geprüft.
- **Löcher in Polygonen sind editierbar, aber weder geprüft noch in der
  Fläche enthalten – potenziell sicherheitsrelevant.**
  `enumerateEditableVertices()` läuft über **alle** Ringe eines Polygons und
  über alle Teile eines MultiPolygons; `validateMapData()` und
  `polygonAreaMeters()` sehen dagegen ausschließlich `coordinates[0]`.

  Eine Sperrfläche mit Loch wäre damit weder validiert noch in der
  Flächenwarnung beim Reduzieren enthalten – der Editor ließe das Loch
  bearbeiten und meldete eine Flächenänderung, die den Innenring nicht
  berücksichtigt. Auf echter Hardware ist die Sperrfläche dann anders, als der
  Editor sagt.

  **Wie wahrscheinlich ist der Fall?** Aus CaSSAndRA nicht: der Import baut
  Exclusions mit `Polygon(geometry['geometry']['coordinates'][0])`
  (`mapdata.py` Zeile 515) und verwirft damit jeden Innenring, der Export
  schreibt immer genau einen Ring (Zeilen 366, 654, 688). CaSSAndRA kann
  Polygone mit Löchern also weder erzeugen noch erhalten. Erreichbar ist der
  Fall nur über handgeschriebene oder fremde Dateien – die der Editor aber
  annimmt und bearbeitbar macht.

  Nach dem Oberflächenumbau ansehen: entweder Löcher gar nicht erst editierbar
  machen, oder Prüfung und Flächenrechnung auf alle Ringe ausweiten. Beides ist
  eine Entscheidung, kein Nachtrag.
- **Die Mähbahnen-Vorschau ist geplant, aber nicht gebaut.** Sie war für
  Ausgabe 049 vorgesehen und wurde herausgenommen, um den Release nicht
  aufzuhalten; sie kommt in einer späteren Ausgabe. In der Anwendung gibt es
  dazu bisher nichts – weder Schalter noch Platzhalter.
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
