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
| Browser | sechzehn Skripte (4.2) | `playwright-core` + Browser, beides außerhalb des Repos | optional, aber bei UI- oder Geometrieänderungen dringend empfohlen |

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

Sechzehn Skripte öffnen `index.html` in einem echten Browser über eine
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
| `test-inspector.mjs` | Inspektor: Zustände, Behälter, Tastatur |

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
| `test-shapes.mjs` | „Werkzeug startet nicht" nach Klick mit Radius 0 |
| `test-merge.mjs` | „Kartenprüfung sieht nur einen Perimeter" |
| `test-merge.mjs` | „Kartenprüfung meldet kein doppeltes Docking" |
| `test-merge.mjs` | „Kartenprüfung meldet danach keine doppelten Features" |
| `test-reduce.mjs` | „Ring ist nach dem Reduzieren noch geschlossen" |
| `test-dockpath.mjs` | „drei Punkte erzeugen keinen Docking-Befund" |

Alle sechs lesen einen Prüfbericht oder einen Knopfzustand, nachdem sie einen
Auslöser gefeuert haben, und würden auch bei einem leeren Bericht bzw. einem
wirkungslosen Klick bestehen. Eine reine Verneinung ohne Auslöser – etwa
`!pointInRing(...)` in `test-geometry.mjs` – ist davon nicht betroffen: dort
gibt es keinen Auslöser, dessen Verarbeitung ausbleiben könnte.

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

**Kreis- und Rechteck-Exclusions:** Ein Klick setzt den Bezugspunkt, die
Geometrie folgt aus den eingestellten Maßen. Beide laufen über dieselbe
Zeichenmechanik wie Exclusion und Search Wire (`SHAPE_MODES`,
`isShapeMode()`), damit Abbrechen, Escape, Statuszeile und Undo-Grenze
unverändert gelten. Vorschau und Erzeugung holen die Punkte aus derselben
Funktion `shapePointsAt()` – sie können nicht auseinanderlaufen.

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
Fehler des Umbaus hält. Gemessen, nicht geschätzt:

| Fenster | vor dem Umbau | Leiste offen | Leiste eingeklappt |
|---|---|---|---|
| 1920 × 1080 | 1 485 120 px² | 1 307 088 px² (−12,0 %) | 1 412 256 px² (−4,9 %) |
| 1440 × 900 | 833 760 px² | 692 208 px² (−17,0 %) | 777 216 px² (−6,8 %) |
| 1280 × 800 | 618 240 px² | 495 568 px² (−19,8 %) | 569 376 px² (−7,9 %) |

Die Kartenfläche kostet: **93 px Höhe** für Legende (30) und die zweizeilige
Statuszeile (63), 168 px Breite für die ausgeklappte Werkzeugleiste.
Zurückgeholt wurden 16 px Höhe (Kopfzeile von 64 auf 48) und 112 px Breite
(Leiste einklappbar). Die zweite Statuszeile hat den eingeklappten Fall von
−2,0 % auf −4,9 % verschoben – bewusst, weil eine abgeschnittene Meldung
teurer ist als 28 px. Was der Umbau
tatsächlich gewinnt, ist **Überdeckung**: die schwebenden Fenster auf der Karte
sind von 25 950 px² auf 21 870 px² geschrumpft, und was übrig ist, verschwindet
mit Etappe 5 weitgehend.

Nach Etappe 6 kommen noch 40 px Breite dazu, wenn der 360 px breite
Seitenleistenbereich dem 320 px breiten Inspektor weicht. Mit eingeklappter
Leiste liegt die Fläche dann bei 1920 × 1080 knapp über dem Ausgangswert. **Wer
mehr erwartet, erwartet das Falsche vom Umbau.**

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

**Behelf mit Ablaufdatum:** `startFeatureDrawing()` klappt den Seitenleisten-
abschnitt „Features erstellen" auf. Die Zeichnung startet seit Etappe 3 aus der
Leiste, „Zeichnung abschließen" und „Abbrechen" liegen aber noch dort – und der
Abschnitt ist eingeklappt. Der Behelf entfällt mit Etappe 5, wenn diese Knöpfe
in den Inspektor ziehen.

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

Ein Release besteht damit aus: Versionsnummer in `index.html` hochziehen,
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
- **`tools/check-dom-ids.mjs` prüft nur IDs, keine Variablen- oder
  Funktionsnamen.** Verwaister Code nach dem Entfernen eines UI-Elements
  bleibt dadurch unentdeckt – genau so hatte `deleteSelectedExclusion()` den
  in Ausgabe 043 entfernten Button um mehrere Ausgaben überlebt. Die manuelle
  Volltextsuche aus Abschnitt 5 ("UI-Element entfernen") bleibt deshalb Pflicht.
- **Das Hilfe-Overlay beschreibt die Anordnung in Prosa und veraltet mit
  jeder Etappe des Oberflächenumbaus.** Es wird in Etappe 9 vollständig neu
  geschrieben, wenn die Anordnung feststeht – vorher wäre es zweimal Arbeit.
  Damit dort keine Neulektüre nötig ist, hier die Sätze, die **jetzt schon
  falsch** sind:

  - „Karteninfo: … liegen jetzt als eigenes einklappbares Fenster direkt auf
    der Karte." – stimmt noch, wird aber mit dem Inspektor hinfällig.
  - **„Auswahl-Werkzeugleiste: Mauszeiger, Rechteck, Lasso, Verschieben,
    Löschen und Auswahl aufheben liegen jetzt direkt auf der Karte." – seit
    Etappe 3 falsch.** Nur noch Begradigen, Löschen und Auswahl aufheben liegen
    dort; „Verschieben" gibt es nicht mehr.
  - **„Einpassen / Zoom: Kartenansicht anpassen." – der Ort stimmt nicht mehr**,
    beides liegt seit Etappe 3 an der Karte statt in der Kopfzeile.
  - „Sidebar: Direkt unter ‚Karten' folgt ‚Karten verbinden' …" – wird mit
    Etappe 6 falsch.
  - **„Karteninfo & Legende: liegen direkt untereinander und lassen sich
    unabhängig aufklappen." – seit Etappe 2 falsch.** Die Legende ist ein
    fester Streifen und lässt sich nicht mehr aufklappen.

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
