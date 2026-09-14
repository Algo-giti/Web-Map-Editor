#!/usr/bin/env node
// Prueft die markierten Bestandszahlen in CLAUDE.md gegen eine Messung am
// heutigen Bestand.
//
// Eine Bestandszahl beschreibt einen gemessenen Zustand des Codes ("die
// Pruefung hat 49 Fundstellen"). Sie veraltet nicht durch Irrtum, sondern
// durch Arbeit - wer eine Schreibstelle ergaenzt oder einen Text uebersetzt,
// aendert sie, ohne sie zu lesen. Bisher meldete das keine Pruefung.
//
// MARKIERUNG: <!-- bestand: name --> unmittelbar vor der Zahl. Gelesen wird
// die erste Zahl nach der Marke, und zwischen beiden darf keine weitere
// Ziffer stehen. Der Wert bleibt damit an genau EINER Stelle - in dem Satz,
// den ein Mensch liest; der Pruefer fuehrt ihn nicht als Literal.
//
// Dieselbe Marke darf mehrfach vorkommen. Das ist kein Versehen, sondern der
// Fall, den CLAUDE.md selbst beschreibt: die 49 steht an zwei Stellen, und
// beide werden geprueft.
//
// Die Messmethoden sind in CLAUDE.md, Abschnitt 4.5, beschrieben.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { readInlineScript, extractDeclarations } from "./extract-script.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const toolsDir = new URL(".", import.meta.url).pathname;

/* ===================================================================== */
/* Messung 1: die Schreibstellen der Kartenpruefung                      */
/* ===================================================================== */

/**
 * Zaehlt die Schreibstellen auf die drei Befundlisten. Gezaehlt wird in
 * ZWEI Funktionen: validateMapData() und collectGeometryFindings(). Die
 * zweite ist leicht zu uebersehen, weil der Satz in CLAUDE.md nur von "der
 * Pruefung" spricht - ohne sie kommen 37 statt 49 heraus.
 */
function messePruefstellen() {
  const quelle = readInlineScript();
  let summe = 0;

  for (const name of ["validateMapData", "collectGeometryFindings"]) {
    const rumpf = extractDeclarations(quelle, [name]);
    summe += (rumpf.match(/\b(?:errors|warnings|info)\.push\(/g) || []).length;
  }

  return summe;
}

/* ===================================================================== */
/* Messung 2: Statustexte ohne englische Fassung                         */
/* ===================================================================== */

/**
 * Die fuenf Funktionen, deren literale erste Argumente die Grundgesamtheit
 * bilden. Sie stehen so auch in CLAUDE.md; hier sind sie die Definition der
 * Messung, nicht eine zweite Fassung der Zahl.
 */
const STATUSFUNKTIONEN = [
  "setEditStatus",
  "setMultiSelectionStatus",
  "setReduceStatus",
  "setRectifyStatus",
  "updateGridStatus",
];

/**
 * Gemessen wird gegen die LAUFENDE Uebersetzungsmechanik, nicht gegen den
 * Dateitext: ein Muster faengt Texte ab, die als Schluessel nirgends
 * dastehen. Die noetigen Deklarationen werden wie in test-cassandra.mjs aus
 * dem Inline-Script geschnitten und in einem Sandkasten ausgefuehrt.
 */
function messeStatustexteOhneEnglisch() {
  const quelle = readInlineScript();
  const code = extractDeclarations(quelle, [
    "I18N_EN",
    "I18N_PATTERNS",
    "I18N_LABEL_PREFIXES",
    "normalizeI18nText",
    "translateHistoryLabel",
    "translateGermanText",
  ]);

  const sandkasten = {};
  runInNewContext(`${code}\nthis.uebersetze = translateGermanText;`, sandkasten);

  /* Gezaehlt werden TEXTE, nicht Fundstellen: die dokumentierte Zahl sagt
     "31 Statustexte", und zehn Texte stehen an mehr als einer Stelle. Mit
     Fundstellen kommen heute 38 statt 28 heraus - und am Ursprungsstand
     d9354ee nicht die dokumentierten 31. */
  const texte = new Set();

  for (const funktion of STATUSFUNKTIONEN) {
    const muster = new RegExp(
      `\\b${funktion}\\(\\s*("(?:[^"\\\\]|\\\\.)*")`,
      "g"
    );

    for (const treffer of quelle.matchAll(muster)) {
      texte.add(JSON.parse(treffer[1]));
    }
  }

  /* Unveraendert zurueck heisst: weder Woerterbucheintrag noch Muster. */
  let ohneFassung = 0;
  for (const text of texte) {
    if (sandkasten.uebersetze(text) === text) ohneFassung += 1;
  }

  return ohneFassung;
}

/* ===================================================================== */
/* Messung 3: Zusicherungen am Auswahlzustand des Inspektors             */
/* ===================================================================== */

/**
 * Die Bezeichner der Auswahlbloecke - die Definition der Suche, nicht eine
 * Bestandszahl.
 *
 * Sie steht hier als Liste und wird NICHT aus dem Markup abgeleitet, und das
 * ist gemessen und nicht bequem: die fuenf Punktknoepfe und
 * duplicateFeatureBtn liegen seit dem elften Durchgang in #selectionActions
 * statt in #inspectorPoint bzw. #inspectorFeature. Eine abgeleitete Liste
 * lieferte damit heute eine andere Menge als am Ursprungsstand, und die Zahl
 * waere ueber die Zeit nicht mehr vergleichbar - eine Umstrukturierung des
 * Markups darf sie nicht aendern, solange sich keine Zusicherung geaendert
 * hat.
 *
 * NICHT enthalten sind widthStat, heightStat und areaStat: sie liegen im
 * Markup zwar in #inspectorEmpty, gehoeren aber zum Abmessungsblock und
 * nicht zum Auswahlzustand. Mit ihnen ergeben sich 54/23 statt 52/22 und ein
 * achter Eintrag test-scale.mjs.
 *
 * FALLSTRICK wie bei der NAMES-Liste in test-cassandra.mjs: wird einer der
 * Bezeichner umbenannt, muss er hier mitgezogen werden - sonst faellt er
 * still aus der Zaehlung.
 */
const AUSWAHLBEZEICHNER = [
  "inspectorEmpty",
  "inspectorPoint",
  "pointEastInput",
  "pointNorthInput",
  "insertPointBeforeBtn",
  "insertPointAfterBtn",
  "setStartPointBtn",
  "setEndPointBtn",
  "deletePointBtn",
  "selectionDeltaInfo",
  "mowerOrientationInfo",
  "pointMeta",
  "inspectorMulti",
  "multiSummary",
  "inspectorMixed",
  "mixedSummary",
  "inspectorFeature",
  "featureTypeStat",
  "featurePointStat",
  "featureAreaRow",
  "featureAreaStat",
  "featureIdxRow",
  "featureIdxStat",
  "duplicateFeatureBtn",
  "inspectorSelection",
  "deleteMultiSelectionBtn",
  "clearMultiSelectionBtn",
  "inspectorTitle",
  "inspectorSubtitle",
];

/** Ersetzt Kommentare durch Leerraum; Strings bleiben erhalten. */
function ohneKommentare(quelle) {
  let aus = "";

  for (let i = 0; i < quelle.length; i++) {
    const zeichen = quelle[i];
    const naechstes = quelle[i + 1];

    if (zeichen === "/" && naechstes === "/") {
      const ende = quelle.indexOf("\n", i);
      if (ende < 0) break;
      aus += " ".repeat(ende - i);
      i = ende - 1;
      continue;
    }

    if (zeichen === "/" && naechstes === "*") {
      const ende = quelle.indexOf("*/", i + 2) + 2;
      aus += quelle.slice(i, ende).replace(/[^\n]/g, " ");
      i = ende - 1;
      continue;
    }

    if (zeichen === '"' || zeichen === "'" || zeichen === "`") {
      let j = i + 1;
      while (j < quelle.length) {
        if (quelle[j] === "\\") j++;
        else if (quelle[j] === zeichen) break;
        j++;
      }
      aus += quelle.slice(i, j + 1);
      i = j;
      continue;
    }

    aus += zeichen;
  }

  return aus;
}

/**
 * Grenzt jeden check(...)-Aufruf ueber die Klammerbilanz ab und ueberspringt
 * dabei Strings.
 *
 * Eine ZEILENWEISE Suche taugt hier nicht: check()-Aufrufe gehen ueber
 * mehrere Zeilen, und der eigene Kalibrierungstreffer - "ein Punkt:
 * Punktzustand plus Auswahlaktionen" in test-inspector.mjs - traegt den
 * Bezeichner eine Zeile unter dem check(.
 */
function checkAufrufe(quelle) {
  const aufrufe = [];
  const istWortzeichen = (z) => z !== undefined && /[A-Za-z0-9_$]/.test(z);

  /** Ueberspringt ein Zeichenkettenliteral und liefert den Index des Endes. */
  function stringEnde(von) {
    const anfuehrung = quelle[von];
    let i = von + 1;

    while (i < quelle.length) {
      if (quelle[i] === "\\") i++;
      else if (quelle[i] === anfuehrung) return i;
      i++;
    }

    return quelle.length;
  }

  /* Gesucht wird sequenziell statt mit matchAll, weil ein check( INNERHALB
     eines Strings kein Aufruf ist. Ein Pruefer, der seine eigene Beschreibung
     "check()-Aufrufe in tools/" als Aufruf zaehlt, verschoebe die Zahl durch
     seine blosze Existenz - genau das ist beim Bau passiert. */
  for (let start = 0; start < quelle.length; start++) {
    const zeichen = quelle[start];

    if (zeichen === '"' || zeichen === "'" || zeichen === "`") {
      start = stringEnde(start);
      continue;
    }

    if (!quelle.startsWith("check", start)) continue;
    if (istWortzeichen(quelle[start - 1])) continue;

    let klammer = start + "check".length;
    while (/\s/.test(quelle[klammer] || "")) klammer++;
    if (quelle[klammer] !== "(") continue;

    let tiefe = 0;

    for (let i = klammer; i < quelle.length; i++) {
      const z = quelle[i];

      if (z === '"' || z === "'" || z === "`") {
        i = stringEnde(i);
        continue;
      }

      if (z === "(") tiefe++;
      else if (z === ")") {
        tiefe--;
        if (tiefe === 0) {
          aufrufe.push({ von: start, bis: i + 1 });
          start = i;
          break;
        }
      }
    }
  }

  return aufrufe;
}

let zusicherungenGemessen = null;

/**
 * Pruefend heisst: der Bezeichner steht im check()-Aufruf selbst.
 * Herstellend heisst: er steht nur im Vorlauf seit dem vorigen check().
 */
function messeZusicherungen() {
  if (zusicherungenGemessen) return zusicherungenGemessen;

  const muster = new RegExp(`\\b(${AUSWAHLBEZEICHNER.join("|")})\\b`);
  const ergebnis = { pruefend: 0, herstellend: 0, inspector: 0 };

  for (const datei of readdirSync(toolsDir).sort()) {
    if (!datei.endsWith(".mjs")) continue;

    const quelle = ohneKommentare(readFileSync(join(toolsDir, datei), "utf8"));
    let pruefend = 0;
    let herstellend = 0;
    let vorigesEnde = 0;

    for (const aufruf of checkAufrufe(quelle)) {
      if (muster.test(quelle.slice(aufruf.von, aufruf.bis))) pruefend += 1;
      else if (muster.test(quelle.slice(vorigesEnde, aufruf.von))) herstellend += 1;
      vorigesEnde = aufruf.bis;
    }

    ergebnis.pruefend += pruefend;
    ergebnis.herstellend += herstellend;
    if (datei === "test-inspector.mjs") ergebnis.inspector = pruefend;
  }

  zusicherungenGemessen = ergebnis;
  return ergebnis;
}

/* ===================================================================== */
/* Die geprueften Zahlen                                                 */
/* ===================================================================== */

const MESSUNGEN = {
  "pruefstellen": {
    was: "Schreibstellen auf errors/warnings/info in validateMapData() und collectGeometryFindings()",
    messen: messePruefstellen,
  },
  "statustexte-ohne-englisch": {
    was: "literale Argumente der fuenf Statusfunktionen, die translateGermanText() unveraendert zurueckgibt",
    messen: messeStatustexteOhneEnglisch,
  },
  "zusicherungen-pruefend": {
    was: "check()-Aufrufe in tools/, die einen Auswahlbezeichner im Aufruf selbst tragen",
    messen: () => messeZusicherungen().pruefend,
  },
  "zusicherungen-herstellend": {
    was: "check()-Aufrufe in tools/, deren Vorlauf einen Auswahlbezeichner traegt",
    messen: () => messeZusicherungen().herstellend,
  },
  "zusicherungen-inspector": {
    was: "davon pruefend in tools/test-inspector.mjs",
    messen: () => messeZusicherungen().inspector,
  },
};

/* ===================================================================== */
/* Marken lesen und vergleichen                                          */
/* ===================================================================== */

/** Liest jede Marke samt der Zahl dahinter und ihrer Zeilennummer. */
function leseMarkierungen() {
  const text = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
  const gefunden = [];

  for (const treffer of text.matchAll(
    /<!--\s*bestand:\s*([a-z0-9-]+)\s*-->([^\d\n]*)(\d+)/g
  )) {
    gefunden.push({
      name: treffer[1],
      wert: Number(treffer[3]),
      zeile: text.slice(0, treffer.index).split("\n").length,
    });
  }

  /* Eine Marke ohne Zahl dahinter faellt oben durch das Muster - sie waere
     eine Markierung, die nichts markiert, und wird darum eigens gesucht. */
  const ohneZahl = [];
  for (const treffer of text.matchAll(/<!--\s*bestand:\s*([a-z0-9-]+)\s*-->/g)) {
    const zeile = text.slice(0, treffer.index).split("\n").length;
    if (!gefunden.some((m) => m.zeile === zeile && m.name === treffer[1])) {
      ohneZahl.push({ name: treffer[1], zeile });
    }
  }

  return { gefunden, ohneZahl };
}

const { gefunden, ohneZahl } = leseMarkierungen();
let fehler = 0;

for (const marke of ohneZahl) {
  console.error(
    `  ROT  CLAUDE.md:${marke.zeile} - Markierung "${marke.name}" steht vor keiner Zahl.`
  );
  fehler += 1;
}

for (const marke of gefunden) {
  if (!MESSUNGEN[marke.name]) {
    console.error(
      `  ROT  CLAUDE.md:${marke.zeile} - Markierung "${marke.name}" kennt der Pruefer nicht; ` +
        "entweder ist der Name vertippt oder der Messbefehl fehlt."
    );
    fehler += 1;
  }
}

for (const [name, messung] of Object.entries(MESSUNGEN)) {
  const marken = gefunden.filter((m) => m.name === name);

  if (marken.length === 0) {
    console.error(
      `  ROT  "${name}" hat keine Markierung in CLAUDE.md - die Zahl ist entfernt ` +
        "oder die Marke wurde vergessen."
    );
    fehler += 1;
    continue;
  }

  let gemessen;
  try {
    gemessen = messung.messen();
  } catch (ursache) {
    console.error(`  ROT  "${name}" liess sich nicht messen: ${ursache.message}`);
    fehler += 1;
    continue;
  }

  for (const marke of marken) {
    if (marke.wert === gemessen) {
      console.log(`  ok   ${name} = ${gemessen} (CLAUDE.md:${marke.zeile})`);
    } else {
      console.error(
        `  ROT  CLAUDE.md:${marke.zeile} - "${name}": dort steht ${marke.wert}, ` +
          `gemessen ${gemessen}.`
      );
      console.error(`       gezaehlt werden: ${messung.was}`);
      fehler += 1;
    }
  }
}

if (fehler > 0) {
  console.error(
    `\ncheck-bestandszahlen: FEHLER - ${fehler} Abweichung(en). ` +
      "Die Messmethoden stehen in CLAUDE.md, Abschnitt 4.5."
  );
  process.exitCode = 1;
} else {
  console.log(
    `\ncheck-bestandszahlen: alle ${gefunden.length} markierten Zahlen stimmen mit der Messung ueberein.`
  );
}
