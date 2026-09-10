# Changelog — Deutsch

> Dieses Änderungsprotokoll wurde nachträglich als deutsches Pendant zu
> `CHANGELOG_EN.md` angelegt und beginnt beim aktuellen Stand (Ausgabe 047).
> Frühere Ausgaben (001–046) sind ausschließlich im englischen
> Änderungsprotokoll (`CHANGELOG_EN.md`) dokumentiert.

## Ausgabe 050

Ausgabe 050 baut die Oberfläche neu auf. An den Kartendaten ändert sich
nichts: Import, Export, Geometrie und alle Rechenwege sind unverändert, und
eine mit 049 gespeicherte Datei ist Byte für Byte dieselbe wie mit 050. Was
sich ändert, ist, **wo** die Bedienelemente stehen – und dass die Karte mehr
Platz bekommt.

---

### 1. Menüleiste statt verstreuter Knöpfe

Oben steht eine Menüleiste mit vier Menüs: **Datei, Ansicht, Karte, Hilfe**.
Öffnen, Speichern, Zurücksetzen, die Kartenfenster und die Hilfe liegen dort.

Jedes Menü hat ein Tastenkürzel aus dem **ersten Buchstaben seines Titels** –
deutsch Alt+D, Alt+A, Alt+K, Alt+H, englisch Alt+F, Alt+V, Alt+M, Alt+H. Die
Kürzel wechseln also mit der Sprache mit, und der markierte Buchstabe wandert
beim Umschalten von selbst mit. F10 betritt die Leiste ohne Wahltaste; danach
führen die Pfeiltasten durch alle Menüs, Escape schließt.

Die Kopfzeile ist dadurch von 1038 auf 880 px Mindestbreite geschrumpft und
von 64 auf 48 px Höhe.

### 2. Werkzeugleiste links

Alle Werkzeuge stehen senkrecht links neben der Karte, in drei Gruppen, und
die Gruppen sagen das Wichtigste: **was die Karte verändert und was nicht.**

| Gruppe | Werkzeuge |
|---|---|
| Auswählen | Zeiger, Rahmen, Lasso |
| Zeichnen | Exclusion, Kreis, Rechteck, Search Wire, Dockpfad |
| Prüfen | Messen, Karte prüfen |

Die Leiste lässt sich auf Symbolbreite einklappen; der Wunsch bleibt über den
nächsten Start hinweg erhalten. In schmalen Fenstern klappt sie von selbst ein.

Ein gesperrtes Zeichenwerkzeug **sagt jetzt, warum** es gesperrt ist – beim
Anklicken erscheint der Grund in der Statuszeile. Vorher blieb etwa „Search
Wire" dauerhaft grau, weil die Karte bereits eine hat, ohne dass das irgendwo
stand.

### 3. Inspektor rechts

Rechts steht ein Inspektor, der **beschreibt, was gerade ausgewählt ist**, und
die dazu passenden Befehle trägt. Er hat einen festen Kopfblock, der beim
Auswählen nicht wandert, und darunter je nach Auswahl: die East/North-Felder
eines Punktes, seine Rolle als Start- oder Endpunkt, Fläche und Punktzahl
eines Features, die Auswahlaktionen „Auswahl löschen" und „Auswahl aufheben".

Fünf Faltblöcke ergänzen ihn: **Umformen** (Begradigen, Reduzieren,
Rechtwinklig), **Kartenprüfung**, **Feature-Navigation**, **Koordinatenbezug**
und die Bestandsangaben. Zugeklappt trägt jeder das Wichtigste in einer Zeile.
Sie klappen nie von selbst auf – auch dann nicht, wenn ein Werkzeug ausführbar
wird oder die Prüfung neue Befunde hat.

Auch der Inspektor lässt sich einklappen, auf einen 34-px-Streifen mit dem
Umschalter; auch dieser Wunsch überlebt den nächsten Start.

Die Umformwerkzeuge stehen **immer** da, auch wenn sie gerade nicht gehen –
mit dem Grund darunter. Wer sie nur sähe, wenn sie schon gehen, erführe nie,
was er dafür tun müsste.

### 4. Legende und Statuszeile unten

Die Legende ist eine feste Reihe über der Statuszeile, **immer sichtbar und
nicht mehr einklappbar**. Vorher lag sie eingeklappt über der Karte und war
damit genau dann nicht da, wenn man die Farben braucht.

Darunter fasst eine zweizeilige Statuszeile sieben zuvor verstreute Ausgaben
zusammen: links Dateiname, Maßstab, Bezugspunkt und Prüfergebnis, rechts
Auswahlzähler und Cursor-Koordinaten, in Zeile 2 über die volle Breite die
jeweils jüngste Meldung. Zehn der vierzehn Ausgabestellen lagen vorher in
einklappbaren Bereichen, und genau daran waren zweimal Meldungen unsichtbar
geworden.

### 5. Drei Fenster über der Karte

**Raster**, **Mähroboter-Vorschau** und **Karten verbinden** sind kleine
Fenster, die sich über das Menü „Karte" öffnen und beim Einstellen den Blick
auf die Karte lassen. Zu kosten sie keinen Platz.

### 6. Die Seitenleiste entfällt

Es gibt sie nicht mehr. Ihre Inhalte sind dorthin gezogen, wo sie gebraucht
werden: die Feature-Navigation und der Koordinatenbezug in den Inspektor, das
Verbinden in sein Fenster, die Maßfelder der Zeichenwerkzeuge in den
Zeichenzustand des Inspektors, die Auswahlleiste von der Karte in den
Inspektor. Der Papierkorb auf der Karte heißt jetzt **„Auswahl löschen"** und
steht im Inspektor.

Auf dem Telefon stehen Werkzeugleiste, Karte und Inspektor untereinander, und
die Seite scrollt; jeder Befehl bleibt über die Menüleiste erreichbar. Der
frühere Knopf, der auf kleinen Displays die Bedienleiste ein- und ausblendete,
ist damit entfallen.

### 7. Mehr Kartenfläche – vor allem in schmalen Fenstern

Gemessen im selben Browser und mit demselben Skript wie der Ausgangswert:

| Fenster | beide Leisten offen | beide eingeklappt |
|---|---|---|
| 1920 × 1080 | −15,2 % | **+8,4 %** |
| 1440 × 900 | −20,0 % | **+13,5 %** |
| 1280 × 800 | −22,9 % | **+15,8 %** |

Der eigentliche Gewinn liegt bei den Zwischenbreiten. Bei **940 × 800** –
einer Breite, in der die Werkzeugleiste ohnehin eingeklappt ist – wuchs die
Kartenfläche von 147 616 auf **371 676 px², also um 151,8 %**. Dort
reservierte das alte Raster eine Spalte für eine Seitenleiste, die der Karte
nichts zurückgab.

**Ehrlich dazu:** mit beiden Leisten offen ist die Fläche kleiner als vorher.
Der Umbau ist ein Ordnungsgewinn; die Fläche gewinnt, wer einklappt.

### 8. Kleinigkeiten

- Der Mauszeiger zeigt das aktive Werkzeug: Fadenkreuz beim Zeichnen, Messen
  und bei Rahmen/Lasso, sonst die Greifhand, über einem Punkt ein
  Verschiebe-Zeiger.
- Der Knopf „Verschieben" ist entfallen – er war reine Doppelung des Zeigers.
- Die Punktknöpfe stehen als Paare: davor/danach, Start/Ende; „Punkt löschen"
  allein über die volle Breite.
- Ein leeres E/N-Feld sagt jetzt, warum es leer ist.
- Die Kartenfarben stehen an einer Stelle, und die Legende zieht dieselben
  Werte wie die Darstellung. Gelb bedeutet nur noch **Auswahl**; der
  Docking-Pfad ist blau, das Ursprungskreuz neutral, die Vergleichslinie
  gehört zu den Vorher-Ghosts.
- Das Hilfe-Overlay beschreibt wieder die tatsächliche Anordnung.

---

## Ausgabe 049

> **Hinweis für Karten, die vor Ausgabe 048 exportiert wurden:** Bis
> einschließlich Ausgabe 047 hat der Editor den in einer Datei hinterlegten
> RTK-Bezugspunkt beim Laden ungefragt übernommen – auch dann, wenn bereits
> eine andere Karte geladen war. Wurde danach exportiert, konnte die Ausgabe um
> den Abstand beider Bezugspunkte verschoben sein, ohne dass die Datei oder
> eine Meldung darauf hingewiesen hätte. Betroffen sind ausschließlich Exporte,
> die entstanden sind, während **zwei Karten gleichzeitig** geladen waren und
> mindestens eine davon einen abweichenden Bezugspunkt mitbrachte. Solche
> Dateien vor dem Einsatz mit dem Original vergleichen. Karten, die mit nur
> einer geladenen Karte exportiert wurden, sind nicht betroffen.

---

### 1. Formaterkennung und Maßstab

Die Moduserkennung beruhte auf einem Präzisionstest: geprüft wurde, ob jeder
Koordinatenwert nach Multiplikation mit 111111 ein Zentimeter-Vielfaches ergibt,
erkannt wurde ab 98 % Treffern. Das ist ein Genauigkeitstest, der als
Einheitentest benutzt wurde – zwei frei gesetzte Punkte auf einer
100-Punkte-Karte kippten ihn, bei kleinen Karten genügte einer. Der Editor
erkannte damit seine eigene Ausgabe nicht wieder.

Entschieden wird jetzt anhand der **Ausdehnung**: eine WGS84-Mähkarte ist
zwangsläufig winzig ausgedehnt (200 m entsprechen 0,0018°), eine Meterkarte
zwangsläufig groß. Der Betrag trennt danach nur noch absolut von relativ. Der
Modus wird beim Laden **einmal** bestimmt und an der Karte gemerkt; Bearbeiten
kann ihn nicht mehr kippen.

Damit ist ein zweiter Fehler behoben, der davor saß: die Absoluterkennung sah
nur den Betrag an. Eine Karte, deren Zahlen schlicht Meter sind, galt deshalb
als absolutes WGS84 und wurde beim Import mit 111111 multipliziert – aus 200 m
wurden 22 222 200 m.

**Verhaltensänderungen an bestehenden Karten:**

| Karte | bisher | jetzt |
|---|---|---|
| Relativkarte mit frei gesetzten Punkten | unskaliert dargestellt | korrekt in Metern |
| Meterkarte (8 m, 200 m, auch mit Versatz) | als Grad gelesen | metrisch (angenommen) |
| Relativkarte über 15 km Ausdehnung | als Grad gelesen | Zweifelsfall, nichts wird behauptet |
| Meterkarte unter 1 m Ausdehnung | als Grad gelesen | Zweifelsfall, nichts wird behauptet |
| WGS84-Karte nahe 0°/0° | unskaliert dargestellt | als Relativkarte gelesen |

Der letzte Fall ist nominell schlechter und eine bewusste Entscheidung: eine
Absolutkarte am Nullpunkt ist von einer Relativkarte numerisch nicht zu
unterscheiden. Der Punkt liegt mitten im Atlantik, die Erwartung „Relativkarte"
ist um Größenordnungen wahrscheinlicher, und ein Zweifelsfall, der diesen Fall
mit abdeckte, träfe jede normale Relativkarte.

**„Metrisch (angenommen)" heißt bewusst angenommen.** Eine große Ausdehnung
beweist nur, dass die Zahlen keine Grad sind – nicht, dass es Meter sind. Es
könnten Fuß, Zentimeter oder ein lokales Gitter sein.

**Bei unklarem Maßstab wird gesperrt, was keine Umrechnung retten kann:**
Rasterfang, absolutes Speichern und das Schreiben der Zusatzfelder
`referenceOrigin` und `coordinateScale`. Eine Zusicherung, die die Datei nicht
einlöst, wird nicht geschrieben. Toleranz, Begradigen und Mäher-Vorschau
bleiben nutzbar und werden nur gekennzeichnet; Längen tragen dann „Einheiten"
statt „m". Ein dauerhaft sichtbarer Hinweis liegt **im Kartenbereich** statt in
einem einklappbaren Abschnitt und nennt beide Lesarten mit ihrer konkreten
Größe.

**Neu: das Feld `coordinateScale`** (`{metersPerUnit}`) auf der
FeatureCollection, gleiche Machart wie `referenceOrigin`. Ein Wert in der Datei
schlägt jede Heuristik – damit erkennt der Editor seine eigene Ausgabe
zuverlässig wieder. Dass CaSSAndRAs Import zusätzliche Felder auf oberster
Ebene ignoriert, ist am Quelltext belegt, aber nicht gegen eine laufende
Instanz geprüft.

**Nur die vier CaSSAndRA-Typen sind bearbeitbar.** Features mit unbekanntem
oder fehlendem `properties.name` werden weiterhin angezeigt und beim Speichern
unverändert zurückgeschrieben, bekommen aber keine Punktmarker, sind räumlich
nicht auswählbar und liefern in jedem Werkzeug denselben Ablehnungsgrund. Ein
gesetzter, aber unbekannter Name ist ein **Fehler** (jemand hat etwas
behauptet, das nicht stimmt); ein ganz fehlender Name nur eine **Warnung**, und
alle betroffenen Features werden zu einer einzigen Meldung zusammengefasst.

**In der Kartenprüfung gilt: eine übersprungene Prüfung ist nicht bestanden.**
Bei unbekanntem Maßstab meldet die Flächenangabe „konnte nicht berechnet
werden" statt einer Zahl, und die Segmentprüfung sagt, dass nur ihr relativer
Anteil angewendet wurde.

### 2. Widersprüchliche Bezugspunkte

Der RTK-Bezugspunkt einer geladenen Datei wurde bisher still übernommen. Das
ist die Ursache des Hinweises am Anfang dieser Ausgabe.

- **Übernommen wird nur noch, wenn nichts anderes geladen ist.** Ist der andere
  Kartenslot belegt, bleibt der aktive Bezugspunkt stehen und der Widerspruch
  wird gemeldet.
- Zwei Bezugspunkte gelten als derselbe Standort, wenn sie **weniger als 1 cm**
  auseinanderliegen. Verglichen wird in Metern, nicht in Grad – ein Längengrad
  ist je nach Breite unterschiedlich lang.
- **Solange ein Widerspruch besteht, ist das Verbinden gesperrt** und **das
  Speichern in beiden Ausgabemodi**. Der relative Pfad ist dabei nicht der
  harmlosere, sondern der leisere: eine gegen den falschen Punkt gerechnete
  Relativkarte liegt auf dem Roboter daneben, und die Datei enthält keine
  einzige Zahl, an der sich das erkennen ließe.
- **Aufgelöst** wird der Widerspruch, indem der in der Warnung genannte
  Bezugspunkt der Datei eingetragen wird. Warnung und Sperren verschwinden dann
  von selbst.
- **Ein geänderter Bezugspunkt basiert umgerechnete Karten neu.** Ohne diese
  Neubasierung wäre der Export nach dem Auflösen um die Differenz verschoben
  gewesen – still falsch trotz gefallener Sperre. Sichtbare Folge: die
  angezeigten East/North-Werte laufen danach gegen einen neuen Nullpunkt. Die
  Statuszeile sagt das.
- Der Bezugspunkt steckt jetzt im Undo-Schritt. Sonst holte ein Undo die
  Geometrie zurück, aber nicht den Rahmen.

### 3. Docking-Pfad: Punktzahl freigegeben

Die bisherige Regel „exakt 3 Punkte" war eine **Eigenerfindung des Editors**
und ist gegen beide Quellen widerlegt.

- **CaSSAndRA** (`mapdata.py`, Branch `master`) reicht den Dockpfad als
  einfachen `LineString` mit allen Koordinaten durch, ohne Zählung.
  `check_dockpoints()` verlangt ausdrücklich nur **mindestens 2** Punkte und
  rechnet mit den letzten beiden. Beim Löschen eines Punktes nimmt CaSSAndRA
  Dockpoints sogar von der 3-Punkte-Regel für Figuren aus.
- **Sunray** (`map.cpp`) verweigert das Andocken bei weniger als 2 Punkten.
  Eine Annahme „genau 3" existiert nirgends; `retryDocking()` vergleicht gegen
  `numPoints-3`, was nur bei **mehr** als drei Punkten Sinn ergibt.

Daraus folgt: **ab 2 Punkten gültig, ohne Obergrenze.** Eine Punktzahl ungleich
3 erzeugt nur noch einen Hinweis auf die übliche Praxis, keinen Fehler. Ein
einzelner Punkt bleibt ein Fehler. Die automatische Fertigstellung nach dem
dritten Punkt entfällt, der Pfad lässt sich am Ende verlängern, und einzelne
Punkte lassen sich löschen, solange 2 übrig bleiben.

**Nicht gegen laufende Firmware oder echte Hardware getestet**, nur gegen den
Quelltext beider Projekte. Eine Obergrenze gibt es in keiner der beiden
Quellen – es wurde keine eingebaut und wird keine behauptet.

### 4. Neue Werkzeuge

**Linie begradigen.** Sind genau zwei Punkte desselben Linienzugs ausgewählt,
werden die Punkte dazwischen senkrecht auf die Verbindungsgerade projiziert.
Die beiden Ankerpunkte bleiben liegen. Bei geschlossenen Ringen wird der
kürzere der beiden Wege genommen. Vorschau vor dem Anwenden, ein Undo-Schritt.

**Punkte reduzieren (Douglas-Peucker).** Arbeitet auf dem Abschnitt zwischen
zwei ausgewählten Punkten oder auf einem ganzen Feature.

- Vorgabetoleranz **0,02 m**, die Größenordnung des RTK-Rauschens.
- Geschlossene Ringe bleiben geschlossen; der Startpunkt bleibt dabei immer
  erhalten – eine bewusste Einschränkung, auf die die Oberfläche hinweist.
- Ist die Toleranz zu groß, wird **abgelehnt statt gekürzt**, und es wird
  genannt, welche Toleranz noch funktioniert hätte.
- **Flächenänderungen an Exclusions werden gemeldet**, wenn sie 1 % *oder* ein
  Quadrat der eingestellten Arbeitsbreite überschreiten. Schrumpfende Flächen
  werden als Warnung gefärbt – sie geben Fläche frei, die der Mäher meiden soll.
- Vor dem Anwenden läuft die Kartenprüfung über eine Vorschaukopie. Neue Fehler
  brechen ab.

**Kreis- und Rechteck-Exclusions.** Ein Klick setzt den Bezugspunkt, die
Geometrie folgt aus den eingestellten Maßen. Das Ergebnis ist eine
**gewöhnliche Exclusion** – gleicher Ringschluss, gleiche `idx`-Vergabe, keine
zusätzlichen Felder, danach wie jede andere editierbar. Vorgabe 24 Ecken: die
Abweichung vom idealen Kreis beträgt dann 8 mm bei 1 m Radius und 17 mm bei
2 m, beides unter dem RTK-Rauschen; die tatsächliche Abweichung wird angezeigt.
Snap-to-Grid wirkt auf den Bezugspunkt, nicht auf die Eckpunkte.

**Erweiterte Kartenprüfung.** Vier neue Befunde, alle **Warnungen**: Exclusions
außerhalb des Perimeters, sich überlappende oder ineinander liegende
Exclusions, sich selbst überschneidende Ringe und Linien, und Korridore, die
schmaler als der Mäher sind.

- Der Docking-Pfad ist von der Perimeterprüfung ausgenommen – er führt in
  vielen Aufbauten bewusst nach außen zur Ladestation.
- Überlappungen werden gemeldet, aber nicht beziffert.
- Der Korridorabstand ist **exakt** berechnet, nicht abgetastet. Exakt ist
  dabei die Geometrie, nicht die Aussage über Befahrbarkeit: gemessen wird
  gegen die Arbeitsbreite, Wendekreis, RTK-Toleranz und Spurabweichung fehlen.
  **Kein Befund bedeutet nicht, dass ein Korridor befahrbar ist** – das steht
  auch im Prüfbericht. Bei unklarem Maßstab meldet sich die Prüfung als
  übersprungen.
- Befunde werden je Feature bzw. je Paar zusammengefasst und nennen Feature und
  Segment. Bei sehr großen Karten wird der Abbruch ausdrücklich gemeldet.

**Ecken rechtwinklig machen.** Legt die Kanten eines ganzen Features auf ein
rechtwinkliges Raster. Die Vorzugsrichtung wird aus dem Umriss geschätzt oder
fest vorgegeben; angezeigt werden Vorzugsrichtung, **Übereinstimmung in
Prozent**, angepasste Kanten und die größte Verschiebung eines Punktes. Eine
niedrige Übereinstimmung heißt, dass die Form gar nicht rechtwinklig gemeint
ist – sie wird als Warnung gefärbt, gesperrt wird nichts. Kanten jenseits der
Toleranz (Vorgabe 15°) bleiben unangetastet, und **es wird kein Punkt
entfernt**. Ausgerichtet wird auf die eigene Vorzugsrichtung, nicht auf
East/North; für achsparallel gibt man 0° fest vor.

### 5. Aufräumen und Korrekturen

- **Verbinden verdoppelte Docking-Pfad und Search Wire.** Beide gibt es pro
  Karte nur einmal; aus der zweiten Karte werden jetzt nur noch Exclusions und
  Features unbekannten Typs angehängt. Leere Platzhalter entfallen, ein
  befüllter Pfad gewinnt unabhängig davon, aus welcher Karte er stammt, und
  **zwei befüllte Pfade sind ein Konflikt**, der das Verbinden sperrt – still
  einen wegzuwerfen wäre falsch. Ein Docking-Pfad mit einem einzigen Punkt gilt
  dabei nicht als leer, sondern als fehlerhaft, und geht in den Konflikt.
- Features unbekannten Typs werden beim Verbinden bewusst aus **beiden** Karten
  übernommen statt zusammengeführt: der Editor weiß nichts über sie, und
  Wegwerfen wäre schlimmer als Verdoppeln.
- **Der Export vergibt Exclusion-Indizes nicht neu.** Geladene `idx`-Werte
  werden unverändert zurückgeschrieben, einschließlich Lücken. Umnummeriert
  wird nur nach strukturellen Änderungen. Speichern soll nichts still ändern,
  was niemand angefasst hat.
- Ein Hinweistext im Bereich „Punkte reduzieren" wurde nie ins Englische
  übersetzt, weil er nur zeilenweise hinterlegt war.
- Testwerkzeuge: `tools/check-all.mjs` bündelt die abhängigkeitsfreien
  Prüfungen, dazu zehn Browsertests. Sie sind bewusst nicht Teil von
  `check-all.mjs` und erzeugen ihre Karten ausschließlich synthetisch.

**Bekannte offene Punkte dieser Ausgabe:** Die dynamischen Titel von
„Zurück"/„Vor" bleiben im englischen Modus deutsch, und ein bereits erzeugter
Prüfbericht wird beim Sprachwechsel nicht nachübersetzt. Beides ist in
`CLAUDE.md` festgehalten und wird beim nächsten Umbau der Oberfläche
gemeinsam erledigt.

## Ausgabe 048

> **Hinweis für bereits exportierte Karten:** Bis einschließlich Ausgabe 047
> hat der Editor den in einer Datei hinterlegten RTK-Bezugspunkt beim Laden
> ungefragt übernommen – auch dann, wenn bereits eine andere Karte geladen
> war. Wurde danach exportiert, konnte die Ausgabe um den Abstand beider
> Bezugspunkte verschoben sein, ohne dass die Datei oder eine Meldung darauf
> hingewiesen hätte. Betroffen sind ausschließlich Exporte, die entstanden
> sind, während **zwei Karten gleichzeitig** geladen waren und mindestens eine
> davon einen abweichenden Bezugspunkt mitbrachte. Solche Dateien vor dem
> Einsatz mit dem Original vergleichen. Karten, die mit nur einer geladenen
> Karte exportiert wurden, sind nicht betroffen.

### CaSSAndRA-Kompatibilität

Diese Funktionen waren bereits umgesetzt, wurden bisher aber in keinem
Änderungsprotokoll geführt. Sie sind gegen den Quelltext von CaSSAndRA
(`export_geojson`) abgeglichen.

- Feature-Typen folgen dem CaSSAndRA-Vokabular: `perimeter`, `exclusion`,
  `search wire`, `dockpoints`
- `properties.name` trägt ausschließlich den Typ; ein abweichender
  Anzeigename gehört nach `properties.label` und bleibt beim Speichern
  erhalten
- beim Import werden zusätzlich die Schreibvarianten `searchwire` und
  `dock points` akzeptiert, beim Export wieder normalisiert
- Features mit unbekanntem Namen behalten ihren Wert und werden nicht
  stillschweigend umbenannt
- Exclusion-Indizes werden auf Feature-Ebene in `idx` geführt
- neuer Bereich **„Koordinatenbezug"** in der Seitenleiste zur Eingabe der
  RTK-Basisposition (lat/lon); sie steht in CaSSAndRA unter *Settings → Robot*
  und ist nicht Teil der GeoJSON-Datei
- neue Auswahl **„Koordinaten beim Speichern"**: *wie geladen* oder
  *absolut WGS84 (CaSSAndRA)*
- Karten in absolutem WGS84 werden beim Laden erkannt und in lokale
  East/North-Meter umgerechnet
- der Bezugspunkt wird im Browser gemerkt und zusätzlich in der Datei
  hinterlegt, ohne CaSSAndRAs Import zu stören
- ohne eingetragenen Bezugspunkt verhält sich der Editor exakt wie zuvor

### Bezugspunkt-Konflikt (sicherheitsrelevant)

Der Editor rechnet intern immer relativ zu **einem** Bezugspunkt. Bislang
überschrieb eine neu geladene Datei diesen Punkt stillschweigend – die bereits
geladene Karte wurde dadurch gegen eine fremde RTK-Basis gerechnet und beim
Speichern entsprechend verschoben ausgegeben, ohne Warnung und ohne Spur in
der Datei. Auf einem Roboter mit der echten Basis wäre die Karte um den
Abstand beider Basispunkte danebengelegen.

- ein in der Datei hinterlegter Bezugspunkt überschreibt den aktiven nicht
  mehr, solange eine andere Karte geladen ist, die sich dadurch verschieben
  würde
- der Widerspruch wird deutlich gemeldet: rot hervorgehobene Statuszeile,
  aufgeklappter Bereich „Koordinatenbezug", beide Werte und ihr Abstand im
  Klartext
- **Verbinden** ist gesperrt, solange eine der beiden Karten dem aktiven
  Bezugspunkt widerspricht
- **Speichern** ist in **beiden** Ausgabemodi gesperrt. Ein relativer Export
  ist dabei nicht der harmlosere, sondern der leisere Fall: dort enthält die
  Datei keine einzige Zahl, an der sich die falsche Basis erkennen ließe
- der Konflikt lässt sich auflösen, indem der genannte Bezugspunkt unter
  „Koordinatenbezug" eingetragen und übernommen wird
- eine aus absolutem WGS84 umgerechnete Karte wird beim Ändern des
  Bezugspunktes exakt neu basiert. Ohne diese Umrechnung wäre der Export nach
  dem Auflösen erneut verschoben gewesen. **Die angezeigten East/North-Werte
  laufen danach gegen einen neuen Nullpunkt und ändern sich sichtbar**, obwohl
  die Geometrie unverändert bleibt
- der Bezugspunkt gehört jetzt zum Undo-Zustand; Zurück stellt Geometrie und
  Bezugsrahmen gemeinsam wieder her
- behoben: beim Verbinden zweier Karten ging die Information verloren, dass
  sie aus absolutem WGS84 stammen – das Ergebnis wurde danach relativ statt
  absolut gespeichert
- die Lade-Meldungen sind erstmals übersetzt; sie erschienen bisher auch im
  englischen Modus auf Deutsch

### Aufräumen und Dokumentation

- toten Code entfernt: `deleteSelectedExclusion()` (verwaister Rest des in
  Ausgabe 043 entfernten Buttons), `loadedAsAbsolute`, `toWorldForData` und
  `pendingDragHistory`
- das Inhaltsverzeichnis im Scriptkopf entsprach nicht mehr den tatsächlichen
  Abschnitten; es ist korrigiert und erklärt die beiden Eigenheiten der
  Nummerierung
- drei Anweisungen ohne Einrückung korrigiert
- `tools/test-origin-conflict.mjs` ergänzt: prüft den Bezugspunkt-Konflikt im
  echten Browser
- `tools/browser-harness.mjs` ergänzt: gemeinsame Playwright- und
  Browsersuche für beide Browsertests. `check-all.mjs` bleibt
  abhängigkeitsfrei, die Browsertests liegen bewusst außerhalb
- `tools/test-cassandra.mjs` um Toleranz, Adoptionsregel und Exportsperre
  erweitert
- Dokumentation an den Codestand angeglichen: CLAUDE.md ohne Zeilennummern,
  Testumgebung umgebungsneutral beschrieben, CaSSAndRA erstmals auch in
  `AGENTS.md`, `docs/DEVELOPMENT.md`, `README.md` und `README_EN.md`
- **Release-ZIPs entfallen ersatzlos.** Es wird laufend weiterentwickelt; ein
  Release besteht nur noch aus Versionsnummer, Changelogs und einem Git-Tag.
  Die Anwendung läuft als einzelne `index.html` direkt aus dem Repository und
  über GitHub Pages – ein Archiv enthielte dieselbe Datei nur ein zweites Mal.
  Frühere Stände bleiben über die Tags auscheckbar.

## Ausgabe 047
- GitHub-README an den aktuellen Funktionsumfang angepasst
- vollständige englische Projektbeschreibung in `README.md` ergänzt
- separate `README_EN.md` hinzugefügt
- englisches Änderungsprotokoll (`CHANGELOG_EN.md`) hinzugefügt
- bestehenden zweisprachigen Disclaimer (Deutsch/Englisch) beibehalten
