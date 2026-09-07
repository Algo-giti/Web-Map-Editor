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
  "CIRCLE_DEFAULT_VERTICES",
  "CIRCLE_MIN_VERTICES",
  "circleChordDeviation",
  "circlePolygonPoints",
  "rectanglePolygonPoints",
  "GEOMETRY_EPSILON_AREA",
  "GEOMETRY_CHECK_PAIR_BUDGET",
  "turnDirection",
  "segmentsProperlyIntersect",
  "pointInRing",
  "closestPointOnSegment",
  "pointSegmentDistance",
  "segmentDistance",
  "sequenceBounds",
  "boundsOverlap",
  "edgeCount",
  "edgeAt",
  "spendPair",
  "ringSelfIntersections",
  "ringRelation",
  "narrowGaps",
  "pointIsMowable",
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
console.log("Kreis- und Rechteck-Exclusions");

const circle = app.circlePolygonPoints([10, 5], 2, 24);

check("Eckpunktanzahl stimmt", circle.length === 24, String(circle.length));
check("alle Punkte liegen auf dem Kreis",
  circle.every(([e, n]) => near(Math.hypot(e - 10, n - 5), 2, 1e-9)));
check("erster Punkt zeigt nach East",
  near(circle[0][0], 12) && near(circle[0][1], 5), JSON.stringify(circle[0]));
check("Drehsinn gegen den Uhrzeigersinn", circle[1][1] > circle[0][1]);
check("Ring wird NICHT geschlossen",
  !(near(circle[0][0], circle[23][0]) && near(circle[0][1], circle[23][1])));

/* Bei 24 Ecken liegt ein Punkt exakt auf jeder Achsenrichtung. */
check("Punkt exakt nach North", circle.some(([e, n]) => near(e, 10) && near(n, 7)));

check("zu wenige Ecken ergeben nichts",
  app.circlePolygonPoints([0, 0], 1, 2).length === 0);
check("Radius 0 ergibt nichts",
  app.circlePolygonPoints([0, 0], 0, 12).length === 0);

/*
 * Die Abweichung vom idealen Kreis ist die Grundlage der Vorgabe von 24 Ecken:
 * bei 1 m Radius rund 8 mm, bei 2 m rund 17 mm - beides unter dem RTK-Rauschen.
 */
check("Abweichung bei 1 m und 24 Ecken unter 1 cm",
  app.circleChordDeviation(1, app.CIRCLE_DEFAULT_VERTICES) < 0.01,
  String(app.circleChordDeviation(1, 24)));
check("Abweichung bei 2 m und 24 Ecken unter 2 cm",
  app.circleChordDeviation(2, 24) < 0.02, String(app.circleChordDeviation(2, 24)));
check("mehr Ecken verringern die Abweichung",
  app.circleChordDeviation(2, 48) < app.circleChordDeviation(2, 24));
check("Abweichung waechst mit dem Radius",
  app.circleChordDeviation(4, 24) > app.circleChordDeviation(2, 24));

/* Rechteck, ungedreht, um den Mittelpunkt. */
const rect = app.rectanglePolygonPoints([0, 0], 4, 2, 0, "center");
check("vier Ecken", rect.length === 4);
check("Mittelpunkt-Bezug ist zentriert",
  near(rect[0][0], -2) && near(rect[0][1], -1), JSON.stringify(rect[0]));
check("Breite stimmt", near(rect[1][0] - rect[0][0], 4));
check("Hoehe stimmt", near(rect[2][1] - rect[1][1], 2));

/* Ecken-Bezug: der Klickpunkt liegt auf der Ecke. */
const corner = app.rectanglePolygonPoints([10, 20], 4, 2, 0, "corner");
check("Ecken-Bezug beginnt am Klickpunkt",
  near(corner[0][0], 10) && near(corner[0][1], 20), JSON.stringify(corner[0]));
check("Ecken-Bezug spannt nach East und North auf",
  near(corner[2][0], 14) && near(corner[2][1], 22), JSON.stringify(corner[2]));

/* Drehung: 90 Grad vertauscht East und North. */
const turned = app.rectanglePolygonPoints([0, 0], 4, 2, 90, "center");
check("90 Grad dreht gegen den Uhrzeigersinn",
  near(turned[0][0], 1) && near(turned[0][1], -2), JSON.stringify(turned[0]));

/* Die Drehung erhaelt die Seitenlaengen. */
const oblique = app.rectanglePolygonPoints([0, 0], 4, 2, 37, "center");
check("Drehung erhaelt die Breite",
  near(Math.hypot(oblique[1][0] - oblique[0][0], oblique[1][1] - oblique[0][1]), 4));
check("Drehung erhaelt die Hoehe",
  near(Math.hypot(oblique[2][0] - oblique[1][0], oblique[2][1] - oblique[1][1]), 2));

check("Breite 0 ergibt nichts",
  app.rectanglePolygonPoints([0, 0], 0, 2, 0).length === 0);

/* -------------------------------------------------------------------- */
console.log("Streckenschnitt und Punktlage");

/* Echtes Kreuz. */
check("kreuzende Strecken werden erkannt",
  app.segmentsProperlyIntersect([0, 0], [10, 0], [5, -5], [5, 5]));

/* Beruehrung in einem Punkt ist bewusst KEINE Kreuzung. */
check("Beruehrung zaehlt nicht",
  !app.segmentsProperlyIntersect([0, 0], [10, 0], [5, 0], [5, 5]));

/* Gemeinsamer Endpunkt - der Normalfall benachbarter Kanten. */
check("gemeinsamer Endpunkt zaehlt nicht",
  !app.segmentsProperlyIntersect([0, 0], [10, 0], [10, 0], [10, 10]));

/* Kollineare Ueberlappung ebenfalls nicht. */
check("kollineare Ueberlappung zaehlt nicht",
  !app.segmentsProperlyIntersect([0, 0], [10, 0], [5, 0], [15, 0]));

check("getrennte Strecken schneiden sich nicht",
  !app.segmentsProperlyIntersect([0, 0], [1, 0], [5, 5], [6, 6]));

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

check("Punkt innen liegt innen", app.pointInRing([5, 5], square));
check("Punkt aussen liegt aussen", !app.pointInRing([15, 5], square));
check("Punkt jenseits der Ecke liegt aussen", !app.pointInRing([-1, -1], square));

/* Konkave Form: die Bucht gehoert NICHT zur Flaeche. */
const uShape = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];

check("Punkt in der Bucht liegt aussen", !app.pointInRing([5, 7], uShape));
check("Punkt im Schenkel liegt innen", app.pointInRing([1, 7], uShape));

/* -------------------------------------------------------------------- */
console.log("Abstand Punkt/Strecke und Strecke/Strecke");

check("Fusspunkt innerhalb der Strecke",
  near(app.pointSegmentDistance([5, 3], [0, 0], [10, 0]), 3));

/*
 * Der Unterschied zur Geraden: hinter dem Endpunkt zaehlt der Abstand zum
 * Endpunkt, nicht der senkrechte Abstand zur verlaengerten Geraden.
 */
check("hinter dem Endpunkt zaehlt der Endpunkt",
  near(app.pointSegmentDistance([14, 3], [0, 0], [10, 0]), 5));
check("die Gerade wuerde hier 3 liefern",
  near(app.perpendicularDistance([14, 3], [0, 0], [10, 0]), 3));

const parallel = app.segmentDistance([0, 0], [10, 0], [0, 2], [10, 2]);
check("parallele Strecken haben den Achsabstand", near(parallel.distance, 2));
check("die Mitte liegt dazwischen", near(parallel.midpoint[1], 1));

const apart = app.segmentDistance([0, 0], [1, 0], [4, 0], [5, 0]);
check("hintereinander liegende Strecken", near(apart.distance, 3));

/* Ueber Eck: das Minimum liegt an einem Endpunkt, nicht im Inneren. */
const cornerGap = app.segmentDistance([0, 0], [10, 0], [12, 1], [12, 9]);
check("ueber Eck zaehlt der naechste Endpunkt",
  near(cornerGap.distance, Math.hypot(2, 1)), String(cornerGap.distance));

/* -------------------------------------------------------------------- */
console.log("Selbstueberschneidung");

check("das Quadrat ueberschneidet sich nicht",
  app.ringSelfIntersections(square, true).found.length === 0);

/* Schleife: die klassische Sanduhr. */
const bowtie = [[0, 0], [10, 10], [10, 0], [0, 10]];
const knots = app.ringSelfIntersections(bowtie, true);

check("die Sanduhr wird erkannt", knots.found.length === 1,
  JSON.stringify(knots.found));
check("die Pruefung lief zu Ende", knots.complete);

/* Offene Linie mit Schleife. */
const looped = [[0, 0], [10, 0], [10, 5], [5, 5], [5, -5]];
check("Schleife im offenen Linienzug",
  app.ringSelfIntersections(looped, false).found.length === 1);

/* Benachbarte Kanten duerfen nie melden - auch nicht erste gegen letzte. */
const nearlyClosed = [[0, 0], [10, 0], [10, 10], [0.001, 0.001]];
check("benachbarte Kanten melden nicht",
  app.ringSelfIntersections(nearlyClosed, true).found.length === 0);

/* Aufgebrauchtes Budget wird gemeldet, nicht verschwiegen. */
const exhausted = app.ringSelfIntersections(bowtie, true, {left: 0});
check("leeres Budget meldet unvollstaendig", exhausted.complete === false);

/* -------------------------------------------------------------------- */
console.log("Lage zweier Ringe");

const outer = [[0, 0], [100, 0], [100, 100], [0, 100]];
const inner = [[10, 10], [20, 10], [20, 20], [10, 20]];
const away = [[200, 200], [210, 200], [210, 210], [200, 210]];
const straddling = [[90, 10], [110, 10], [110, 20], [90, 20]];

check("innen wird als innen erkannt",
  app.ringRelation(inner, outer).relation === "inside");
check("aussen wird als aussen erkannt",
  app.ringRelation(away, outer).relation === "disjoint");
check("umgekehrte Richtung ergibt contains",
  app.ringRelation(outer, inner).relation === "contains");
check("ueberlappend ergibt crossing",
  app.ringRelation(straddling, outer).relation === "crossing");

const budgetOut = app.ringRelation(straddling, outer, {left: 0});
check("leeres Budget liefert unknown", budgetOut.relation === "unknown");
check("und meldet sich als unvollstaendig", budgetOut.complete === false);

/* -------------------------------------------------------------------- */
console.log("Enge Stellen");

/*
 * Zwei Quadrate mit 20 cm Abstand. Bei einer Maeherbreite von 35 cm ist das
 * eine enge Stelle, bei 15 cm nicht.
 */
const left = [[0, 0], [10, 0], [10, 10], [0, 10]];
const right = [[10.2, 0], [20, 0], [20, 10], [10.2, 10]];

const tight = app.narrowGaps(
  {points: left, closed: true},
  {points: right, closed: true},
  0.35
);

check("die enge Stelle wird gefunden", tight.found.length > 0,
  String(tight.found.length));
check("der Abstand stimmt",
  tight.found.every((gap) => near(gap.distance, 0.2)),
  JSON.stringify(tight.found.map((gap) => gap.distance)));
check("die Mitte liegt im Spalt",
  tight.found.every((gap) => gap.midpoint[0] > 10 && gap.midpoint[0] < 10.2));

const loose = app.narrowGaps(
  {points: left, closed: true},
  {points: right, closed: true},
  0.15
);

check("unter der Schwelle wird nichts gemeldet", loose.found.length === 0);

/* Ecken derselben Form duerfen sich nicht selbst melden. */
const selfGaps = app.narrowGaps(
  {points: left, closed: true},
  {points: left, closed: true},
  0.35,
  {sameSequence: true}
);

check("das Quadrat meldet sich nicht selbst", selfGaps.found.length === 0,
  JSON.stringify(selfGaps.found));

/* Eine echte schmale Bucht in derselben Form dagegen schon. */
const narrowBay = [
  [0, 0], [20, 0], [20, 20], [0, 20],
  [0, 12], [15, 12], [15, 11.8], [0, 11.8]
];

const bay = app.narrowGaps(
  {points: narrowBay, closed: true},
  {points: narrowBay, closed: true},
  0.35,
  {sameSequence: true}
);

check("die schmale Bucht wird gefunden", bay.found.length > 0,
  String(bay.found.length));

/* -------------------------------------------------------------------- */
console.log("Maehbarer Bereich");

check("Punkt im Perimeter ist maehbar",
  app.pointIsMowable([50, 50], [outer], [inner]));
check("Punkt in der Exclusion ist nicht maehbar",
  !app.pointIsMowable([15, 15], [outer], [inner]));
check("Punkt ausserhalb des Perimeters ist nicht maehbar",
  !app.pointIsMowable([205, 205], [outer], [inner]));
check("ohne Perimeter ist nichts maehbar",
  !app.pointIsMowable([50, 50], [], []));

/* -------------------------------------------------------------------- */
console.log(
  failures
    ? `\ntest-geometry: FEHLGESCHLAGEN (${failures})`
    : "\ntest-geometry: alle Pruefungen bestanden."
);

process.exitCode = failures ? 1 : 0;
