#!/usr/bin/env node
// Zero-dependency check: verifies that every string-literal
// document.getElementById("...") call in index.html refers to an id that
// actually exists in the HTML markup. This is the "DOM ID audit" and part
// of the "stale-reference audit" described in AGENTS.md / DEVELOPMENT.md -
// most runtime crashes in this project's history came from exactly this
// class of bug (an element removed from the HTML while JS still reached
// for its id).

import { readFileSync } from "node:fs";

const indexPath = new URL("../index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");

// Alle ids, die als LITERAL in der Datei stehen - in drei Schreibweisen:
//
//   1. id="..." im Markup, und ebenso in Vorlagen innerhalb des Skripts.
//      Diese Sammlung ist eine Textsuche, kein DOM-Aufbau; dynamisch
//      erzeugtes Markup bleibt dadurch prüfbar.
//   2. element.id = "..." für programmatisch erzeugte SVG-Gruppen, die kein
//      Markup haben (geometryGroup, vertexGroup, selectionGhostGroup, ...).
//   3. setAttribute("id", "...") aus demselben Grund.
const existingIds = new Set([
  ...[...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]),
  ...[...html.matchAll(/\.id\s*=\s*(["'`])([^"'`]+)\1/g)].map((m) => m[2]),
  ...[...html.matchAll(/setAttribute\(\s*(["'`])id\1\s*,\s*(["'`])([^"'`]+)\2/g)].map(
    (m) => m[3]
  ),
]);

const getByIdCalls = [...html.matchAll(/getElementById\(\s*(["'`])([^"'`]*)\1\s*\)/g)];
const dynamicCalls = [...html.matchAll(/getElementById\(\s*[^"'`)]/g)].length;

// Zusammengesetzte oder aus Variablen gesetzte ids.
//
// Die Sammlung oben findet jede id, die irgendwo als Literal im Dateitext
// steht. Wird eine id dagegen aus einer Variablen oder per Zeichenkettenkette
// gesetzt, steht sie nirgends - der Abgleich unten hielte eine später
// verwaiste Referenz dann für gültig, weil er sie gar nicht kennt. Diese
// Schreibweise ist deshalb verboten; siehe CLAUDE.md, Abschnitt 6.
// Geprüft wird das erste Zeichen nach dem Gleichheitszeichen bzw. Komma.
// Ein negativer Lookahead hinter \s* trüge nicht: der Stern kann auf null
// Zeichen zurückfallen, und dann steht dort ein Leerzeichen statt des
// Anführungszeichens - die Regel liefe für JEDE Zuweisung an.
const composedIds = [
  ...html.matchAll(/\.id\s*=(?!=)\s*(\S)/g),
  ...html.matchAll(/setAttribute\(\s*(["'`])id\1\s*,\s*(\S)/g),
]
  .filter((match) => !["\"", "'", "`"].includes(match[match.length - 1]))
  .map((match) => html.slice(0, match.index).split("\n").length);

// Doppelte ids im MARKUP.
//
// Der Oberflächenumbau verschiebt Bedienelemente aus der Seitenleiste in den
// Inspektor. Wird dabei kopiert statt verschoben, existiert dieselbe id
// zweimal: getElementById() liefert dann das erste Vorkommen, das zweite ist
// tot, und beide sehen im Browser gleich aus. Genau das ist beim Bau des
// Inspektors passiert - fünf ids doppelt, und diese Prüfung sah es nicht,
// weil sie nur fragte, ob eine referenzierte id EXISTIERT.
//
// Nur das Markup wird betrachtet: Vorlagen im Skript dürfen dieselbe id
// enthalten wie das Markup, das sie ersetzen.
const markup = html.slice(
  html.indexOf("<body"),
  html.indexOf("<script", html.indexOf("<body"))
);

const markupIds = [...markup.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
const seenInMarkup = new Set();
const duplicateIds = [];

for (const id of markupIds) {
  if (seenInMarkup.has(id)) {
    if (!duplicateIds.includes(id)) duplicateIds.push(id);
  }
  seenInMarkup.add(id);
}

// Doppelte Funktionsnamen.
//
// Dieselbe Falle wie bei den ids, nur im Skript: eine zweite Deklaration
// desselben Namens ueberschreibt die erste lautlos, und die Syntaxpruefung
// findet daran nichts. Beim Bau des Inspektors bekam
// isWholeFeatureSelected() eine zweite Fassung mit anderer Signatur - die
// spaetere gewann, der Zustand "ganzes Feature" wurde nie erreicht, und kein
// Werkzeug meldete etwas.
//
// Betrachtet werden nur Deklarationen am Zeilenanfang: die sind im inline
// Script alle global. Eingerueckte Funktionen stehen in einem eigenen
// Gueltigkeitsbereich und duerfen sich wiederholen.
const functionNames = [...html.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)]
  .map((m) => m[1]);

const seenFunctions = new Set();
const duplicateFunctions = [];

for (const name of functionNames) {
  if (seenFunctions.has(name) && !duplicateFunctions.includes(name)) {
    duplicateFunctions.push(name);
  }
  seenFunctions.add(name);
}

const missing = [];
const seen = new Set();
for (const match of getByIdCalls) {
  const id = match[2];
  if (seen.has(id)) continue;
  seen.add(id);
  if (!existingIds.has(id)) missing.push(id);
}

console.log(
  `check-dom-ids: ${existingIds.size} ids in markup, ${seen.size} distinct literal getElementById() references` +
    (dynamicCalls ? `, ${dynamicCalls} dynamic (non-literal) call(s) skipped - review those by hand` : "")
);

if (duplicateIds.length > 0) {
  console.error(
    "check-dom-ids: FAILED - these ids appear more than once in the markup:"
  );
  for (const id of duplicateIds) console.error(`  - ${id}`);
  console.error(
    "  getElementById() returns the first one; the second is dead markup."
  );
  process.exitCode = 1;
}

if (duplicateFunctions.length > 0) {
  console.error(
    "check-dom-ids: FAILED - these top-level functions are declared more than once:"
  );
  for (const name of duplicateFunctions) console.error(`  - ${name}()`);
  console.error(
    "  The later declaration silently wins; the earlier one is dead code."
  );
  process.exitCode = 1;
}

if (composedIds.length > 0) {
  console.error(
    "check-dom-ids: FAILED - every id must be a string literal so this audit can see it."
  );
  console.error(
    "  Composed or variable ids are not allowed. Offending lines in index.html:"
  );
  for (const line of composedIds) console.error(`  - line ${line}`);
  process.exitCode = 1;
}

if (missing.length > 0) {
  console.error("check-dom-ids: FAILED - referenced ids missing from index.html:");
  for (const id of missing) console.error(`  - ${id}`);
  process.exitCode = 1;
} else if (
  composedIds.length === 0 &&
  duplicateIds.length === 0 &&
  duplicateFunctions.length === 0
) {
  console.log(
    "check-dom-ids: OK - every literal getElementById() reference resolves to an existing id, " +
      "every id is a string literal and appears once in the markup, " +
      `and all ${seenFunctions.size} top-level function names are unique.`
  );
}
