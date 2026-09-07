# Changelog — Deutsch

> Dieses Änderungsprotokoll wurde nachträglich als deutsches Pendant zu
> `CHANGELOG_EN.md` angelegt und beginnt beim aktuellen Stand (Ausgabe 047).
> Frühere Ausgaben (001–046) sind ausschließlich im englischen
> Änderungsprotokoll (`CHANGELOG_EN.md`) dokumentiert.

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
