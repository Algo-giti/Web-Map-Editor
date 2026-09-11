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
| Browser | die Skripte der Tabelle in 4.2, gestartet über `tools/run-browser-tests.mjs` | `playwright-core` + Browser, beides außerhalb des Repos | optional, aber bei UI- oder Geometrieänderungen dringend empfohlen |

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

  **Dazu seit Ausgabe 050: Namen aus ignorierten Ordnern.** Die
  Privatsphäre-Regel verbietet ausdrücklich auch **Dateinamen** in
  versionierten Dateien, und die Kartendatei-Prüfung findet die nicht – sie
  sucht nach Dateien, nicht nach Namen darin. Genau so überlebte der Name
  einer privaten Karte als fest verdrahteter Pfad in
  `tools/test-cassandra.mjs`. Geprüft wird jetzt jeder Verweis, der **in**
  einen über `.gitignore` ausgeschlossenen Ordner hineinzeigt; der Ordnername
  selbst bleibt erlaubt, weil ein Skript ihn ansprechen muss, um ihn zu
  durchsuchen.

  **Die enge Form ist gemessen, nicht geraten.** Sie erzeugt null
  Falschmeldungen im ganzen Repository, auch in der Prosa der Dokumentation.
  Die naheliegende breite Form – jedes Literal auf `.json`/`.geojson` melden –
  wurde verworfen, weil sie **38 Treffer** liefert, allesamt berechtigt:
  synthetische Testkartennamen aus `setInputFiles()` und Erwähnungen von
  `package.json`. Ein privater Name ist von einem synthetischen syntaktisch
  nicht zu unterscheiden; die Prüfung kann deshalb nur den **Ort** erkennen,
  nicht den Namen.
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

Die Skripte der folgenden Tabelle öffnen `index.html` in einem echten Browser
über eine `file://`-URL – die Datei hat keine externen Ressourcen und keine
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

#### Der Läufer – und warum es ihn gibt

**Gestartet werden sie über `tools/run-browser-tests.mjs`.** Machart wie
`tools/check-all.mjs`: nur Node-Bordmittel, keine Abhängigkeit, und **bewusst nicht
in `tools/check-all.mjs` eingehängt** – die statische Stufe muss in jeder Umgebung
ohne Vorbereitung durchlaufen.

```bash
PLAYWRIGHT_CORE_PATH="$SCRATCH" node tools/run-browser-tests.mjs
```

Drei Eigenschaften, und jede hat einen konkreten Anlass:

- **Er ermittelt seine Liste, statt sie aufzuzählen.** Ein Browsertest ist für
  ihn ein Skript in `tools/`, das `tools/browser-harness.mjs` einbindet. Eine
  Handliste wäre eine zweite Quelle und würde beim nächsten neuen Test
  vergessen. Gegen die Tabelle oben gleicht er ab und nennt bei Abweichung
  beide Richtungen – ein neu angelegter Test fällt damit nicht mehr still aus
  dem Lauf.

  **Nebenwirkung, die beim Schreiben dieses Abschnitts zugeschlagen hat:** der
  Abgleich liest jeden blanken Dateinamen auf `.mjs` aus diesem Abschnitt, der
  in Rückstrichen steht. Ein Skript, das **kein** Browsertest ist, wird hier deshalb mit
  Pfad geschrieben – `tools/check-all.mjs`, `tools/browser-harness.mjs`,
  `tools/run-browser-tests.mjs` –, sonst meldet der Läufer es als
  „dokumentiert, aber nicht in tools/".
- **Er trennt bestanden / gerissen / übersprungen** und gibt immer alle drei
  Zeilen aus. Grün ist er nur, wenn tatsächlich gelaufen wurde.
- **Übersprungen heißt Exit-Code 2**, nicht 0 (siehe unten). Vorher war ein
  Lauf ohne Browser von einem bestandenen nicht zu unterscheiden.

**Eine Faltgeste, nicht acht.** `openAllFolds(page, menue)` im Harness öffnet
alle Faltbereiche – `.inspector-fold`, `.tool-settings` und seit Etappe 7b auch
`#featureNavigator details`, die Karten der Feature-Navigation. `#sidebar
details` stand bis Etappe 7e ebenfalls darin und ist mit der Seitenleiste
entfallen: ein Selektor, der nichts mehr treffen **kann**, liest sich beim
nächsten Mal wie eine Zusicherung. Der Helfer stand seit Etappe 6 b2 im Harness, dessen
Nachricht ihn als Bündelung „der bisher acht Mal kopierten Faltgeste"
beschrieb – **aufgerufen hat ihn danach kein einziger Test**, alle acht Kopien
blieben stehen. Damit erreichte die Reparatur der Navigationskarten zunächst
niemanden. Seit Etappe 7 f rufen **elf Skripte** den Helfer auf, und
`setAttribute("open", …)` steht im ganzen `tools/`-Verzeichnis an genau einer
Stelle. **Keine neunte Kopie anlegen** – auch nicht unter anderem Namen; drei
der acht hießen `expand()` statt `expandSidebar()` oder standen inline.

#### Eine Behauptung ist kein Beleg

**„Alle 17 Browsertests grün" stand neun Berichte lang in Commit-Nachrichten,
ohne je gemessen worden zu sein** – in b2, b3, b4, n1, n2, n3, 7a1, 7b und 7c.
Tatsächlich brach `test-map-switch.mjs` seit b2 ab, ab 7b zusätzlich
`test-reduce.mjs`, ab 7c `test-scale.mjs`. Möglich war das, weil es keinen
Läufer gab: gestartet wurde von Hand als Shell-Schleife, und
`node tools/x.mjs | tail -1` wirft den Exit-Status in der Pipe weg. Dazu kam
die 0 für „übersprungen".

**Daraus die Regel: eine Testzahl im Bericht gilt nur, wenn sie aus
`tools/run-browser-tests.mjs` stammt.** Nicht aus einer Schleife, nicht aus
der Erinnerung, nicht aus „ich habe die betroffenen laufen lassen".

**Dieselbe Wurzel, zweiter Fall: eine Commit-Nachricht behauptet nichts, was
im Diff nicht steht.** b2s Nachricht sagt wörtlich, „die sechs
`uncheck(#showMowerPreview)` und die zwei Klicks auf `#mapAButton` laufen über
`menueBefehl()`" – der Diff zu `test-map-switch.mjs` bestand aus dem Import und
**einem** umgestellten `uncheck`. Dieselbe Nachricht beschrieb `openAllFolds()`
als Bündelung der acht Kopien, ohne eine einzige davon umzustellen. Zweimal in
einer Etappe wurde ein Helfer gebaut, in der Nachricht als übernommen
beschrieben und nicht übernommen.

Beide Fälle sind derselbe Fehler: **etwas als getan gemeldet, weil es gedacht
war.** Wer eine Zahl oder eine Umstellung in eine Nachricht schreibt, hat sie
vorher gemessen bzw. im eigenen Diff gesehen.

**Dritter Fall, und diesmal eine Aufzählung statt einer Umstellung:** die
Nachricht von `3d6cd9f` (Etappe 7d-3c) beschreibt die eingetragene Messtabelle
als „acht Eingriffe mit Ring und Infotext danach – Punkt 0 und letzter Punkt
**je** mit Pfeiltaste, E/N-Feld und Maus, dazu Rechtwinklig, Reduzieren und
Begradigen".

| | |
|---|---|
| die Nachricht sagt | beide Punkte je über drei Wege bewegt – sechs Bewegungszeilen, mit den drei Werkzeugen zusammen neun |
| der Diff enthält | fünf Bewegungszeilen: Punkt 0 über Pfeiltaste, E-Feld und Maus, der **letzte Punkt nur über Pfeiltaste und Maus**. Der letzte Punkt über das E/N-Feld ist nicht gemessen |

Die Zahl „acht" ist richtig, die Aufzählung darunter ergäbe neun und
widerspricht ihr damit selbst. **Nachträglich richtiggestellt wurde die
Nachricht nicht** – `3d6cd9f` war zum Zeitpunkt des Befundes bereits
veröffentlicht, und ein `--amend` hätte einen Force-Push auf einen
veröffentlichten Commit verlangt. Der Eintrag hier ist die Richtigstellung.

**Daraus die engere Regel: eine Aufzählung wird gegen den Diff gezählt, nicht
nur gelesen.** Der Fehler wäre beim Schreiben aufgefallen, wenn die Zahl vor
der Aufzählung mit der Länge der Aufzählung verglichen worden wäre – die beiden
standen im selben Satz.

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

Wenn `playwright-core` fehlt oder kein Browser startet, brechen die Skripte
**nicht** mit Fehler ab, sondern geben eine Anleitung aus und beenden sich mit
**Exit-Code 2**. Fehlende Testinfrastruktur ist kein Testfehler – aber sie ist
auch kein bestandener Test, und genau das muss ein Exit-Code sagen können.

**Die 0 an dieser Stelle war das Falsche zugesichert.** Sie machte einen Lauf
ohne Browser von einem bestandenen ununterscheidbar: lauter Skripte, die alle
mit 0 enden, weil keines starten konnte, sehen aus wie ebenso viele bestandene
Tests. `tools/run-browser-tests.mjs` zählt 2 deshalb als **übersprungen** und
meldet den Lauf ausdrücklich als *nicht gelaufen*.

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

**Dritter Fall derselben Regel: ein geschlossenes `<details>` rendert seinen
Inhalt nicht – meldet aber `display` und einen Kasten.** Die Regel ist eine,
die Fälle sind drei: abschneidender `overflow`-Vorfahr, Spezifitätsfalle,
nicht gerendertes `<details>`.

Gemessen in Etappe 7 c: der Knopf „Ganzes Feature auswählen" der
Feature-Navigation hatte `getComputedStyle(...).display === "block"` und ein
Rechteck von 264 × 40 px, war aber nicht anklickbar, weil das umgebende
`<details class="feature-card">` zu war. Eine Zusicherung auf `display` hätte
den Fall **nicht** gesehen. Umgekehrt gilt: `textContent()` und `.count()`
tragen durch ein geschlossenes `<details>` hindurch – nachgemessen 329 Zeichen
und drei Treffer bei zugeklapptem Prüfblock.

Praktisch heißt das: **vor jedem Klick und jeder Eingabe die Faltbereiche
öffnen**, und zwar über `openAllFolds()` aus dem Harness.

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
| `test-reduce.mjs` | „Ring ist nach dem Reduzieren noch geschlossen" (`test-reduce.mjs:307`) |
| `test-dockpath.mjs` | „drei Punkte erzeugen keinen Docking-Befund" (`test-dockpath.mjs:287`) |

Beide lesen einen Prüfbericht, nachdem sie „Karte prüfen" gedrückt haben, und
prüfen darin auf das **Ausbleiben** einer Zeichenkette (`!report.includes(…)`).
Sie bestünden auch bei einem leeren Bericht.

**Drei Einträge sind gestrichen, weil sie erledigt sind – und die Streichung
kommt drei Etappen zu spät.** `test-merge.mjs` trug „Kartenprüfung sieht nur
einen Perimeter", „Kartenprüfung meldet kein doppeltes Docking" und
„Kartenprüfung meldet danach keine doppelten Features". Etappe 7a1 (`8bd2b9f`)
hat genau diese drei entfernt und durch Zählungen am Ergebnis ersetzt:

| gestrichener Eintrag | erledigt durch |
|---|---|
| „Kartenprüfung sieht nur einen Perimeter" | „Karte A hat genau einen Perimeter" (`test-merge.mjs:204`) und „das Ergebnis hat genau einen Perimeter" (`:267`) – beide zählen `typen()` |
| „Kartenprüfung meldet kein doppeltes Docking" | „Karte A hat genau einen Docking-Pfad" (`:206`) und „genau einen Docking-Pfad und eine Search Wire" (`:269`) |
| „Kartenprüfung meldet danach keine doppelten Features" | „und kein Feature ohne erkennbaren Typ" (`:208` und `:272`) sowie „beide Exclusions übernommen" (`:237`) |

**Die Lehre daraus steht schon in dieser Datei, nur andersherum.** Der
dokumentierte Fall ist „bearbeitet gilt als geprüft" – ein Eintrag, an dem
gearbeitet wurde, wird beim nächsten Durchgang übersprungen. Hier war es die
Gegenrichtung: **repariert, aber nicht ausgetragen.** Die Reparatur stand sogar
im selben Dokument beschrieben („der Gewinn der Umstellung aus 7a1 von ‚den
Prüfbericht befragen' auf ‚das Ergebnis zählen'"), nur eben nicht in dieser
Liste. Eine Liste offener Punkte, die Erledigtes führt, kostet beim nächsten
Lesen genauso viel wie eine, der etwas fehlt – und sie bindet die Planung:
„sie werden mitgezogen, wenn die betroffenen Tests ohnehin angefasst werden"
hätte in Etappe 7d-3 zu einer Suche nach drei Zusicherungen geführt, die es
nicht mehr gibt. **Wer einen Punkt dieser Datei behebt, streicht ihn im selben
Commit.**

Die sechste des ursprünglichen Bestandes ist schon mit Etappe 5b erledigt und
damals ausgetragen worden, wie es sich gehört: `test-shapes.mjs` prüfte
„Werkzeug startet nicht" nach einem Klick mit Radius 0 – das bestand auch,
wenn der Klick gar nichts auslöste. Geprüft wird jetzt die Wirkung: der Abschluss ist
gesperrt, der Grund steht sichtbar da, ein gültiger Wert gibt ihn wieder frei,
und danach entsteht die Form wirklich. Eine reine Verneinung ohne Auslöser – etwa
`!pointInRing(...)` in `test-geometry.mjs` – ist davon nicht betroffen: dort
gibt es keinen Auslöser, dessen Verarbeitung ausbleiben könnte.

#### Eine neue Zusicherung wird durch Mutation gegengeprüft

**Ein Test, der beim ersten Lauf grün ist, hat noch nichts belegt.** Er belegt
erst dann etwas, wenn gezeigt ist, dass er bei ausbleibender Wirkung **reißt**.
Das ist die schärfere Fassung der Regel „eine Behauptung ist kein Beleg": dort
ging es um Zahlen, die niemand gemessen hat, hier um Zusicherungen, die niemand
zum Fallen gebracht hat.

**Das Verfahren:** in einer **Arbeitskopie** genau eine Stelle des Bestandes so
verändern, dass die zugesicherte Wirkung ausbleibt; den Test laufen lassen;
danach die Arbeitskopie wieder herstellen und mit `git diff` belegen, dass
nichts zurückgeblieben ist. Je Mutation gehören **Fundstelle, Änderung und die
namentlich gerissenen Zusicherungen** in den Bericht.

**Wird eine Schreibstelle mehrfach bedient, wird jede einzeln mutiert.** Die
Auftrennstelle wird an drei Stellen gesetzt – `setSelectedAsPolygonStart()`,
`setSelectedAsPolygonEnd()` und `applyMergeCut()`. Eine Mutation an einer davon
sagt über die anderen beiden nichts; genau so blieb in Etappe 7d-3 zunächst
unbemerkt, dass die beiden Punktknöpfe gar nicht abgedeckt waren.

**Eine Mutation, die nicht reißt, ist eine benannte Lücke – keine Abdeckung.**
Sie wird als solche gemeldet und nicht dadurch aus der Welt geschafft, dass man
die Mutation umformuliert, bis sie doch reißt. Vorher ist allerdings zu prüfen,
ob die Mutation überhaupt eine **Wirkung** hat: eine, die den Bestand gar nicht
verändert, sagt über den Test nichts. Der Unterschied wird gemessen, nicht
angenommen.

**Reißen heißt: eine benannte Zusicherung meldet FAIL.** Ein Abbruch mit
Zeitüberschreitung zählt zwar als roter Lauf, ist aber der schlechtere Befund –
er nennt die Ursache nicht und kostet dreißig Sekunden je Fall. Wer einen Klick
auf einen Knopf schreibt, der gesperrt sein **kann**, setzt deshalb eine
Prüfung auf `isEnabled()` davor; sonst wird aus einer klaren Ablehnung ein
stummer Timeout.

**Beim Messen der Mutation nicht durch eine Pipe filtern.** `node tools/x.mjs |
grep FAIL` wirft den Exit-Status weg – dieselbe Falle, die den Läufer nötig
gemacht hat, nur eine Ebene tiefer. Die Ausgabe in eine Datei schreiben, den
Exit-Status davon getrennt lesen. Genau daran ist in Etappe 7d-3b der erste
Durchgang gescheitert: zwei Mutationen sahen aus, als reiße keine Zusicherung,
und eine davon hatte in Wahrheit den ganzen Lauf abgebrochen.

**Die Zusicherung allein genügt nicht – der Klick muss unterbleiben.** Eine
gerissene `check()`-Zusicherung bricht den Lauf nicht ab; unmittelbar danach
klickt das Skript weiter, und der gesperrte Knopf liefert doch den Timeout.
Gemessen in Etappe 7d-3d an der Mutation „Klickreihenfolge statt `min`/`max`":
mit bloßem Wächter riss die benannte Zusicherung zwar, der Lauf endete
trotzdem im Abbruch. `tools/test-merge.mjs` führt deshalb **alle dreizehn**
Klicks auf sperrbare Knöpfe über den einen Helfer `klickeFreienKnopf()`, der
zusichert **und** bei gesperrtem Knopf nicht klickt. Danach meldet dieselbe
Mutation fünf benannte Zusicherungen und null Timeouts. Kein zweiter Helfer
daneben – dieselbe Regel wie bei `openAllFolds()`.

**ERLEDIGT mit Schritt 4 (7d-4a): die Auftrennstelle im Undo-Snapshot.** Die
Lücke ist geschlossen; `tools/test-merge.mjs` trägt dafür jetzt die
Gegenrichtung – *setzen → Punkt verschieben → Undo → immer noch gewählt*.
Nachgemessen mit derselben Mutation wie unten (Paar im Klon gelöscht): sie
reißt **drei** benannte Zusicherungen, „und das Undo holt die Auftrennstelle
zurueck", „ein Rundlauf zurueck auf die Stelle gilt wieder als gewaehlt" und
„und auch danach holt das Undo sie zurueck". Der Befund bleibt als Beleg
stehen:

**Benannte Lücke (bis Schritt 4): die Auftrennstelle im Undo-Snapshot ist
nicht abgedeckt.** Gemessen in Etappe 7d-3d, Stand `3d6cd9f`.

Mutiert wurde `cloneMapSlot()`: der Klon entsteht weiter über
`structuredClone()`, verliert aber anschließend die Marke
(`delete klon.cutEdgeChosen`). Damit reist `cutEdgeChosen` nicht mehr im
Snapshot mit.

**Die Mutation wirkt** – nachgemessen an der Folge *Auftrennstelle setzen →
einen Punkt mit der Pfeiltaste verschieben → Undo*:

| | Ring nach dem Undo | `#mergeAInfo` nach dem Undo |
|---|---|---|
| heil | `40.00/0.00 40.00/40.00 0.00/40.00 0.00/0.00` | „Auftrennstelle **gewählt**." |
| mutiert | derselbe Ring | „Auftrennstelle **aus der Datei**." |

**Kein Test sieht das:** `tools/test-merge.mjs` läuft mit der Mutation
unverändert grün durch, 130 Zusicherungen, null FAIL, Exit 0.

Der Grund ist die **Richtung** der vorhandenen Undo-Zusicherung. Sie prüft
*ungesetzt → setzen → Undo → ungesetzt*, und dort liefert eine verlorene Marke
dasselbe Ergebnis wie eine erhaltene. Erst die Gegenrichtung – *setzen →
irgendeine andere Änderung → Undo → immer noch gesetzt* – trennt die beiden
Fälle. **Die Lücke wurde nicht dort geschlossen, sondern mit 7d-4a**, das die
Marke ohnehin angefasst hat: solange offen war, ob sie „der Nutzer hat einmal
gewählt" oder „die aktuelle Auftrennstelle ist gewählt" behaupten soll, hätte
eine Zusicherung dort das eine oder das andere vorweggenommen. Entschieden ist
seit 7d-4a die **zweite** Lesart.

**Neue benannte Lücke aus Schritt 4: „Verweis statt Kopie" reißt nicht.**
`rotateRingToStart()` legt das Paar als Kopie der Rohwerte ab. Wird die Kopie
durch einen Verweis auf `rotated[0]` bzw. `rotated[letzter]` ersetzt, bleibt
`tools/test-merge.mjs` grün – Exit 0, keine gerissene Zusicherung.

**Der Grund ist gemessen und nicht der erwartete.** `rebuildClosedRing()` baut
den Ring aus `uniquePoints.map(point => [point[0], point[1]])`, also aus
**neuen** Arrays, und spleißt diese ein. `rotated[0]` ist damit nie das Objekt,
in das `setVertexWorldCoordinate()` später hineinschreibt – ein Verweis ist
heute schon entkoppelt. **Die Mutation wird deshalb nicht umformuliert, bis sie
doch reißt.** Die Kopie bleibt als örtliche Zusicherung stehen: sie macht die
Entkopplung dort sichtbar, wo das Paar entsteht, statt sie aus dem Innenleben
einer anderen Funktion zu borgen.

#### Hinweis für eigene Erweiterungen

**Einklappbare Bereiche zuerst öffnen.** Seit Etappe 5 sind „Umformen" und
„Kartenprüfung" im Inspektor `<details>` und beim ersten Start **zu** – ein
Klick auf einen Knopf darin läuft sonst in einen Playwright-Timeout
("element is not visible"). Die betroffenen Tests öffnen deshalb
`.inspector-fold` – über `openAllFolds()`; genau das tut auch ein Nutzer.

**Ein Klick auf einen bereits markierten Punkt HEBT die Gruppe nicht auf.**
Das ist gewolltes Verhalten – man soll die Gruppe ziehen können –, und es ist
ein Fallstrick für jeden Test, der nach einer Feature-Auswahl den
**Abschnittsfall** prüfen will: ohne vorheriges „Auswahl aufheben"
(`#clearMultiSelectionBtn`) arbeitet er weiter im Zustand „ganzes Feature" und
**bleibt dabei grün**, weil beide Zustände ein gültiges Ziel liefern. Genau das
ist in `tools/test-reduce.mjs` aufgetreten, als 7f den vorigen Abschnitt auf
eine Feature-Auswahl umstellte.

Der Knopf ist gesperrt, wenn nichts ausgewählt ist – der Klick gehört deshalb
hinter eine Prüfung auf `isEnabled()`, und daneben eine Zusicherung, dass
danach wirklich kein Marker mehr markiert ist.

**`.first()` auf einem Navigationsknopf ist seit 7f der Perimeter.** „Ganzes
Feature auswählen" hängt seitdem an `isSupportedFeature()` statt an
`canMoveWholeFeature()`, und der Perimeter hat den Knopf damit auch. Tests
sprechen ihn über `[data-action="select-whole-feature"][data-feature-index="…"]`
an; `.first()` traf vorher zufällig das gewünschte Feature und trifft es jetzt
zufällig nicht mehr.

Dazu: **die Navigation wird bei jeder Auswahländerung neu gebaut**, und die
Karten nicht ausgewählter Features entstehen dabei **zu**. Vor einem Klick
darauf gehört deshalb `openAllFolds()` – auch dann, wenn zu Beginn des Tests
schon einmal aufgeklappt wurde.

**Die Zoom-Leiste liegt über der Karte** (`.map-view-toolbar`, oben rechts).
Ein Punktmarker darunter lässt sich nicht anklicken – Playwright meldet
"subtree intercepts pointer events". Testpunkte deshalb nicht in die obere
rechte Ecke der Karte legen.

Werte in eingeklappten `<details>`-Bereichen (z. B. `#widthStat`,
`#originStatus`) müssen mit `textContent` gelesen werden, `innerText` liefert
dort einen leeren String.

Testkarten erzeugen die Skripte immer selbst und synthetisch. Es liegt keine
Kartendatei im Repository und es wird keine gelesen.

**Es gibt keinen Ordner für Beispiel- oder Testkarten, und es soll keiner
geben.** Entschieden, damit die Frage nicht neu gestellt wird. Zwei Gründe, und
beide tragen für sich: eine geteilte Fixture-Datei koppelte **jedes Skript in
`tools/`, das sich eine Testkarte baut**, aneinander – wer sie für einen Test
erweitert, ändert die Ausgangslage aller übrigen mit, ohne es zu sehen; heute
steht die Karte **neben** der Zusicherung, die sie erklärt.

Gezählt sind das die Browsertests aus der Tabelle in 4.2 **plus
`tools/test-cassandra.mjs`**, das als einziges statische Skript eine Karte
liest. Die Zahl stand hier früher ausgeschrieben da, ohne zu sagen, was sie
zählt – und ließ sich deshalb mit der Zahl der Browsertests verwechseln, die
um eins kleiner ist.

Der zweite Grund: `tools/check-privacy.mjs` meldet **jede von git getrackte
Datei** auf `.json`/`.geojson` mit `FeatureCollection` als **Fehler**; ein Beispielordner verlangte also zwingend eine Ausnahme in der
einzigen automatisierten Schutzschicht gegen eingecheckte Kartendaten. Die
Ausnahme wäre die eigentliche Entscheidung, nicht der Ordner.

**Daran hängt eine offene Frage, kein Auftrag: ein neuer Nutzer hat nichts zum
Hineinladen.** Er kann den Editor öffnen und sieht „Keine Karte geladen"; die
READMEs beschreiben das Format, liefern aber keine Datei. Ob und wie das
gelöst wird – eine Karte, die der Editor auf Wunsch selbst erzeugt, wäre der
Weg, der ohne Datei im Repository auskommt –, ist offen.

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
- **Alt+Buchstabe auf macOS – VERMUTUNG, kein Befund.** Auf macOS erzeugt die
  Wahltaste ein Sonderzeichen (Alt+D → „∂"), und `event.key` trägt dann
  dieses Zeichen statt des Buchstabens. Der Vergleich in `runMenuShortcut()`
  ginge damit ins Leere, und die Menükürzel funktionierten dort nicht.

  **Das ist ungeprüft** – es steht kein Mac zur Verfügung, und die Aussage
  stammt aus der Plattformkonvention, nicht aus einer Messung. Sie gilt
  außerdem unverändert für den Zustand vor der Ableitung: das Kürzel wäre
  auch mit einer festen Tabelle betroffen.

  **Falls es zutrifft, ist die Antwort F10, nicht der Verzicht auf die
  Markierung.** F10 betritt die Leiste ohne Wahltaste, danach führen die
  Pfeiltasten durch alle Menüs – der Weg ist also auch ohne Alt vollständig.
  Den Unterstrich deswegen wegzunehmen hieße, die Erklärung dort zu streichen,
  wo sie stimmt, weil sie anderswo vielleicht nicht stimmt.

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
5. Sprache umschalten (oben rechts) und Kernbereiche (Menüleiste,
   Werkzeugleiste, Inspektor, Kartenfenster, Hilfe-Overlay, Statusmeldungen)
   auf Übersetzung prüfen.
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
ausgewählt (Rahmen, Lasso oder Ctrl+Klick), entfernt „Auswahl löschen" im
Inspektor die **komplette** Exclusion. Teilauswahl löscht nur die ausgewählten Punkte
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

**Zeitpunkt der Werkzeugvorschauen – entschieden mit Etappe 7f.** Bis dahin
stand hier eine Frage; sie lautete „wann erscheinen die Vorschauen?" und ist
mit dieser Regel beantwortet:

| Vorschau | Funktion | Ziel | erscheint, sobald |
|---|---|---|---|
| Begradigen | `renderStraightenPreview()` | `getSelectedSection()` | **genau zwei** Punkte desselben Rings eines unterstützten Features ausgewählt sind – unverändert |
| Reduzieren | `renderReducePreview()` | `getReduceTarget()`: Abschnitt, sonst `getWholeFeatureTarget()` | im Abschnitt wie bisher; beim ganzen Feature erst, wenn **alle** seine Punkte ausgewählt sind – zusätzlich nur, wenn bei der eingestellten Toleranz überhaupt Punkte wegfielen und die Mindestpunktzahl hält |
| Rechtwinklig | `renderRectifyPreview()` | `getWholeFeatureTarget()` | erst, wenn **alle** Punkte des Features ausgewählt sind – zusätzlich nur, wenn `analyzeRectify()` etwas verschiebt (`maxShift > 0`) |

**Der Zeitpunkt hängt an genau einer Stelle: `previewSelectionAllows(target)`.**
Beide betroffenen Vorschauen rufen sie auf. Drei Werkzeuge mit drei
Zeitpunkten wären schlimmer als der vorige Zustand – dann müsste man sich
merken, welches wann zeigt.

**Was entfallen ist:** der Auslöser „ein Punkt genügt". `getWholeFeatureTarget()`
fällt weiterhin auf das ganze Feature zurück, sobald die Auswahl eindeutig zu
einem gehört – nur trägt dieser Rückfall keine Vorschau mehr. Wer einen Punkt
verschieben will, bekommt nicht länger ungefragt die Vorschau eines Werkzeugs,
nach dem er nicht gefragt hat.

**Das Begradigen blieb unverändert, und das ist eine Entscheidung.** Zwei
gewählte Punkte desselben Rings sind bereits eine eindeutige Absichtserklärung
– man wählt sie nicht versehentlich, und es gibt genau ein Werkzeug, das darauf
antwortet. Die naheliegende Alternative, den Zeitpunkt an den geöffneten
Faltblock „Umformen" zu hängen, hätte das **verschlechtert**: sie hätte eine
Geste, die schon eindeutig ist, von einem zweiten Zustand abhängig gemacht, den
der Nutzer eigens herstellen muss.

**Die Regel betrifft NUR den Zeitpunkt der Vorschau.** Worauf die Werkzeuge
wirken, entscheiden weiterhin `getReduceTarget()` und `getWholeFeatureTarget()`
– mit einem einzelnen gewählten Punkt melden Statuszeile und Knopf also
weiterhin das ganze Feature. Ob das so bleiben soll, ist eine eigene Frage und
wurde mit 7f ausdrücklich nicht mitentschieden.

**Der Knopf „Ganzes Feature auswählen" hängt nicht mehr an
`canMoveWholeFeature()`**, sondern an `descriptors.length > 0 &&
isSupportedFeature(feature)`. Er erscheint damit auch am Perimeter – ohne ihn
gäbe es dort keinen zumutbaren Weg, alle Punkte zu wählen, und der wird seit
7f gebraucht.

`canMoveWholeFeature()` ist unverändert und behält ihre Aufgabe beim
Flächenziehen: der Perimeter bleibt bewusst nicht per Drag verschiebbar, das
hängt an `.feature-movable`. **Auswählen ist nicht Verschieben** – die alte
Bedingung beantwortete die falsche Frage.

**`isSupportedFeature()` muss ausdrücklich danebenstehen.** Die alte Typliste
trug **zwei** Aufgaben zugleich: die Verschiebeerlaubnis *und* den Filter gegen
nicht unterstützte Features. `getFeatureDescriptors()` filtert nicht. Ohne den
zweiten Teil erschiene der Knopf an Features ohne Punktmarker, die anschließend
in jedem Werkzeug denselben Ablehnungsgrund liefern.

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
bleibt, wo er hingehört: der Prüfbericht im Faltblock „Kartenprüfung" des
Inspektors, der Maßstabshinweis im Kartenfeld, der Bezugspunkt im Faltblock
„Koordinatenbezug" – ebenfalls im Inspektor, seit Etappe 7c.
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
vollständig im Inspektor, wer sie braucht, findet sie dort wieder. Die
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
Seitenleiste **und** Inspektor stehen gleichzeitig. Dieser Zustand endete mit
Etappe 7e, nicht mit Etappe 6 – die Hülle blieb stehen, bis „Karten verbinden"
ein Ziel hatte.

| Fenster | alles offen | Leiste zu | Inspektor zu | beide zu |
|---|---|---|---|---|
| 1920 × 1080 | −36,5 % | −29,9 % | −19,5 % | −12,9 % |
| 1440 × 900 | −50,2 % | −40,8 % | −26,2 % | −16,8 % |
| 1280 × 800 | −58,0 % | −47,1 % | −30,1 % | −19,2 % |

**Schlussmessung nach Etappe 7e**, als die Seitenleiste fiel und nur noch
Werkzeugleiste, Karte und Inspektor nebeneinanderstehen. Gemessen im selben
Browser und mit demselben Skript wie die Ausgangswerte, gegen die Baseline oben:

| Fenster | Leiste offen, Inspektor offen | Leiste zu, Inspektor offen | beide zu |
|---|---|---|---|
| 1920 × 1080 | 1 344 648 px², −15,2 % | 1 449 816 px², −8,5 % | 1 718 370 px², **+8,4 %** |
| 1440 × 900 | 722 568 px², −20,0 % | 807 576 px², −10,6 % | 1 024 650 px², **+13,5 %** |
| 1280 × 800 | 521 928 px², −22,9 % | 595 736 px², −12,0 % | 784 210 px², **+15,8 %** |

**Alle neun Werte treffen die frühere Vorschau exakt – Abweichung null.** Das
ist kein Zufall und auch kein Verdienst: die Vorschau war seinerzeit gemessen,
indem die Seitenleiste **eingeklappt** wurde, und eine entfernte Seitenleiste
ergibt dasselbe Raster wie eine eingeklappte. Der Wert der Übereinstimmung liegt
darin, dass die Vorhersage damit als Methode bestätigt ist, nicht darin, dass
sie überraschte.

**Der vierte Messwert, und er ist der eigentliche Gewinn:** bei **940 × 800** –
einer Breite, die keine der drei Standardgrößen trifft und in der die Leiste
erzwungen eingeklappt ist – wuchs die Kartenfläche von 147 616 px² auf
**371 676 px², also um +151,8 %**. Eingeklappt von 336 090 auf 560 150 px²,
**+66,7 %**. Dort saß der 940-px-Befund aus der Nachlese zu Etappe 6: das Raster
reservierte eine Spalte für eine Seitenleiste, die der Karte nichts zurückgab.
Für diese Breite gibt es keinen Vorschauwert, gegen den sich halten ließe – sie
kam als vierte Messgröße erst mit 7e dazu, und genau deshalb.

**Die Reserve des Inspektors bei 900 px ist unverändert 12 px**, deutsch und
englisch – nachgemessen nach 7e. Sie ist der Grund, aus dem „Karten verbinden"
ein Fenster wurde und kein Faltblock.

**Geändert gegenüber der ursprünglichen Etappenplanung: „Seitenleiste
auflösen" und die Schlussmessung rücken von Etappe 6 nach Etappe 7.** Etappe 6
füllt die vier Menüs, aber „Karten verbinden" hat noch kein Ziel. Solange
bleibt seine Hülle stehen, und mit ihr zwei weitere Abschnitte (siehe unten).
Das Ziel wurde mit Etappe 7e ein **Kartenfenster** und nicht, wie hier
ursprünglich geplant, ein Werkzeug der Leiste. Der hier früher angekündigte
geführte Modus kommt **nicht** – siehe die Richtigstellung unten. Die Hülle zu entfernen und das
Verbinden dabei zu verlieren wäre schlechter als eine Etappe mit einem
sichtbaren Rest. Die Schlussmessung wird in Etappe 7 gemacht, im selben Browser
und mit demselben Skript wie die Ausgangswerte.

**Seit Etappe 7e gibt es die Seitenleiste nicht mehr.** Feature-Navigation und
Koordinatenbezug sind in den Inspektor gezogen (7b und 7c), „Karten verbinden"
in ein Kartenfenster (7e); danach fiel die Hülle mitsamt `--sidebar-col`, der
980-px-Regel, `.section`, `.sidebar-collapsible*`, `#mobilePanelBtn` und der
Mobilausnahme. `main` hat seitdem **drei** Rasterspalten: Werkzeugleiste, Karte,
Inspektor.

**Die frühere Regel „Feature-Navigation und Koordinatenbezug ziehen NICHT
vorzeitig in den Inspektor" ist damit erledigt, nicht gebrochen.** Sie hieß
*nicht vorzeitig*, und ihr Zeitpunkt war Etappe 7; sie hat genau das getan,
wozu sie da war – die beiden Umzüge fanden in einer Etappe statt und nicht in
zweien. Der dritte ihrer drei Gründe ist eingelöst: die Höhenentscheidung wurde
**einmal mit allen Blöcken** getroffen und nicht zweimal mit halbem Bestand.

Was die beiden Umzüge tatsächlich gekostet haben, steht unten bei der
verbindlichen Reserve. Die dort früher genannte Befürchtung („zwei weitere
Faltblöcke kosten mindestens 42 px plus Lücken") war der Größenordnung nach
richtig: gemessen sind es zwei Blöcke à 20 bzw. 21 px plus je 10 px Lücke.

**„Karten verbinden" liegt seit 7e in einem Kartenfenster**, geöffnet über
einen **echten** Eintrag im Menü „Karte". Die frühere Fassung dieses Absatzes
sagte „es ist ein Modus, kein Menübefehl" und hielt den Eintrag heraus – das
wird hier **richtiggestellt, nicht gelöscht**, denn der Satz hatte einen engeren
Sinn, als er zu haben schien:

- Er richtete sich gegen einen **grauen** Eintrag, der Unerreichbarkeit
  behauptet hätte, während der Befehl zehn Zentimeter weiter links in der
  Seitenleiste funktionierte. **Diese Regel gilt unverändert** und hält
  weiterhin Zoom, Einpassen und „Karte prüfen" aus den Menüs heraus; sie
  verbietet auch einen Platzhalter für die noch ungebaute Mähbahnen-Vorschau.
  Ein Eintrag, der das Fenster öffnet, **in dem der Befehl liegt**, behauptet
  dagegen nichts Falsches.
- **Verbinden ist heute kein Modus.** Es besteht aus zwei Statuszeilen
  (`mergeAInfo`, `mergeBInfo`), einem Kontrollkästchen (`showMergePreview`),
  einer Meldung (`mergeStatus`) und einem Auslöser (`mergeMapsBtn`); Start und
  Ende beider Perimeter kommen aus den **Punktknöpfen des Inspektors**. Der
  frühere Zusatz „mit Etappe 7d wird daraus ein geführter Modus – und der
  bedient dasselbe Fenster" ist **richtiggestellt, nicht gelöscht**: es bleibt
  bei keinem Modus. Der Grund steht unmittelbar darunter.

**Warum aus 7d kein geführter Modus wurde – Richtigstellung mit Grund.** Der
Satz entstand, **bevor bekannt war, dass Start und Ende gar keine zwei Größen
sind, sondern eine**: die Drehung des Rings. Ein Modus hätte den Nutzer durch
vier Abfragen geführt, von denen je zwei dasselbe verstellen – er hätte die
Überschreibung **geführt statt sie zu beheben**.

**Der Befund im Einzelnen.** `getPerimeterEndpoints()` liest `unique[0]` als
Start und `unique[letzter]` als Ende – beide aus derselben Ringreihenfolge.
`setSelectedAsPolygonStart()` dreht den Ring auf `[S …, … S-1]`,
`setSelectedAsPolygonEnd()` auf `[E+1 …, … E]`. Daraus folgt:

> **„Ende E setzen" ist identisch mit „Start E+1 setzen".** Wer beide Gesten
> nacheinander ausführt, **löscht die erste** – außer E ist zufällig der
> direkte Vorgänger von S. **Nichts meldet das**; beide Knöpfe geben sogar
> dieselbe Erfolgsmeldung aus („Punkte neu nummeriert: Start = 1, Ende = n").

**Pro Karte wählt der Nutzer damit EINE Kante, die aufgetrennt wird** – zwei
Freiheitsgrade, nicht vier. Genau so heißt es seit 7d-1 auch in der
Oberfläche: **Auftrennstelle**.

**Warum es nie auffiel – und das ist der eigentlich teure Teil des Befundes:**
im ganzen Verzeichnis `tools/` wird **kein einziges Mal** ein Start- oder
Endpunkt gesetzt. Sämtliche Merge-Zusicherungen laufen gegen die Reihenfolge,
die zufällig in der Datei steht. **Die Führung war nie geprüft**, deshalb
konnte die stumme Überschreibung beliebig lange bestehen. Das ist dieselbe
Klasse wie „eine Zusicherung über ein Ausbleiben beweist nichts", nur eine
Stufe davor: es gab überhaupt keine Zusicherung. Mit 7d-3 gibt es sie.

**Was 7d stattdessen ist – drei Teilschritte, kein Modus:**

| Teilschritt | Inhalt |
|---|---|
| 7d-1 | `mergeStatus` nennt die Vorgabe, statt „Bereit." zu behaupten; die beiden neuen Kanten werden auf Kreuzungen geprüft – **Warnung, keine Sperre** |
| 7d-2 | „Auftrennstelle setzen" bei genau zwei benachbarten Punkten desselben Rings; `mergeAInfo`/`mergeBInfo` nennen die gewählte Stelle |
| 7d-3 | Zusicherungen, die das **Ergebnis** zählen – und die Überschreibung durch die beiden alten Knöpfe belegen |

**Die Auftrennstelle ist keine neue Auswahlbedingung, sondern der Fall, den das
Begradigen ablehnt.** `getSelectedSection()` gibt bei zwei **benachbarten**
Punkten den Grund `"adjacent"` zurück, weil zwischen ihnen nichts zu
begradigen ist – und genau diese Lage ist die aufzutrennende Kante.
`getMergeCutTarget()` ruft deshalb dieselbe Funktion und dreht ihr Urteil um,
statt die Kette aus Feature-, Ring- und Typprüfungen ein zweites Mal
hinzuschreiben. Hinzu kommen nur zwei Bedingungen, die das Begradigen nicht
braucht: es muss der **Perimeter** sein, und sein Ring muss **geschlossen**
sein.

**Die Drehung steht seit 7d-2 an genau einer Stelle** (`rotateRingToStart()`).
Drei Wege lösen sie aus – „Startpunkt setzen", „Endpunkt setzen",
„Auftrennstelle setzen" –, aber es gibt nur einen Rechenweg. Drei Kopien wären
genau dort auseinandergelaufen, wo der Unterschied ohnehin schwer zu sehen
ist.

**Der Knopf liegt im Verbinden-Fenster, nicht im Inspektor** – obwohl er an
der Auswahl hängt und damit nach der Hausregel dorthin gehörte. Der Grund ist
gemessen und derselbe wie bei 7e: ein weiterer Knopf im Inspektor kostet dort
rund 40 px, und die verbindliche Reserve bei 900 px Fensterhöhe beträgt 12 px.
Sein Ablehnungsgrund steht **sichtbar** unter ihm in einem `.tool-reason`-Feld,
nicht im Tooltip – dieselbe Entscheidung wie bei den Zeichenknöpfen (Etappe 3)
und den Umformwerkzeugen (Etappe 5).

**Seine Freigabe hängt an `updateSelectionPanel()`, nicht an
`updateMergePanel()`.** Das ist kein Schönheitsfehler, sondern notwendig:
`updateMergePanel()` läuft an Kartenwechseln und Geometrieänderungen, aber
**nicht** an einer reinen Auswahländerung – der Knopf bliebe stehen, wie er
zufällig zuletzt war.

**Für 7d-3 vorgemerkt, weil es heute nur im Scratchpad gemessen ist:**

- **Undo holt die Auftrennstelle zurück** – Ring **und** Marke. Diese
  Zusicherung gehört in den Bestand, denn sie belegt, dass `cutEdgeChosen` im
  Snapshot mitreist; ohne sie stünde die Behauptung „`cloneMapSlot()` klont
  tief" ungeprüft da. Gemessen: nach dem Auftrennen und einem Undo steht der
  Ring wieder auf der Dateireihenfolge und der Infoblock wieder auf
  „Auftrennstelle aus der Datei."
- Dazu: die Überschreibung durch die beiden alten Knöpfe (Start setzen, Ende
  setzen, Ring steht auf E+1), die Warnung bei gekreuzten Brücken, und der
  Vorgabetext bei ungesetzter Stelle.

**Fallstrick für genau diese Tests, schon einmal zugeschlagen:** ein Klick auf
einen **bereits markierten** Punkt hebt die Gruppe **nicht** auf. Wer im selben
Test nacheinander zwei verschiedene Paare wählt, hat beim zweiten Mal drei
Punkte ausgewählt und bekommt den Grund „genau zwei … auswählen" – der Test
sieht dann wie ein Fehler des Knopfes aus und ist einer des Skripts. Vorher
`clearVertexSelection()` auslösen (Escape ohne offenes Fenster).

**Sechs Texte des Verbinden-Fensters hatten keine englische Fassung** – nicht
zwei, wie zunächst angenommen. Gefunden wurden sie erst, als 7d-1
`updateMergePanel()` in `refreshDerivedUi()` einhängte: **ein Text, der nie auf
dem abgeleiteten Weg lief, kann seine Übersetzungslücke gar nicht zeigen.** Die
Lücke war in beiden Sprachen unsichtbar, weil beim Sprachwechsel schlicht
nichts passierte. Betroffen waren „Kein gültiger Perimeter.",
„Nicht geladen.", die beiden Sperrmeldungen zu Perimeter und Skalierung sowie
die Koordinatenzeilen `Start:`/`Ende:` – letztere waren **ein einziger
Textknoten mit Zahlen darin** und damit weder als Wörterbucheintrag noch als
Muster erfassbar. Sie sind mit 7d-2 in einzelne Elemente zerlegt.

**Die Regel daraus, allgemeiner als dieser Fall: wer eine Übersetzungslücke
sucht, prüft zuerst, ob der Text beim Sprachwechsel überhaupt angefasst
wird.** Ein Text, den niemand neu schreibt, sieht in beiden Sprachen richtig
aus, solange man ihn nur ansieht.

### Der Zustand „Beide" – eigene Etappe, nicht 7d

**Beide Karten gleichzeitig aktiv – als DRITTER ZUSTAND, nicht als Schalter.**
Eintrag, **kein Auftrag**; die fünf Punkte darunter sind zu **entscheiden**,
bevor gebaut wird.

**Der Eintrag stand ursprünglich unter 7d und ist mit 7d-1 herausgelöst
worden.** Drei Gründe, und jeder trägt für sich:

1. **Das Verbinden braucht ihn nicht.** Weder in der heutigen Fassung noch in
   der von 7d. Beide Auftrennstellen lassen sich nacheinander wählen; ein
   Kartenwechsel dazwischen ist ein Menübefehl.
2. **Die Hälfte „sichtbar" existiert längst.** `renderOtherMapOverlay()`
   zeichnet die inaktive Karte gedämpft **mitsamt hervorgehobenem Start- und
   Endpunkt ihres Perimeters**. Was „Beide" wirklich hinzufügt, ist allein
   **bearbeitbar** – also genau die Frage 2 unten, die mit „heute nicht
   darstellbar" beantwortet ist.
3. **Die Größe passt nicht zu 7d.** 7d ist ein Schritt an drei Funktionen;
   „Beide" ist ein Umbau am Auswahlmodell.

**Der teure Teil ist NICHT das Feld im Deskriptor.** Das ist die naheliegende
Fehleinschätzung, deshalb steht sie hier ausdrücklich: einen Slot an
`enumerateEditableVertices()` anzuhängen ist eine Stelle, und die Auflösung
gegen `data` betrifft geschätzt 20 bis 30 weitere (Grobmaß: 114 Vorkommen von
`featureIndex`, 64 von `data.features`). Die Historie ist sogar schon fertig –
`createWorkspaceSnapshot()` hält beide Slots.

**Teuer ist die Folgefrage: was tut JEDES Werkzeug bei gemischter Auswahl?**
Begradigen, Reduzieren, Rechtwinklig, Löschen, Verschieben, die E/N-Felder –
sobald eine Auswahl zwei Slots enthalten *kann*, braucht jedes davon eine
Antwort, und keine davon ist ableitbar. **Das ist der Aufwand, nicht die
Umstellung.**

**Die kleine Lesart wird NICHT dazugenommen.** „Beide" nur als *sichtbar*, mit
slot-reiner Auswahl, wäre billig – und wäre **die Hälfte des Gemeinten unter
demselben Namen**. Ein Nutzer, der den Eintrag „Beide" wählt und dann nur eine
Karte bearbeiten kann, hat keinen reduzierten Zustand vor sich, sondern einen
falsch beschrifteten. Entweder beides, oder der Eintrag heißt anders.

Gemeint ist beides zugleich: **sichtbar und bearbeitbar**, und gezielt
wählbar. Der heutige Einzelmodus bleibt unverändert, das Gleichzeitige tritt
daneben. Das Menü „Karte" bekommt deshalb neben „Karte A" und „Karte B" einen
**dritten Eintrag „Beide"**.

**Warum ein dritter Eintrag und kein Schalter über den beiden:** die zwei
Slot-Einträge sind eine Radiogruppe (`role="menuitemradio"`), und `aria-checked`
ist seit Etappe 6 die **einzige** Quelle des aktiven Zustands – die frühere
Klasse `active` war eine zweite und ist genau deshalb entfallen. Ein Schalter
daneben führte diese zweite Quelle wieder ein: „A angekreuzt **und**
gleichzeitig beide" wäre ein Zustand, den `updateMapSlotUi()` nicht ausdrücken
kann, ohne zu lügen. Als dritter Eintrag bleibt die Regel **genau einer ist
gewählt** – einer davon heißt eben „beide".

**1. Wohin geht ein neu gesetzter Punkt?** Ein Klick trifft eine Stelle, aber
nicht eindeutig eine Karte: die Perimeter dürfen sich überlappen. Drei
Antworten, die zu diesem Programm passen:

| Antwort | was sie für die Bedienung heißt |
|---|---|
| **Eine der beiden bleibt Zielkarte**, die andere ist nur mitbearbeitbar | Das Neue landet immer vorhersagbar; der Preis ist ein **vierter** Zustand („beide, Ziel A" / „beide, Ziel B") oder eine zweite Anzeige neben `aria-checked` – und damit genau die zweite Quelle, die der dritte Eintrag vermeiden sollte |
| **Die Karte des zuletzt angefassten Features** | Kein zusätzlicher Zustand, und es trifft meistens die Absicht. Aber die Zielkarte ist dann **abgeleitet und unsichtbar**; wer nichts angefasst hat, hat keine – der erste Klick nach dem Umschalten wäre unbestimmt |
| **Zeichnen ist im Zustand „beide" gesperrt**, mit Grund | Ehrlich und billig: die Zeichenknöpfe tragen ihren Ablehnungsgrund schon heute in `data-blocked-reason`. „Beide" wäre dann ein Ansichts- und Umform-Zustand, kein Zeichenzustand |

Die dritte ist die einzige, die ohne neuen verborgenen Zustand auskommt. Sie
schränkt dafür ein, was der Modus kann. **Das ist die Abwägung, nicht die
Antwort.**

**2. Worauf wirken die Umformwerkzeuge bei gemischter Auswahl? Nachgesehen:
der Fall lässt sich heute gar nicht ausdrücken.** Ein Punktdeskriptor aus
`enumerateEditableVertices()` besteht aus `featureIndex`, `containerPath` und
`pointIndex` – **er trägt keinen Slot**. `getSelectedSection()` und
`getWholeFeatureTarget()` lösen ihn über `data.features?.[featureIndex]` auf,
und `data` ist die **eine** globale Kartendatenstruktur, die `activateMap()`
auf den aktiven Slot zeigen lässt. „Feature 3" heißt damit „Feature 3 der
aktiven Karte", und beide Karten haben ein Feature 3.

Daraus folgt: **eine gemischte Auswahl ist keine Erweiterung, sondern ein
Umbau des Auswahlmodells.** Entweder bekommt der Deskriptor ein
Slot-Feld – dann müssen alle Stellen mit, die heute `featureIndex` gegen `data`
auflösen, einschließlich `mapSlots`-Sicherung und -Rückholung (die laut
Abschnitt 2 schon einmal an sieben Stellen gleichzeitig anzufassen war) –,
oder die Auswahl bleibt slot-rein und „beide" heißt nur: beide **sichtbar**,
bearbeitbar bleibt eine. Die zweite Lesart ist erheblich kleiner und
widerspricht der Formulierung „sichtbar UND bearbeitbar"; **welche gilt, ist zu
entscheiden.**

**3. Was zeigt der Inspektor, besonders beim Bezugspunkt?** `referenceOrigin`
ist global und beschreibt die physische RTK-Basis; der Konflikt wird aus
`slot.fileOrigin` gegen `referenceOrigin` **abgeleitet**
(`getSlotOriginConflict()`), und `getActiveOriginConflict()` sieht nur den
aktiven Slot an. Im Zustand „beide" gäbe es zwei Slots und damit zwei mögliche
Befunde – **derselbe Fall, den `getMergeOriginIssue()` heute schon über beide
Slots durchläuft und der das Verbinden sperrt.** Naheliegend ist deshalb, für
„beide" dieselbe Funktion zu benutzen statt einer neuen. Zu entscheiden bleibt,
**ob ein Widerspruch den Zustand „beide" ebenso sperrt wie das Verbinden**:
zwei Karten mit wirklich verschiedenen Basen gleichzeitig zu bearbeiten hieße,
sie in einem Rahmen zu zeigen, in dem eine von beiden falsch liegt – und zwar
**still**, denn die Geometrie sieht plausibel aus.

**4. Was zeigt die Statuszeile als Dateinamen?** Heute baut
`updateMapSlotUi()` den Text als `Karte ${activeMapId} · ${currentFilename}`
plus `*` bei ungespeicherten Änderungen; `currentFilename` ist eine globale
Variable, die `activateMap()` aus dem aktiven Slot setzt. Für „beide" gibt es
keinen einen Namen. Zu entscheiden: beide Namen nebeneinander (das Feld ist
eine **Kurzform** und wird ab 1000 px ohnehin gekappt – siehe die Regel „wird
eine länger als eine Zeile, ist es keine Kurzform mehr"), nur der Name der
Zielkarte aus Punkt 1, oder ein eigener Text wie „Karte A + B". Die
Dirty-Markierung `*` trifft dieselbe Frage ein zweites Mal: sie gilt heute je
Slot.

**5. Woran hängt heute, dass genau ein Slot aktiv ist – die Fundstellen:**

| Datei | Stelle |
|---|---|
| `index.html` | `updateMapSlotUi()` setzt `aria-checked` aus `activeMapId === "A"` bzw. `"B"` – der Zustand steht **nur** dort |
| `index.html` | `activateMap()` setzt `data`, `currentFilename`, `dataDirty`, `selectedVertex`, `selectedVertices` auf **einen** Slot |
| `index.html` | `getActiveSlot()` / `getActiveOriginConflict()` – ein Slot |
| `index.html` | Exportname und `slot.originalFilename` gehen über `currentFilename` |
| `tools/test-menu.mjs` | „Karte A ist nach dem Laden angekreuzt" prüft die Zeichenkette `"A:true B:false"` über **beide** Knöpfe – diese Zusicherung bricht bei einem dritten Zustand als Erste |
| `tools/test-menu.mjs` | „Karte B ist ohne Datei gesperrt"; „deutsch nennt Karte A aktiv" (`"Karte A · aktiv"`) und die englische Entsprechung |
| `tools/test-menu.mjs` | „der Wechsel bringt Karte A mit vier Punkten zurück" – zählt Marker, prüft also die **Wirkung** des Umschaltens, nicht nur das Attribut |
| `tools/test-map-switch.mjs` | die ganze Datei: Auswahl je Slot, „auf Karte B ist die Auswahl leer", „Karte A hat weiterhin zwei" |
| `tools/test-merge.mjs` | `menueBefehl(page, "Karte", "Karte A")` an drei Stellen, danach Zusicherungen über „Karte A hat genau einen Perimeter" |
| `tools/test-origin-conflict.mjs` | lädt A und B nacheinander und prüft, dass der **aktive** Bezugspunkt unverändert bleibt |

Ein dritter Eintrag verändert damit mindestens `test-menu.mjs` (Radiogruppe)
und berührt die drei anderen. **Wer „Beide" baut, fasst diese Zusicherungen im
selben Schritt an** – das ist genau die Regel „UI-Element verschieben – Wege
statt Bezeichner", nur für einen hinzukommenden Zustand statt für einen Umzug.

**Warum nicht in den Inspektor?** Gemessen, nicht erwogen: ein weiterer
Faltblock kostet dort 30 bis 31 px (20–21 px Block plus 10 px Lücke) und
brächte die verbindliche Reserve bei 900 px Fensterhöhe von 12 px auf rund
**−19 px** – das Höhenziel „bis 900 px scrollfrei" wäre gebrochen. Ein Fenster
kostet null Höhe, solange es zu ist.

**Und warum nicht ein Block, der nur bei zwei geladenen Karten erscheint?**
Das hätte die Höhe gerettet, widerspricht aber der Hausregel des Inspektors: die
Umformwerkzeuge stehen ausdrücklich auch dann da, wenn sie nicht gehen, weil man
sonst nie erfährt, was man dafür tun müsste.

**`#mobilePanelBtn` ist mit 7e entfallen**, zusammen mit `.mobile-panel-btn`,
`aside.mobile-open` und der Mobilausnahme. Er war bis dahin der **einzige** Weg
zum Verbinden-Befehl auf einem Telefon – nachgemessen bei 400 × 800: ohne ihn
hatte `#mergeMapsBtn` dort einen Kasten von 0 × 0 und `isVisible() === false`.
Genau deshalb durfte er erst gehen, als der Befehl ein anderes Ziel hatte.
`tools/test-toolbar.mjs` hält den erreichten Zustand fest: bei 400 × 800 sind
Menüleiste, Werkzeugleiste, Karte, Inspektor und Statuszeile vorhanden, das
Verbinden-Fenster ist über das Menü erreichbar und wirklich getroffen, und
weder `#sidebar` noch `#mobilePanelBtn` existieren noch.

Der Inspektor war von `aside { display:none }` nie betroffen: `.inspector` ist
eine Klasse und schlägt den Elementselektor. Die Regel galt allein der
Seitenleiste – das steht jetzt als Kommentar an der Stelle, damit es niemand
für eine Lücke hält.

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

**Die festen Rasterspalten stehen als Variablen an `.app`** (`--rail-col`,
`--inspector-col`), nicht als eigene Regel je Kombination. Mit unabhängig
einklappbaren Bereichen gäbe es sonst eine Regel je Kombination, die alle
dasselbe Raster wiederholen – und die letzte vergisst irgendwann jemand. `main`
hat damit genau **eine** Rastervorlage mit **drei** Spalten: Werkzeugleiste,
Karte, Inspektor.

Bis Etappe 7e gab es eine dritte Variable `--sidebar-col` und eine **zweite**
Vorlage für den Fall, dass die Seitenleiste auf `display:none` stand – sie fiel
sonst aus der Rasterzuordnung, und die übrigen Spalten rutschten eine nach
vorn. Beides ist mit der Seitenleiste entfallen.

**Und die Elemente lesen dieselben Variablen, statt ihre Breite zu
wiederholen.** `.tool-rail` trägt `width:var(--rail-col)`, `.inspector`
`width:var(--inspector-col)`. Die eingeklappten Werte stehen ebenfalls nur
einmal, nämlich an `.app.rail-collapsed` (56 px) und
`.app.inspector-collapsed` (34 px); die Regeln für den eingeklappten Zustand
setzen nur noch Polsterung und Überlauf. **Jede der vier Zahlen steht damit an
genau einer Stelle.**

Das war bis zur Nachlese von Etappe 6 nicht so, und es hatte eine Wirkung: die
Medienregel für ≤ 980 px wiederholte `168px` und `320px` als feste Werte – die
Regel selbst ist mit Etappe 7e entfallen, der Absatz bleibt als Historie.
Unterhalb von 1000 px ist die Leiste aber **erzwungen eingeklappt** – das
Raster reservierte dort also 168 px für ein 56 px breites Element und 320 px
für einen Inspektor, den man auf 34 px einklappen konnte, ohne dass die Karte
etwas davon hatte. Bei 940 × 800 blieben der Karte 112 px Breite, egal was man
einklappte. Seit die Regel die Variablen benutzt, sind es 224 px ausgeklappt
und 510 px eingeklappt.

`tools/test-toolbar.mjs` sichert das als Wirkung ab: die berechnete
Rasterspalte muss die gemessene Elementbreite treffen – ausgeklappt,
eingeklappt und bei erzwungener Enge unter 980 px.

**Die Rasterspalten sind fest, nicht `auto`.** Ein `auto`-Track nimmt sich
seine max-content-Breite, sobald Platz frei wird – beim Einklappen der
Seitenleiste wuchs die Spalte der Werkzeugleiste von 168 auf 659 px und fraß
den Gewinn auf.

**Zwischenstand-Schalter der Seitenleiste:** `#sidebarToggle` **war** der
Behelf für die Zeit, in der Seitenleiste und Inspektor gleichzeitig standen,
und ist mit Etappe 6 b1 entfallen – bewusst ohne `localStorage`, damit der
vorübergehende Zustand nicht in eine spätere Ausgabe überlebt. Er steht hier
nur noch als Beispiel: **ein Behelf bekommt kein Gedächtnis.**
`tools/test-inspector.mjs` sichert seine Abwesenheit zu.

**Menüleiste: der Alt-Buchstabe ist ABGELEITET, nicht gesetzt.** Er ist der
erste Buchstabe des Menütitels **in der laufenden Sprache** – deutsch
Alt+D/A/K/H für Datei, Ansicht, Karte, Hilfe, englisch Alt+F/V/M/H für File,
View, Map, Help. **Die Kürzel wechseln damit mit der Sprache mit.**

Eine Tabelle Buchstabe → Menü wäre eine zweite Quelle für dieselbe Tatsache:
sie stimmte nur, solange die Titel so heißen, und eine Umbenennung liesse das
Kürzel still auf das falsche Menü zeigen. `menuAltKey()` liest deshalb den
Titeltext.

**Der Preis dafür ist eine Prüfung, und sie steht in `test-cassandra.mjs`:**
hätten in einer Sprache zwei Titel denselben Anfangsbuchstaben, gewönne im
Browser schlicht das erste Menü, und das zweite wäre per Tastatur
unerreichbar – ohne Fehler, ohne Meldung. Geprüft wird deshalb **jedes
Wörterbuch**, nicht nur das laufende, und die Meldung nennt **beide**
kollidierenden Titel. Eine neue Sprache scheitert damit dort und nicht erst
beim Durchklicken. Der Melder selbst wird an einem künstlichen Paar
gegengeprüft – sonst bestünde „keine Kollision" auch, wenn er gar nichts fände.

**Markiert wird über `.menu-title::first-letter`, nicht über ein `<span>`.**
Ein `<span>` um den ersten Buchstaben zerlegte den Titel in **zwei**
Textknoten („D" + „atei"); der i18n-Schnappschuss fände für keinen der beiden
einen Wörterbucheintrag, und der Titel bliebe im Englischen deutsch – sichtbar
erst im englischen Durchlauf, also spät. `::first-letter` liest dagegen
dieselbe Quelle wie das Kürzel: den **gerenderten** ersten Buchstaben.
Markierung und Kürzel sind damit beide abgeleitet und können nicht
auseinanderlaufen; beim Sprachwechsel wandert der Unterstrich von selbst mit.
Gemessen kostet er **0 px** – je Titel und für die ganze Leiste, in beiden
Sprachen.

Dass der Unterstrich dauerhaft steht und nicht erst beim Drücken von Alt
erscheint, ist eine Entscheidung: die Einträge *im* Menü zeigen „Strg+O" und
„Strg+S" ebenfalls dauerhaft, und ein Zustand, der nur solange gilt, wie eine
Taste gedrückt ist, kann nach Alt+Tab hängenbleiben.

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

Die Knöpfe des Inspektors behalten das native `disabled`: sie stehen in ihrem
Block bei ihresgleichen, dort erklärt sich der Zustand aus den Nachbarn und aus
dem `.tool-reason`-Feld darunter. Bis Etappe 7e galt derselbe Satz für die
Knöpfe der Seitenleiste.

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
Kopfzeile → Werkzeugleiste → Karte → Inspektor; seit Etappe 7e endet sie dort,
weil die Seitenleiste entfallen ist. Der Test
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

**Der verbindliche Wert ist: 12 px Reserve bei 900 px – und 11 px, sobald der
Bezugspunkt-Fold seine Kurzform hat.** Beide Zahlen stehen hier mit ihrer
Bedingung, weil sonst nach dem nächsten Schritt eine Zahl dastünde, die niemand
nachzieht: sie sähe plausibel aus. Der Fold aus 7c misst **20 px** statt der
21 px seiner vier Geschwister, weil ihm als einzigem die
`.fold-summary`-Kurzform fehlt; bekommt er sie, wächst er auf 21 px und die
Reserve sinkt auf 11 px. **Bis dahin gilt 12, danach 11.**

Das ist die Zahl, die der nächste Block schlagen muss, der in den Punktzustand
will. Gemessen mit ausgewähltem Startpunkt (Rolle sichtbar), 1600 px breit,
deutsch und englisch identisch:

| Fensterhöhe | Spalte | Inhalt | Reserve |
|---|---|---|---|
| 1000 px | 859 | 747 | 112 px |
| 900 px | 759 | 747 | **12 px** (11 px mit Kurzform) |
| 800 px | 659 | 747 | −88 px, zugelassen |

Zum Vergleich der Stand vor 7b und 7c, damit die Kosten der beiden Umzüge
ablesbar bleiben: Inhalt 739 px, Reserve 120 / **20** / −80 px. Die beiden
Faltblöcke haben zusammen 8 px mehr gekostet, als die 42-px-Schätzung oben
erwarten ließ – zwei Blöcke à 20 bzw. 21 px plus zweimal 10 px Lücke.

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
`:not(.active)`, in der Leiste **und** im Inspektor: „Search Wire verlängern"
und „Docking-Pfad verlängern" – seit Etappe 6 b3 im Block „Bestand" – sind
während des Verlängerns ebenfalls beides zugleich.

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
- **Die Werkzeugvorschauen liegen in der Ghost-Gruppe und erben deren
  Deckung.** `renderStraightenPreview()`, `renderReducePreview()` und
  `renderRectifyPreview()` hängen ihre Elemente in `selectionGhostGroup`, und
  die trägt `opacity:.42`. Die Rechtwinklig-Vorschau ist deshalb nominell
  blassgrün (`rgba(180,255,160,.85)`), sichtbar aber grau – nicht mehr zu
  unterscheiden von den Vorher-Ghosts. Das ist ein Verstoß gegen die Regel
  oben, und zwar ein sinnentstellender: die Ghosts zeigen die **Vergangenheit**
  („so lag der Punkt beim letzten Speichern"), die Vorschauen einen
  **Vorschlag für die Zukunft**.

  In der Gruppe liegen sie nur wegen der Z-Ordnung – sie sollen hinter der
  aktiven Geometrie stehen; der Kommentar an `renderStraightenPreview()` sagt
  das selbst. **Vorschlag:** eine eigene Gruppe an derselben Z-Position mit
  eigener Deckung. Dann ist Grün wieder grün.

  Nebenbei aufgefallen und dazugehörig: `renderReducePreview()` benutzt für
  seinen Ergebnispfad die Klasse `.straighten-preview-line` des Begradigens.
  Zwei Werkzeuge, eine Farbe – dieselbe Regel, dieselbe Runde.

- **Strichbreiten und Leuchten:** MapmakerBT zeichnet etwa doppelt so kräftig
  (Perimeter 5, Exclusion 4, Dock 5, Search Wire 4, Punktrand 4 gegen unsere
  2,2 / 2,0 / 2,6 / 2,4 / 1,4) und legt auf jede Form ein
  `filter: drop-shadow(...)` in ihrer eigenen Farbe. Zurückgestellt: das ist
  eine Frage des Erscheinungsbildes, keine der Bedeutung.

**Der Zeitpunkt der Vorschauen gehört NICHT mehr in diese Runde.** Er ist
Verhalten, nicht Farbe, und er betrifft alle drei Werkzeuge statt eines – er
steht als Entscheidung für Etappe 7 in Abschnitt 7.

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

**Ein Feature nimmt genau EINEN Weg – und daran hing der Verdopplungsfehler.**
Der Filter, der `bAdditionalFeatures` bildet, lautet heute
`type !== "perimeter" && !MERGE_SINGLETON_TYPES.includes(type)`. Der zweite
Teil ist die Reparatur aus `d05345e` (07.09.); vorher entfernte der Filter
**nur den Perimeter**, und die beiden Singletons liefen dadurch durch **beide**
Wege – einmal angehängt, einmal über `mergeSingletonFeatures()`
zusammengeführt. Das Ergebnis trug dann zwei Docking-Pfade und zwei
Search Wires.

**`mergeSingletonFeatures()` war dabei immer richtig.** Der Fehler saß in der
**Arbeitsteilung**, nicht in der Rechnung – eine Fehlersuche in der
Zusammenführungsfunktion wäre ergebnislos geblieben. Wer hier etwas ändert,
prüft deshalb zuerst, ob ein Feature genau einen Weg nimmt, und erst danach,
was auf dem Weg passiert.

**Warum der Fehler so selten sichtbar war:** er zeigt sich **nur, wenn beide
Karten leere Platzhalter tragen.** Hat auch nur eine Seite einen befüllten
Pfad, bricht `getMergeSingletonConflict()` vorher ab, und es wird gar nicht
verbunden. Leere Platzhalter sind aber der Normalfall, nicht die Ausnahme:
CaSSAndRA schreibt Docking-Pfad und Search Wire **immer** in den Export, auch
ohne Punkte. Der Fehler traf also die gewöhnlichste Ausgangslage und blieb
trotzdem lange unbemerkt, weil zwei leere Platzhalter gleich aussehen – der
Unterschied steht nur im Namen.

**Nachträglich diagnostiziert an zwei echten Nutzerkarten** (nicht im
Repository). Beide trugen je einen leeren Docking-Pfad und eine leere Search
Wire; das fehlerhafte Ergebnis hatte 18 Features mit
`{perimeter: 1, dockpoints: 2, searchwire: 2, exclusion: 13}`. **Die
Zusatzfeatures waren korrekt benannt und `supported`** – nicht, wie zunächst
vermutet, vom Typ `other` mit einem Namen, den `FEATURE_TYPE_BY_NAME` nicht
kennt. Der heutige Stand liefert mit denselben Dateien 16 Features und
`{perimeter: 1, dockpoints: 1, searchwire: 1, exclusion: 13}`, in beiden
Ladereihenfolgen.

**Die Zusicherungen von 7a1 hätten den Fehler gefunden – belegt, nicht
geschlossen.** Wird in einer Arbeitskopie **nur** die eine Bedingung
`!MERGE_SINGLETON_TYPES.includes(type)` entfernt, reißen in
`tools/test-merge.mjs` **fünf** Zusicherungen, darunter „genau ein
Docking-Pfad" mit dem Wert 2. Das ist genau der Gewinn der Umstellung aus 7a1
von „den Prüfbericht befragen" auf „das Ergebnis zählen": die alten Fassungen
lasen einen Bericht und hätten auch bei leerem Bericht bestanden.

**Einschränkung dazu, damit der Beleg nicht mehr behauptet, als er zeigt:** der
echte Vorgängerstand `d05345e^` ließ sich nicht gegenprüfen – er kennt die
Menüleiste noch nicht, und der heutige Test kann ihn nicht bedienen. Der Beleg
isoliert die Bedingung deshalb im **heutigen** Code. Über die Zusicherungen
sagt das mehr, über den damaligen Build weniger.

**Die Lehre, und sie gilt über diesen Fall hinaus: ein offener Punkt ohne
Reproduktionsfall kann längst behoben sein und trotzdem die Planung binden.**
Dieser hier hat es getan – die Reihenfolge der Etappe 7 war nach ihm gerichtet,
und die Behebung lag zu diesem Zeitpunkt schon Wochen zurück; die
Beispieldatei, die den Fehler zeigte, war neun Tage **älter** als die
Reparatur. **Wer einen Fehler notiert, notiert das Datum des Befundes dazu** –
sonst lässt sich später nicht entscheiden, ob ein Punkt noch offen ist oder nur
noch dasteht.

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
  keinerlei WGS84-Bezug, der Ursprung war hart E=0/N=0. Er wird im
  Inspektor unter "Koordinatenbezug" gepflegt (bis Etappe 7c in der
  Seitenleiste), in `localStorage`
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

**Mobile/Android – geänderte Etappenplanung, Etappe 8.** Die frühere Fassung
dieser Regel lautete „Chrome-auf-Android-Kompatibilität erhalten – Touch-
Zielgrößen, Seiten-Scrolling, Karteninteraktion, Toolbar-Overflow,
Formulargrößen. Desktop-Verhalten dabei nicht brechen." Sie gilt in dieser
Form nicht mehr.

**Entscheidung: das Telefon fällt als Zielgerät heraus. Zielgeräte sind
Desktop und Tablet.** Der Grund ist nicht die Technik, sondern der Umfang: der
Editor trägt eine Menüleiste mit vier Menüs, eine dreigruppige Werkzeugleiste,
einen Inspektor mit sieben Zuständen und fünf Faltblöcken, drei Kartenfenster
und eine zweizeilige Statuszeile. Auf 400 px Breite lässt sich das stapeln,
aber nicht bedienen – und eine eigene **reduzierte Handyfassung wird nicht
gebaut**, weil sie eine zweite Oberfläche wäre, die neben der ersten gepflegt
werden müsste. Das ist dieselbe Fehlerklasse wie ein eingechecktes Erzeugnis
neben seiner Quelle: eine Tatsache an zwei Orten.

**Was die Entscheidung ausdrücklich NICHT heißt:** der Editor wird bei 400 px
**nicht gesperrt und nicht abgewiesen**. Kein Hinweisbildschirm, keine
Mindestbreite, keine Weiche. Wer dort etwas ansehen will, soll es können. Es
wird nur nichts mehr dafür gebaut und nichts mehr dafür gemessen.

**1. Die neue untere Zielgröße: 744 px – und die heutige Schwelle liegt
falsch.** Übliche Tablet-Breiten in CSS-Pixeln:

| Gerät | Hochformat | Querformat |
|---|---|---|
| iPad mini 8,3" | **744** | 1133 |
| ältere iPads, viele Android-Tablets | 768 / 800 | 1024 / 1280 |
| iPad 10,9" | 820 | 1180 |
| iPad Air / Pro 11" | 834 | 1194 |
| Surface Pro | 912 | 1368 |
| iPad Pro 13" | 1024 | 1366 |

Das Feld beginnt also bei **744** und ist ab 1024 unauffällig. Die heutige
Schwelle von **760 px schneidet mitten hindurch**: ein iPad mini im
Hochformat (744) bekommt das Telefon-Layout, ein iPad bei 768 das
Desktop-Layout – zwei Tablets derselben Familie auf verschiedenen Seiten einer
Grenze, die für Telefone gedacht war. Das ist kein Fehler des alten Entwurfs,
sondern eine Folge der Umwidmung.

**Entschieden: die Grenze ist 744 px, nicht 768.** Eine Grenze soll das
kleinste Zielgerät **einschließen**, nicht knapp daneben liegen. Bei 768 fiele
das iPad mini im Hochformat wieder heraus – wir hätten dieselbe Trennung
24 px weiter rechts und denselben Befund in einem Jahr noch einmal.

**Gemessen und zugesichert wird an 744, 768, 834 und 1024 px**, zusätzlich zu
den drei Desktop-Größen. **Unterhalb von 744: darf schlecht aussehen, darf
nicht abweisen.**

**Die 760er-Schwelle lag schon vor dieser Entscheidung falsch.** Das ist kein
Nebensatz: sie schnitt **mitten durch dieselbe Gerätefamilie** – iPad mini
hochkant 744 auf der einen, iPad hochkant 768 auf der anderen Seite. Selbst als
reine Telefon/Nicht-Telefon-Grenze war sie damit schon unbrauchbar, weil sie
zwei Geräte trennte, die sich in der Bedienung nicht unterscheiden. Die
Umwidmung auf Tablets hat den Fehler nicht erzeugt, sondern sichtbar gemacht.

**2. Was trägt die 760-px-Schwelle noch?** Nachgesehen – sie hängt an
**genau zwei `@media`-Blöcken in CSS und sonst nirgends**:

| Ort | Inhalt |
|---|---|
| `@media(max-width:760px)`, erster Block | Inspektor auf volle Breite, Werkzeugleiste waagerecht mit Umbruch, `.tool-rail-toggle` ausgeblendet |
| `@media(max-width:760px)`, zweiter Block | Seiten-Scrolling statt fester Fensterhöhe, klebende Kopfzeile, Menüleiste in eigener Zeile, Marke verkleinert, `main` als Spalte, Inspektor über der Karte (`order:1` / `order:2`), Kartenhöhe 68 vh, **44-px-Zielgrößen** und **16 px Schriftgröße** in Eingabefeldern |

**Kein `matchMedia` in JS hängt daran** – die einzige Schwelle in JS ist
`TOOL_RAIL_NARROW_QUERY = "(max-width: 1000px)"`. **Kein Test sichert 760 zu**;
die kleinste geprüfte Breite ist 400 × 800 in `tools/test-toolbar.mjs`
(„Mobil: 400 × 800, alles erreichbar"), daneben 860 px in
`tools/test-statusbar.mjs` und 940 px in `tools/test-toolbar.mjs`. In der Doku
steht sie einmal, in der Schwellentabelle in Abschnitt 7.

**Sie fällt nicht, sie wird die Tablet-Grenze – bei 744 statt bei 760.** Die
Inhalte des zweiten Blocks sind zum größten Teil genau das, was ein Tablet im
Hochformat braucht; siehe Punkt 3.

**3. Was ist heute mobilspezifisch gebaut – und trägt es auf einem Tablet?**

| Verhalten | auf einem Tablet |
|---|---|
| Inspektor gestapelt **über** der Karte, volle Breite, kein eigener Scrollbereich | **trägt** im Hochformat bei 744–834 px; im Querformat ab 1024 px ist es **überflüssig** und sogar schlechter als die Spalte |
| Werkzeugleiste waagerecht mit Umbruch, `.tool-rail-toggle` ausgeblendet | **trägt** im Hochformat. Dass der Umschalter verschwindet, ist dort richtig – eine waagerechte Leiste hat nichts einzuklappen |
| Seiten-Scrolling statt fester Fensterhöhe | **trägt**; auf einem Tablet ist die Höhe im Hochformat ähnlich knapp |
| Kartenhöhe `68vh`, mindestens 420 px, höchstens 760 px | **trägt**, ist aber nie an einem Tablet gemessen worden |
| 44-px-Zielgrößen für Menütitel, Menüeinträge, Kopfzeilenknöpfe und Inspektorknöpfe | **trägt und ist der wichtigste Punkt** – ein Tablet wird mit dem Finger bedient, unabhängig von der Breite. Fiele der Block ersatzlos, bekäme ein Tablet im **Querformat** Desktop-Zielgrößen |
| `font-size:16px` in Eingabefeldern gegen Androids Formular-Zoom | **trägt** auf Android-Tablets, ist auf einem iPad folgenlos |
| Statuszeile: `data-optional`-Felder weichen ab 900 px | hängt **nicht** an 760, sondern an 900. Bezugspunkt und Prüfergebnis weichen damit auf **jedem** Tablet im Hochformat – nachschlagbar im Inspektor, also regelkonform, aber es ist der Normalfall und nicht mehr der Ausnahmefall |
| Marke verkleinert, Menüleiste in eigener Zeile | **überflüssig** ab etwa 820 px, dort passt beides nebeneinander |

**Der Befund daraus, und er ist der eigentliche Inhalt der Etappe: der eine
`@media`-Block vermischt zwei Dinge, die nichts miteinander zu tun haben.**

| hängt an der **Breite** | hängt an der **Bedienart** |
|---|---|
| Inspektor gestapelt über der Karte | **44-px-Zielgrößen** für Menütitel, Menüeinträge, Kopfzeilen- und Inspektorknöpfe |
| Werkzeugleiste waagerecht mit Umbruch, Umschalter ausgeblendet | **16 px Schriftgröße** in Eingabefeldern gegen Androids Formular-Zoom |
| Seiten-Scrolling statt fester Fensterhöhe | |
| Kartenhöhe `68vh` | |
| Marke verkleinert, Menüleiste in eigener Zeile | |

**Die rechte Spalte trägt in JEDER Breite.** Ein Tablet wird mit dem Finger
bedient, ob es 744 px breit ist oder 1366. **Fiele der Block ersatzlos, bekäme
ein Tablet im Querformat Desktop-Zielgrößen** – also 28-px-Knöpfe für einen
Finger, und das auf dem Gerät, das gerade zum Zielgerät erklärt wurde. Die
rechte Spalte gehört deshalb nicht an eine Breitenschwelle, sondern an das
Eingabegerät (`pointer: coarse` / `any-pointer: coarse`), oder sie gilt
unbedingt.

**Und ein Feld, das an der falschen Zahl hängt:** die `data-optional`-Felder
der Statuszeile weichen ab **900 px**, nicht ab 760. Bezugspunkt und
Prüfergebnis verschwinden damit auf **jedem** Tablet im Hochformat – 744, 768,
820, 834 liegen alle darunter. Das ist regelkonform, weil beide im Inspektor
nachschlagbar sind, aber es ist damit der Normalfall des Zielgeräts und nicht
mehr der Ausnahmefall eines schmalen Fensters. Ob 900 dafür der richtige Wert
bleibt, ist mitzuentscheiden.

**4. WAS DIE ENTSCHEIDUNG NICHT ERLEDIGT: Berührungsbedienung ist nicht
Bildschirmbreite.** Ein Tablet hat keine Maus, in **jeder** Breite. Nachgesehen
und gemessen:

- **Zwanzig `title`-Attribute im Markup und zwölf weitere per JS gesetzt** sind
  die einzige Stelle, an der die **Wirkung** eines Bedienelements erklärt wird.
  Darunter die drei Umformwerkzeuge über `TRANSFORM_TOOL_HELP` (welche Punkte
  sich bewegen, welche bleiben, was ausdrücklich *nicht* geschieht), die
  Zeichen- und Prüfwerkzeuge der Leiste, „Auswahl löschen" und „Auswahl
  aufheben", die reinen Symbolknöpfe Einpassen/Zoom, die Fensteröffner, der
  Sprachumschalter und die Ebene „Sonstiges". **Auf einem Touchgerät erscheint
  keines davon.**
- **Der schärfste Fall ist die Strg-Erklärung**: „Rechteckauswahl: Rahmen um
  Punkte ziehen. Mit Strg wird zur bestehenden Auswahl hinzugefügt." Sie steht
  **nur** im Tooltip und beschreibt eine Taste, die es auf einem Tablet
  ebenfalls nicht gibt – zwei Ausschlüsse in einem Satz. Dasselbe gilt für das
  Lasso.
- **Die Cursor-Koordinaten der Statuszeile** kommen ausschließlich aus dem
  `pointermove`-Handler am `svg`. Ohne schwebenden Zeiger bleibt das Feld leer,
  bis ein Finger die Karte berührt – und zeigt dann die Stelle **unter dem
  Finger**. Eines der beiden ständig wechselnden Felder der Statuszeile ist auf
  einem Tablet also praktisch tot.
- **`.vertex:hover`** ist die einzige Rückmeldung, dass ein Punkt überhaupt
  treffbar ist, bevor man ihn antippt.

**Was davon NICHT betroffen ist, und warum es die Richtung zeigt:** der
**Ablehnungsgrund** eines gesperrten Werkzeugs ist erreichbar – die
Zeichenknöpfe tragen ihn in `data-blocked-reason` und geben ihn beim Klick in
die Statuszeile aus, die Inspektorwerkzeuge tragen ihn sichtbar im
`.tool-reason`-Feld. Das wurde in den Etappen 3 und 5 genau mit der Begründung
entschieden, dass ein `title` auf Touch nie erscheint. **Der Grund ist also
schon umgezogen, die Erklärung noch nicht.**

---

### Etappe 8b – „Erklärung ohne Hover"

**Eine eigene Etappe, keine Randnotiz.** Sie ist das, was die Entscheidung
„kein Telefon" **nicht** erledigt, sondern erst recht fällig macht: Tablets
sind jetzt das erklärte Ziel, und sie haben keine Maus.

**Zur Nummer:** sie steht als 8b und nicht als eigene Zahl, weil 9 (Inspektor)
und 10 (Hilfe-Overlay) vergeben sind und sie **vor** dem Overlay liegen muss –
sie verschiebt Erklärungen an sichtbare Orte, und das Overlay beschreibt
Orte. Inhaltlich ist sie eine eigenständige Etappe mit eigenem Commit; die
Zahl ist eine Reihenfolge, keine Einordnung als Nachtrag.

**Der Befund in einem Satz: 32 Tooltips sind die einzige Stelle, an der die
Wirkung eines Bedienelements erklärt wird, und auf dem Zielgerät erscheint
keiner davon.** Zwanzig stehen im Markup, zwölf werden per JS gesetzt.

**Der schärfste Fall, wörtlich:** „Rechteckauswahl: Rahmen um Punkte ziehen.
**Mit Strg wird zur bestehenden Auswahl hinzugefügt.**" – Hover **und** Strg,
zwei Ausschlüsse in einem Satz. Auf einem Tablet gibt es weder das eine noch
das andere, und die Aussage steht nirgends sonst. Dasselbe gilt für das Lasso.

**Der Weg steht schon im Haus.** Der Ablehnungsgrund ist genau aus diesem Grund
bereits aus dem `title` herausgezogen worden – in die Statuszeile
(`data-blocked-reason`, ausgegeben von `runToolAction()`) und in das sichtbare
`.tool-reason`-Feld des Inspektors, entschieden in den Etappen 3 und 5 mit der
Begründung, dass ein `title` auf Touch nie erscheint. **Der Grund ist
umgezogen, die Erklärung nicht.** Die Etappe wiederholt eine Bewegung, die
dieses Repository schon einmal richtig gemacht hat.

**Was ausdrücklich dazugehört, weil es dieselbe Wurzel hat:**

- **Die Cursor-Koordinaten der Statuszeile.** Sie kommen ausschließlich aus dem
  `pointermove`-Handler am `svg`. Ohne schwebenden Zeiger bleibt das Feld leer,
  bis ein Finger die Karte berührt – und zeigt dann die Stelle **unter dem
  Finger**, die man nicht sehen kann. Eines der beiden ständig wechselnden
  Felder der Statuszeile ist auf dem Zielgerät praktisch tot.
- **`.vertex:hover`** ist die einzige Rückmeldung, dass ein Punkt überhaupt
  treffbar ist, bevor man ihn antippt. Auf Touch gibt es sie nicht, und die
  Trefferfläche eines Markers ist damit unsichtbar.
- **Die Erklärtexte von `#setStartPointBtn` und `#setEndPointBtn` stehen nur
  im `title`.** Mit Etappe 7d-2 dazugekommen, und beide tragen eine Aussage,
  die nirgends sonst steht: dass die zwei Knöpfe **dieselbe** Drehung auslösen
  und die zweite Geste die erste überschreibt. Auf dem Zielgerät erscheint
  keiner der beiden Texte. Der Nachbarknopf „Auftrennstelle setzen" macht es im
  selben Fenster bereits richtig – sein Ablehnungsgrund steht sichtbar in einem
  `.tool-reason`-Feld –, aber das ist der **Grund**, nicht die **Erklärung**;
  die Trennung, um die es in dieser Etappe geht, verläuft genau hier.

**Nicht mitentschieden ist die Antwort.** Ein zweites `.tool-reason`-Feld für
jeden Knopf wäre der naheliegende Weg und der falsche – der Inspektor trägt
schon zu viel (siehe Etappe 9). Aufzuschreiben ist zuerst, **welche der 32
Erklärungen überhaupt gebraucht werden**: eine Erklärung, die nur den
Knopfnamen wiederholt, ist auch am Desktop nichts wert, und die Hausregel
„der Tooltip erklärt, er benennt nicht" ist bereits formuliert.

**5. Der Schalter „vollständige Fassung" existiert nicht.** Nachgesehen: es
gibt sechs `localStorage`-Schlüssel – `referenceOrigin`, `toolRailCollapsed`,
`inspectorCollapsed` und die drei Faltblock-Schlüssel –, und keiner davon ist
ein Fassungsschalter. Im ganzen Repository steht kein „vollständige Fassung",
keine „Vollversion", kein „full version". Er war ein Vorhaben und ist nie
gebaut worden.

**Ohne Handyfassung hat er auch keinen Zweck mehr** und wird nicht gebaut: Es
gäbe keine zweite Fassung, zwischen der er umschalten könnte. Ein Schalter, der
von einer vollständigen Oberfläche auf dieselbe vollständige Oberfläche
umschaltet, wäre ein Bedienelement ohne Wirkung. **Das ist damit entschieden
und keine offene Frage mehr** – die Regel „kein neuer `localStorage`-Schlüssel
ohne dauerhaften Wunsch dahinter" gilt unverändert.

**Was Etappe 8 damit ist:** die Trennung von Breite und Eingabegerät. Die
Schwelle bekommt einen Wert, der zum Tablet-Feld passt statt zum Telefon; die
Zielgrößen für den Finger lösen sich von der Breite; und die Erklärungen finden
einen Ort, den ein Finger erreicht. **Was Etappe 8 nicht ist:** eine
Handyfassung, ein Fassungsschalter, oder eine Sperre unterhalb von 744 px.

### Etappe 9 – der Inspektor wird entdoppelt, dann zieht der Prüfbericht um

**Eintrag, kein Auftrag; der Plan folgt, wenn 7d durch ist.** 7a2 ist mit der
Merge-Diagnose erledigt, siehe „Verbinden und Singletons“ in Abschnitt 5.
Ausgelöst durch die Beobachtung, der Inspektor trage zu viel, und den
Vorschlag, Bestand, Koordinatenbezug, Kartenprüfung und Feature-Navigation aus
der Spalte in ein Menü zu nehmen. **Die Messung sagt etwas anderes**, und die
Zahlen stehen hier, damit der nächste Leser nicht wieder bei den Faltblöcken
anfängt.

**Gemessen im Zustand „ganzes Feature"** (Exclusion #0 mit vier Punkten,
Auslieferungszustand: alle fünf Faltblöcke zu), bei 1920 × 1080, 1440 × 900 und
1280 × 800:

| Bestandteil | Höhe |
|---|---|
| Kopfblock | 64 px |
| `#inspectorMulti` („Gruppe") | 110 px |
| `#inspectorFeature` („Feature") | **274 px** |
| `#inspectorSelection` (die beiden Auswahlknöpfe) | 37 px |
| die fünf Faltblöcke zusammen | 104 px (21 + 21 + 21 + 21 + 20) |
| acht Lücken à 10 px + 24 px Polsterung | 104 px |
| **Inhalt** | **693 px** |

**Die Blockhöhen sind bei allen drei Breiten identisch** – die Spalte ist fest
320 px breit, die Fensterbreite spielt für den Inspektor keine Rolle. Es
unterscheidet sich nur die verfügbare Höhe: 915 / 735 / 635 px, also **Reserve
+222 / +42 / −58 px**. Eng wird es über die Fensterhöhe, nie über die Breite.

**Die Zahl, die die Richtung entscheidet:**

| | inkl. Lücken | Anteil am Inhalt |
|---|---|---|
| die vier vorgeschlagenen Blöcke, zugeklappt | 123 px | **17,7 %** |
| davon Bestand + Kartenprüfung + Koordinatenbezug | 92 px | 13,3 % |
| **der Auswahlzustand darüber** | **451 px** | **65,1 %** |
| davon `#inspectorFeature` allein | 274 px | 39,5 % |

Alle vier herauszunehmen brächte 1280 × 800 von −58 auf +65 px – gerade über
die Kante –, während zwei Drittel des Inhalts unangetastet blieben.

#### 9a – Doppelungen im Auswahlzustand

**106 px, kein Umzug, kein Ortswechsel.** Der billigste verfügbare Gewinn, und
mehr als Bestand, Kartenprüfung und Koordinatenbezug zusammen (92 px).

Bei ausgewähltem Exclusion-Feature sagt der **Kopfblock** „4 Punkte
ausgewählt" und „Exclusion #0 · vollständig"; **`#inspectorMulti`** sagt „Alle
4 Punkte von Exclusion #0."; **`#inspectorFeature`** sagt „Typ: Exclusion #0"
und „Punkte: 4". **„Exclusion #0" steht dreimal in der Spalte, „4 Punkte"
ebenfalls dreimal.** Dazu erklären zwei Hinweissätze à 35 px beide dasselbe
Verschieben („Einen markierten Punkt ziehen verschiebt die ganze Gruppe…" und
„Verschieben durch Ziehen an der Geometrie auf der Karte…").

Aufgeschlüsselt, damit beim Planen nicht neu gemessen werden muss:

| Block | Zeilen |
|---|---|
| `#inspectorFeature` (274) | Überschrift 15 · Typ 31 · Punkte 31 · Fläche 31 · idx 31 · Knopf „Exclusion duplizieren" 40 · Hinweis 35 |
| `#inspectorMulti` (110) | Überschrift 15 · „Alle 4 Punkte von Exclusion #0." 40 · Hinweis 35 |
| `#inspectorSelection` (37) | die beiden Knöpfe nebeneinander |

**Beim Planen zu entscheiden, nicht jetzt: welche der drei Stellen die Angabe
trägt – und warum.** Nicht „die kürzeste gewinnt", sondern **die, an der man
sie sucht**. Das ist eine Frage über die Lesegewohnheit, nicht über Pixel; wer
sie mit einer Höhenrechnung beantwortet, hat sie nicht beantwortet.

**Derselbe Befund ist in Etappe 5 schon einmal gelöst worden:** `#pointMeta`
wiederholte Punktnummer, Feature und Geometrietyp – also genau das, was der
feste Kopfblock seit Etappe 4 sagt. Übrig blieb die Punktrolle, und nur für
Start- und Endpunkt. Den Kopfblock einzuführen und die Wiederholung darunter
stehen zu lassen war damals ein halber Umbau; **hier steht die andere Hälfte
desselben Umbaus noch aus.**

#### 9b – Prüfbericht ins Fenster

**Nicht wegen der 21 px.** Der Grund ist, dass der Bericht heute hinter einem
zugeklappten Block steht, den niemand öffnet – die Faltblöcke klappen
absichtlich nie von selbst auf –, und dass die Zusicherungen darauf **329
Zeichen bei `isVisible() === false`** belegen. `textContent()` und `.count()`
tragen durch ein geschlossenes `<details>` hindurch; die Zusicherung beweist
damit „der Text steht im DOM", nicht „der Nutzer kann ihn lesen". Betroffen
sind `tools/test-validation.mjs` (viermal) und `tools/test-scale.mjs`.

**Im Fenster kann `elementGetroffen()` beide Teile zeigen:** der Inhalt stimmt
**und** der Weg dorthin existiert. Damit ist der offene Punkt „Zusicherungen
auf unsichtbaren Inhalt" nicht wegdefiniert, sondern eingelöst.

Dazu kommt: ein Bericht mit dutzenden Zeilen gehört ohnehin nicht in eine
320-px-Spalte.

**VORHER zu entscheiden – die Überdeckung.** Ein Prüfbefund ist ein
`<button>`, der über `selectWholeFeature()` **auf die Karte springt**. Liegt
das Fenster über der Karte, kann das angesprungene Feature darunter landen.
Die Kartenfenster sitzen heute unten links (`left:12px; bottom:12px`,
`min(300px, …)`), weil oben rechts die Zoom-Leiste liegt. Drei Antworten:

| Antwort | was sie kostet |
|---|---|
| **Fenster verschiebbar machen** | eine Zieh-Mechanik, die es im ganzen Editor noch nicht gibt, plus die Frage, ob die Position gemerkt wird – also ein neuer `localStorage`-Schlüssel oder ein Zustand, der bei jedem Start zurückspringt |
| **Den Sprung in die freie Fläche einpassen** | `selectWholeFeature()` bekommt eine zweite Aufgabe und muss die Fenstergeometrie kennen; die Einpassung hinge dann davon ab, welches Fenster gerade offen ist – eine Kopplung zwischen Auswahl und Fensterzustand, die es heute nicht gibt |
| **Andocken statt schweben** | kostet dauerhaft Kartenfläche, solange der Bericht offen ist, und bricht mit dem Muster der drei vorhandenen Fenster – dafür entfällt die Überdeckung vollständig |

**Der Faltblock hatte dieses Problem nicht, weil er außerhalb der Karte liegt.**
Das gehört ausdrücklich dazu: der Umzug **erzeugt** ein Problem, das die
heutige Lösung nicht hat, und er ist trotzdem richtig – aber nur, wenn die
Frage vorher beantwortet ist und nicht hinterher auffällt.

#### 9c – Feature-Navigation

**Erst danach**, wenn 9b gezeigt hat, wie sich ein springendes Fenster
verhält. Der Grund ist stärker als bei der Prüfung: die Navigation ist der
Block, der aufgeklappt am weitesten wächst – **21 px zu, 614 px offen** – und
sie wird bei jeder Auswahländerung neu gebaut.

**Die Überdeckung trifft sie in härterer Form:** ein Klick in der Navigation
wählt ein Feature auf der Karte aus, das Fenster steht also bei **jeder**
Benutzung möglicherweise vor dem Ergebnis. Bei der Prüfung ist der Sprung die
Ausnahme, hier ist er der Zweck.

#### Was NICHT gemacht wird, mit Begründung

- **Bestand bleibt in der Spalte.** Drei Ablehnungsgründe verweisen wörtlich
  auf seine Knöpfe: „Es existiert bereits eine Search Wire. Verwende „Search
  Wire verlängern" oder lösche sie zuerst." und dieselbe Form für den
  Docking-Pfad. Hinter einem Menütitel müsste der Text den **Ort** nennen – und
  ein Ort in einem Text ist genau das, was veraltet. Etappe 7g hat gerade acht
  solche Sätze richtiggestellt.
- **Koordinatenbezug bleibt in der Spalte.** Der dokumentierte Grund – der
  Block klappt bei einem Konflikt selbst auf, als einzige Ausnahme von
  „Faltblöcke klappen nie von selbst auf" – gilt **gegen ein Menü, nicht gegen
  ein Fenster**: ein Fenster kann offen bleiben, `openMapWindow()` gibt es. Er
  wird trotzdem nicht gebraucht, denn 20 px sind es nicht wert, den einzigen
  selbsttätigen Warnpfad der Anwendung umzubauen.
- **Kein Menü für die vier.** Ein Menüeintrag kann keinen Warnzustand offen
  halten. Das schließt die ursprünglich vorgeschlagene Form aus, unabhängig
  davon, welche Blöcke am Ende umziehen.

#### Planung

**Das Hilfe-Overlay wird Etappe 10.** Das folgt genau dem Grund, aus dem es
zurückgestellt wurde: geschrieben wird, **wenn die Anordnung feststeht**. Zöge
der Prüfbericht nach der Neufassung in ein Fenster, wäre das Overlay zweimal zu
schreiben – der Aufwand, den die Zurückstellung vermeiden sollte. **Die
Fehlerliste bleibt bis dahin offen und nimmt auf, was dieser Umbau falsch
macht.**

---

**UI-Element verschieben – Wege statt Bezeichner:** Etappe 7 hat drei
Browsertests repariert, die seit b2, 7b und 7c rot waren, und die Ursache war
jedes Mal dieselbe: **ein Umzug hat den WEG zu einem Element geändert, ohne
dass eine `id` verschwand.** Die Slot-Knöpfe wurden Menüeinträge, die
Feature-Navigation zog in einen Faltblock, der Bezugspunkt ebenso. Die Regel
„jede `id` ist ein Literal" schützt den **Bezeichner**, nicht den **Zugang** –
`check-dom-ids.mjs` findet nichts, weil nichts fehlt.

Daraus: **wer ein Bedienelement verschiebt, prüft im selben Schritt, welche
Tests es anfassen und ob ihr Weg dorthin noch trägt.** Ein Element, das vorher
frei lag und jetzt in einem Menü oder einem Faltblock steht, braucht dort einen
Öffnungsschritt – `menueBefehl()` bzw. `openAllFolds()`. Der Läufer macht so
etwas sichtbar, aber erst **nach** dem Umzug; in b2 lagen zwischen Umzug und
Befund neun Berichte.

**UI-Element entfernen – Pflichtsuche:** Beim Entfernen jedes UI-Elements
**immer** im gesamten Script suchen nach: Element-ID, verwandte
Variablennamen, Event-Listener, Init-Code, Enable/Disable-Zuweisungen,
Status-Update-Referenzen. Reine Syntaxprüfung erkennt diese Fehlerklasse
**nicht** – dafür existiert jetzt `tools/check-dom-ids.mjs`, aber eine
manuelle Grep-Suche nach Variablennamen bleibt zusätzlich nötig, da das
Skript nur IDs, keine Variablennamen prüft.

**Release-Nummerierung und -Packaging:** Baseline aktuell **Ausgabe 050**
(der Oberflächenumbau), nächstes substantielles Release **Ausgabe 051**.
Ausgabe 051 nicht anlegen, bevor eine substantielle Änderung tatsächlich
angefragt wurde.

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
(`v050`, `v051`, …). Die Tags sind der Rollback-Mechanismus – jeder frühere
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
- **Die 1000-px-Schwelle steht als einzige Layout-Schwelle in JS, alle
  anderen in CSS.** Die Zahlen, damit die eine nicht wieder für eine der
  anderen gehalten wird:

  | Schwelle | Ort | Wirkung |
  |---|---|---|
  | 1100 px | `@media` | die Werkzeugleiste zeigt Text |
  | **1000 px** | **JS**, `TOOL_RAIL_NARROW_QUERY = "(max-width: 1000px)"` | die Werkzeugleiste klappt **erzwungen** ein |
  | 900 px | `@media` | Statusfelder mit `data-optional` weichen |
  | 760 px | `@media` | mobiles Layout: alles untereinander |

  Eine Schwelle bei **980 px** gibt es nicht mehr – sie gehörte zur zweiten
  Rastervorlage der Seitenleiste und ist mit Etappe 7e entfallen. Wer in
  Kommentaren oder Zusicherungen „unter 980 px" liest, meint die 1000er aus JS;
  in `tools/test-toolbar.mjs` stand genau das und ist mit 7g richtiggestellt. Das ist heute richtig so - der erzwungene
  Zustand läuft über dieselbe Klasse wie der Handschalter, nicht über eine
  Medienregel, und genau das steht oben als Entscheidung. Es bleibt aber die
  eine Stelle, an der eine Layout-Schwelle nicht dort steht, wo die anderen
  stehen. Nur vermerkt, nichts geändert.

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

  Dazugekommen sind mit Etappe 7 zwei **vorbestehende** Fälle, die die Prüfung
  ebenfalls fände: `.feature-nav-feature` – die Karten der Feature-Navigation
  tragen `feature-card`, die Regel hat also nie ein Markup gehabt – und
  `.section-accent-slate`, das kein Markup mehr hat. Anders als die
  oben genannten stammt er nicht aus dem Umbau – er stand schon vorher da und
  ist beim Umzug des Koordinatenbezugs nur aufgefallen, weil dessen
  Nachbarregel `.section-accent-cyan` tatsächlich verwaiste und entfernt wurde;
  `.feature-nav-feature` fiel bei der Fehlersuche in 7c auf. Beide
  stehengelassen, weil sie nicht zu den Umzügen gehören; sie gehören hierher.

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
  jeder Etappe des Oberflächenumbaus.** Es wird in Etappe 10 vollständig neu
  geschrieben, wenn die Anordnung feststeht – vorher wäre es zweimal Arbeit.
  Bis dahin steht hier die Liste der Sätze, die **jetzt schon falsch** sind,
  damit dort keine Neulektüre nötig ist. Die Fundstelle ist der Abschnitt des
  Overlays plus die ersten Worte des Satzes – Zeilennummern verschieben sich
  mit jeder Änderung und wären hier bereits beim Aufschreiben veraltet.

  **Die Liste ist derzeit leer: die acht bekannten Sätze sind mit Etappe 7g
  behoben**, deutsch und englisch im selben Commit. Der Eintrag bleibt
  trotzdem stehen, denn der Grund für ihn ist nicht erledigt – das Overlay
  beschreibt weiterhin Anordnung in Prosa, und jede weitere Etappe kann es
  wieder falsch machen. **Beim Fortschreiten der Etappen hier ergänzen**,
  statt am Ende alles neu zu lesen.

  **Was die Behebung an Lehre hinterlässt – der achte Satz.** Erfasst waren
  sieben; falsch waren acht. Der fehlende war „Punkte löschen: einzeln oder
  als Mehrfachauswahl …", der ebenfalls den Papierkorb nennt. Gefunden wurde
  er erst beim Schreiben, weil die ursprüngliche Erfassung nach **Ortsangaben**
  gesucht hatte – nach Sätzen also, die sagen, *wo* etwas liegt. „Punkte
  löschen" nennt den Papierkorb ohne Ort und fiel deshalb durch das Muster.
  **Eine Liste ist so vollständig wie ihr Suchmuster.** Wer die Liste beim
  nächsten Mal fortschreibt, sucht deshalb nicht nur nach Orten, sondern auch
  nach den **Bezeichnern verschwundener Bedienelemente** – hier hätte
  „Papierkorb" allein alle acht gefunden.

  **Dieselbe Lücke eine Ebene daneben: das Muster sah Fließtexte an, keine
  Beschriftungen.** Ein Hilfesatz besteht aus zwei Teilen, und die Erfassung
  prüfte nur einen. So kam „Rechteck / Lasso:" nicht auf die Liste, obwohl das
  Auswahlwerkzeug seit Etappe 3 **„Rahmen"** heißt und „Rechteck" heute das
  Zeichenwerkzeug für Rechteck-Exclusions ist – ihr *Fließtext* stand auf der
  Liste, ihre *Beschriftung* wurde nie angesehen. Mit 7g ist sie auf
  „Rahmen / Lasso:" richtiggestellt. **Beide Teile eines Satzes gehören ins
  Muster.**

  **Alle 32 Beschriftungen des Overlays sind daraufhin durchgesehen worden**
  (nicht nur die geänderten). Dabei kam der fünfte Fall zutage:
  **„Karteninfo:"** benannte das Fenster, das mit Etappe 4/5 in den Inspektor
  gezogen ist – dort heißt der Block „Abmessungen", und vom alten Namen war in
  `index.html` nur noch ein CSS-Kommentar an `.map-info-text` übrig. Sie heißt
  jetzt **„Abmessungen:"**, englisch „Dimensions:". Ihr Rumpf ist dabei
  entdoppelt worden – „Abmessungen: Abmessungen und Hinweise …" war die Folge
  der Umbenennung, nicht der ursprüngliche Wortlaut; er nennt die Kennzahlen
  jetzt einzeln.

  **Warum gerade sie durchrutschte – und die Regel daraus.** Ihr *Rumpf* stand
  auf der Liste und war bereits richtiggestellt; der Satz sah damit fertig aus,
  und die Beschriftung wurde nicht mehr angesehen. Das ist die **dritte Lücke
  desselben Durchgangs**, nach „Ortsangaben statt Nennungen ohne Ort" und
  „Fließtexte statt Beschriftungen":

  > **Ein Eintrag, an dem schon einmal gearbeitet wurde, wird beim nächsten
  > Durchgang übersprungen, weil er als erledigt gilt.**

  Das ist **dasselbe Muster, das dieses Repository schon zweimal teuer bezahlt
  hat**, und zwar an Stellen, die mit Hilfetexten nichts zu tun haben:
  `openAllFolds()` war gebaut und wurde deshalb für übernommen gehalten –
  aufgerufen hat ihn kein einziger Test, alle acht Kopien blieben stehen. Und
  b2s Umstellung der Slot-Klicks auf `menueBefehl()` war beschrieben und galt
  deshalb als getan – im Diff stand eine einzige Zeile. Gebaut ist nicht
  benutzt, bearbeitet ist nicht geprüft. **Beim Wiederaufnehmen einer Liste ist
  „daran wurde schon gearbeitet" kein Grund zum Überspringen, sondern einer zum
  Hinsehen.**

  **Vierte Lücke, gefunden beim Absuchen des übrigen Bestands für Zug 3:
  gesucht wurde nach Namen, nicht nach Sachverhalten.** Der entfallene
  Mobilknopf `#mobilePanelBtn` stand in beiden READMEs unter dem Wort
  **„Bedienleiste"** bzw. **„control panel"** – einem Wort, das weder „Sidebar"
  noch „Seitenleiste" enthält und damit durch jedes Muster fiel, das nach den
  Bezeichnern der verschwundenen Elemente suchte. Gefunden wurde die Stelle
  erst, als das Muster um die **Umschreibungen** erweitert wurde, unter denen
  ein Bedienelement in Prosa auftaucht.

  **Die vier Lücken zusammen, weil sie erst nebeneinander eine Regel ergeben:**

  | Gesucht wurde nach | Übersehen wurde dadurch | Fundstelle |
  |---|---|---|
  | Ortsangaben | Nennungen ohne Ort | „Punkte löschen", der achte Satz |
  | Fließtexten | Beschriftungen | „Rechteck / Lasso:" |
  | noch nicht Bearbeitetem | schon einmal Angefasstem | „Karteninfo:" |
  | Namen | Sachverhalten unter anderem Wort | „Bedienleiste" / „control panel" |

  Alle vier sind derselbe Fehler in vier Kleidern: **das Suchmuster war enger
  als der Bestand, und sein Ergebnis wurde für vollständig gehalten.** Wer das
  nächste Mal einen Bestand absucht, prüft das Muster gegen mindestens einen
  bekannten Treffer, den es finden **muss** – und nennt beim Melden, wonach
  gesucht wurde, nicht nur, was gefunden wurde.

  **Zwei Einträge der früheren Liste waren zu streng und wurden zurückgenommen:**
  „Einpassen / Zoom: Kartenansicht anpassen." und „Raster: Schrittweite frei
  einstellen; Snap-to-Grid kann beim Ziehen verwendet werden." nennen gar
  keinen Ort. Beide Sätze stimmen weiterhin – falsch war nicht der Satz,
  sondern die frühere Behauptung über ihn. Eine Liste bekannter Fehler, die
  Richtiges enthält, ist beim nächsten Lesen genauso teuer wie eine
  unvollständige.

  **Fünf Beschriftungen sind dabei mit umbenannt worden**, weil sie ein Ding
  benannten, das es nicht mehr gibt: „Auswahl-Werkzeugleiste" → „Werkzeuge",
  „Sidebar" → „Anordnung", „Karteninfo & Legende" → „Legende",
  „Rechteck / Lasso" → „Rahmen / Lasso" und „Karteninfo" → „Abmessungen". Eine
  Beschriftung ist Teil des Satzes; sie stehen zu lassen hätte den
  richtiggestellten Rumpf unter eine falsche Überschrift gehängt.

  **Jeder Hilfetext ist ein eigener Wörterbuchschlüssel** – der Rumpf einer,
  die `<strong>`-Beschriftung ein zweiter. Eine Textänderung **tauscht** den
  Schlüssel, sie ändert ihn nicht: der alte muss mit weg, sonst bleibt eine
  tote Zeile in `I18N_EN` stehen. Genau eine solche stand dort bereits, eine
  ältere, kürzere Fassung von „Punkte löschen" ohne Markup; sie ist mit 7g
  entfallen. `tools/check-dom-ids.mjs` findet diese Klasse nicht – ein
  verwaister Wörterbucheintrag ist kein Fehler, nur Ballast, der beim nächsten
  Lesen wie eine gültige Übersetzung aussieht.

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
- **Zusicherungen auf unsichtbaren Inhalt – offene Frage, kein Auftrag.**
  `test-validation.mjs` und `test-scale.mjs` sichern den Inhalt von Elementen
  zu, die `isVisible() === false` melden: `textContent()` und `.count()` tragen
  durch ein geschlossenes `<details>` hindurch. Gemessen bei zugeklapptem
  `#inspectorValidation`: **329 Zeichen Text, drei `.validation-item`-Treffer,
  `isVisible()` falsch.** Die Zusicherung belegt damit „der Text steht im DOM",
  nicht „der Nutzer kann ihn lesen".

  **Vertretbar ist das**, weil die Kurzform in der Kopfzeile des Faltblocks und
  in der Statuszeile steht und das Nicht-Aufklappen eine bewusste Regel ist –
  die vollständige Zusicherung hätte aber zwei Teile: *der Inhalt stimmt*, und
  *der Weg dorthin existiert*.

  Die Fundstellen, damit sie beim Entscheiden nicht neu gesucht werden:

  | Skript | Stelle | Zugriff |
  |---|---|---|
  | `test-validation.mjs` | `#validationReport` im Prüfblock | `textContent()` |
  | `test-validation.mjs` | `#validationReport .validation-item.warning` / `.error` / `.info` | `.count()` |
  | `test-validation.mjs` | `#validationReport` im englischen Durchlauf | `textContent()` |
  | `test-scale.mjs` | `#validationReport` nach „Karte prüfen" | `textContent()` |

- **Dezimaltrennzeichen – ERLEDIGT mit „Schritt 2: ein Zahlenformat für alle
  vier Orte" (11.09.2026).** Der Eintrag bleibt stehen, weil der Befund die
  Regel trägt und der Weg dorthin nachlesbar sein soll.

  **Der Stand heute:** `formatMeters(value, digits, maxDigits)` ist die eine
  Formatierfunktion. Das Dezimalzeichen folgt der Oberflächensprache – deutsch
  Komma, englisch Punkt –, ein Tausendertrenner entsteht nie, und ein fest
  verdrahtetes Locale gibt es nicht mehr. Alle vier Orte gehen hier durch:
  die E/N-Felder, `formatGridMeters()` für `#gridShort`, der `pointermove`-Text
  in `#hud` und `formatEndpoint()` für das Verbinden-Fenster.

  **Drei Dinge, die dabei gemessen wurden und ohne die der Umbau riskant
  gewesen wäre:**

  - **Die `I18N_PATTERNS` vertragen beide Trennzeichen schon immer.** Jedes
    Muster, das eine Dezimalzahl erfasst, benutzt die Zeichenklasse
    `[\d.,]+` – nachgesehen für alle 22 solchen Muster. Ein
    sprachabhängiges Zahlenformat bricht die Übersetzung deshalb nicht. Wäre
    auch nur eines als `(\d+),(\d+)` geschrieben gewesen, hätte die
    englische Oberfläche an dieser Stelle deutschen Text gezeigt.
  - **Die E/N-Felder hingen nicht am abgeleiteten Weg.** `refreshDerivedUi()`
    rief `updateInspector()`, und das schreibt die Felder nicht –
    `updateSelectionPanel()` tut es. Nach einem Sprachwechsel stand deshalb
    das Zeichen der vorigen Sprache im Feld. Der Aufruf ist ersetzt.
  - **`refreshDerivedUi()` hat genau EINEN Aufrufer**, `setLanguage()`.

  **Befund am Rande, und er ist der Grund für eine sonst unerklärliche
  Testzeile: der Klick auf `#languageToggle` nimmt dem Eingabefeld den
  Fokus.** Der Schutz „ein fokussiertes Feld wird beim Sprachwechsel nicht
  überschrieben" kann über den Schalter deshalb gar nicht greifen – bis dahin
  ist der Fokus beim Schalter. `tools/test-inspector.mjs` misst ihn deshalb
  über `setLanguage()` selbst und sichert daneben zu, dass derselbe Weg ohne
  Fokus sehr wohl neu schreibt. Der Schutz gilt jedem künftigen Aufrufer von
  `refreshDerivedUi()`.

  **Neuer offener Punkt aus demselben Umbau: eine Einmalmeldung friert ihr
  Zahlenformat ein.** `setLocalizedText()` legt den deutschen Text als
  `data-i18n-de` am Element ab; die Zahl darin ist in dem Format erstarrt, das
  beim Erzeugen galt. Gemessen: eine auf englisch erzeugte Meldung zeigt nach
  dem Wechsel ins Deutsche weiter `E=12.50`, eine auf deutsch erzeugte im
  Englischen weiter `E=13,50`. Vorher fiel das nicht auf, weil jede Zahl
  immer deutsch formatiert war. Das trifft nur flüchtige Meldungen – jeder
  abgeleitete Text wird beim Wechsel neu gebaut und ist richtig. **Kein
  Auftrag:** die Meldung ist eine Zeile, die bei der nächsten Handlung ohnehin
  verschwindet, und sie richtig zu machen hieße, die Zahl aus dem fertigen
  Text wieder herauszurechnen.

  **Ebenfalls offen, gleiche Familie: die übrigen `toFixed(2)`-Stellen.** Der
  Prüfbericht (Perimeterfläche, Exclusion-Fläche, engste Stelle, Mäherbreite,
  auffälliges Segment) und der Vergleichsblock eines ausgewählten Punktes
  rechnen weiter mit `toFixed()` und zeigen damit in **beiden** Sprachen einen
  Punkt. Sie gehören nicht zu den vier Orten dieses Schritts; wer sie
  nachzieht, schickt sie durch dieselbe eine Funktion.

  **Der ursprüngliche Befund**, vom 10.09.2026, Stand `4202533`, in beiden
  Sprachen im Browser gemessen:

  | Ort | deutsch | englisch | Funktion |
  |---|---|---|---|
  | Inspektor, E/N-Felder (`#pointEastInput`, `#pointNorthInput`) | `40,50` | **`40,50`** | `formatMeters()`, `index.html:11755` – `toLocaleString("de-DE")` |
  | Statuszeile, Rasterfeld (`#gridShort`) | `0,10 m` | **`0,10 m`** | `formatGridMeters()`, `index.html:15362` – `toLocaleString("de-DE")` |
  | Statuszeile, Cursor-Koordinaten (`#hud`) | `E: 20.25 m` | `E: 20.25 m` | `toFixed(2)`, `index.html:17733` |
  | Verbinden-Fenster (`#mergeAInfo`, `#mergeBInfo`) | `E 0.00 / N 40.50 m` | `E 0.00 / N 40.50 m` | `formatEndpoint()`, `index.html:15655` – `toFixed(2)` |

  **Zwei Befunde, nicht einer.** Erstens stehen Komma und Punkt nebeneinander:
  `toLocaleString("de-DE")` an zwei Orten, `toFixed()` an zwei anderen.
  Zweitens – und das ist der schwerere – ist `"de-DE"` **fest verdrahtet**: die
  englische Oberfläche zeigt `40,50`, wo ein englischer Leser einen
  Tausendertrenner erwartet. Der Punkt der `toFixed()`-Stellen ist im
  Englischen also zufällig richtig und im Deutschen falsch, der Komma-Stellen
  genau umgekehrt.

  **Wer das vereinheitlicht, fasst nicht nur die Ausgabe an.** Die E/N-Felder
  sind **Eingaben**: was dort steht, wird zurückgelesen. Ein einheitliches
  Format muss deshalb in beiden Sprachen auch **geparst** werden. Heute leistet
  das `parseLocaleNumber()` (`index.html:11764`), das Komma und Punkt gleich
  behandelt – nachgemessen: `"40,50"` und `"40.50"` liefern beide `40.5`. Diese
  Toleranz ist die Voraussetzung dafür, dass sich an der Anzeige überhaupt
  etwas ändern lässt, ohne Eingaben zu brechen; sie darf beim Vereinheitlichen
  nicht wegfallen.

  Zur Herkunft, damit niemand die Stelle für neu hält: `formatEndpoint()` ist
  seit Etappe 7d-1 unverändert, 7d-2 hat nur die Beschriftungen ringsum
  ausgetauscht. Der Punkt im Verbinden-Fenster stand vorher genauso da.

  **Der Tausendertrenner war ein DEFEKT – behoben mit „Schritt 1: der
  Tausendertrenner ist abgeschaltet" (11.09.2026).** `useGrouping:false` steht
  seitdem an allen vier `toLocaleString`-Stellen, drei davon in
  `formatGridMeters()`. Nachgemessen: **52 Ausgaben beider Funktionen**, von
  `0,001` bis `1234567,50` und negativ, werden von `parseLocaleNumber()`
  sämtlich zurückgelesen; keine einzige enthält beide Trennzeichen. Punkt und
  Komma bleiben als Dezimalzeichen zulässig – an `parseLocaleNumber()` war
  dafür nichts zu ändern. `tools/test-inspector.mjs` sichert den Rundlauf in
  beiden Sprachen ab, und zwar an dem Text, den das Feld **anzeigt**.

  Der Befund, der dazu führte, bleibt hier stehen, weil er die Regel dahinter
  trägt. Er lautete: `useGrouping` war nirgends gesetzt, die Vorgabe ist `true`,
  und ab 1000 schrieb die Anzeige damit einen Punkt, den
  `parseLocaleNumber()` nicht mehr lesen konnte –
  `String(value).replace(",", ".")` ersetzt nur das **erste** Komma, aus
  `"1.234,50"` wurde `"1.234.50"`, daraus `NaN`, daraus `null`.

  **Die Lehre, und sie gilt über diesen Fall hinaus: wer ein Anzeigeformat
  ändert, ändert eine Eingabe mit.** Ein Feld, dessen Inhalt zurückgelesen
  wird, ist beides zugleich; die Ausgabefunktion und die Lesefunktion sind
  **ein** Paar und gehören zusammen geprüft. Zum Messen gehört, den
  **angezeigten** Text zu bearbeiten: ein `fill()` mit einem selbst gebauten
  Literal umgeht die Anzeige und sieht den Defekt nicht – genau daran ist der
  erste Entwurf der Zusicherung vorbeigelaufen und blieb unter der Mutation
  grün.

  **Die Messwerte von damals** (10.09.2026, Stand `3d6cd9f`), damit die Größe
  des Fehlers nachlesbar bleibt:

  | Eingabe | Ergebnis |
  |---|---|
  | `"1234,5"` / `"1234.5"` | `1234.5` – wie beschrieben |
  | `"1.234,5"` / `"1.234,50"` | **`null`** |
  | `"1,234.5"` | **`null`** |

  **Reproduktionsfall, deutsch und englisch identisch** – ein Punkt, dessen E
  bei 1234,5 liegt:

  | Schritt | Feld danach | Weltmeter | Statuszeile |
  |---|---|---|---|
  | E auf `1234,5` gesetzt | `1.234,50` | 1234,5 | „Punkt auf E=1.234,50 m … gesetzt." |
  | Feld **unverändert** mit Enter bestätigt | `1.234,50` | 1234,5 | **„Bitte gültige Zahlen für East und North eingeben."** |
  | nur die letzte Ziffer auf `1.234,56` | **`1.234,56`** | **1234,5** | **„Bitte gültige Zahlen …"** |
  | Gegenprobe `999,50`, unverändert Enter | `999,50` | 999,5 | „Die Koordinate wurde nicht verändert." |
  | Gegenprobe `999,50` → `999,56` | `999,56` | 999,56 | „Punkt auf E=999,56 m … gesetzt." |

  **Die Folge war: ein Punkt ab 1000 Einheiten Abstand vom Nullpunkt ließ sich
  über die E/N-Felder überhaupt nicht mehr bearbeiten**, und der Editor lehnte
  dabei seine eigene Anzeige als „ungültige Zahl" ab. In der dritten Zeile
  widersprachen sich zusätzlich Anzeige (`1.234,56`) und Zustand (1234,5), bis
  das nächste Neuzeichnen das Feld überschrieb.

  **Kein Wert änderte sich, den der Nutzer nicht geändert hatte** – die
  Weltkoordinate blieb in jedem Fall stehen. Der Defekt war Unbedienbarkeit,
  nicht stille Datenveränderung.

  **Das Verlassen des Feldes löst nichts aus.** An `#pointEastInput` und
  `#pointNorthInput` hängt allein ein `keydown`-Handler auf Enter; einen
  `blur`- oder `change`-Handler gibt es nicht. Wer das Feld verlässt, sieht
  deshalb noch die Meldung des vorigen Enter – das ist beim Messen leicht für
  eine Reaktion auf das Verlassen zu halten.

  **Was davon offen bleibt:** der Trenner ist weg, das fest verdrahtete
  `"de-DE"` steht noch. Die englische Oberfläche zeigt weiterhin `1234,50` mit
  Komma. Das ist der ursprüngliche, weiter oben beschriebene Punkt und wird
  getrennt behandelt.

- **Die Messungen zu 7d-4, gemessen am 11.09.2026, Stand `ec6f1f5`.** Sie
  stehen hier, weil sie mehrere Entscheidungen von 7d-4a getragen haben und
  sonst beim nächsten Mal neu gemacht werden müssten.

  **Rundläufe (d3): nicht jeder kommt bitgleich zurück.** Ausgangslage je
  Karte: Auftrennstelle gesetzt, danach Punkt 0 einmal hin und zurück.

  | Karte | Weg | bitgleich | Abweichung |
  |---|---|---|---|
  | relativ | E-Feld 40,00 → 45 → 40,00 | **ja** | 0 m |
  | relativ | Pfeil rechts, dann links | **ja** | 0 m |
  | umgerechnet (WGS84) | E-Feld 40,00 → 45 → 40,00 | **nein** | 5,9·10⁻¹¹ m |
  | umgerechnet (WGS84) | Pfeil rechts, dann links | **ja** | 0 m |

  Der lose Fall ist die Anzeige, nicht die Rechnung: das Feld zeigt zwei
  Nachkommastellen, und „40,00" zurückzuschreiben trifft den ursprünglichen
  Rohwert nicht exakt. **Daraus folgt die Toleranz von 7d-4a:** ein exakter
  Vergleich scheidet aus, und die im Haus vorhandene Schwelle `1e-12`
  (Weltmeter) deckt 5,9·10⁻¹¹ m nicht ab. Deshalb
  `CUT_EDGE_TOLERANCE_METERS = 0.001`, bei unbekanntem Maßstab exakt.

  **Alle Toleranzvergleiche des Editors (d2)**, Suchmuster gegen die bekannte
  `1e-12` kalibriert:

  | Fundstelle | Wert | Einheit | wofür |
  |---|---|---|---|
  | `baselineStillMoved()` | `1e-12` | Weltmeter | Punkt seit der Baseline bewegt? |
  | `applySelectedPointFromInputs()` | `1e-12` | Weltmeter | Eingabe gleich der alten Koordinate? |
  | `pointermove`-Drag-Handler | `1e-12` | Weltmeter | hat der Zug wirklich bewegt? |
  | `applyGridStepFromInput()` | `1e-12` | Meter | trifft die Eingabe einen `<option>`-Wert? |
  | `getVertexOrientation()` | `1e-9` | Weltmeter | zwei Punkte zu dicht → kein Winkel |
  | `originsMatch()` (`ORIGIN_MATCH_TOLERANCE_METERS`) | `0.01` | Meter | derselbe RTK-Standort? |
  | `turnDirection()` (`GEOMETRY_EPSILON_AREA`) | `1e-9` | Weltmeter² | Rauschgrenze des Kreuzprodukts |

  **Bezugspunkt wechseln (d4): die Zahlen verschieben sich real.** Von
  48,1/11,5 auf 48,2/11,6 wandern die Rohwerte um **11111,10 m**; die
  Ringreihenfolge bleibt dabei unverändert. Das ist kein Rundungsrauschen,
  also rechnet `rebaseConvertedMaps()` das Paar seit 7d-4a mit – über
  dieselben beiden Umrechnungsfunktionen wie den Ring.

  **Wege, die die Geometrie eines Slots ersetzen statt sie zu bearbeiten
  (f).** Muster gegen `setMapSlotData()` kalibriert:

  | Weg | Art | Auftrennstelle |
  |---|---|---|
  | `setMapSlotData()` | Neubefüllung aus einer Datei | `clearCutEdge(slot)` |
  | `resetToOriginal()` | Neubefüllung aus `originalData` | `clearCutEdge(slot)` |
  | `mergeMapSlots()`, Literal für A | neues Ergebnis | Feld fehlt |
  | `mergeMapSlots()`, Literal für B | leerer Slot | Feld fehlt |
  | `removeSecondMap()`, Literal für B | leerer Slot | Feld fehlt |
  | die beiden Anfangs-Literale in `mapSlots` | Startzustand | Feld fehlt |
  | `restoreWorkspaceSnapshot()` | Kopie aus dem Snapshot | **bleibt** – das ist der Zweck |

  **Verschieben ändert einen Ringpunkt IN PLACE (g).**
  `setVertexWorldCoordinate()` schreibt `coordinate[0] = rawX`. Die eine
  Ausnahme ist der Ringschluss: `ring[lastIndex] = [rawX, rawY]` ersetzt das
  Array. Deshalb ist das gespeicherte Paar eine Kopie – wobei die Kopie heute
  nicht messbar nötig ist, siehe die benannte Lücke in Abschnitt 4.2.

  **Die Meldungen von `#mergeStatus` und ihre Rangfolge (h).** Die ersten fünf
  kehren sofort zurück, stehen also allein:

  | Rang | Bedingung | Klasse | Knopf |
  |---|---|---|---|
  | 1 | Karte B nicht geladen | `merge-status` | gesperrt |
  | 2 | kein gültiger Perimeter | `error` | gesperrt |
  | 3 | verschiedene Skalierungen | `error` | gesperrt |
  | 4 | Bezugspunkt-Konflikt | `error` | gesperrt |
  | 5 | Singleton-Konflikt | `error` | gesperrt |
  | 6 | sonst | `ok` bzw. `warning` | frei |

  Rang 6 setzt sich zusammen aus dem Hinweis zur Wahl („Bereit." / „nur für
  Karte A" / „nur für Karte B" / „nicht gewählt"), den beiden Brückenlängen
  und – falls vorhanden – den Kreuzungssätzen.

  **`interiorIndicesBetween()` (i): welche Regel?** Der Vorwärtsweg läuft von
  `low+1` bis `high-1` und enthält Index 0 nie. Bei einer offenen Linie gilt
  immer er. Bei einem geschlossenen Ring wird auch der Rückwärtsweg gebildet;
  dann gewinnt **der kürzere**, bei Gleichstand **der ohne Index 0**, sonst der
  Vorwärtsweg.

  **Das hat eine sichtbare Folge, und sie ist neu: die Drehung entscheidet
  mit, welcher Punkt beim Begradigen gezogen wird.** Gemessen an einem
  Quadrat, begradigt werden jeweils dieselben zwei geometrischen Punkte
  `(40,0)` und `(0,40)`:

  | Ring | gezogen wird |
  |---|---|
  | Dateireihenfolge `(0,0) (40,0) (40,40) (0,40)` | **(40,40)** → (20,20) |
  | nach Drehung auf Start `(40,40)` | **(0,0)** → (20,20) |

  Dieselbe Geste auf derselben Geometrie bewegt nach dem Setzen einer
  Auftrennstelle einen **anderen** Punkt. **Nur gemessen, nicht behoben** – ob
  das ein Fehler ist, hängt daran, ob „der kürzere Weg" oder „der Weg ohne den
  Ringstart" die gemeinte Regel ist, und das ist eine Entscheidung.

  **Und die Schlusskante überlebt das Reduzieren nicht (i).** Ring
  `(0,0) (40,0) (40,40) (0,40) (0,20)`, Schlusskante als Auftrennstelle
  gewählt (das dreht nicht, `startIndex` ist 0), dann ganzes Feature
  reduzieren mit Toleranz 1,00 m: **`(0,20)` fällt**, 5 → 4 Punkte. Punkt 0
  bleibt nach der Hausregel immer erhalten, der letzte Punkt ist in der
  offenen Folge `[0 … n-1, 0]` dagegen ein Innenpunkt. Seit 7d-4a meldet der
  Infoblock danach „seit der Wahl verändert" statt weiter „gewählt".

- **Die Auftrennstelle überlebt ihre eigene Kante – ERLEDIGT mit Schritt 4
  (7d-4a) und Schritt 6 (7d-4c).** Der Befund bleibt stehen, weil er die
  Entscheidung trägt.

  **Entschieden ist die zweite der beiden Lesarten:** die Marke behauptet
  „die aktuelle Auftrennstelle ist gewählt", nicht „der Nutzer hat einmal
  gewählt". Gespeichert ist seit 7d-4a das **Paar** der gewählten Rohwerte,
  und `getCutEdgeState()` vergleicht es bei jedem Aufruf mit dem heutigen
  Ring – die Hausregel „abgeleitet, nicht gespeichert" gilt damit wieder,
  soweit sie kann: gespeichert ist die Entscheidung des Nutzers, abgeleitet
  ihr Verhältnis zum heutigen Zustand.

  Aus zwei Zuständen sind dadurch drei geworden. Der mittlere,
  „Auftrennstelle seit der Wahl verändert.", ist genau der Fall, den der
  Befund unten beschreibt: die Anzeige behauptet nicht länger „gewählt",
  während sie Koordinaten nennt, die niemand gewählt hat.

  **Und die stille Überschreibung meldet sich seit 7d-4c.** Wird eine bereits
  gewählte Stelle durch eine **andere** ersetzt, sagt die Statuszeile „Die
  vorher gewählte Auftrennstelle wurde ersetzt." statt des gewöhnlichen
  Erfolgstextes. Nicht beim ersten Setzen, und nicht, wenn dieselbe Kante noch
  einmal gewählt wird – das ist eine Bestätigung, keine Ersetzung. Die
  Entscheidung, ob das nach 7d-4 oder nach 8b gehört, ist damit zugunsten von
  7d-4 gefallen: die **Erklärung** in den beiden `title`-Attributen bleibt ein
  Fall für Etappe 8b, die **Meldung** gehörte zum Gegenstand.

  Der ursprüngliche Befund vom 10.09.2026, Stand `d012fc6`, im Browser
  gemessen:

  `slot.cutEdgeChosen` ist ein Boolean über eine **vergangene Geste**, nicht
  über den heutigen Ring. Jede Geometrieänderung an Punkt 0 oder am letzten
  Punkt verschiebt die Auftrennstelle, ohne dass die Marke fällt – der
  Infoblock behauptet weiter, der Nutzer habe diese Stelle gewählt.

  Ausgangslage in beiden Fällen: Perimeter `[[40,0],[40,40],[0,40],[0,0]]`
  nach „Auftrennstelle setzen", Marke `true`, Infoblock „Karte A ·
  Auftrennstelle gewählt. · Startpunkt E 40.00 / N 0.00 m · Endpunkt
  E 0.00 / N 0.00 m".

  | Eingriff | Ring danach | Marke | Infoblock danach |
  |---|---|---|---|
  | Punkt 0 löschen (der gewählte Startpunkt) | `[[40,40],[0,40],[0,0]]` | **`true`** | „Auftrennstelle gewählt.", Startpunkt **E 40.00 / N 40.00 m** |
  | Punkt hinter dem letzten einfügen | `[[40,40],[0,40],[0,0],[20,20]]` | **`true`** | „Auftrennstelle gewählt.", Endpunkt **E 20.00 / N 20.00 m** |

  Im zweiten Fall nennt die Anzeige einen Punkt, den es beim Wählen noch gar
  nicht gab. **Das ist dieselbe Klasse wie der Befund, der Etappe 7d ausgelöst
  hat:** eine stille Überschreibung der Auftrennstelle, die nichts meldet – nur
  dass sie hier nicht von einem zweiten Knopf kommt, sondern von einer ganz
  gewöhnlichen Punktbearbeitung.

  **Die offenen Messungen sind mit dem 7d-4-Befund nachgeholt** (Stand
  `1a0c325`, 10.09.2026). Ausgangslage überall: Ring
  `40.00/0.00 40.00/40.00 0.00/40.00 0.00/0.00`, Auftrennstelle gesetzt,
  Infoblock „Startpunkt E 40.00 / N 0.00 m · Endpunkt E 0.00 / N 0.00 m".

  | Eingriff | Ring danach | Infotext danach |
  |---|---|---|
  | Punkt 0, Pfeiltaste nach rechts | `40.10/0.00 …` | „gewählt.", Startpunkt **E 40.10 / N 0.00 m** |
  | letzter Punkt, Pfeiltaste nach oben | `… 0.00/0.10` | „gewählt.", Endpunkt **E 0.00 / N 0.10 m** |
  | Punkt 0 über das E-Feld auf 45,00 | `45.00/0.00 …` | „gewählt.", Startpunkt **E 45.00 / N 0.00 m** |
  | Punkt 0 mit der Maus gezogen | `43.20/0.00 … 3.20/0.00` | „gewählt.", Startpunkt **E 43.20**, Endpunkt **E 3.20** |
  | letzter Punkt mit der Maus, Auswahl vorher leer | `… -3.20/0.00` | „gewählt.", Endpunkt **E -3.20 / N 0.00 m** |
  | Rechtwinklig, ganzes Feature | `39.75/0.75 39.25/40.25 -0.25/39.75 0.25/0.25` | „gewählt.", Startpunkt **E 39.75 / N 0.75**, Endpunkt **E 0.25 / N 0.25** |
  | Reduzieren, ganzes Feature, Toleranz 1,00 m | 5 → 4 Punkte, es fiel ein **Innenpunkt** | unverändert richtig |
  | Begradigen, zwei Punkte desselben Rings | Innenpunkt auf `20.00/20.00` gezogen | unverändert richtig |

  **Alle drei Bewegungswege verhalten sich gleich** – Maus, E/N-Feld,
  Pfeiltaste –, und es gibt keinen Bearbeitungsweg, der die Marke fallen ließe.
  Der Infoblock nennt dabei jedes Mal den **heutigen** ersten und letzten Punkt:
  er behauptet „gewählt" und zeigt Koordinaten, die der Nutzer nie gewählt hat.

  **Der Mausfall bewegt zwei Punkte, nicht einen.** Nach `applyMergeCut()`
  bleiben **beide** Endpunkte ausgewählt, und ein Zug am einen Marker zieht die
  ganze Gruppe – deshalb wanderten Start und Ende oben um dieselben 3,20 m. Wer
  den letzten Punkt allein bewegen will, hebt die Auswahl vorher auf.

  **Zwei Fälle sind weiterhin NICHT gemessen**, und beide sind nur deshalb
  offen, weil sie sich auf einem Rechteck nicht herstellen ließen:

  - **Reduzieren entfernt den letzten Punkt.** Punkt 0 bleibt nach der
    Hausregel immer erhalten; der letzte Punkt ist in der offenen Folge
    `[0 … n-1, 0]` dagegen ein Innenpunkt und **kann** fallen. In der Messung
    fiel ein anderer, weil er der flachste war.
  - **Begradigen erfasst Punkt 0.** Das setzte voraus, dass der Innenbereich
    des gewählten Abschnitts über die Schlusskante läuft;
    `interiorIndicesBetween()` wählte beide Male den nicht umlaufenden Weg.

  Beide dürfen bis zur Messung **nicht als Befund zitiert werden** – aus dem
  Verhalten der übrigen Wege folgt zwar, was zu erwarten ist, aber erwartet ist
  nicht gemessen.

  **Dieselbe Lücke ein zweites Mal, an den beiden alten Punktknöpfen.** Die
  zweite Punktgeste überschreibt die erste – „Startpunkt setzen" auf einen
  Punkt und danach „Endpunkt setzen" auf einen anderen lässt vom ersten nichts
  übrig –, und **die Statuszeile meldet beide Male Erfolg**: „Punkte neu
  nummeriert: Start = 1, Ende = n". **Eine Meldung beim Überschreiben fehlt.**
  Das ist genau der Befund, aus dem Etappe 7d entstanden ist; 7d-1 bis 7d-3
  haben ihn benannt, belegt und zugesichert, aber nicht behoben – die beiden
  Knöpfe verhalten sich unverändert.

  **Behoben mit Schritt 6 (7d-4c).** Die Zuordnung ist zugunsten von 7d-4
  entschieden – es war derselbe Gegenstand, und die Marke wurde ohnehin
  angefasst. **Der 8b-Anteil bleibt offen:** die beiden `title`-Attribute von
  `#setStartPointBtn` und `#setEndPointBtn` erklären weiterhin als einzige,
  dass die zwei Knöpfe dieselbe Drehung auslösen, und auf einem Tablet
  erscheint kein `title`. Die **Meldung** gibt es jetzt, die **Erklärung
  vorher** noch nicht.

  Gemeldet wird in `rotateRingToStart()`, also an der einen Stelle, an der
  eine Auftrennstelle entsteht; verglichen wird über `cutEdgePointMatches()`,
  dieselbe Funktion, die auch `getCutEdgeState()` benutzt. Zwei Rechenwege
  liefen genau dort auseinander, wo der Unterschied ein Bruchteil eines
  Millimeters ist.

- **`selectedVertex` steht nach `applyMergeCut()` auf dem Endpunkt, obwohl die
  Funktion ihn auf `null` setzt.** Befund vom 10.09.2026, Stand `1a0c325`, im
  Browser gemessen – **Reproduktionsfall, kein Auftrag.**

  `applyMergeCut()` setzt ausdrücklich `selectedVertex = null` und füllt allein
  `selectedVertices` mit den beiden Endpunkten. Unmittelbar nach dem Klick auf
  „Auftrennstelle setzen" steht `selectedVertex` trotzdem auf `3`, also auf dem
  letzten Punkt des gedrehten Rings.

  **Die sichtbare Folge ist ein fehlender Marker.** Die Mähervorschau
  **ersetzt** den Marker des ausgewählten Punktes (`mowerReplacesPoint` in
  `renderGeometry()`); weil `selectedVertex` gesetzt ist, greift sie. Gemessen
  bei einem Ring aus vier Punkten:

  ```
  Ring:   [[40,0],[40,40],[0,40],[0,0]]
  Marker: 0:0:0@40/0   0:0:1@40/-40   0:0:2@0/-40      -> DREI Marker
  selectedVertices: [0, 3]   selectedVertex: 3
  ```

  Der Marker des Endpunkts fehlt, an seiner Stelle steht der Mäher.

  **Noch nicht ermittelt, und beides gehört vor eine Entscheidung:**

  - **Wer `selectedVertex` danach schreibt.** In Frage kommen
    `afterGeometryEdit()`, `syncActiveSlotFromGlobals()` und `activateMap()`,
    die alle drei die Auswahl anfassen; nachgesehen ist es nicht.
  - **Ob dem Nutzer damit ein Griff fehlt.** Der Endpunkt ist über den Mäher
    weiterhin auswählbar, sofern der Mäher dieselbe Trefferfläche hat – und ob
    er das tut, ist ebenfalls nicht gemessen. Ist die Fläche kleiner oder
    versetzt, ist der Endpunkt nach dem Auftrennen schwerer zu greifen als
    jeder andere Punkt, und zwar genau in dem Moment, in dem man ihn ansehen
    will.

  **Für Tests ist das ein Fallstrick**, und er hat beim Messen zu 7d-4 sofort
  zugeschlagen: ein Skript, das den Marker des Endpunkts über seine Koordinate
  sucht, findet ihn nicht und läuft in einen Playwright-Timeout. Vorher die
  Auswahl aufheben – dann stehen wieder alle Marker da.

- **Die Mähbahnen-Vorschau ist geplant, aber nicht gebaut.** Sie war für
  Ausgabe 049 vorgesehen und wurde herausgenommen, um den Release nicht
  aufzuhalten; sie kommt in einer späteren Ausgabe. In der Anwendung gibt es
  dazu bisher nichts – weder Schalter noch Platzhalter.
- **Ein relativer Export schreibt weiterhin den aktiven `referenceOrigin` in
  die Datei.** Das ist korrekt, solange kein Konflikt besteht – und ein
  Konflikt sperrt den Export inzwischen vollständig. Bleibt als Merkposten,
  falls die Sperre je gelockert wird.

- **Nach dem Umbau zu entscheiden: Dateigröße und Struktur von `index.html`.**
  Offene Frage, **kein Auftrag** – und ausdrücklich **nicht während Etappe 7
  anzufassen**: die Datei umzustrukturieren hieße, jede Fundstelle in dieser
  Datei gleichzeitig zu verschieben, und CLAUDE.md nennt durchgehend
  Bezeichner statt Zeilennummern genau deshalb, weil Bezeichner beim Umbau
  stabil bleiben sollen.

  **Der Befund, der die Frage aufwirft:** über 330 globale Funktionen liegen in
  einem einzigen Gültigkeitsbereich (Abschnitt 6). Etappe 6 hat pro Teilschritt
  mindestens eine Tatsache zutage gefördert, die an mehreren Orten stand –
  doppelte `id`s im Markup, eine zweite Fassung von `isWholeFeatureSelected()`,
  doppelte Schlüssel in `I18N_EN`, Breitenwerte in einer Medienregel neben den
  Rastervariablen, verwaiste CSS-Regeln. Das ist kein Zufall, sondern eine
  Folge dieses Zustands: wer eine Hilfsfunktion schreibt, sieht die 9 000
  Zeilen weiter unten nicht.

  **Die Randbedingung, die den naheliegenden Weg ausschließt:** ES-Module über
  `<script type="module">` unterliegen CORS, und ein `file://`-Dokument hat
  keinen Origin – der Browser lehnt jeden Import ab. Aufteilen in mehrere
  Dateien scheitert damit genau an dem, was die Datei autark macht. Ein
  Build-Schritt, der wieder zusammenfügt, gäbe „kein Build, keine
  Dependencies" auf.

  **Nicht verwechseln: klassische `<script src>` unterliegen CORS nicht** und
  laden auch über `file://`. Sie lösen die Frage trotzdem nicht – der
  Gültigkeitsbereich bliebe ein einziger, gewonnen wäre nur die Trennung in
  Dateien, und bezahlt würde sie mit der Autarkie: `index.html` allein liefe
  dann nicht mehr. **Das ist hier nicht gemessen, sondern aus dem
  Browserverhalten abgeleitet** – wer den Weg ernsthaft erwägt, probiert ihn
  vorher aus.

  **Zu entscheiden ist in dieser Reihenfolge, und die Reihenfolge ist der
  eigentliche Inhalt dieses Eintrags:**

  1. **Zuerst messen.** Zeilen und Bytes getrennt nach Markup, CSS und JS; die
     zehn größten Funktionen; die Verteilung der ~330 Funktionen auf Themen;
     und welche Themen heute über die Datei verstreut liegen statt beieinander.
     Ohne diese Zahlen ist jede Antwort auf 2. und 3. geraten.
  2. **Dann: lösen Namensräume das Problem oder verschieben sie es nur?** Und
     vor allem: **was lösen sie ausdrücklich nicht?** Ein Objekt, das dreißig
     Funktionen bündelt, beseitigt die stille Doppelvergabe innerhalb seines
     Namens – aber weder die Streuung eines Themas über die Datei noch die
     Länge noch die Frage, ob jemand beim Schreiben den Namensraum trifft.
     Anmerkung zur Ehrlichkeit: **die „geplanten Namensräume" stehen bisher
     nirgends im Repository**, weder hier noch in `AGENTS.md`. Sie sind eine
     Absicht, kein aufgeschriebener Entwurf.
  3. **Erst danach: ob überhaupt geteilt wird.** Ein Zusammenbau aus mehreren
     Quelldateien mit eingechecktem Erzeugnis wäre technisch möglich, erzeugt
     aber **zwei Wahrheiten**: Quelle und Erzeugnis laufen still auseinander,
     sobald jemand am Erzeugnis editiert – und am Erzeugnis wird editiert
     werden, weil es die Datei ist, die im Browser läuft und auf die jede
     Fehlersuche zeigt. Das ist dieselbe Fehlerklasse, die Etappe 6 fünfmal
     gezeigt hat, nur größer: eine Tatsache an zwei Orten, ohne Prüfung, die
     das Auseinanderlaufen meldet.

- **Nach dem UI-Umbau: fünf zusammenhängende Punkte um die Mähergeometrie.**
  Eintrag, **kein Auftrag** – und ausdrücklich **ein Paket, keine fünf
  Einzelpunkte**. Die Reihenfolge ist die Abhängigkeit: **1 und 4 tragen 2 und
  3**, deshalb wird nichts davon einzeln vorgezogen. Wer 2 oder 3 ohne 1 baut,
  hat keine Abmessung, gegen die er prüft; wer sie ohne 4 baut, verschiebt mit
  gleicher Wahrscheinlichkeit in die falsche Richtung – und das Ergebnis sieht
  dabei plausibel aus.

  **1. Genaue Mähergeometrie (Grundlage).** Statt Länge und Breite: Abstand
  GPS-Antenne zur Front, GPS zum Heck, Gesamtbreite, Spielraum. **Der
  Bezugspunkt liegt damit nicht mehr in der Mitte** – der Körper ist
  unsymmetrisch um den Punkt.

  - **Was das an `renderSelectedMower()` ändert:** die Funktion zeichnet heute
    durchgehend symmetrisch, und zwar nicht an einer Stelle, sondern in jedem
    Teil. Der Rumpf sitzt auf `-mowerLength/2` / `-mowerWidth/2`, die Frontspitze
    auf `+mowerLength/2`, die Räder auf `±mowerWidth/2`, Mittelpunkt und Pfeil
    sind Bruchteile der Länge. Jede dieser Zahlen müsste stattdessen gegen
    *vorn* und *hinten* getrennt gerechnet werden. Mitbetroffen sind der
    Tooltip in `bindMowerEvents()` und die Größenzeile in
    `updateMowerOrientationInfo()`, die beide „L × B" ausgeben.
  - **Was mit `mowerLengthInput` / `mowerWidthInput` geschieht – ersetzt,
    abgeleitet oder daneben – ist zu entscheiden.** Zur Entscheidung gehört
    dieser Befund: **die Breite ist nicht nur Darstellung.** `mowerWidth` ist
    die Schwelle der Korridorprüfung und geht als `mowerWidth²` in
    `reduceAreaAbsoluteThreshold()` ein; die Oberfläche sagt das inzwischen
    selbst. Ein Ersetzen muss diesen beiden Stellen also eine definierte
    Nachfolge geben, ein Danebenstellen erzeugt zwei Breiten.
  - **Vierter Verbraucher, leicht zu übersehen:** der Vergleichs-Baseline eines
    ausgewählten Punktes speichert `mowerLength` und `mowerWidth` **mit** und
    zeichnet den Ghost daraus. Eine neue Geometrie muss dort mitreisen, sonst
    zeigt der Vergleichsmäher weiter den alten Körper.
  - **Ob der Spielraum ein eigener Wert ist oder eingerechnet wird, ist eine
    Entscheidung, keine Ableitung.** Für einen eigenen Wert spricht, dass er in
    2 und 3 wieder auftaucht und eingerechnet dort unsichtbar wäre; dagegen
    spricht ein Feld mehr. Eingerechnet lässt sich hinterher nicht mehr
    unterscheiden, was Fahrzeugmaß und was Sicherheitsabstand war.

  **2. Kollisionsprüfung eines ausgewählten Bereichs.** Einen gewählten Bereich
  gegen Fahrzeugabmessung plus Spielraum prüfen. **Zu entscheiden ist, ob die
  vorhandene Korridorprüfung der Kartenprüfung mitwächst** – sie benutzt heute
  schlicht `const threshold = mowerWidth` – **oder ob eine zweite Prüfung
  daneben entsteht.** Zwei Antworten auf „passt der Mäher hier durch" wären
  eine Tatsache an zwei Orten.

  Wer die zweite Prüfung erwägt, übernimmt damit auch alles, was an der ersten
  schon entschieden ist: `segmentDistance()` in geschlossener Form statt
  Abtastung, der `pointIsMowable()`-Filter, `GEOMETRY_CHECK_PAIR_BUDGET`, die
  Sperre bei unbekanntem Maßstab und die Einstufung als Warnung. Eine zweite
  Prüfung, die eine dieser Eigenschaften anders beantwortet, ist kein Zusatz
  mehr, sondern ein Widerspruch.

  **3. Abrunden – zwei Betriebsarten, EIN Werkzeug.** Ecken im Radius der
  Mäherabmessung inklusive Spielraum abrunden. Viertes Umformwerkzeug neben
  Begradigen, Reduzieren und Rechtwinklig, im selben Faltblock.

  | Betriebsart | Auswahl | Wirkung |
  |---|---|---|
  | eine Ecke | genau zwei Punkte desselben Rings | die Ecke zwischen ihnen |
  | alle Ecken | ganzes Feature ausgewählt (Lasso, Rechteck oder „Ganzes Feature auswählen") | jede Ecke des Features, mit denselben Werten inklusive Spielraum |

  **Das ist ein Werkzeug mit zwei Betriebsarten und nicht zwei Werkzeuge.**
  Ausdrücklich so festgehalten, weil daraus sonst später zwei Einträge in der
  Werkzeugleiste entstehen, die dasselbe tun – unterschieden nur dadurch, wie
  viel gerade ausgewählt ist, und das sieht der Nutzer der Leiste nicht an.

  **Die Auswahlbedingungen sind keine neuen.** Jede der beiden Betriebsarten
  fällt mit einer zusammen, die es schon gibt – und daran hängt, dass die
  Vorschau-Regel aus Etappe 7f für **beide** Fälle gilt und nicht nur für einen:

  - Der **Alle-Ecken-Fall** deckt sich mit der Bedingung, die Reduzieren und
    Rechtwinklig in 7f bekommen: die Vorschau erscheint erst, wenn **alle**
    Punkte eines Features ausgewählt sind – statt wie heute schon bei einem
    einzigen über den Rückfall auf `getWholeFeatureTarget()`.
  - Der **Zwei-Punkte-Fall** deckt sich mit dem Begradigen, das unverändert bei
    genau zwei Punkten desselben Rings bleibt (`getSelectedSection()`).

  **Offen, als Entscheidung einzutragen: was gilt, wenn Lasso oder Rechteck
  mehrere Features vollständig treffen** – alle abrunden oder ablehnen? Beides
  ist vertretbar, und die Antwort gehört vor den Bau: ein Werkzeug, das
  stillschweigend das erste Feature nimmt, wäre die schlechteste der drei
  Möglichkeiten.

  Offen bleibt außerdem, **welcher Radius genau**: halbe Breite, volle Breite,
  oder frei einstellbar mit der Geometrie als Vorschlag.

  Nebenbei festzuhalten, weil es die Nachbarwerkzeuge unterscheidet: Abrunden
  **fügt Punkte hinzu**. Rechtwinklig entfernt ausdrücklich keinen, Reduzieren
  entfernt – ein Werkzeug, das welche einfügt, ist in dieser Gruppe neu und
  braucht eine Aussage dazu, wie viele.

  **Kein eigenes Symbol für das Abrunden.** Entschieden, nicht offen: die drei
  vorhandenen Umformwerkzeuge sind **reine Textknöpfe** im Faltblock – im
  ganzen Transform-Block steht kein einziges `<svg>`. Ein Symbol allein für das
  vierte wäre damit nicht Konsistenz, sondern deren Bruch. **Wenn die
  Umformwerkzeuge Symbole bekommen, dann alle vier gemeinsam, als eigener
  Punkt.**

  Der Entwurf steht hier trotzdem, damit er für diesen Fall nicht neu erfunden
  wird. Bildsprache ist die der Werkzeugleiste, und sie ist eng: `viewBox="0 0
  24 24"`, gezeichnet mit 18 px, `fill:none`, `stroke:currentColor`,
  `stroke-width:1.8`, runde Enden und Ecken, ganzzahliges Raster etwa zwischen
  3 und 21. Fast jedes Symbol dort ist **ein** Pfad; nur Lasso und Messen haben
  zwei.

  ```svg
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 19V9a4 4 0 0 1 4-4h10"></path>
    <path d="M5 9V5h4"></path>
  </svg>
  ```

  Der erste Pfad ist der abgerundete Winkel: senkrecht von (5,19) hoch,
  Viertelkreis mit Radius 4 um (9,9), waagerecht bis (19,5). Der zweite ist der
  weggenommene Scheitel (5,5), der die Bogenenden tangential verbindet – das
  Symbol zeigt damit die **Umformung** und nicht bloß ein Ergebnis.
  **Rückfallebene, falls es bei 18 px zu unruhig wirkt:** der erste Pfad
  allein; dann trägt das Wort „Abrunden" am Knopf die Bedeutung.

  **4. Umlaufsinn als Voraussetzung für 2 und 3.** Ohne Kenntnis der
  Umlaufrichtung ist „nach innen" nicht definiert: beim Perimeter liegt der
  Mähbereich innerhalb, bei einer Exclusion außerhalb.

  - **Er wird berechnet, nicht abgefragt** – vorzeichenbehaftete Fläche
    (Shoelace) je Ring. Der Nutzer sieht ihn, er trägt ihn nicht ein.
  - **Er gilt je Ring, nicht je Feature:** ein Loch läuft entgegengesetzt zum
    äußeren Ring.
  - Er betrifft **jede** Verschiebung nach innen oder außen, also 2 und 3
    gleichermaßen.
  - **Nachgesehen, wie gefordert: die Formel ist bereits da.**
    `polygonAreaMeters()` summiert genau die Shoelace-Terme
    (`x1*y2 - x2*y1`) und wirft das Vorzeichen erst in der letzten Zeile mit
    `Math.abs()` weg. Der Umlaufsinn ist damit **eine vorhandene Quelle, keine
    neue Formel** – er liegt ein `Math.abs()` entfernt. **Aber:** die Funktion
    liest ausschließlich `coordinates[0]`. Für „je Ring" muss sie verallgemeinert
    werden oder ein Geschwister auf Ringebene bekommen, und **das ist dieselbe
    Entscheidung wie beim Punkt „Löcher in Polygonen"** weiter oben – nicht
    zweimal getrennt beantworten.
  - **Nicht verwechseln mit `getVertexOrientation()`.** Das liefert die
    Fahrtrichtung aus der Punktfolge und sagt nichts darüber, welche Seite
    innen liegt.

  **5. Eigener Befund für die Kartenprüfung.** GeoJSON schreibt für Polygone
  einen Umlaufsinn vor; CaSSAndRA-Dateien halten das nicht zwingend ein.
  **Als Entscheidung einzutragen, nicht als Auftrag: meldet der Editor einen
  abweichenden Umlaufsinn nur, oder korrigiert er ihn?** Korrigieren heißt,
  fremde Dateien umzuschreiben – dieselbe Frage wie bei den Löchern in
  Polygonen, die heute editierbar, aber nicht validiert sind.

  Zwei Dinge, die der Entscheidung vorliegen sollten:

  - **Der Wortlaut der Norm ist zweigeteilt, und beide Hälften zählen.**
    RFC 7946, Abschnitt 3.1.6: „A linear ring MUST follow the right-hand rule
    with respect to the area it bounds, i.e., exterior rings are
    counterclockwise, and holes are clockwise." Unmittelbar danach jedoch:
    „For backwards compatibility, parsers SHOULD NOT reject Polygons that do
    not follow the right-hand rule." **Ein `MUST` für den Schreiber, ein
    ausdrückliches Nicht-Ablehnen für den Leser.** Ein Fehler wäre danach die
    falsche Einstufung; eine Warnung passt. (Gegen den RFC-Text nachgelesen,
    nicht aus dem Gedächtnis.)
  - **Das Haus hat dazu schon eine Linie:** die Befunde aus
    `collectGeometryFindings()` sind sämtlich Warnungen, weil der Editor zu
    wenig über die Absicht des Nutzers weiß, und der Export vergibt `idx` nicht
    neu, weil Speichern nichts still verändern soll. Beides zeigt in dieselbe
    Richtung – **es ist trotzdem eine Entscheidung und keine Ableitung**, denn
    der Umlaufsinn ist anders als `idx` normativ festgelegt.

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
