#!/usr/bin/env node
// Zero-dependency Unit-Tests der reinen Geometriefunktionen aus index.html.
//
// Aktuell abgedeckt: "Linie begradigen" - Projektion auf die Verbindungsgerade,
// die Wegwahl zwischen zwei Punkten eines Rings und die Bewertung des
// Ergebnisses (deckungsgleiche Punkte, Rückläufer).
//
// Bewusst getrennt von tools/test-cassandra.mjs: dort geht es um die
// Kompatibilität mit einem fremden Format (Bezeichner, Koordinatenbezug), hier
// um reine Geometrie. Bei einem Fehlschlag ist damit sofort erkennbar, welcher
// der beiden Bereiche gebrochen ist.
//
// Die geprüften Funktionen werden über tools/extract-script.mjs direkt aus dem
// Inline-Script extrahiert. Wird eine davon umbenannt, muss der Name in NAMES
// mitgezogen werden - sonst bricht der Test mit "Deklaration nicht gefunden" ab.

import { extractDeclarations, readInlineScript } from "./extract-script.mjs";

const NAMES = [
  "STRAIGHTEN_COINCIDENT_METERS",
  "projectOntoLine",
  "interiorIndicesBetween",
  "analyzeStraighten",
];

const source = extractDeclarations(readInlineScript(), NAMES);
const app = new Function(`${source}\nreturn {${NAMES.join(",")}};`)();

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
}

function near(actual, expected, tolerance = 1e-9) {
  return Math.abs(actual - expected) <= tolerance;
}

function sameList(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

/* -------------------------------------------------------------------- */
console.log("Projektion auf die Gerade");

const from = [0, 0];
const to = [10, 0];

const onLine = app.projectOntoLine([4, 0], from, to);
check("Punkt auf der Geraden bleibt liegen",
  near(onLine.point[0], 4) && near(onLine.point[1], 0));
check("t entspricht dem Anteil an der Strecke", near(onLine.t, 0.4));

const above = app.projectOntoLine([4, 7], from, to);
check("senkrechter Fusspunkt ist korrekt",
  near(above.point[0], 4) && near(above.point[1], 0),
  JSON.stringify(above.point));

/* Schräge Gerade: die Projektion muss unabhängig von der Achslage stimmen. */
const diagonal = app.projectOntoLine([0, 2], [0, 0], [2, 2]);
check("schräge Gerade: Fusspunkt liegt mittig",
  near(diagonal.point[0], 1) && near(diagonal.point[1], 1),
  JSON.stringify(diagonal.point));

/*
 * Ohne Klemmen auf die Strecke: Punkte neben dem Abschnitt landen ausserhalb
 * und sind an t < 0 bzw. t > 1 erkennbar. Genau daran hängt die
 * Rücklaeufer-Erkennung.
 */
const before = app.projectOntoLine([-5, 3], from, to);
check("Punkt vor dem Abschnitt liefert t < 0", before.t < 0, String(before.t));
check("Punkt vor dem Abschnitt wird nicht geklemmt", near(before.point[0], -5));

const behind = app.projectOntoLine([15, -3], from, to);
check("Punkt hinter dem Abschnitt liefert t > 1", behind.t > 1, String(behind.t));

check("entartete Gerade liefert null",
  app.projectOntoLine([1, 1], [5, 5], [5, 5]) === null);

/* -------------------------------------------------------------------- */
console.log("Wegwahl zwischen zwei Punkten");

/* Offene Linie: genau ein Weg. */
check("offene Linie: Punkte dazwischen",
  sameList(app.interiorIndicesBetween(0, 4, 6, false), [1, 2, 3]));
check("offene Linie: Reihenfolge der Auswahl ist egal",
  sameList(app.interiorIndicesBetween(4, 0, 6, false), [1, 2, 3]));
check("offene Linie: benachbart ergibt leer",
  sameList(app.interiorIndicesBetween(2, 3, 6, false), []));

/* Ring mit 8 Punkten: der kürzere Weg gewinnt. */
check("Ring: kurzer Weg vorwaerts",
  sameList(app.interiorIndicesBetween(1, 4, 8, true), [2, 3]));
check("Ring: kurzer Weg ueber den Ringschluss",
  sameList(app.interiorIndicesBetween(1, 6, 8, true), [7, 0]),
  JSON.stringify(app.interiorIndicesBetween(1, 6, 8, true)));

/*
 * Gleichstand: bei 8 Punkten und den Indizes 1 und 5 liegen auf beiden Wegen
 * drei Punkte (2,3,4 gegen 6,7,0). Der Weg mit dem Ringstart verliert.
 */
const tie = app.interiorIndicesBetween(1, 5, 8, true);
check("Gleichstand: beide Wege sind gleich lang",
  tie.length === 3, JSON.stringify(tie));
check("Gleichstand: Weg ohne Ringstart gewinnt",
  !tie.includes(0) && sameList(tie, [2, 3, 4]), JSON.stringify(tie));

/*
 * Ueber den Ringschluss benachbart: 0 und count-1 liegen im Ring nebeneinander.
 * Der Rueckwaertsweg ist leer und gewinnt damit - es gibt nichts zu begradigen.
 */
check("Ring: 0 und count-1 gelten als benachbart",
  sameList(app.interiorIndicesBetween(0, 7, 8, true), []),
  JSON.stringify(app.interiorIndicesBetween(0, 7, 8, true)));

check("gleicher Index ergibt leer",
  sameList(app.interiorIndicesBetween(3, 3, 8, true), []));
check("Index ausserhalb ergibt leer",
  sameList(app.interiorIndicesBetween(0, 9, 8, true), []));

/* -------------------------------------------------------------------- */
console.log("Bewertung des Ergebnisses");

const straight = app.analyzeStraighten(from, to, [[3, 2], [6, -1]]);
check("gerade Eingabe: keine Warnung",
  straight.coincident === 0 && straight.reversed === 0);
check("gerade Eingabe: Punkte liegen danach auf der Geraden",
  straight.projected.every(point => near(point[1], 0)));
check("gerade Eingabe: East-Werte bleiben erhalten",
  near(straight.projected[0][0], 3) && near(straight.projected[1][0], 6));

/*
 * Stark gekruemmter Abschnitt: der mittlere Punkt liegt seitlich weit hinter
 * dem Startanker und kehrt die Reihenfolge um.
 */
const curved = app.analyzeStraighten(from, to, [[8, 1], [2, 1]]);
check("Rueckläufer wird erkannt", curved.reversed > 0, String(curved.reversed));

/* Zwei Punkte, die auf dieselbe Stelle projizieren. */
const duplicated = app.analyzeStraighten(from, to, [[5, 3], [5, -3]]);
check("deckungsgleiche Punkte werden erkannt",
  duplicated.coincident === 1, String(duplicated.coincident));
check("deckungsgleiche Punkte gelten nicht zusaetzlich als Rueckläufer",
  duplicated.reversed === 0, String(duplicated.reversed));

/* Ein Punkt, der genau auf einem Anker landet. */
const onAnchor = app.analyzeStraighten(from, to, [[0, 4]]);
check("Punkt auf dem Anker gilt als deckungsgleich",
  onAnchor.coincident === 1, String(onAnchor.coincident));

check("entartete Gerade wird gemeldet",
  app.analyzeStraighten([1, 1], [1, 1], [[2, 2]]).degenerate === true);

check("Toleranz liegt unter der Anzeigeauflaesung",
  app.STRAIGHTEN_COINCIDENT_METERS < 0.01,
  String(app.STRAIGHTEN_COINCIDENT_METERS));

/* -------------------------------------------------------------------- */
console.log(
  failures
    ? `\ntest-geometry: FEHLGESCHLAGEN (${failures})`
    : "\ntest-geometry: alle Pruefungen bestanden."
);

process.exitCode = failures ? 1 : 0;
