#!/usr/bin/env node
// KEIN BROWSERTEST - Werkzeug. Es sichert nichts zu, sondern durchsucht die
// laufende Oberfläche nach deutschem Text ohne englische Fassung. Deshalb ist
// es weder in tools/run-browser-tests.mjs noch in tools/check-all.mjs
// eingehängt; die Marke in dieser Zeile hält es aus dem Läufer heraus.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/scan-i18n.mjs
//
// ---------------------------------------------------------------------------
// VERFAHREN
//
// Die Oberfläche bleibt deutsch. Das Werkzeug spielt Zustände durch, sammelt in
// jedem jeden Textknoten unter "body *" - auch in ausgeblendeten Elementen -
// sowie die drei übersetzbaren Attribute (title, aria-label, placeholder),
// schickt jeden Text durch translateGermanText() und meldet, was UNVERÄNDERT
// zurückkommt. Genau das ist die Bedingung, unter der setLanguage() nichts zu
// tun hätte.
//
// ---------------------------------------------------------------------------
// BESUCHTE ZUSTÄNDE - und warum sie hier stehen
//
// Eine Laufzeitsuche ist nur so vollständig wie die Zustände, die sie besucht
// hat. Ein Zustand, den niemand herstellt, liefert keinen Treffer, und das
// leere Ergebnis sieht aus wie ein sauberer Befund. Die Liste gehört deshalb
// in das Werkzeug und in jeden Bericht, der seine Zahlen nennt:
//
//   leer                      Grundzustand ohne Karte
//   geladen                   Karte mit allen fünf Feature-Typen
//   punkt+vergleich           ein Punkt ausgewählt und verschoben
//   reduzieren-schrumpfend    Reduzieren, die Fläche wird kleiner
//   reduzieren-wachsend       Reduzieren, die Fläche wird größer
//   begradigen                Begradigen angewendet
//   rechtwinklig              Ecken rechtwinklig angewendet
//   pruefbericht              Kartenprüfung mit Befunden
//   messen                    Messwerkzeug mit zwei Punkten
//   zeichnen                  Exclusion, ein Punkt gesetzt
//   zeichnen-abgebrochen      dieselbe Zeichnung verworfen
//   kreis                     Kreiswerkzeug gestartet
//   verbinden-ungesetzt       Verbinden-Fenster ohne Auftrennstelle
//   auftrennstelle-gesetzt    dasselbe Fenster mit gesetzter Stelle
//   verbunden                 Karten verbunden, Karte B trug namenlose Linien
//   herausgezoomt             Raster feiner als ein Bildschirmpixel
//   bezugspunktkonflikt       zwei Karten mit verschiedener RTK-Basis
//   ladefehler                unlesbare Datei
//
// Ein Zustand, der hier fehlt, ist nicht geprüft - auch dann nicht, wenn das
// Werkzeug null neue Treffer meldet.
//
// ---------------------------------------------------------------------------
// BEKANNTE SCHWÄCHE
//
// Ein Text, dessen englische Fassung mit dem deutschen Original ÜBEREINSTIMMT,
// kommt unverändert zurück und erscheint damit als Treffer, obwohl er richtig
// ist. Betroffen sind Eigennamen ("Perimeter", "Exclusion"), Dateinamen und
// Zahlenangaben ohne Wort. Solche Fälle stehen unten in FALSCHMELDUNGEN, jede
// mit ihrer Begründung; das Werkzeug trennt die Ausgabe danach in "bekannt"
// und "neu".
//
// ---------------------------------------------------------------------------
// KALIBRIERUNG
//
// Das Verfahren wird gegen einen Treffer geprüft, den es finden MUSS. Dafür
// wird ein Wörterbucheintrag entfernt - der Vorschlag ist
// "Ausgang seit letztem Speichern:", weil er im Zustand punkt+vergleich sicher
// sichtbar ist. Das Werkzeug macht das nicht selbst; die Mutation gehört nach
// §4.2 aus einer Sicherungskopie zurückgenommen:
//
//   cp index.html "$SCRATCH/kopie.html"
//   # den Eintrag "Ausgang seit letztem Speichern:" aus I18N_EN entfernen
//   PLAYWRIGHT_CORE_PATH="$SCRATCH" node tools/scan-i18n.mjs
//   # der Eintrag MUSS jetzt als neuer Treffer erscheinen
//   cp "$SCRATCH/kopie.html" index.html && md5sum index.html "$SCRATCH/kopie.html"
//
// Findet der Lauf ihn nicht, ist nicht die Oberfläche sauber, sondern das
// Werkzeug kaputt.

import {
  createMenueBefehl,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

/*
 * Falschmeldungen: Texte, die das Verfahren melden MUSS, weil ihre englische
 * Fassung gleich lautet. Jede mit Begruendung - eine Liste ohne Begruendung
 * waere ein Filter, hinter dem sich ein echter Fund verstecken koennte.
 */
const FALSCHMELDUNGEN = [
  /* Eigennamen und Bezeichner, die im Englischen gleich lauten */
  [/^Perimeter$/, "Eigenname des Feature-Typs, englisch gleich"],
  [/^Exclusion:?$/, "Eigenname des Feature-Typs, englisch gleich"],
  [/^Exclusion #\d+$/, "abgeleiteter Anzeigename, englisch gleich"],
  [/^Polygon$/, "Geometrietyp aus GeoJSON, englisch gleich"],
  [/^LineString$/, "Geometrietyp aus GeoJSON, englisch gleich"],
  [/^Dockpoints$/, "CaSSAndRA-Bezeichner, englisch gleich"],
  [/^Search ?[Ww]ire:?$/, "Eigenname, englisch gleich"],
  [/^Features?$/, "englisch gleich"],
  [/^Lasso$/, "englisch gleich"],
  [/^idx$/, "Feldname aus der GeoJSON-Datei, nicht übersetzbar"],
  [/^Index:$/, "englisch ebenfalls „Index:“"],
  [/^Info:$/, "englisch ebenfalls „Info:“"],
  [/^Radius \(m\)$/, "englisch gleich"],

  /* Der Prüfbericht nennt den Anzeigenamen und eine Zahl - beides gleich */
  [/^Exclusion \d+: [\d.,]+ m²\.$/,
   "Anzeigename und Fläche; der Text ist englisch wortgleich, nur die Zahl wechselt"],

  /* Die Sprachumschaltung ist absichtlich zweisprachig beschriftet */
  [/^Deutsch$/, "Name der Sprache, steht in beiden Fassungen so da"],
  [/^English$/, "Name der Sprache, steht in beiden Fassungen so da"],
  [/^Deutsch \/ English$/, "zweisprachige Beschriftung des Umschalters"],
  [/^Sprache \/ Language$/, "zweisprachige Beschriftung des Umschalters"],

  /* Koordinatenachsen und Himmelsrichtungen */
  [/^(East \/ E|North \/ N) \(m\)$/, "Achsenbeschriftung, englisch gleich"],
  [/^[\d.,]+° \(0° East · 90° North\)$/,
   "Winkelangabe; „East“ und „North“ sind die Konvention und bleiben englisch"],

  /* Marke und Tastennamen */
  [/^Web Map Editor$/, "Produktname"],
  [/^GeoJSON · RTK · Polygon Editing$/, "Untertitel der Marke, bereits englisch"],
  [/^Esc:$/, "Tastenname, englisch gleich"],

  /*
   * Eine fluechtige Meldung mit Dezimalzahl wird beim Sprachwechsel VERWORFEN
   * und nicht uebersetzt - transientStatusCanGoStale() trifft schon wegen der
   * Zahl zu. Ein Woerterbucheintrag waere hier wirkungslos: er wuerde nie
   * angewendet. Nachgemessen an "→ East · 0,10 m": nach setLanguage("en")
   * steht dort der englische Leerlauftext, nicht der deutsche Rest.
   */
  [/^[←→↑↓] (West|East|North|South) · [\d.,]+ m$/,
   "fluechtige Verschiebemeldung mit Dezimalzahl - wird verworfen, nicht uebersetzt"],
  [/^\d+ Punkte · [←→↑↓] (West|East|North|South) · [\d.,]+ m$/,
   "dieselbe Meldung mit Punktzahl"],

  /* Aus der Testdatei, nicht aus dem Quelltext */
  [/^(unbekannt|kabel)$/, "properties.name der Testkarte - kein Text des Editors"],
  [/^[\w-]+\.geojson( \*)?$/, "Dateiname der Testkarte"],
];

/** Ist der Text eine bekannte Falschmeldung? Dann mit welcher Begründung? */
function falschmeldung(text) {
  for (const [muster, grund] of FALSCHMELDUNGEN) {
    if (muster.test(text)) return grund;
  }
  return null;
}

/* Reine Zahlen-, Koordinaten- und Symbolangaben sind nie uebersetzbar. */
const NUR_ZAHLEN = /^[\s\d.,:;()+\-–—·°%/*×x²³'"„“]*$/u;
const KOORDINATE = /^[EN][:\s]|^[-+]?\d[\d.,]*\s*(m|m²|°|px)?$/u;

const browser = await launchBrowser("scan-i18n");
if (!browser) process.exit(2);

const S = 111111;
const cm = (v) => Math.round(v * 100) / 100;
const rel = ([e, n]) => [cm(e) / S, cm(n) / S];

/* Die Delle nach innen laesst die Flaeche beim Reduzieren WACHSEN. */
const delle = [[0, 0], [10, 0.5], [20, 0], [20, 20], [0, 20], [0, 0]].map(rel);
/* Eine gezackte Kante schrumpft dagegen. */
const zacken = [[25, 0], [30, 0.4], [35, 0], [35, 10], [25, 10], [25, 0]].map(rel);

const KARTE_A = {
  type: "FeatureCollection",
  referenceOrigin: { lat: 52.5, lon: 13.4 },
  features: [
    { type: "Feature", properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        rel([-10, -10]), rel([40, -10]), rel([40, 40]), rel([-10, 40]), rel([-10, -10]),
      ]] } },
    { type: "Feature", idx: 0, properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [delle] } },
    { type: "Feature", idx: 1, properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [zacken] } },
    { type: "Feature", properties: { name: "search wire" },
      geometry: { type: "LineString",
        coordinates: [rel([25, 25]), rel([30, 25]), rel([35, 25])] } },
    { type: "Feature", properties: { name: "dockpoints" },
      geometry: { type: "LineString", coordinates: [rel([35, 35]), rel([38, 38])] } },
    { type: "Feature", properties: { name: "unbekannt" },
      geometry: { type: "LineString", coordinates: [rel([1, 1]), rel([2, 2])] } },
  ],
};

const KARTE_B = {
  type: "FeatureCollection",
  referenceOrigin: { lat: 52.51, lon: 13.4 },
  features: [
    { type: "Feature", properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        rel([60, 0]), rel([100, 0]), rel([100, 40]), rel([60, 40]), rel([60, 0]),
      ]] } },
  ],
};

/*
 * Karte B zum VERBINDEN - gleiche RTK-Basis wie Karte A, sonst sperrt der
 * Bezugspunkt-Konflikt das Verbinden und der Zustand entstuende nie.
 *
 * Sie traegt zwei Linien ohne erkennbaren Typ, eine mit und eine ohne Namen:
 * beschreibeUnbekannteLinie() hat genau diese zwei Faelle, und beide gehoeren
 * in denselben Satz. Search Wire und Docking-Pfad fehlen absichtlich - zwei
 * befuellte Singletons waeren ein Konflikt und sperrten das Verbinden.
 */
const KARTE_B_VERBINDEN = {
  type: "FeatureCollection",
  referenceOrigin: { lat: 52.5, lon: 13.4 },
  features: [
    { type: "Feature", properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        rel([60, 0]), rel([100, 0]), rel([100, 40]), rel([60, 40]), rel([60, 0]),
      ]] } },
    { type: "Feature", properties: { name: "kabel" },
      geometry: { type: "LineString",
        coordinates: [rel([62, 2]), rel([64, 4]), rel([66, 2])] } },
    { type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: [rel([70, 2]), rel([72, 4])] } },
  ],
};

const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 1000 });

/*
 * Das Verbinden fragt per window.confirm() nach. Playwright weist einen
 * Dialog ohne Handler ab - der Befehl liefe dann still ins Leere, und der
 * Zustand "verbunden" entstuende nie. Ein leeres Ergebnis saehe dabei aus wie
 * ein sauberer Befund.
 */
page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

/*
 * createMenueBefehl() verlangt ein check(). Dieses Werkzeug fuehrt keines -
 * es sichert nichts zu, sondern sucht. Ein gesperrter Menueeintrag ist hier
 * trotzdem ein harter Befund und keine Nebensache: der Zustand dahinter wird
 * dann nicht besucht, und das Ergebnis saehe sauber aus, obwohl die Suche ihn
 * nie gesehen hat. Genau davor warnt die Regel "eine Laufzeitsuche ist nur so
 * vollstaendig wie die Zustaende, die sie besucht hat". Deshalb laut melden;
 * den Abbruch besorgt der Helfer anschliessend selbst.
 */
const menueBefehl = createMenueBefehl(page, (name, bedingung, detail) => {
  if (bedingung) return;
  console.error(`  NICHT ERREICHT  ${name} - ${detail}`);
});

const treffer = new Map();

const sammle = async (zustand) => {
  const roh = await page.evaluate(() => {
    const raus = [];
    const ausgenommen = "script,style,code,pre";
    const pfad = (el) =>
      (el.closest("[id]")?.id ? `#${el.closest("[id]").id} ` : "") +
      el.tagName.toLowerCase();

    document.querySelectorAll("body *").forEach((el) => {
      if (el.matches(ausgenommen) || el.closest(ausgenommen)) return;

      el.childNodes.forEach((knoten) => {
        if (knoten.nodeType !== Node.TEXT_NODE) return;
        const norm = normalizeI18nText(knoten.nodeValue);
        if (!norm || translateGermanText(norm) !== norm) return;
        raus.push({ art: "text", t: norm, o: pfad(el) });
      });

      ["title", "aria-label", "placeholder"].forEach((attribut) => {
        if (!el.hasAttribute(attribut)) return;
        const norm = normalizeI18nText(el.getAttribute(attribut));
        if (!norm || translateGermanText(norm) !== norm) return;
        raus.push({ art: attribut, t: norm, o: pfad(el) });
      });
    });

    return raus;
  });

  let gezaehlt = 0;
  for (const t of roh) {
    if (NUR_ZAHLEN.test(t.t) || KOORDINATE.test(t.t)) continue;
    if (!/[A-Za-zÄÖÜäöüß]{3}/.test(t.t)) continue;

    const schluessel = `${t.art}|${t.t}`;
    if (!treffer.has(schluessel)) {
      treffer.set(schluessel, { art: t.art, t: t.t, o: t.o, z: new Set() });
    }
    treffer.get(schluessel).z.add(zustand);
    gezaehlt++;
  }

  console.error(`   [${zustand}] ${gezaehlt} Rohtreffer`);
};

const laden = async (selektor, name, inhalt) => {
  await page.locator(selektor).setInputFiles({
    name,
    mimeType: "application/geo+json",
    buffer: Buffer.from(typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt)),
  });
  await page.waitForTimeout(500);
};

try {
  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await sammle("leer");

  await laden("#fileInput", "a.geojson", KARTE_A);
  await openAllFolds(page);
  await sammle("geladen");

  /* Punktzustand mit Vergleichsblock: auswaehlen und verschieben. */
  const perimeterMarken = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  await perimeterMarken.nth(1).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  await openAllFolds(page);
  await sammle("punkt+vergleich");

  /* Reduzieren, beide Richtungen der Flaechenwarnung. */
  const reduziere = async (featureIndex, toleranz, zustand) => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await openAllFolds(page);
    await page.fill("#reduceToleranceInput", toleranz);
    await page.locator("#applyReduceToleranceBtn").click();
    await page.waitForTimeout(250);
    await openAllFolds(page);
    const knopf = page.locator(
      `[data-action="select-whole-feature"][data-feature-index="${featureIndex}"]`);
    if (await knopf.count()) {
      await knopf.click();
      await page.waitForTimeout(300);
    }
    await openAllFolds(page);
    if (await page.locator("#reduceApplyBtn").isEnabled()) {
      await page.locator("#reduceApplyBtn").click();
      await page.waitForTimeout(450);
    }
    await openAllFolds(page);
    await sammle(zustand);
  };

  await reduziere(2, "0,30", "reduzieren-schrumpfend");
  await reduziere(1, "0,60", "reduzieren-wachsend");

  /* Begradigen: zwei Punkte desselben Rings. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await perimeterMarken.nth(0).click();
  await perimeterMarken.nth(2).click({ modifiers: ["Control"] });
  await page.waitForTimeout(300);
  await openAllFolds(page);
  if (await page.locator("#straightenSelectionBtn").isEnabled()) {
    await page.locator("#straightenSelectionBtn").click();
    await page.waitForTimeout(400);
  }
  await openAllFolds(page);
  await sammle("begradigen");

  /* Rechtwinklig auf das ganze Feature. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await openAllFolds(page);
  const ganzes = page.locator('[data-action="select-whole-feature"][data-feature-index="0"]');
  if (await ganzes.count()) {
    await ganzes.click();
    await page.waitForTimeout(300);
  }
  await openAllFolds(page);
  if (await page.locator("#rectifyApplyBtn").isEnabled()) {
    await page.locator("#rectifyApplyBtn").click();
    await page.waitForTimeout(400);
  }
  await openAllFolds(page);
  await sammle("rechtwinklig");

  /* Pruefbericht mit Befunden. */
  await page.evaluate(() => validateActiveMap());
  await page.waitForTimeout(400);
  await openAllFolds(page);
  await sammle("pruefbericht");

  /* Messen mit zwei Punkten. */
  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);
  await page.locator("#svg").click({ position: { x: 200, y: 200 } });
  await page.waitForTimeout(150);
  await page.locator("#svg").click({ position: { x: 400, y: 300 } });
  await page.waitForTimeout(350);
  await sammle("messen");
  await page.locator("#clearMeasureBtn").click();
  await page.waitForTimeout(250);
  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);

  /* Zeichnen, abbrechen, Kreiswerkzeug. */
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);
  await page.locator("#svg").click({ position: { x: 300, y: 300 } });
  await page.waitForTimeout(250);
  await sammle("zeichnen");

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(400);
  await sammle("zeichnen-abgebrochen");

  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);
  await sammle("kreis");
  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(400);

  /* Verbinden-Fenster, ohne und mit Auftrennstelle. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await menueBefehl("Karte", "Karten verbinden…");
  await page.waitForTimeout(300);
  await sammle("verbinden-ungesetzt");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await perimeterMarken.nth(0).click();
  await perimeterMarken.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(300);
  await menueBefehl("Karte", "Karten verbinden…");
  await page.waitForTimeout(300);
  if (await page.locator("#setMergeCutBtn").isEnabled()) {
    await page.locator("#setMergeCutBtn").click();
    await page.waitForTimeout(450);
    await menueBefehl("Karte", "Karten verbinden…");
    await page.waitForTimeout(300);
  }
  await sammle("auftrennstelle-gesetzt");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /*
   * Verbinden mit Linien ohne erkennbaren Typ. Die Erfolgsmeldung entsteht nur
   * hier: sie zaehlt auf, was aus Karte B unveraendert uebernommen wurde, und
   * ist damit der einzige Zustand, in dem dieser Text ueberhaupt dasteht.
   */
  await laden("#secondFileInput", "b-verbinden.geojson", KARTE_B_VERBINDEN);
  await menueBefehl("Karte", "Karten verbinden…");
  await page.waitForTimeout(300);
  await page.locator("#mergeMapsBtn").click();
  await page.waitForTimeout(500);
  await openAllFolds(page);
  await sammle("verbunden");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /*
   * Weit herausgezoomt: erst dann meldet der Rasterhinweis, dass das feinere
   * Raster kleiner als ein Bildschirmpixel waere.
   */
  await menueBefehl("Ansicht", "Raster…");
  await page.waitForTimeout(250);
  await page.fill("#gridStepInput", "0,01");
  await page.locator("#gridStepInput").press("Enter");
  await page.waitForTimeout(250);
  for (let i = 0; i < 12; i++) {
    await page.locator("#zoomOutBtn").click();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(350);
  await sammle("herausgezoomt");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* Bezugspunktkonflikt und Ladefehler. */
  await laden("#secondFileInput", "b.geojson", KARTE_B);
  await openAllFolds(page);
  await sammle("bezugspunktkonflikt");

  await laden("#fileInput", "kaputt.geojson", "{ das ist kein JSON");
  await sammle("ladefehler");
} finally {
  const liste = [...treffer.values()].sort((a, b) => a.t.localeCompare(b.t, "de"));
  const bekannt = liste.filter((t) => falschmeldung(t.t));
  const neu = liste.filter((t) => !falschmeldung(t.t));

  console.log(`\n=== NEU (${neu.length}) - deutscher Text ohne englische Fassung`);
  for (const t of neu) {
    console.log(`[${t.art}] ${JSON.stringify(t.t)}\n        @ ${t.o}  {${[...t.z].join(",")}}`);
  }

  console.log(`\n=== BEKANNT (${bekannt.length}) - Falschmeldungen mit Begründung`);
  for (const t of bekannt) {
    console.log(`[${t.art}] ${JSON.stringify(t.t)}  - ${falschmeldung(t.t)}`);
  }

  const ungenutzt = FALSCHMELDUNGEN
    .filter(([muster]) => !liste.some((t) => muster.test(t.t)))
    .map(([muster]) => String(muster));
  if (ungenutzt.length) {
    console.log(`\n=== Einträge in FALSCHMELDUNGEN ohne Treffer (${ungenutzt.length})`);
    console.log("    " + ungenutzt.join(", "));
    console.log("    Sie filtern nichts mehr - entweder ist der Text weg oder er");
    console.log("    hat inzwischen eine Übersetzung. Beim nächsten Mal prüfen.");
  }

  await browser.close();
}
