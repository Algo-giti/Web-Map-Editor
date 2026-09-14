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
// den ein Mensch liest; der Pruefer fuehrt ihn nicht als Literal. Ein
// Leerzeichen als Tausendertrenner ist erlaubt ("21 000"), weil die
// Dokumentation groesze Zahlen so schreibt.
//
// TOLERANZ: <!-- bestand: name +-500 --> laesst eine Abweichung zu. Sie ist
// fuer GERUNDETE Angaben da ("rund 21 000 Zeilen"), die sonst bei jeder
// Aenderung an index.html rissen, ohne dass die Aussage falsch geworden
// waere. Eine Toleranz macht die Zahl traege, nicht unreiszbar: waechst die
// Datei ueber die Grenze hinaus, ist die Rundung falsch und der Pruefer
// meldet es. Ohne Angabe wird exakt verglichen.
//
// Dieselbe Marke darf mehrfach vorkommen. Das ist kein Versehen, sondern der
// Fall, den CLAUDE.md selbst beschreibt: die 49 steht an zwei Stellen, und
// beide werden geprueft.
//
// Die Messmethoden sind in CLAUDE.md, Abschnitt 4.5, beschrieben.

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { runInNewContext } from "node:vm";
import { readInlineScript, extractDeclarations } from "./extract-script.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const toolsDir = new URL(".", import.meta.url).pathname;

/**
 * Der Pruefer selbst, und er ist von JEDER Zaehlung ueber tools/
 * ausgenommen.
 *
 * Das ist keine Bequemlichkeit, sondern notwendig: seine Beschreibungen
 * nennen genau die Muster, nach denen er sucht - "Aufrufe von menueBefehl()",
 * "Skripte, die openAllFolds() aufrufen". Ohne den Ausschluss zaehlt er sich
 * als Aufrufer mit und verschiebt jede dieser Zahlen um eins. Gemessen beim
 * Bau, an drei Zahlen gleichzeitig.
 *
 * Er ist ausserdem kein Testskript: er fuehrt keine Zusicherung und ruft
 * keinen der Helfer auf, ueber die hier gezaehlt wird.
 *
 * Der Name wird aus import.meta.url abgeleitet und nicht hingeschrieben: als
 * Literal haengt der Ausschluss am Dateinamen, und eine Umbenennung liesze
 * den Pruefer sich wieder selbst mitzaehlen. Gemessen an einer Kopie unter
 * anderem Namen: drei Zahlen verschoben sich auf 23 / 15 / 45.
 */
const EIGENE_DATEI = basename(new URL(import.meta.url).pathname);

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

/**
 * Beginnt an dieser Stelle ein Regex-Literal?
 *
 * Gebraucht, weil ein Regex Anfuehrungszeichen enthalten darf: das Muster
 * /(stroke|fill)="(#|rgb|hsl)/i in tools/test-inspector.mjs liesz den
 * Stringueberspringer einen String oeffnen, der bis zum naechsten " lief -
 * gemessen fielen die Zusicherungszahlen dadurch von 59/23/53 auf 34/15/28.
 * Der Parser kannte bis dahin Strings und Kommentare, aber nicht die dritte
 * Form, in der ein Anfuehrungszeichen harmlos auftreten kann.
 *
 * Die Heuristik ist die uebliche: nach einem Wert (Bezeichner, Zahl,
 * schlieszende Klammer) ist / eine Division, sonst ein Regex-Anfang.
 */
function istRegexAnfang(quelle, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(quelle[i])) i--;
  if (i < 0) return true;
  return !/[A-Za-z0-9_$)\]]/.test(quelle[i]);
}

/** Liefert den Index des schlieszenden / eines Regex-Literals. */
function regexEnde(quelle, von) {
  let inKlasse = false;

  for (let i = von + 1; i < quelle.length; i++) {
    const zeichen = quelle[i];

    if (zeichen === "\\") { i++; continue; }
    if (zeichen === "\n") return von;      /* ueber eine Zeile: kein Regex */
    if (zeichen === "[") inKlasse = true;
    else if (zeichen === "]") inKlasse = false;
    else if (zeichen === "/" && !inKlasse) return i;
  }

  return von;
}

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

    /* Ein Regex bleibt stehen, seine Anfuehrungszeichen oeffnen aber keinen
       String - sonst verschluckt der naechste Ueberspringer den halben Rest. */
    if (zeichen === "/" && istRegexAnfang(quelle, i)) {
      const ende = regexEnde(quelle, i);
      if (ende > i) {
        aus += quelle.slice(i, ende + 1);
        i = ende;
        continue;
      }
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

    if (zeichen === "/" && istRegexAnfang(quelle, start)) {
      const ende = regexEnde(quelle, start);
      if (ende > start) { start = ende; continue; }
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

      if (z === "/" && istRegexAnfang(quelle, i)) {
        const ende = regexEnde(quelle, i);
        if (ende > i) { i = ende; continue; }
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
    if (!datei.endsWith(".mjs") || datei === EIGENE_DATEI) continue;

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
/* Weitere Messungen: Umfang der Datei, Zaehlungen im Verzeichnis        */
/* ===================================================================== */

const leseHtml = () => readFileSync(join(repoRoot, "index.html"), "utf8");

/**
 * Die Zahl der Uebersetzungsmuster.
 *
 * Gezaehlt wird die ausgefuehrte Liste und nicht ihr Quelltext: eine
 * Textzaehlung ueber die Zeilenanfaenge kommt auf 178 statt 181, weil drei
 * Eintraege anders umbrochen sind. tools/test-cassandra.mjs nennt dieselbe
 * Zahl in seiner Ausgabe ("154 von 181 Mustern automatisch geprueft").
 */
function messeI18nMuster() {
  const code = extractDeclarations(readInlineScript(), ["I18N_PATTERNS"]);
  const sandkasten = {};
  runInNewContext(`${code}\nthis.anzahl = I18N_PATTERNS.length;`, sandkasten);
  return sandkasten.anzahl;
}

const zaehle = (text, muster) => (text.match(muster) || []).length;

/** Alle .mjs-Dateien in tools/, ausser den genannten. */
function toolsDateien(ausser = []) {
  return readdirSync(toolsDir)
    .filter(
      (datei) =>
        datei.endsWith(".mjs") &&
        datei !== EIGENE_DATEI &&
        !ausser.includes(datei)
    )
    .map((datei) => ({ datei, quelle: readFileSync(join(toolsDir, datei), "utf8") }));
}

/**
 * Zaehlt die <details>-Elemente einer Rolle im Markup.
 *
 * Ueber die Klasse und nicht ueber "<details", weil das Wort sieben Mal in
 * Kommentaren des Skripts steht - eine Zaehlung ohne Klasse kaeme auf 17
 * statt auf 10.
 */
function detailsMitKlasse(klasse) {
  return zaehle(leseHtml(), new RegExp(`<details[^>]*class="[^"]*\\b${klasse}\\b`, "g"));
}

const DETAILS_ROLLEN = [
  "inspector-fold",
  "tool-settings",
  "inspector-note",
  "selection-actions",
];

/** Die literalen title-Attribute im Markup. */
const messeTitleMarkup = () => zaehle(leseHtml(), /title="/g);

/**
 * Die per Skript gesetzten title-Zuweisungen.
 *
 * \s* statt eines Leerzeichens: drei der Zuweisungen sind ueber die
 * Zeilengrenze umgebrochen, und genau daran ist die Zaehlung des achten
 * Durchgangs vorbeigelaufen - sie meldete 36 statt 39.
 */
const messeTitleJs = () =>
  zaehle(leseHtml(), /\.title\s*=[^=]/g) +
  zaehle(leseHtml(), /setAttribute\("title"/g);

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
  "zeilen-index-html": {
    was: "Zeilen in index.html",
    messen: () => leseHtml().split("\n").length - 1,
  },
  "globale-funktionen": {
    was: "Funktionsdeklarationen am Zeilenanfang, also ohne Einrueckung und damit global",
    messen: () => zaehle(leseHtml(), /^function [A-Za-z_$][A-Za-z0-9_$]*\s*\(/gm),
  },
  "i18n-muster": {
    was: "Eintraege in I18N_PATTERNS",
    messen: messeI18nMuster,
  },
  "openallfolds-aufrufer": {
    was: "Skripte in tools/, die openAllFolds() aufrufen (ohne browser-harness.mjs, das den Helfer definiert)",
    messen: () =>
      toolsDateien(["browser-harness.mjs"]).filter((d) => /openAllFolds\(/.test(d.quelle))
        .length,
  },
  "klickefreienknopf-aufrufe": {
    was: "Aufrufe von klickeFreienKnopf() in tools/test-merge.mjs",
    messen: () =>
      zaehle(
        readFileSync(join(toolsDir, "test-merge.mjs"), "utf8"),
        /klickeFreienKnopf\(/g
      ),
  },
  "menuebefehl-aufrufe": {
    was: "Aufrufe von menueBefehl() in den Browsertests (ohne scan-i18n.mjs, das kein Test ist)",
    messen: () =>
      toolsDateien(["scan-i18n.mjs"]).reduce(
        (summe, d) => summe + zaehle(d.quelle, /menueBefehl\(/g),
        0
      ),
  },
  "title-fundstellen": {
    was: "title-Attribute im Markup und per Skript gesetzte zusammen",
    messen: () => messeTitleMarkup() + messeTitleJs(),
  },
  "title-markup": {
    was: "literale title-Attribute in index.html",
    messen: messeTitleMarkup,
  },
  "title-js": {
    was: "per Skript gesetzte title-Attribute, umgebrochene Zuweisungen eingeschlossen",
    messen: messeTitleJs,
  },
  "details-instanzen": {
    was: "<details>-Elemente des Markups in ihren vier Rollen",
    messen: () => DETAILS_ROLLEN.reduce((summe, rolle) => summe + detailsMitKlasse(rolle), 0),
  },
  "details-inspector-fold": {
    was: "<details class=\"... inspector-fold\"> im Markup",
    messen: () => detailsMitKlasse("inspector-fold"),
  },
  "details-tool-settings": {
    was: "<details class=\"tool-settings\"> im Markup",
    messen: () => detailsMitKlasse("tool-settings"),
  },
  "details-inspector-note": {
    was: "<details class=\"inspector-note\"> im Markup",
    messen: () => detailsMitKlasse("inspector-note"),
  },
  "details-selection-actions": {
    was: "<details class=\"selection-actions\"> im Markup",
    messen: () => detailsMitKlasse("selection-actions"),
  },
  "klicks-feste-koordinate": {
    was: "Klicks mit fester Koordinate in tools/, gefunden ueber \"position: { x:\"",
    messen: () =>
      toolsDateien().reduce((summe, d) => summe + zaehle(d.quelle, /position: \{ x:/g), 0),
  },
};

/* ===================================================================== */
/* Marken lesen und vergleichen                                          */
/* ===================================================================== */

/**
 * Eine Fence-Zeile: drei oder mehr Backticks, danach hoechstens ein
 * Infostring ("```bash", "```js") und sonst nichts.
 *
 * Das "und sonst nichts" ist der ganze Punkt. CLAUDE.md schreibt ueber ihre
 * eigenen Codebloecke, und dabei stehen drei Backticks mitten im Fliesztext
 * ("die ```-Bloecke durch Leerraum ersetzen"). Eine Erkennung, die nur auf
 * den Zeilenanfang sieht, haelte so eine Zeile fuer einen Blockanfang und
 * verschluckte alles dahinter - stillschweigend.
 *
 * Tilden-Fences (~~~) kennt Markdown auch, diese Datei benutzt sie nicht,
 * und sie kollidieren optisch mit der Durchstreichung ~~so~~. Deshalb nur
 * Backticks.
 *
 * Und der Infostring traegt keinen Bindestrich, obwohl Markdown ihn erlaubt:
 * sonst gaelte eine Zeile, die mit "```-Bloecke" beginnt, als Blockanfang.
 * Genau darueber schreibt diese Datei. Die hier benutzten Infostrings sind
 * bash, js und svg.
 */
const FENCE_AUF = /^`{3,}[A-Za-z0-9_+]*$/;
const FENCE_ZU = /^`{3,}$/;

/**
 * Ersetzt Codebeispiele durch Leerraum - Codebloecke UND Code-Spans in
 * einfachen Backticks.
 *
 * GRUND: ein Codebeispiel zeigt die FORM einer Markierung, es behauptet
 * keinen Bestand. Das Formbeispiel in Abschnitt 4.5 wurde sonst als echte
 * Marke gelesen - gemessen 25 Fundstellen statt 23.
 *
 * Die Code-Spans kamen dazu, als der Pruefer anfing, formaehnliche Marken zu
 * melden: CLAUDE.md zeigt die verworfene Form `<!-- bestand: name=49 -->` und
 * eine falsch geschriebene in Backticks, und beide sind Beispiele und keine
 * Versaeumnisse.
 *
 * Ersetzt wird zeichenweise und laengengleich, damit die Offsets und damit
 * die gemeldeten Zeilennummern unveraendert bleiben.
 */
function ohneCodebeispiele(text) {
  const zeilen = text.split("\n");
  let imBlock = false;
  let beginn = 0;

  /* Fehlt IRGENDWO ein schlieszender Fence, so schlieszt der naechste Block
     den vorigen, und alles dazwischen wird verschluckt - mitsamt echten
     Marken. Gemessen: ein einzelner zusaetzlicher Fence liesz die Zahl der
     Fundstellen von 23 auf 22 fallen, und der Pruefer blieb gruen, weil die
     betroffene Messung eine zweite Fundstelle hatte.

     Die Zahl der Fence-Zeilen muss deshalb gerade sein. Das faengt den
     realistischen Fall - einer fehlt oder einer ist zu viel - und faengt ihn
     dort, wo er entsteht, statt am Dateiende. Zwei gleichzeitig fehlende
     Fences bleiben unerkannt; das ist eine benannte Grenze, keine Zusicherung. */
  const fences = zeilen.filter((zeile) => {
    const rand = zeile.trim();
    return FENCE_AUF.test(rand) || FENCE_ZU.test(rand);
  }).length;

  if (fences % 2 !== 0) {
    throw new Error(
      `CLAUDE.md: ungerade Zahl von Codeblock-Begrenzern (${fences}) - ` +
        "irgendwo fehlt ein ``` oder steht eines zu viel."
    );
  }

  const maskiert = zeilen.map((zeile, index) => {
    const rand = zeile.trim();

    if (!imBlock && FENCE_AUF.test(rand)) {
      imBlock = true;
      beginn = index + 1;
      return " ".repeat(zeile.length);
    }

    if (imBlock && FENCE_ZU.test(rand)) {
      imBlock = false;
      return " ".repeat(zeile.length);
    }

    return imBlock ? " ".repeat(zeile.length) : zeile;
  });

  /* Ein nie geschlossener Block wuerde den Rest der Datei verschlucken, und
     zwar lautlos: der Pruefer meldete dann "keine Markierung" fuer alles
     Folgende. Lieber ein harter Abbruch mit der Zeile, an der es anfing. */
  if (imBlock) {
    throw new Error(
      `CLAUDE.md: der Codeblock ab Zeile ${beginn} wird nirgends geschlossen.`
    );
  }

  /* Code-Spans zeilenweise: ein Span ueber einen Zeilenumbruch kommt in
     dieser Datei nicht vor, und ein Muster darueber verschluckte im Zweifel
     ganze Absaetze. */
  return maskiert
    .map((zeile) =>
      zeile.replace(/(`+)([^`\n]*)\1/g, (treffer) => " ".repeat(treffer.length))
    )
    .join("\n");
}

/**
 * Was der Form nahekommt, aber nicht passt - und warum.
 *
 * Vorher wurde so etwas STILL uebergangen: eine Marke mit groszgeschriebenem
 * Namen fiel durch das strenge Muster, war damit keine Marke, und kein
 * einziges Wort der Ausgabe erwaehnte sie. Das ist schwerer als eine falsche
 * Zahl - wer sie so schreibt, glaubt, seine Zahl sei geprueft.
 */
function grundDerAblehnung(schluessel, rest) {
  if (schluessel !== "bestand") {
    return `das Schluesselwort muss "bestand" heiszen, hier steht "${schluessel}"`;
  }

  if (!rest) return "hinter dem Doppelpunkt steht kein Name";

  const [name, ...weiteres] = rest.split(/\s+/);
  const zusatz = weiteres.join(" ");
  const verboten = [...new Set([...name].filter((zeichen) => !/[a-z0-9-]/.test(zeichen)))];

  if (verboten.length > 0) {
    return (
      `der Name "${name}" enthaelt ${verboten.map((z) => `"${z}"`).join(", ")} - ` +
      "erlaubt sind nur a-z, 0-9 und der Bindestrich"
    );
  }

  if (zusatz && !/^\+-\d+$/.test(zusatz)) {
    return `die Toleranz muss "+-N" heiszen, hier steht "${zusatz}"`;
  }

  return "sie passt nicht auf die Form <!-- bestand: name -->";
}

/** Liest jede Marke samt der Zahl dahinter und ihrer Zeilennummer. */
function leseMarkierungen() {
  const roh = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
  const text = ohneCodebeispiele(roh);
  const gefunden = [];

  for (const treffer of text.matchAll(
    /<!--\s*bestand:\s*([a-z0-9-]+)\s*(?:\+-(\d+)\s*)?-->([^\d\n]*)(\d[\d\u00a0 ]*\d|\d)/g
  )) {
    gefunden.push({
      name: treffer[1],
      toleranz: treffer[2] ? Number(treffer[2]) : 0,
      wert: Number(treffer[4].replace(/[\u00a0 ]/g, "")),
      zeile: text.slice(0, treffer.index).split("\n").length,
    });
  }

  /* Eine Marke ohne Zahl dahinter faellt oben durch das Muster - sie waere
     eine Markierung, die nichts markiert, und wird darum eigens gesucht. */
  const ohneZahl = [];
  for (const treffer of text.matchAll(
    /<!--\s*bestand:\s*([a-z0-9-]+)\s*(?:\+-\d+\s*)?-->/g
  )) {
    const zeile = text.slice(0, treffer.index).split("\n").length;
    if (!gefunden.some((m) => m.zeile === zeile && m.name === treffer[1])) {
      ohneZahl.push({ name: treffer[1], zeile });
    }
  }

  /* Alles, was wie eine Marke aussieht - auch mit falsch geschriebenem
     Schluesselwort oder Namen. Was davon nicht als richtige Marke erkannt
     wurde, wird gemeldet statt uebergangen. */
  const formaehnlich = [];
  for (const treffer of text.matchAll(/<!--\s*(bestand)\s*:\s*([^>]*?)\s*-->/gi)) {
    const zeile = text.slice(0, treffer.index).split("\n").length;
    const erkannt =
      gefunden.some((m) => m.zeile === zeile) || ohneZahl.some((m) => m.zeile === zeile);

    if (!erkannt) {
      const rest = treffer[2];
      formaehnlich.push({
        wortlaut: rest.split(/\s+/)[0] || "(ohne Namen)",
        zeile,
        grund: grundDerAblehnung(treffer[1], rest),
      });
    }
  }

  /* Wieviel in Codebeispielen stand, wird genannt und nicht verschwiegen:
     eine Marke, die versehentlich in Backticks geraet, faellt sonst lautlos
     aus der Zaehlung. */
  const alle = (roh.match(/<!--\s*bestand\s*:/gi) || []).length;
  const sichtbar = (text.match(/<!--\s*bestand\s*:/gi) || []).length;

  return { gefunden, ohneZahl, formaehnlich, inBeispielen: alle - sichtbar };
}

const { gefunden, ohneZahl, formaehnlich, inBeispielen } = leseMarkierungen();
let fehler = 0;

for (const fast of formaehnlich) {
  console.error(
    `  ROT  CLAUDE.md:${fast.zeile} - "${fast.wortlaut}" sieht wie eine Markierung ` +
      `aus, ist aber keine: ${fast.grund}.`
  );
  fehler += 1;
}

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
    const abweichung = Math.abs(marke.wert - gemessen);

    if (abweichung <= marke.toleranz) {
      const spanne = marke.toleranz ? ` (+-${marke.toleranz}, gemessen ${gemessen})` : "";
      console.log(`  ok   ${name} = ${marke.wert}${spanne} (CLAUDE.md:${marke.zeile})`);
    } else {
      const spanne = marke.toleranz ? ` +-${marke.toleranz}` : "";
      console.error(
        `  ROT  CLAUDE.md:${marke.zeile} - "${name}": dort steht ${marke.wert}${spanne}, ` +
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
  const beispiele =
    inBeispielen > 0
      ? ` (${inBeispielen} weitere stehen in Codebeispielen und zaehlen nicht)`
      : "";

  console.log(
    `\ncheck-bestandszahlen: alle ${gefunden.length} markierten Zahlen stimmen mit der ` +
      `Messung ueberein${beispiele}.`
  );
}
