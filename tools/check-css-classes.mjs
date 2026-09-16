#!/usr/bin/env node
// Zero-dependency check: findet Klassenselektoren im <style>-Block von
// index.html, für die es im Rest der Datei keine einzige Verwendung gibt -
// weder im Markup, noch in einer Vorlage im Skript, noch über classList,
// className oder setAttribute("class", ...).
//
// Der Anlass steht in CLAUDE.md, Abschnitt 7: in Etappe 6 b1, b2 und b3
// blieben dreimal Regeln stehen, deren einziges Markup gerade entfernt worden
// war; weitere Fälle fielen erst Etappen später bei einer Fehlersuche auf.
// Kein Laufzeitfehler, aber genau die Klasse, gegen die check-dom-ids.mjs
// gebaut wurde: tote Verweise, die niemand sieht.
//
// WARNUNG, NICHT FEHLER. Eine verwaiste Regel ist Ballast und kein Defekt,
// und die Suche kann falsch melden - deshalb endet dieses Skript mit 0.
// Damit die Zahl trotzdem reissen kann, steht sie als markierte Bestandszahl
// in CLAUDE.md und wird von check-bestandszahlen.mjs gegen diese Messung
// gehalten (siehe dort den Messbefehl "verwaiste-css-klassen").

import { readFileSync } from "node:fs";

const indexPath = new URL("../index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");

const styleOpen = html.indexOf("<style>");
const styleClose = html.indexOf("</style>");
if (styleOpen < 0 || styleClose < 0) {
  console.error("check-css-classes: FAILED - kein <style>-Block in index.html gefunden.");
  process.exit(1);
}
const cssStart = styleOpen + "<style>".length;
const css = html.slice(cssStart, styleClose);

// Alles ausserhalb des <style>-Blocks ist die Verwendungsseite: das Markup
// davor und danach UND der komplette Skriptblock mit seinen Vorlagen.
const rest = html.slice(0, cssStart) + html.slice(styleClose);

/**
 * Klassennamen aus den SELEKTOREN des CSS, mit Zeilennummer des ersten
 * Vorkommens.
 *
 * Gelesen wird zeichenweise mit einem Kontextstapel, nicht mit einer
 * Regex über die ganze Datei: eine Deklaration wie
 * `max-width:calc(100% - 350px)` enthält Zeichen, die in einem Selektor
 * etwas anderes bedeuten, und `@media`-Rümpfe tragen ihrerseits wieder
 * Selektoren. Ein `{` öffnet deshalb je nach Präludium entweder einen
 * Deklarationsblock (Inhalt wird übersprungen) oder einen At-Regel-Rumpf
 * (Inhalt ist wieder Selektorebene).
 */
function klassenAusSelektoren(text) {
  const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
  const gefunden = new Map();
  const stapel = [true]; // true = Selektorebene
  let praeludium = "";
  let praeludiumStart = 0;

  const ernte = (selektor, offset) => {
    for (const m of selektor.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
      if (gefunden.has(m[1])) continue;
      const stelle = offset + m.index;
      gefunden.set(m[1], ohneKommentare.slice(0, stelle).split("\n").length);
    }
  };

  for (let i = 0; i < ohneKommentare.length; i++) {
    const ch = ohneKommentare[i];
    if (ch === "{") {
      const aufSelektorebene = stapel[stapel.length - 1];
      if (aufSelektorebene) {
        const istAtRegel = praeludium.trimStart().startsWith("@");
        if (!istAtRegel) ernte(praeludium, praeludiumStart);
        stapel.push(istAtRegel);
      } else {
        stapel.push(false);
      }
      praeludium = "";
      praeludiumStart = i + 1;
    } else if (ch === "}") {
      if (stapel.length > 1) stapel.pop();
      praeludium = "";
      praeludiumStart = i + 1;
    } else if (stapel[stapel.length - 1]) {
      if (!praeludium) praeludiumStart = i;
      praeludium += ch;
    }
  }
  return gefunden;
}

/**
 * Jeder Name, der irgendwo als Klasse VERGEBEN wird.
 *
 * Vier Schreibweisen, und die vierte ist die, an der ein einfacheres Muster
 * scheitert: `className = \`feature-card${sel ? " selected-feature" : ""}\``
 * setzt zwei Klassen in einem Template-Literal. Die Interpolation wird
 * deshalb wie ein Trennzeichen behandelt statt das Literal zu verwerfen -
 * sonst gälten `feature-card` und `selected-feature` fälschlich als verwaist.
 */
function vergebeneNamen(text) {
  const namen = new Set();
  const zerlege = (wert) => {
    for (const teil of String(wert).split(/[\s${}`'"+]+/)) {
      if (/^-?[A-Za-z_][\w-]*$/.test(teil)) namen.add(teil);
    }
  };
  for (const m of text.matchAll(/\bclass=(["'])([^"']*)\1/g)) zerlege(m[2]);
  for (const m of text.matchAll(/\bclassName\s*=\s*([`"'])([^`"']*)\1/g)) zerlege(m[2]);
  // className aus einem Template-Literal MIT Interpolation: bis zum
  // schliessenden Backtick lesen, Interpolationen als Trenner.
  for (const m of text.matchAll(/\bclassName\s*=\s*`([^`]*)`/g)) zerlege(m[1]);
  for (const m of text.matchAll(
    /classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g
  )) {
    for (const s of m[1].matchAll(/([`"'])([^`"']*)\1/g)) zerlege(s[2]);
  }
  for (const m of text.matchAll(
    /setAttribute\(\s*([`"'])class\1\s*,\s*(["'])([^"']*)\2/g
  )) {
    zerlege(m[3]);
  }
  // setAttribute("class", `...`) mit Interpolation - dieselbe Falle wie oben.
  for (const m of text.matchAll(
    /setAttribute\(\s*([`"'])class\1\s*,\s*`([^`]*)`/g
  )) {
    zerlege(m[2]);
  }
  return namen;
}

/**
 * Klassen, die aus einer VARIABLEN entstehen und deshalb nirgends als Literal
 * im Dateitext stehen.
 *
 * Das ist die benannte Grenze dieser Prüfung, und sie ist nicht auflösbar:
 * eine Textsuche kann `feature ${layer}` nicht auflösen. Bei ids löst das
 * Haus dieselbe Frage mit einem Verbot (CLAUDE.md, Abschnitt 6: "jede id ist
 * ein Zeichenketten-Literal"); für Klassen wäre ein solches Verbot unsinnig -
 * eine Ebenenklasse aus dem Feature-Typ zu bilden ist genau richtig.
 *
 * Aufgezählt werden deshalb die EXAKTEN Namen, mit dem Ausdruck, der sie
 * erzeugt - und nur die, die sonst nirgends als Literal stehen:
 * `.exclusion` und `.searchwire` entstehen aus demselben Ausdruck, kommen
 * aber zusätzlich als Literal vor und brauchen deshalb keinen Eintrag.
 * Ein überflüssiger Eintrag wird unten gemeldet. Kein Präfixmuster: `map-` als Präfix träfe auch
 * `.map-selection-toolbar` und `.map-selection-counter`, und die sind
 * wirklich verwaist. Machart wie die FALSCHMELDUNGEN in tools/scan-i18n.mjs.
 */
const AUS_VARIABLE = new Map([
  ["perimeter", "`feature ${layer}` in renderGeometry()"],
  ["dockpoints", "`feature ${layer}` in renderGeometry()"],
  ["other", "`feature ${layer}` in renderGeometry()"],
  ["info", "`validation-item ${item.type}` in renderValidationResult()"],
  ["map-a", "`other-map-overlay map-${slot.id.toLowerCase()}`"],
  ["map-b", "`other-map-overlay map-${slot.id.toLowerCase()}`"],
]);

const imCss = klassenAusSelektoren(css);
const vergeben = vergebeneNamen(rest);

const ohneLiteral = [...imCss.entries()]
  .filter(([name]) => !vergeben.has(name))
  .sort((a, b) => a[1] - b[1]);

const verwaist = ohneLiteral.filter(([name]) => !AUS_VARIABLE.has(name));
const ausVariable = ohneLiteral.filter(([name]) => AUS_VARIABLE.has(name));

console.log(
  `check-css-classes: ${imCss.size} Klassenselektoren im <style>-Block, ` +
    `${vergeben.size} vergebene Namen im Rest der Datei.`
);

// Ein Eintrag in AUS_VARIABLE, der gar nicht mehr gebraucht wird, ist
// derselbe Fall, gegen den diese Prüfung gebaut ist - nur eine Ebene höher.
// Er wird deshalb gemeldet, wie check-bestandszahlen.mjs einen Messbefehl
// ohne Marke meldet.
const ueberfluessig = [...AUS_VARIABLE.keys()].filter(
  (name) => !imCss.has(name) || vergeben.has(name)
);
if (ueberfluessig.length > 0) {
  console.log(
    "check-css-classes: HINWEIS - diese Einträge in AUS_VARIABLE werden nicht " +
      "mehr gebraucht (die Klasse steht als Literal da oder es gibt sie nicht " +
      `mehr): ${ueberfluessig.map((n) => "." + n).join(", ")}`
  );
}

if (ausVariable.length > 0) {
  console.log(
    `check-css-classes: ${ausVariable.length} Klassen werden aus einer ` +
      "Variablen gesetzt und sind für eine Textsuche unsichtbar:"
  );
  for (const [name, zeile] of ausVariable) {
    console.log(`  - .${name} (index.html:${zeile}) - ${AUS_VARIABLE.get(name)}`);
  }
}

if (verwaist.length === 0) {
  console.log("check-css-classes: OK - keine verwaiste Klassenregel.");
} else {
  console.log(
    `check-css-classes: WARNUNG - ${verwaist.length} Klassenselektoren ohne ` +
      "jede Verwendung (Ballast, kein Defekt - deshalb kein Fehler):"
  );
  for (const [name, zeile] of verwaist) {
    console.log(`  - .${name} (index.html:${zeile})`);
  }
}
