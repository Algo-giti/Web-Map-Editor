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
  "perpendicularDistance",
  "douglasPeuckerThresholds",
  "douglasPeuckerKeepIndices",
  "largestToleranceKeeping",
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
console.log("Punkte reduzieren (Douglas-Peucker)");

check("Abstand zur Geraden", near(app.perpendicularDistance([4, 3], [0, 0], [10, 0]), 3));
check("Abstand bei entarteter Strecke",
  near(app.perpendicularDistance([3, 4], [0, 0], [0, 0]), 5));

/* Eine exakte Gerade: alles zwischen den Enden ist entbehrlich. */
const straightLine = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
check("Gerade wird auf zwei Punkte reduziert",
  sameList(app.douglasPeuckerKeepIndices(straightLine, 0.01), [0, 4]),
  JSON.stringify(app.douglasPeuckerKeepIndices(straightLine, 0.01)));

/* Eine Spitze muss erhalten bleiben, solange sie ueber der Toleranz liegt. */
const spike = [[0, 0], [1, 0], [2, 1], [3, 0], [4, 0]];
check("Spitze bleibt bei kleiner Toleranz erhalten",
  app.douglasPeuckerKeepIndices(spike, 0.1).includes(2));
check("Spitze faellt bei grosser Toleranz weg",
  !app.douglasPeuckerKeepIndices(spike, 2).includes(2));

/* Endpunkte bleiben immer. */
for (const tolerance of [0, 0.5, 5, 1000]) {
  const kept = app.douglasPeuckerKeepIndices(spike, tolerance);
  check(`Endpunkte bleiben bei Toleranz ${tolerance}`,
    kept[0] === 0 && kept[kept.length - 1] === spike.length - 1,
    JSON.stringify(kept));
}

/* Monotonie: eine groessere Toleranz darf nie mehr Punkte behalten. */
let previousCount = Infinity;
let monotone = true;
for (const tolerance of [0.01, 0.05, 0.2, 0.5, 1, 2]) {
  const count = app.douglasPeuckerKeepIndices(spike, tolerance).length;
  if (count > previousCount) monotone = false;
  previousCount = count;
}
check("mehr Toleranz behaelt nie mehr Punkte", monotone);

/*
 * Die Schwellen sind der Kern: ein Punkt ueberlebt genau dann, wenn seine
 * Schwelle groesser als die Toleranz ist. Das muss mit dem Filterergebnis
 * uebereinstimmen, sonst weicht das Verfahren vom klassischen ab.
 */
const zigzag = [[0, 0], [1, 0.5], [2, -0.4], [3, 0.9], [4, -0.2], [5, 0]];
const thresholds = app.douglasPeuckerThresholds(zigzag);

check("Endpunkte haben unendliche Schwelle",
  thresholds[0] === Infinity && thresholds[zigzag.length - 1] === Infinity);

let consistent = true;
for (const tolerance of [0, 0.1, 0.3, 0.45, 0.6, 1.2]) {
  const filtered = thresholds
    .map((value, index) => (value > tolerance ? index : -1))
    .filter((index) => index >= 0);

  if (!sameList(app.douglasPeuckerKeepIndices(zigzag, tolerance), filtered)) {
    consistent = false;
  }
}
check("Filtern der Schwellen entspricht dem Verfahren", consistent);

/* Schwellen fallen entlang der Rekursion nie an - sonst waere das Filtern falsch. */
check("Schwellen sind nach unten fortgepflanzt",
  thresholds.every((value) => value >= 0));

/*
 * Groesste noch funktionierende Toleranz: exakt der n-groesste Schwellwert,
 * nicht durch Probieren ermittelt.
 */
const boundary = app.largestToleranceKeeping(zigzag, 4);
check("Grenztoleranz liefert einen endlichen Wert",
  boundary !== null && Number.isFinite(boundary), String(boundary));
check("knapp unter der Grenze bleiben genug Punkte",
  app.douglasPeuckerKeepIndices(zigzag, boundary - 1e-9).length >= 4,
  String(app.douglasPeuckerKeepIndices(zigzag, boundary - 1e-9).length));
check("knapp darueber sind es zu wenige",
  app.douglasPeuckerKeepIndices(zigzag, boundary + 1e-9).length < 4,
  String(app.douglasPeuckerKeepIndices(zigzag, boundary + 1e-9).length));

check("Grenztoleranz ist null, wenn jede Toleranz genuegt",
  app.largestToleranceKeeping(zigzag, 2) === null);
check("Grenztoleranz ist null bei zu wenigen Punkten",
  app.largestToleranceKeeping(zigzag, 99) === null);

/*
 * Geschlossener Ring: als offene Folge [0 … n-1, 0] behandelt. Index 0 taucht
 * zweimal auf und ist damit an beiden Enden verankert - er bleibt also immer.
 */
const ring = [[0, 0], [4, 0], [4.01, 2], [4, 4], [0, 4], [0, 0]];
const ringKept = app.douglasPeuckerKeepIndices(ring, 0.05);
check("Ringstart bleibt am Anfang erhalten", ringKept.includes(0));
check("Ringschluss bleibt am Ende erhalten", ringKept.includes(ring.length - 1));
check("nahezu kollinearer Punkt faellt weg", !ringKept.includes(2),
  JSON.stringify(ringKept));

/* Randfaelle. */
check("leere Folge", sameList(app.douglasPeuckerKeepIndices([], 1), []));
check("ein Punkt", sameList(app.douglasPeuckerKeepIndices([[0, 0]], 1), [0]));
check("zwei Punkte bleiben beide",
  sameList(app.douglasPeuckerKeepIndices([[0, 0], [1, 1]], 99), [0, 1]));

/* -------------------------------------------------------------------- */
console.log(
  failures
    ? `\ntest-geometry: FEHLGESCHLAGEN (${failures})`
    : "\ntest-geometry: alle Pruefungen bestanden."
);

process.exitCode = failures ? 1 : 0;
