#!/usr/bin/env node
// Läufer für die Browsertests. Machart wie check-all.mjs: nur Node-Bordmittel,
// keine Abhängigkeit, nichts installiert.
//
// BEWUSST NICHT in check-all.mjs eingehängt. Die statische Stufe muss in jeder
// Umgebung ohne Vorbereitung durchlaufen; die Browsertests brauchen
// playwright-core und einen Browser und bleiben deshalb die optionale Stufe.
//
// Er existiert wegen eines konkreten Fehlers: neun Berichte hintereinander
// meldeten "alle 17 Browsertests grün", während test-map-switch seit Etappe 6 b2
// abbrach. Gestartet wurde von Hand als Shell-Schleife, und die verwirft den
// Exit-Status in der Pipe (`node tools/x.mjs | tail -1`). Dazu kam, dass ein
// Lauf OHNE Browser sich von einem bestandenen nicht unterscheiden ließ - beide
// endeten mit 0. Beides behebt dieser Läufer, das zweite zusammen mit dem neuen
// Exit-Code 2 in den Testskripten.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/run-browser-tests.mjs

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(toolsDir, "..");

/* Exit-Code 2 heißt "Infrastruktur fehlt" - siehe browser-harness.mjs. */
const EXIT_SKIPPED = 2;

/**
 * Welche Skripte sind Browsertests?
 *
 * Ermittelt, nicht aufgezählt: ein Browsertest ist ein Skript in tools/, das
 * browser-harness.mjs einbindet. Eine Liste von Hand wäre eine zweite Quelle -
 * sie würde beim nächsten neuen Test vergessen, und genau dieses stille
 * Herausfallen soll der Läufer verhindern.
 */
function findBrowserTests() {
  return readdirSync(toolsDir)
    .filter((name) => name.endsWith(".mjs") && name !== "browser-harness.mjs")
    .filter((name) =>
      /from\s+"\.\/browser-harness\.mjs"/.test(readFileSync(join(toolsDir, name), "utf8")))
    .sort();
}

/**
 * Welche Skripte nennt CLAUDE.md §4.2?
 *
 * Die Tabelle dort ist die Dokumentation, dieses Verzeichnis die Wirklichkeit.
 * Läuft beides auseinander, ist eine von beiden falsch - der Läufer sagt
 * welche, statt einer Zahl im Fließtext zu glauben.
 */
function documentedTests() {
  const text = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
  const section = text.slice(text.indexOf("### 4.2"), text.indexOf("#### Einrichtung"));
  const namen = new Set();

  for (const treffer of section.matchAll(/`([a-z0-9-]+\.mjs)`/g)) {
    if (treffer[1] !== "browser-harness.mjs") namen.add(treffer[1]);
  }

  return [...namen].sort();
}

const tests = findBrowserTests();
const dokumentiert = documentedTests();

const fehltInDoku = tests.filter((name) => !dokumentiert.includes(name));
const fehltImVerzeichnis = dokumentiert.filter((name) => !tests.includes(name));
let abweichung = false;

if (fehltInDoku.length || fehltImVerzeichnis.length) {
  abweichung = true;
  console.error("run-browser-tests: Liste weicht von CLAUDE.md §4.2 ab.");
  if (fehltInDoku.length) {
    console.error(`  in tools/, aber nicht dokumentiert: ${fehltInDoku.join(", ")}`);
  }
  if (fehltImVerzeichnis.length) {
    console.error(`  dokumentiert, aber nicht in tools/: ${fehltImVerzeichnis.join(", ")}`);
  }
}

console.log(`run-browser-tests: ${tests.length} Skripte gefunden.\n`);

const bestanden = [];
const gerissen = [];
const uebersprungen = [];

for (const name of tests) {
  console.log(`\n=== ${name} ===`);

  const lauf = spawnSync(process.execPath, [join(toolsDir, name)], { stdio: "inherit" });

  if (lauf.status === 0) bestanden.push(name);
  else if (lauf.status === EXIT_SKIPPED) uebersprungen.push(name);
  else gerissen.push(name);
}

/*
 * Eine Zeile je Zustand, immer alle drei - eine Zeile, die nur bei Inhalt
 * erscheint, liest sich bei null Fehlschlägen wie eine bestandene Prüfung.
 */
console.log("\n--------------------------------------------------");
console.log(`bestanden:     ${bestanden.length}${bestanden.length ? ` (${bestanden.join(", ")})` : ""}`);
console.log(`gerissen:      ${gerissen.length}${gerissen.length ? ` (${gerissen.join(", ")})` : ""}`);
console.log(`übersprungen:  ${uebersprungen.length}${uebersprungen.length ? ` (${uebersprungen.join(", ")})` : ""}`);

/*
 * Grün NUR, wenn wirklich gelaufen wurde. Ein übersprungener Test ist kein
 * Testfehler, aber auch kein bestandener - genau diese Unterscheidung fehlte
 * bisher, weil beide Fälle mit 0 endeten.
 */
const gruen =
  !abweichung && !gerissen.length && !uebersprungen.length && bestanden.length > 0;

if (gruen) {
  console.log(`\nrun-browser-tests: alle ${bestanden.length} Browsertests grün.`);
} else if (gerissen.length) {
  console.log(`\nrun-browser-tests: FEHLGESCHLAGEN - ${gerissen.length} von ${tests.length} gerissen.`);
} else if (uebersprungen.length) {
  console.log(
    `\nrun-browser-tests: NICHT GELAUFEN - ${uebersprungen.length} Skripte übersprungen, ` +
    "es fehlt playwright-core oder ein Browser. Das ist kein bestandener Lauf."
  );
} else if (abweichung) {
  console.log("\nrun-browser-tests: Liste und CLAUDE.md §4.2 stimmen nicht überein.");
} else {
  console.log("\nrun-browser-tests: kein Skript gefunden.");
}

process.exitCode = gruen ? 0 : 1;
