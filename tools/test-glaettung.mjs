#!/usr/bin/env node
// Browsertest für die Kartenglättung (Umformen → Glätten).
//
// Geprüft wird nach der WIRKUNG, über sichtbaren Text, elementGetroffen() und
// die gespeicherte Datei - nicht über Funktionen des Editors. Die Geometrie,
// gegen die die Zusicherungen halten, rechnet dieser Test selbst nach: wie weit
// eine Linie auf der falschen Seite der alten liegt und wie weit beide
// voneinander abweichen, misst er mit eigenem Code an den Rohwerten der Datei.
//
// Die Beispiele sind so gewählt, dass Datei, Zwischenstand und Endergebnis
// verschieden sind: vor dem Glätten wird ein Punkt verschoben. Eine
// Zusicherung, die versehentlich gegen die Datei statt gegen den Zwischenstand
// prüft, risse dadurch.
//
// Die Grenzwerte liest der Test aus ihren Feldern, statt 2 cm anzunehmen, und
// zu jedem Grenzwert gibt es einen zweiten Wert mit anderem Ergebnis - sonst
// könnte die Einstellung wirkungslos sein, ohne dass es auffällt.
//
// Alle Karten werden synthetisch erzeugt. Einrichtung und Browsersuche siehe
// tools/browser-harness.mjs; wie die übrigen Browsertests bewusst NICHT Teil
// von tools/check-all.mjs.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-glaettung.mjs

import {
  createChecker,
  createMarkerKlicker,
  createMenueBefehl,
  createUmformwerkzeug,
  elementGetroffen,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-glaettung";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/* --- Karten -------------------------------------------------------------- */

/*
 * Ein Perimeter mit fünf Ecken zwischen 61 und 80 Grad Drehung - jede davon
 * wird geglättet - und eine längliche Exclusion mit sieben Ecken, an der der
 * Grenzwert der Exclusion den Ausschlag gibt (bei 0 m bleibt sie, wie sie
 * ist). Dazu eine Search Wire, die das Glätten nie anfasst.
 */
const PERIMETER = [[16.81, 11.41], [10.12, 15.47], [3.09, 10.19], [7.2, 1.51], [14.33, 1.85]];
const EXCLUSION = [[13.06, 8.03], [10.95, 9.63], [7.96, 9.92], [5.89, 8.02],
                   [6.66, 6.64], [9.56, 6.18], [12.7, 7.26]];
const SEARCH_WIRE = [[9, 12], [11, 12.5], [12, 12.2]];

/*
 * Eine Exclusion 1,3 cm neben der unteren Perimeterkante: ihre spitze Ecke
 * käme beim Glätten der Kante näher als der Mindestkorridor. Dieselbe
 * Exclusion einen Meter weiter oben ist die Gegenprobe.
 */
const ENG = [[9.5, 2.04], [10.7, 1.69], [11.9, 2.04], [11.5, 2.84], [9.9, 2.84]];
const WEIT = ENG.map(([x, y]) => [x, Math.round((y + 1) * 100) / 100]);

/*
 * Ein grob aufgenommener Baumring: er wird durch einen Kreis ersetzt, und
 * auch dort gibt der Grenzwert der Exclusion den Ausschlag - bei 0 m und bei
 * 0,02 m entstehen verschiedene Kreisvielecke.
 */
const BAUMRING = [[10.32, 11.25], [10.12, 11.57], [9.75, 11.71], [9.44, 11.52],
                  [9.28, 11.15], [9.47, 10.77], [9.9, 10.66], [10.17, 10.82]];

const ring = (punkte) => [...punkte, punkte[0]];

/*
 * Zwei Exclusions dicht am Perimeter. Glättet man die ganze Karte, wandern
 * alle Linien zugleich, und wo zwei neue Bögen einander zu nahe kommen,
 * bleibt einer von beiden stehen - der Perimeter hat dann 19 Punkte statt 23.
 * Ist nur ein Feature gewählt, zählen die anderen so, wie sie dastehen. Auf
 * dieser Karte unterscheidet sich das; gefunden durch eine Suche über 6800
 * Lagen, weil eine schlichte Exclusion den Unterschied nie zeigt.
 */
const DICHT_OBEN = [[9.33, 14.87], [9.72, 13.55], [10.89, 12.5], [12.35, 12.66],
                    [12.45, 13.48], [11.37, 14.57], [9.72, 15.09]];
const DICHT_UNTEN = [[6.16, 5.85], [6.04, 3.99], [7.04, 2.12], [8.97, 1.65],
                     [9.48, 2.64], [8.61, 4.52], [6.75, 5.94]];

/* Weitere Karten für die Gründe und Wirkungen, je in beiden Sprachen. */
/* Ein Loch, ganz innerhalb der Exclusion. */
const ZUM_LOCH = [[8.5, 7.5], [9.5, 7.5], [9.5, 8.5], [8.5, 8.5]];
const KLEIN = [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]];
const ACHTZEHNECK = Array.from({ length: 18 }, (_, i) => [
  Math.round((10 + 6 * Math.cos(2 * Math.PI * i / 18)) * 100) / 100,
  Math.round((8 + 6 * Math.sin(2 * Math.PI * i / 18)) * 100) / 100,
]);
const RECHTECK = [[0, 0], [20, 0], [20, 12], [0, 12]];
/* Zwei Ecken an einer Kante von 7 cm - dort hat kein Bogen Platz. */
const KURZE_KANTE = [[13.19, 8.01], [8.29, 14.86], [2.73, 12.86], [2.42, 5.06],
                     [5.25, 3], [11.37, 3.39], [11.44, 3.44]];
/*
 * Derselbe Baumring an der unteren Perimeterkante: 2 cm daneben käme sein
 * Kreis der Kante näher als der Mindestkorridor, 0,5 cm daneben findet das
 * Runden auf 1 cm keine Lage mehr. Er bleibt beide Male, wie er ist - und
 * zählt als EINE Stelle, nicht als acht Ecken.
 */
const RING_KORRIDOR = [[10.32, 2.24], [10.12, 2.56], [9.75, 2.7], [9.44, 2.51],
                       [9.28, 2.14], [9.47, 1.76], [9.9, 1.65], [10.17, 1.81]];
const RING_RASTER = [[10.32, 2.23], [10.12, 2.55], [9.75, 2.69], [9.44, 2.5],
                     [9.28, 2.13], [9.47, 1.75], [9.9, 1.64], [10.17, 1.8]];
/* Eine Exclusion, die die Perimeterecke bei (16,81 | 11,41) ganz überdeckt. */
const UEBER_ECKE = [[16.51, 11.11], [17.11, 11.11], [17.11, 11.71], [16.51, 11.71]];

function sammlung(perimeter, exclusions, extra = []) {
  return JSON.stringify({ type: "FeatureCollection", features: [
    ...perimeter.map((punkte) => ({ type: "Feature", properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [ring(punkte)] } })),
    ...exclusions.map((ringe, k) => ({ type: "Feature", properties: { name: "exclusion" }, idx: k,
      geometry: { type: "Polygon", coordinates: ringe.map(ring) } })),
    ...extra,
  ] });
}

function karte(exclusion, mitSearchWire = false) {
  const features = [
    { type: "Feature", properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [ring(PERIMETER)] } },
    { type: "Feature", properties: { name: "exclusion" }, idx: 0,
      geometry: { type: "Polygon", coordinates: [ring(exclusion)] } },
  ];

  if (mitSearchWire) {
    features.push({ type: "Feature", properties: { name: "search wire" },
      geometry: { type: "LineString", coordinates: SEARCH_WIRE } });
  }

  return JSON.stringify({ type: "FeatureCollection", features });
}

/* --- Eigene Geometrie, unabhängig vom Editor ------------------------------ */

function innen(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
        p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

function abstandStrecke(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function abstandRing(p, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    m = Math.min(m, abstandStrecke(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return m;
}

/* Jede Strecke des Rings alle 1 mm - Punkte und Strecken, nicht nur Punkte. */
function abgetastet(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.001));
    for (let j = 0; j < k; j++) {
      out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
  }
  return out;
}

/**
 * Wie weit liegt die neue Linie auf der falschen Seite der alten?
 * innenErlaubt: beim Perimeter true (außen ist falsch), bei einer Exclusion
 * false (innen ist falsch).
 */
function ueberstand(neu, alt, innenErlaubt) {
  let m = 0;
  for (const p of abgetastet(neu)) {
    if (innen(p, alt) !== innenErlaubt) m = Math.max(m, abstandRing(p, alt));
  }
  return m;
}

/** Wie weit geht die neue Linie auf die ERLAUBTE Seite? */
function aufErlaubterSeite(neu, alt, innenErlaubt) {
  let m = 0;
  for (const p of abgetastet(neu)) {
    if (innen(p, alt) === innenErlaubt) m = Math.max(m, abstandRing(p, alt));
  }
  return m;
}

/** Größter Abstand eines Punktes der einen Linie zur anderen, beide Richtungen. */
function abweichung(alt, neu) {
  let m = 0;
  for (const p of abgetastet(neu)) m = Math.max(m, abstandRing(p, alt));
  for (const p of abgetastet(alt)) m = Math.max(m, abstandRing(p, neu));
  return m;
}

/** Die Punkte eines Polygons ohne den Schlusspunkt. */
const offen = (feature) => feature.geometry.coordinates[0].slice(0, -1);

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const zahl = (text) => Number(String(text).trim().replace(",", "."));

/* --- Lauf ------------------------------------------------------------------ */

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /*
   * Marker werden ueber den gemeinsamen Helfer geklickt: die Angaben zur
   * Auswahl stehen unten rechts ueber der Karte und verdecken dort Marker,
   * sobald etwas ausgewaehlt ist. Der Helfer klappt sie ueber ihren Griff zu
   * und danach wieder auf - siehe tools/browser-harness.mjs.
   */
  const markerKlicken = createMarkerKlicker(page, check);
  const menueBefehl = createMenueBefehl(page, check);
  const umformwerkzeug = createUmformwerkzeug(page, check);

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  /* Eine Rückfrage beim Speichern wäre ein Befund, kein Klick ins Leere. */
  const dialoge = [];
  page.on("dialog", (dialog) => {
    dialoge.push(dialog.message());
    dialog.accept();
  });

  const load = async (body, name = "glaettung.geojson") => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.locator("#fileInput").setInputFiles({
      name, mimeType: "application/geo+json", buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await openAllFolds(page);

    /*
     * Glätten steht seit dem 06.10.2026 als Werkzeug in der Leiste; Knopf,
     * Vorschau und Einstellungen stehen im Inspektor, solange es gewaehlt ist.
     */
    await umformwerkzeug("smooth");
  };

  const herunterladen = async () => {
    const wartend = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await menueBefehl("Datei", "GeoJSON speichern");
    const ereignis = await wartend;
    if (!ereignis) return null;

    const stream = await ereignis.createReadStream();
    const teile = [];
    for await (const teil of stream) teile.push(teil);
    return JSON.parse(Buffer.concat(teile).toString());
  };

  const text = (id) =>
    page.evaluate((i) => document.getElementById(i)?.textContent.replace(/\s+/g, " ").trim() ?? null, id);

  const sprache = () => page.evaluate(() => currentLanguage);

  /* Sichtbar heißt getroffen - erst in den Blick rollen, dann messen. */
  const getroffen = async (selektor) => {
    const el = page.locator(selektor).first();
    if (await el.count()) await el.scrollIntoViewIfNeeded().catch(() => {});
    return elementGetroffen(page, selektor, { dy: 5 });
  };

  /* Enter übernimmt; mit taste = "Tab" das Verlassen des Feldes. */
  const setzeFeld = async (id, wert, taste = "Enter") => {
    await page.locator(`#${id}`).fill(wert);
    await page.locator(`#${id}`).press(taste);
    await page.waitForTimeout(400);
  };

  const feldwert = (id) => page.locator(`#${id}`).inputValue();

  const glaetten = async () => {
    const knopf = page.locator("#smoothApplyBtn");
    const frei = await knopf.isEnabled();
    check("der Knopf „Glätten“ ist frei", frei);
    if (!frei) return false;

    await knopf.scrollIntoViewIfNeeded();
    await knopf.click();
    await page.waitForTimeout(500);
    return true;
  };

  const knopfKlicken = async (id, name) => {
    const knopf = page.locator(`#${id}`);
    const sichtbar = await knopf.isVisible() && await knopf.isEnabled();
    check(`„${name}“ steht da und ist frei`, sichtbar);
    if (!sichtbar) return false;

    await knopf.scrollIntoViewIfNeeded();
    await knopf.click();
    await page.waitForTimeout(400);
    return true;
  };

  /* Die Vorschau, wie sie gezeichnet ist: je Feature die Linie aus dem Pfad. */
  const vorschauLinien = () => page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#toolPreviewGroup .smooth-preview-line").forEach((path) => {
      const zahlen = path.getAttribute("d").match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
      const punkte = [];
      for (let i = 0; i < zahlen.length; i += 2) punkte.push([zahlen[i], -zahlen[i + 1]]);
      out[path.dataset.featureIndex] = punkte.slice(0, -1);
    });
    return out;
  });

  const vorschauPunkte = () => page.evaluate(() =>
    [...document.querySelectorAll("#toolPreviewGroup .smooth-preview-point")].map((c) => ({
      fi: c.dataset.featureIndex,
      p: [Number(c.getAttribute("cx")), -Number(c.getAttribute("cy"))],
    })));

  const auswahlAufheben = async () => {
    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  };

  const ganzesFeature = async (index) => {
    await openAllFolds(page);
    const knopf = page.locator(
      `[data-action="select-whole-feature"][data-feature-index="${index}"]`);
    const da = (await knopf.count()) === 1;
    check(`Feature ${index} lässt sich über die Navigation ganz auswählen`, da);
    if (!da) return false;
    await knopf.click();
    await page.waitForTimeout(300);
    await openAllFolds(page);
    return true;
  };

  /* ===================================================================== */
  console.log("Ausgangslage: Datei laden, dann einen Zwischenstand herstellen");

  await load(karte(EXCLUSION, true));

  check("Vorbedingung: die Oberflaeche steht auf deutsch", (await sprache()) === "de");

  const datei = await herunterladen();
  check("die Datei laesst sich speichern", !!datei);

  /* Zwischenstand: Perimeterpunkt 0 um 0,4 m nach East. */
  const marker = page.locator('circle.vertex[data-vertex-key="0:0:0"]');
  await marker.click();
  await page.waitForTimeout(200);
  await page.locator("#pointEastInput").fill("17,21");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(300);
  await auswahlAufheben();

  const zwischen = await herunterladen();
  check("Zwischenstand: Punkt 0 steht jetzt bei 17,21",
    !!(zwischen && zwischen.features[0].geometry.coordinates[0][0][0] === 17.21),
    JSON.stringify(zwischen?.features[0].geometry.coordinates[0][0]));
  check("und der Zwischenstand ist nicht die Datei",
    !!(zwischen && datei && !gleich(zwischen.features, datei.features)));

  /* ===================================================================== */
  console.log("Ohne Auswahl: die Wirkung steht sichtbar beim Werkzeug");

  check("der Satz unter dem Knopf nennt die ganze Karte",
    (await text("smoothReason")) === "Glättet die ganze Karte – Perimeter und 1 Exclusion.",
    await text("smoothReason"));
  const grundSichtbar = await getroffen("#smoothReason");
  check("und er steht sichtbar da", grundSichtbar.ok, grundSichtbar.grund);

  check("die Felder tragen die Vorgaben, deutsch geschrieben",
    gleich([await feldwert("smoothSpacingInput"), await feldwert("smoothKnickInput"),
            await feldwert("smoothPerimeterLimitInput"), await feldwert("smoothExclusionLimitInput")],
           ["0,15", "25", "0,02", "0,02"]),
    [await feldwert("smoothSpacingInput"), await feldwert("smoothKnickInput"),
     await feldwert("smoothPerimeterLimitInput"), await feldwert("smoothExclusionLimitInput")].join(" | "));

  /* ===================================================================== */
  console.log("Vorschau und Abbrechen");

  check("vor dem Glaetten gibt es keine Vorschau",
    (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) === 0);

  if (await glaetten()) {
    const zusammenfassung = await text("smoothSummary");
    check("die Vorschau nennt Punkte vorher und nachher und die groesste Abweichung",
      /^Vorschau: 12 → \d+ Punkte, größte Abweichung \d+,\d+ m\.$/.test(zusammenfassung),
      zusammenfassung);
    const sichtbar = await getroffen("#smoothSummary");
    check("und sie steht sichtbar da", sichtbar.ok, sichtbar.grund);

    const linien = await vorschauLinien();
    check("ohne Auswahl zeigt die Vorschau Perimeter und Exclusion",
      gleich(Object.keys(linien).sort(), ["0", "1"]), Object.keys(linien).join(","));
    check("und neue Punkte als Marker",
      (await page.locator("#toolPreviewGroup .smooth-preview-point").count()) > 0);

    await knopfKlicken("smoothCancelBtn", "Abbrechen");

    check("nach dem Abbrechen ist die Vorschau weg",
      (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) === 0 &&
      (await page.locator("#toolPreviewGroup .smooth-preview-point").count()) === 0);
    check("und die Meldung sagt, dass die Karte unveraendert ist",
      (await text("editStatus")) === "Glätten abgebrochen – die Karte ist unverändert.",
      await text("editStatus"));

    const nachAbbruch = await herunterladen();
    check("Abbrechen laesst die Karte, wie sie war: der Zwischenstand",
      !!(nachAbbruch && gleich(nachAbbruch.features, zwischen.features)));
    check("und nicht etwa die Datei",
      !!(nachAbbruch && !gleich(nachAbbruch.features, datei.features)));
  }

  /* ===================================================================== */
  console.log("Anwenden ohne Auswahl: die ganze Karte aendert sich");

  let geglaettet = null;
  let meldung = null;

  if (await glaetten()) {
    await knopfKlicken("smoothConfirmBtn", "Anwenden");
    /* Vor dem Speichern lesen - das Speichern meldet sich selbst. */
    meldung = await text("editStatus");
    geglaettet = await herunterladen();
  }

  if (geglaettet && zwischen) {
    const perAlt = offen(zwischen.features[0]), perNeu = offen(geglaettet.features[0]);
    const excAlt = offen(zwischen.features[1]), excNeu = offen(geglaettet.features[1]);

    check("der Perimeter hat sich geaendert", !gleich(perAlt, perNeu));
    check("die Exclusion hat sich geaendert", !gleich(excAlt, excNeu));
    check("die Search Wire ist punktgleich geblieben",
      gleich(geglaettet.features[2].geometry.coordinates, zwischen.features[2].geometry.coordinates));
    check("und die Datei ist weder Zwischenstand noch Ausgangsdatei",
      !gleich(geglaettet.features, zwischen.features) &&
      !gleich(geglaettet.features, datei.features));

    /* Die Grenzwerte aus den Feldern, nicht als Zahl im Test. */
    const grenzePerimeter = zahl(await feldwert("smoothPerimeterLimitInput"));
    const grenzeExclusion = zahl(await feldwert("smoothExclusionLimitInput"));

    const perAussen = ueberstand(perNeu, perAlt, true);
    const excInnen = ueberstand(excNeu, excAlt, false);

    check("der Perimeter liegt hoechstens um den Grenzwert ausserhalb der Aufnahme",
      perAussen <= grenzePerimeter + 1e-6, `${perAussen.toFixed(5)} m bei ${grenzePerimeter} m`);
    check("die Exclusion liegt hoechstens um den Grenzwert innerhalb der Aufnahme",
      excInnen <= grenzeExclusion + 1e-6, `${excInnen.toFixed(5)} m bei ${grenzeExclusion} m`);
    check("nach innen hat der Perimeter keine Grenze: er schneidet weiter als den Grenzwert",
      aufErlaubterSeite(perNeu, perAlt, true) > grenzePerimeter,
      `${aufErlaubterSeite(perNeu, perAlt, true).toFixed(4)} m`);

    /* Die Meldung - Zahlen gegen eigene Rechnung. */
    const treffer = meldung?.match(
      /^Geglättet: (\d+) → (\d+) Punkte, größte Abweichung (\d+,\d+) m · mit Zurück rückgängig\.$/);
    check("die Meldung nennt Punkte vorher/nachher und die groesste Abweichung", !!treffer, meldung);

    if (treffer) {
      check("vorher: die Punkte des Zwischenstands",
        Number(treffer[1]) === perAlt.length + excAlt.length, `${treffer[1]}`);
      check("nachher: die Punkte der gespeicherten Datei",
        Number(treffer[2]) === perNeu.length + excNeu.length, `${treffer[2]}`);

      const gemessen = Math.max(abweichung(perAlt, perNeu), abweichung(excAlt, excNeu));
      check("die groesste Abweichung stimmt mit der Geometrie ueberein",
        Math.abs(zahl(treffer[3]) - gemessen) < 0.0006,
        `Meldung ${treffer[3]} m, gemessen ${gemessen.toFixed(5)} m`);
    }

    /* Ein Undo-Schritt holt den Zwischenstand zurück. */
    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    const zurueck = await herunterladen();
    check("ein Undo holt den Zwischenstand zurueck",
      !!(zurueck && gleich(zurueck.features, zwischen.features)));
  }

  /* ===================================================================== */
  console.log("Die Vorschau zeigt das Ergebnis");

  await auswahlAufheben();

  if (await glaetten()) {
    const linien = await vorschauLinien();
    const punkte = await vorschauPunkte();

    await knopfKlicken("smoothConfirmBtn", "Anwenden");
    const nach = await herunterladen();

    if (nach) {
      const nah = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
      const linieGleich = (vorschau, ergebnis) =>
        vorschau.length === ergebnis.length && vorschau.every((p, i) => nah(p, ergebnis[i]));

      check("die Vorschau des Perimeters ist Punkt fuer Punkt das Ergebnis",
        linieGleich(linien["0"] || [], offen(nach.features[0])),
        `${(linien["0"] || []).length} gegen ${offen(nach.features[0]).length} Punkte`);
      check("die Vorschau der Exclusion ist Punkt fuer Punkt das Ergebnis",
        linieGleich(linien["1"] || [], offen(nach.features[1])),
        `${(linien["1"] || []).length} gegen ${offen(nach.features[1]).length} Punkte`);

      const alt = [...offen(zwischen.features[0]), ...offen(zwischen.features[1])];
      const neuInDatei = [...offen(nach.features[0]), ...offen(nach.features[1])]
        .filter((p) => !alt.some((q) => nah(p, q)));
      check("die Marker der Vorschau sind genau die neuen Punkte",
        punkte.length === neuInDatei.length &&
          punkte.every(({ p }) => neuInDatei.some((q) => nah(p, q))),
        `${punkte.length} Marker, ${neuInDatei.length} neue Punkte`);
    }

    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
  }

  /* ===================================================================== */
  console.log("Eine Vorschau, deren Karte sich geaendert hat, faellt weg");

  /*
   * Das Undo eben hat das Glätten zurückgenommen; es lässt sich wiederholen.
   * Ein Wiederholen ändert die Karte, aber weder die Auswahl noch die
   * Einstellungen - also genau den Fall, den nur der Fingerabdruck der
   * Vorschau erkennt.
   */
  if (await glaetten()) {
    check("Vorbedingung: die Vorschau steht",
      (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) > 0);
    const wirkungVorher = await text("smoothReason");

    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(400);

    check("Vorbedingung: Ziel und Wirkung sind dieselben geblieben",
      (await text("smoothReason")) === wirkungVorher, await text("smoothReason"));
    check("nach dem Wiederholen ist die Vorschau weg",
      (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) === 0 &&
      (await page.locator("#toolPreviewGroup .smooth-preview-point").count()) === 0);
    check("und es gibt nichts mehr anzuwenden",
      !(await page.locator("#smoothConfirmBtn").isVisible()));

    const wiederholt = await herunterladen();
    check("Vorbedingung: das Wiederholen hat die Karte wirklich geaendert",
      !!(wiederholt && !gleich(wiederholt.features, zwischen.features)));

    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
  }

  /* ===================================================================== */
  console.log("Eine Vorschau, deren Maeherbreite sich geaendert hat, faellt weg");

  /*
   * Die halbe Mäherbreite ist der kleinste Bogenradius, der nicht ausgelassen
   * wird - sie geht in die Rechnung ein, wird aber in einem anderen Fenster
   * eingestellt, das nur neu zeichnet und den Inspektor nicht anfasst.
   */
  await auswahlAufheben();

  if (await glaetten()) {
    check("Vorbedingung: die Vorschau steht",
      (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) > 0 &&
      (await page.locator("#smoothConfirmBtn").isVisible()));

    await menueBefehl("Ansicht", "Mähroboter-Vorschau…");
    await page.waitForTimeout(250);
    const breiteVorher = await page.locator("#mowerWidthInput").inputValue();
    await page.fill("#mowerWidthInput", "0,50");
    await page.locator("#applyMowerSizeBtn").click();
    await page.waitForTimeout(400);

    check("nach einer anderen Maeherbreite ist die Vorschau weg",
      (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) === 0 &&
      (await page.locator("#toolPreviewGroup .smooth-preview-point").count()) === 0);
    check("und mit ihr der Kasten mit „Anwenden“",
      !(await page.locator("#smoothConfirmBtn").isVisible()) &&
        !(await page.locator("#smoothSummary").isVisible()));

    await page.fill("#mowerWidthInput", breiteVorher);
    await page.locator("#applyMowerSizeBtn").click();
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }

  /* ===================================================================== */
  console.log("Grenzwerte: aus dem Feld gelesen, und ein zweiter Wert wirkt");

  await auswahlAufheben();

  let vorgabe = null;
  if (await glaetten()) vorgabe = await vorschauLinien();

  /* Perimeter: 0 m statt der Vorgabe. Die wartende Vorschau folgt dem Feld. */
  await setzeFeld("smoothPerimeterLimitInput", "0");
  const perNull = await vorschauLinien();
  const grenzePerNull = zahl(await feldwert("smoothPerimeterLimitInput"));

  check("ein zweiter Grenzwert des Perimeters gibt einen anderen Perimeter",
    !!(vorgabe && perNull["0"] && !gleich(vorgabe["0"], perNull["0"])),
    `${vorgabe?.["0"]?.length} gegen ${perNull["0"]?.length} Punkte`);
  check("und der liegt hoechstens um diesen Grenzwert ausserhalb",
    !!(perNull["0"] && ueberstand(perNull["0"], offen(zwischen.features[0]), true) <= grenzePerNull + 1e-6),
    perNull["0"] && ueberstand(perNull["0"], offen(zwischen.features[0]), true).toFixed(5));
  check("die Exclusion bleibt dabei dieselbe",
    !!(vorgabe && perNull["1"] && gleich(vorgabe["1"], perNull["1"])));

  await setzeFeld("smoothPerimeterLimitInput", "0,02");

  /* Exclusion: 0 m statt der Vorgabe. */
  await setzeFeld("smoothExclusionLimitInput", "0");
  const excNull = await vorschauLinien();
  const grenzeExcNull = zahl(await feldwert("smoothExclusionLimitInput"));
  const excNullLinie = excNull["1"] || offen(zwischen.features[1]);

  check("ein zweiter Grenzwert der Exclusion gibt eine andere Exclusion",
    !!(vorgabe && !gleich(vorgabe["1"], excNullLinie)),
    `${vorgabe?.["1"]?.length} gegen ${excNullLinie.length} Punkte`);
  check("und die liegt hoechstens um diesen Grenzwert innerhalb",
    ueberstand(excNullLinie, offen(zwischen.features[1]), false) <= grenzeExcNull + 1e-6,
    ueberstand(excNullLinie, offen(zwischen.features[1]), false).toFixed(5));
  check("der Perimeter bleibt dabei derselbe",
    !!(vorgabe && excNull["0"] && gleich(vorgabe["0"], excNull["0"])));

  await setzeFeld("smoothExclusionLimitInput", "0,02");

  /* Ein negativer Wert wird abgelehnt - die Richtung steht fest. */
  for (const [id, satz] of [
    ["smoothPerimeterLimitInput", "Glätten: der Überstand des Perimeters muss eine Zahl ab 0 sein."],
    ["smoothExclusionLimitInput", "Glätten: der Überstand der Exclusion muss eine Zahl ab 0 sein."],
  ]) {
    await setzeFeld(id, "-0,01");
    check(`${id}: ein negativer Wert wird mit Begruendung abgelehnt`,
      (await text("smoothReason")) === satz, await text("smoothReason"));
    check(`${id}: und der Knopf ist gesperrt`,
      !(await page.locator("#smoothApplyBtn").isEnabled()));
    check(`${id}: eine wartende Vorschau faellt dabei weg`,
      (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) === 0);

    await setzeFeld(id, "0,02");
    check(`${id}: mit 0,02 ist der Knopf wieder frei`,
      await page.locator("#smoothApplyBtn").isEnabled());
  }

  /* Bogenpunktabstand und Knick wirken ebenso. */
  if (await glaetten()) vorgabe = await vorschauLinien();

  /* Diesmal mit Tab: auch das Verlassen des Feldes übernimmt den Wert. */
  await setzeFeld("smoothSpacingInput", "0,20", "Tab");
  check("ein zweiter Bogenpunktabstand gibt ein anderes Ergebnis",
    !gleich(vorgabe, await vorschauLinien()));
  await setzeFeld("smoothSpacingInput", "0,05");
  check("ein Bogenpunktabstand unter der Wegpunkttoleranz wird abgelehnt",
    (await text("smoothReason")) ===
      "Glätten: der Bogenpunktabstand muss mindestens 0,10 m betragen – das ist die Wegpunkttoleranz.",
    await text("smoothReason"));
  await setzeFeld("smoothSpacingInput", "0,15");

  if (await glaetten()) vorgabe = await vorschauLinien();

  await setzeFeld("smoothKnickInput", "40");
  check("ein zweiter Knick gibt ein anderes Ergebnis",
    !gleich(vorgabe, await vorschauLinien()));
  await setzeFeld("smoothKnickInput", "0");
  check("ein Knick von 0 Grad wird abgelehnt",
    (await text("smoothReason")) ===
      "Glätten: der Knick muss größer als 0 und kleiner als 180 Grad sein.",
    await text("smoothReason"));
  await setzeFeld("smoothKnickInput", "25");

  /* ===================================================================== */
  console.log("Mit Auswahl: nur das gewaehlte Feature aendert sich");

  for (const [index, anderer, name] of [[1, 0, "Exclusion #0"], [0, 1, "Perimeter"]]) {
    if (!(await ganzesFeature(index))) continue;

    check(`${name}: der Satz unter dem Knopf nennt nur dieses Feature`,
      (await text("smoothReason")) === `Glättet nur ${name}.`, await text("smoothReason"));

    if (!(await glaetten())) continue;

    check(`${name}: die Vorschau zeigt nur dieses Feature`,
      gleich(Object.keys(await vorschauLinien()), [String(index)]),
      Object.keys(await vorschauLinien()).join(","));

    await knopfKlicken("smoothConfirmBtn", "Anwenden");
    const nach = await herunterladen();

    if (nach) {
      check(`${name}: es hat sich geaendert`,
        !gleich(offen(nach.features[index]), offen(zwischen.features[index])));
      check(`${name}: das andere Feature ist punktgleich geblieben (Gegenprobe)`,
        gleich(nach.features[anderer].geometry.coordinates,
               zwischen.features[anderer].geometry.coordinates));
      check(`${name}: die Search Wire ebenso`,
        gleich(nach.features[2].geometry.coordinates, zwischen.features[2].geometry.coordinates));
    }

    /* Die Punktnummern zeigen danach auf andere Punkte - die Auswahl fällt. */
    check(`${name}: nach dem Anwenden ist die Auswahl aufgehoben, es wirkt wieder auf die ganze Karte`,
      (await text("smoothReason")) === "Glättet die ganze Karte – Perimeter und 1 Exclusion.",
      await text("smoothReason"));

    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await auswahlAufheben();
  }

  /* Die Search Wire wird nicht geglättet - abgelehnt mit Grund. */
  if (await ganzesFeature(2)) {
    check("Search Wire: abgelehnt mit Begruendung",
      (await text("smoothReason")) === "Glätten: nur Perimeter und Exclusions lassen sich glätten.",
      await text("smoothReason"));
    check("Search Wire: und der Knopf ist gesperrt",
      !(await page.locator("#smoothApplyBtn").isEnabled()));
    await auswahlAufheben();
  }

  /* ===================================================================== */
  console.log("Mit Auswahl: die anderen zaehlen, wie sie dastehen");

  /*
   * Ist ein Feature gewählt, wird nur dieses geglättet - die anderen sind
   * Nachbarn, so wie sie auf der Karte stehen. Daraus folgt eine Beziehung,
   * die sich ohne den Rechenkern prüfen lässt: das Ergebnis des gewählten
   * Perimeters hängt nicht am Grenzwert der Exclusions, und das einer
   * gewählten Exclusion nicht am Grenzwert des Perimeters. Rechnete das
   * Werkzeug die anderen Linien insgeheim mit, hinge es daran.
   */
  await load(sammlung([PERIMETER], [[DICHT_OBEN], [DICHT_UNTEN]]));

  /* Die Vorbedingung: auf dieser Karte wirken beide Grenzwerte überhaupt. */
  if (await glaetten()) {
    const beide = await vorschauLinien();
    await setzeFeld("smoothExclusionLimitInput", "0");
    const ohneExclusion = await vorschauLinien();
    await setzeFeld("smoothExclusionLimitInput", "0,02");
    await setzeFeld("smoothPerimeterLimitInput", "0");
    const ohnePerimeter = await vorschauLinien();
    await setzeFeld("smoothPerimeterLimitInput", "0,02");

    check("Vorbedingung: ganze Karte, der Grenzwert der Exclusions aendert die Exclusions",
      !gleich([beide["1"], beide["2"]], [ohneExclusion["1"], ohneExclusion["2"]]));
    check("Vorbedingung: ganze Karte, der Grenzwert des Perimeters aendert den Perimeter",
      !!beide["0"] && !gleich(beide["0"], ohnePerimeter["0"]));
    await knopfKlicken("smoothCancelBtn", "Abbrechen");
  }

  for (const [index, name, roh, fremd, eigen] of [
    [0, "Perimeter", PERIMETER, "smoothExclusionLimitInput", "smoothPerimeterLimitInput"],
    [1, "Exclusion #0", DICHT_OBEN, "smoothPerimeterLimitInput", "smoothExclusionLimitInput"],
  ]) {
    await auswahlAufheben();
    if (!(await ganzesFeature(index)) || !(await glaetten())) continue;

    /* Ohne Vorschaulinie bleibt das Feature, wie es ist - dann zählt es roh. */
    const ergebnis = async () => (await vorschauLinien())[String(index)] ?? roh;

    const vorgabe = await ergebnis();
    await setzeFeld(fremd, "0");
    const fremdNull = await ergebnis();
    await setzeFeld(fremd, "0,02");
    await setzeFeld(eigen, "0");
    const eigenNull = await ergebnis();
    await setzeFeld(eigen, "0,02");

    check(`${name} gewaehlt: es wird geglaettet`, !gleich(vorgabe, roh));
    check(`${name} gewaehlt: sein Ergebnis haengt nicht am Grenzwert der anderen`,
      gleich(vorgabe, fremdNull), `${vorgabe.length} gegen ${fremdNull.length} Punkte`);
    check(`${name} gewaehlt: am eigenen Grenzwert sehr wohl (Gegenprobe)`,
      !gleich(vorgabe, eigenNull), `${vorgabe.length} gegen ${eigenNull.length} Punkte`);

    await knopfKlicken("smoothCancelBtn", "Abbrechen");
  }

  await auswahlAufheben();

  /* ===================================================================== */
  console.log("Baumring: ein Kreis, und auch dort wirkt der Grenzwert");

  await load(karte(BAUMRING));

  if (await ganzesFeature(1) && await glaetten()) {
    const kreis = (await vorschauLinien())["1"] || [];
    const marker = (await vorschauPunkte()).filter(({ fi }) => fi === "1").length;

    check("der Baumring wird ein Vieleck aus lauter neuen Punkten",
      kreis.length >= 8 && marker === kreis.length, `${kreis.length} Punkte, ${marker} Marker`);

    const grenze = zahl(await feldwert("smoothExclusionLimitInput"));
    check("der Kreis liegt hoechstens um den Grenzwert innerhalb des Rings",
      ueberstand(kreis, BAUMRING, false) <= grenze + 1e-6,
      ueberstand(kreis, BAUMRING, false).toFixed(5));
    check("und umschliesst ihn sonst: er wird groesser, nicht kleiner",
      aufErlaubterSeite(kreis, BAUMRING, false) > 0);

    await setzeFeld("smoothExclusionLimitInput", "0");
    const kreisNull = (await vorschauLinien())["1"] || [];
    const grenzeNull = zahl(await feldwert("smoothExclusionLimitInput"));

    check("ein zweiter Grenzwert gibt einen anderen Kreis",
      kreisNull.length > 0 && !gleich(kreis, kreisNull), `${kreis.length} gegen ${kreisNull.length}`);
    check("und der liegt hoechstens um diesen Grenzwert innerhalb",
      kreisNull.length > 0 && ueberstand(kreisNull, BAUMRING, false) <= grenzeNull + 1e-6,
      ueberstand(kreisNull, BAUMRING, false).toFixed(5));
  }

  /* ===================================================================== */
  console.log("Ein Durchlass unter dem Mindestkorridor fuehrt zur Ablehnung");

  for (const [exclusion, eng] of [[ENG, true], [WEIT, false]]) {
    await load(karte(exclusion));
    if (!(await ganzesFeature(1))) continue;
    if (!(await glaetten())) continue;

    if (eng) {
      check("eng: das Glaetten wird abgelehnt",
        (await text("smoothSummary")) === "Glätten abgelehnt: dabei ändert sich nichts.",
        await text("smoothSummary"));
      check("eng: der Grund ist der Mindestkorridor",
        await page.evaluate(() => [...document.querySelectorAll("#smoothKeptList .smooth-kept-name")]
          .some((el) => el.textContent.trim() === "Mindestkorridor")),
        await text("smoothKeptList"));
      const grund = await getroffen("#smoothKeptList");
      check("eng: und die Begruendung steht sichtbar da", grund.ok, grund.grund);
      check("eng: es gibt nichts anzuwenden",
        !(await page.locator("#smoothConfirmBtn").isVisible()) &&
        (await page.locator("#toolPreviewGroup .smooth-preview-line").count()) === 0);

      /* Und die Begründung geht in beiden Richtungen mit. */
      await page.evaluate(() => setLanguage("en"));
      check("eng, deutsch erzeugt, dann englisch: die Ablehnung ist uebersetzt",
        (await text("smoothSummary")) === "Smoothing rejected: nothing would change.",
        await text("smoothSummary"));
      check("eng, dann englisch: der Grund ebenso",
        (await text("smoothKeptList")).includes("minimum corridor"), await text("smoothKeptList"));
      await page.evaluate(() => setLanguage("de"));
      check("eng, zurueck auf deutsch: wieder deutsch",
        (await text("smoothKeptList")).includes("Mindestkorridor"), await text("smoothKeptList"));

      /* Auf englisch erzeugt, dann deutsch. */
      await page.evaluate(() => setLanguage("en"));
      await glaetten();
      check("eng, englisch erzeugt: die Ablehnung ist englisch",
        (await text("smoothSummary")) === "Smoothing rejected: nothing would change." &&
          (await text("smoothKeptList")).includes("minimum corridor"),
        `${await text("smoothSummary")} / ${await text("smoothKeptList")}`);
      await page.evaluate(() => setLanguage("de"));
      check("eng, englisch erzeugt, dann deutsch: Ablehnung und Grund deutsch",
        (await text("smoothSummary")) === "Glätten abgelehnt: dabei ändert sich nichts." &&
          (await text("smoothKeptList")).includes("Mindestkorridor"),
        `${await text("smoothSummary")} / ${await text("smoothKeptList")}`);
    } else {
      check("einen Meter weiter weg wird dieselbe Exclusion geglaettet (Gegenprobe)",
        /^Vorschau: /.test(await text("smoothSummary")) &&
          gleich(Object.keys(await vorschauLinien()), ["1"]),
        await text("smoothSummary"));
    }
  }

  /* ===================================================================== */
  console.log("Sprachwechsel in beiden Richtungen");

  await load(karte(EXCLUSION, true));

  if (await glaetten()) {
    const de = await text("smoothSummary");
    const m = de.match(/^Vorschau: (\d+) → (\d+) Punkte, größte Abweichung (\d+),(\d+) m\.$/);
    check("deutsch erzeugt: die Vorschau ist deutsch, mit Komma", !!m, de);

    await page.evaluate(() => setLanguage("en"));
    const en = await text("smoothSummary");
    check("deutsch erzeugt, dann englisch: dieselben Zahlen, englisch, mit Punkt",
      !!m && en === `Preview: ${m[1]} → ${m[2]} points, largest deviation ${m[3]}.${m[4]} m.`, en);
    check("und die Wirkung unter dem Knopf ist englisch",
      (await text("smoothReason")) === "Smooths the whole map – perimeter and 1 exclusion.",
      await text("smoothReason"));
    check("und die Felder schreiben ihre Zahl englisch",
      (await feldwert("smoothPerimeterLimitInput")) === "0.02" &&
        (await feldwert("smoothSpacingInput")) === "0.15",
      `${await feldwert("smoothPerimeterLimitInput")} | ${await feldwert("smoothSpacingInput")}`);

    /* Neu erzeugt auf englisch, dann zurück. */
    await knopfKlicken("smoothCancelBtn", "Cancel");
    await glaetten();
    const en2 = await text("smoothSummary");
    const m2 = en2.match(/^Preview: (\d+) → (\d+) points, largest deviation (\d+)\.(\d+) m\.$/);
    check("englisch erzeugt: die Vorschau ist englisch, mit Punkt", !!m2, en2);

    await page.evaluate(() => setLanguage("de"));
    const de2 = await text("smoothSummary");
    check("englisch erzeugt, dann deutsch: dieselben Zahlen, deutsch, mit Komma",
      !!m2 && de2 === `Vorschau: ${m2[1]} → ${m2[2]} Punkte, größte Abweichung ${m2[3]},${m2[4]} m.`, de2);
    check("und die Felder wieder deutsch",
      (await feldwert("smoothPerimeterLimitInput")) === "0,02", await feldwert("smoothPerimeterLimitInput"));
    check("und die Wirkung unter dem Knopf wieder deutsch",
      (await text("smoothReason")) === "Glättet die ganze Karte – Perimeter und 1 Exclusion.",
      await text("smoothReason"));

    /* Die Meldung nach dem Anwenden: englisch erzeugt ist sie englisch. */
    await page.evaluate(() => setLanguage("en"));
    await knopfKlicken("smoothConfirmBtn", "Apply");
    const meldungEn = await text("editStatus");
    check("englisch angewendet: die Meldung ist englisch, mit Punkt",
      /^Smoothed: \d+ → \d+ points, largest deviation \d+\.\d+ m · use Undo to restore\.$/.test(meldungEn),
      meldungEn);

    await page.locator("#svg").focus().catch(() => {});
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await page.evaluate(() => setLanguage("de"));

    /*
     * Deutsch angewendet, dann englisch: eine Einmalmeldung mit Dezimalzahl
     * wird beim Sprachwechsel verworfen, statt halb in der alten Sprache
     * stehen zu bleiben (discardTransientStatus).
     */
    await glaetten();
    await knopfKlicken("smoothConfirmBtn", "Anwenden");
    check("deutsch angewendet: die Meldung ist deutsch",
      /^Geglättet: /.test(await text("editStatus")), await text("editStatus"));
    await page.evaluate(() => setLanguage("en"));
    const verworfen = await text("editStatus");
    check("dann englisch: kein deutscher Rest und kein deutsches Dezimalkomma",
      !/Geglättet|Punkte/.test(verworfen) && !/\d,\d/.test(verworfen), verworfen);
    await page.evaluate(() => setLanguage("de"));
  }

  /* ===================================================================== */
  console.log("Gruende und Wirkung, je deutsch, englisch und zurueck");

  /*
   * Abgeleitete Texte: sie werden beim Sprachwechsel neu gebaut. Gemessen
   * wird deutsch, dann nach setLanguage("en") englisch, dann nach
   * setLanguage("de") wieder deutsch - ohne Handlung dazwischen.
   */
  const zweisprachig = async (name, lesen, de, en) => {
    check(`${name}: deutsch`, (await lesen()) === de, await lesen());
    await page.evaluate(() => setLanguage("en"));
    check(`${name}: dann englisch`, (await lesen()) === en, await lesen());
    await page.evaluate(() => setLanguage("de"));
    check(`${name}: und zurueck deutsch`, (await lesen()) === de, await lesen());
  };

  const grund = () => text("smoothReason");
  const gruende = () => page.evaluate(() =>
    [...document.querySelectorAll("#smoothKeptList li")].map((li) => {
      const name = li.querySelector(".smooth-kept-name");
      const anzahl = li.querySelector(".smooth-kept-count");
      return name ? `${name.textContent.trim()}:${anzahl.textContent.trim()}` : li.textContent.trim();
    }).join(" | "));

  /* Ohne Karte. */
  await page.goto(indexUrl(), { waitUntil: "load" });
  await openAllFolds(page);
  await umformwerkzeug("smooth");
  await zweisprachig("ohne Karte", grund,
    "Glätten: keine Karte geladen.", "Smooth: no map loaded.");

  /* Beschriftungen, Erklärung im title und die festen Werte. */
  const beschriftung = () => page.evaluate(() => {
    const t = (el) => el.textContent.replace(/\s+/g, " ").trim();
    const feld = (id) => t(document.querySelector(`label[for="${id}"]`));
    return [
      t(document.getElementById("smoothApplyBtn")),
      feld("smoothSpacingInput"), feld("smoothKnickInput"),
      feld("smoothPerimeterLimitInput"), feld("smoothExclusionLimitInput"),
      t(document.getElementById("smoothConfirmBtn")),
    ].join(" | ");
  });
  await zweisprachig("die Beschriftungen", beschriftung,
    "Glätten | Bogenpunktabstand in Metern | Knick je Bogenpunkt in Grad | " +
      "Perimeter höchstens so weit nach außen (m) | Exclusion höchstens so weit nach innen (m) | Anwenden",
    "Smooth | Arc point spacing in metres | Bend per arc point in degrees | " +
      "Perimeter at most this far outwards (m) | Exclusion at most this far inwards (m) | Apply");
  await zweisprachig("die festen Werte", () => text("smoothFixedHint"),
    "Fest stehen der Mindestkorridor (0,01 m), die Wegpunkttoleranz (0,10 m), die Bogenweite " +
      "(0,25 m) und das Raster der neuen Punkte (0,01 m).",
    "Fixed are the minimum corridor (0.01 m), the waypoint tolerance (0.10 m), the arc reach " +
      "(0.25 m) and the grid of the new points (0.01 m).");
  await zweisprachig("die Erklaerung des Knopfes",
    () => page.locator("#smoothApplyBtn").getAttribute("title"),
    "Ersetzt scharfe Ecken durch Bögen und Baumringe durch Kreise. Perimeterecken werden nach " +
      "innen geschnitten, Exclusions wachsen; auf die falsche Seite geht keine Linie weiter als " +
      "der eingestellte Grenzwert. Erst erscheint eine Vorschau, übernommen wird mit „Anwenden“.",
    "Replaces sharp corners with arcs and tree rings with circles. Perimeter corners are cut " +
      "inwards, exclusions grow; no line goes further onto the wrong side than the set limit. " +
      "A preview comes first; Apply takes it over.");

  /* Der Hinweis im Mäherfenster nennt das Glätten - dort wird die Breite gesetzt. */
  await zweisprachig("der Hinweis im Maeherfenster",
    () => page.evaluate(() => document.querySelector("#mowerWindow .hint").textContent
      .replace(/\s+/g, " ").trim()),
    "Die Breite ist zugleich die Arbeitsbreite: sie ist die Schwelle der Korridorprüfung in " +
      "der Kartenprüfung, geht als Quadrat in die Flächenwarnung beim Reduzieren ein, und ihre " +
      "Hälfte ist beim Glätten der kleinste Bogenradius, der nicht ausgelassen wird.",
    "The width is also the working width: it is the threshold of the corridor check in map " +
      "validation, enters the area warning when reducing points as its square, and half of it " +
      "is the smallest arc radius that smoothing does not skip.");

  /* Die Ablehnungen der Felder. */
  for (const [id, wert, de, en] of [
    ["smoothSpacingInput", "0,05",
      "Glätten: der Bogenpunktabstand muss mindestens 0,10 m betragen – das ist die Wegpunkttoleranz.",
      "Smooth: the arc point spacing must be at least 0.10 m – that is the waypoint tolerance."],
    ["smoothKnickInput", "180",
      "Glätten: der Knick muss größer als 0 und kleiner als 180 Grad sein.",
      "Smooth: the bend must be greater than 0 and less than 180 degrees."],
    ["smoothPerimeterLimitInput", "-1",
      "Glätten: der Überstand des Perimeters muss eine Zahl ab 0 sein.",
      "Smooth: the perimeter limit must be a number of at least 0."],
    ["smoothExclusionLimitInput", "x",
      "Glätten: der Überstand der Exclusion muss eine Zahl ab 0 sein.",
      "Smooth: the exclusion limit must be a number of at least 0."],
  ]) {
    await load(sammlung([PERIMETER], []));
    const vorgabe = await feldwert(id);
    await setzeFeld(id, wert);
    await zweisprachig(`${id} = ${wert}`, grund, de, en);
    await setzeFeld(id, vorgabe);
  }

  /*
   * Bis zum 06.10.2026 stand hier die Kurzform des Faltblocks „Umformen“, die
   * das Glätten nannte, wo es ging. Der Faltblock ist entfallen; das Glätten
   * steht seitdem als Werkzeug in der Leiste, und sein Knopf dort erklärt sich
   * mit demselben Satz wie der Knopf im Inspektor - in beiden Sprachen.
   */
  await load(sammlung([PERIMETER], []));
  await zweisprachig("die Erklaerung in der Werkzeugleiste",
    () => page.locator("#smoothToolBtn").getAttribute("title"),
    "Ersetzt scharfe Ecken durch Bögen und Baumringe durch Kreise. Perimeterecken werden nach " +
      "innen geschnitten, Exclusions wachsen; auf die falsche Seite geht keine Linie weiter als " +
      "der eingestellte Grenzwert. Erst erscheint eine Vorschau, übernommen wird mit „Anwenden“.",
    "Replaces sharp corners with arcs and tree rings with circles. Perimeter corners are cut " +
      "inwards, exclusions grow; no line goes further onto the wrong side than the set limit. " +
      "A preview comes first; Apply takes it over.");

  /* Die Wirkung, je nach Karte. */
  await load(sammlung([PERIMETER], []));
  await zweisprachig("nur ein Perimeter", grund,
    "Glättet die ganze Karte – den Perimeter.", "Smooths the whole map – the perimeter.");

  await load(sammlung([PERIMETER], [[EXCLUSION], [WEIT]]));
  await zweisprachig("zwei Exclusions", grund,
    "Glättet die ganze Karte – Perimeter und 2 Exclusions.",
    "Smooths the whole map – perimeter and 2 exclusions.");

  if (await ganzesFeature(1)) {
    await zweisprachig("eine Exclusion gewaehlt", grund,
      "Glättet nur Exclusion #0.", "Smooths Exclusion #0 only.");
  }

  await load(karte(EXCLUSION, true));
  if (await ganzesFeature(2)) {
    await zweisprachig("die Search Wire gewaehlt", grund,
      "Glätten: nur Perimeter und Exclusions lassen sich glätten.",
      "Smooth: only perimeters and exclusions can be smoothed.");
  }

  /* Abgelehnt, je mit Grund. */
  await load(sammlung([KLEIN], []));
  await zweisprachig("unklarer Massstab", grund,
    "Glätten: der Maßstab ist unklar – geglättet wird in Metern.",
    "Smooth: the scale is unclear – smoothing works in metres.");

  await load(sammlung([PERIMETER, KLEIN.map(([x, y]) => [x + 9, y + 8])], []));
  await zweisprachig("zwei Perimeter", grund,
    "Glätten: die Karte braucht genau einen Perimeter.",
    "Smooth: the map needs exactly one perimeter.");

  await load(sammlung([PERIMETER], [[EXCLUSION, ZUM_LOCH]]));
  await zweisprachig("Exclusion mit Loch", grund,
    "Glätten: Exclusion #0 ist kein einfacher geschlossener Ring.",
    "Smooth: Exclusion #0 is not a simple closed ring.");

  /* Eine Auswahl über zwei Ringe desselben Features. */
  await markerKlicken("1:0:0");
  await markerKlicken("1:1:0", { modifiers: ["Control"] });
  await page.waitForTimeout(300);
  await zweisprachig("Auswahl ueber zwei Ringe", grund,
    "Glätten: die Auswahl muss zu genau einem Linienzug gehören.",
    "Smooth: the selection must belong to exactly one line.");

  /* Eine Auswahl über zwei Features. */
  await load(karte(EXCLUSION));
  await markerKlicken("0:0:0");
  await markerKlicken("1:0:0", { modifiers: ["Control"] });
  await page.waitForTimeout(300);
  await zweisprachig("Auswahl ueber zwei Features", grund,
    "Glätten: die Auswahl gehört zu mehreren Features. Ein Feature auswählen oder die " +
      "Auswahl aufheben – dann wirkt es auf die ganze Karte.",
    "Smooth: the selection belongs to several features. Select one feature, or clear the " +
      "selection – then it applies to the whole map.");

  /* Die Gründe ungeglätteter Stellen - hier ändert sich jeweils nichts. */
  await load(sammlung([ACHTZEHNECK], []));
  if (await glaetten()) {
    await zweisprachig("keine Ecke ueber der Schwelle", gruende,
      "Keine Ecke knickt um 25 Grad oder mehr.", "No corner bends by 25 degrees or more.");
  }

  await load(sammlung([RECHTECK], []));
  if (await glaetten()) {
    await zweisprachig("rechte Winkel: zu enge Boegen", gruende,
      "enger Bogen ausgelassen:4", "tight arc skipped:4");
    await zweisprachig("rechte Winkel: die Zahl der Stellen", () => text("smoothKeptHead"),
      "4 Stellen bleiben ungeglättet:", "4 places stay unsmoothed:");
  }

  await load(sammlung([PERIMETER], [[UEBER_ECKE]]));
  if (await ganzesFeature(0) && await glaetten()) {
    await zweisprachig("eine Exclusion ueber der Ecke", gruende,
      "andere Fläche im Weg:1 | Mindestkorridor:2", "another area in the way:1 | minimum corridor:2");
  }

  for (const [name, ringPunkte, de, en] of [
    ["Baumring am Rand, Korridor", RING_KORRIDOR, "Mindestkorridor:1", "minimum corridor:1"],
    ["Baumring am Rand, Raster", RING_RASTER, "Runden auf 1 cm:1", "rounding to 1 cm:1"],
  ]) {
    await load(sammlung([PERIMETER], [[ringPunkte]]));
    if (await ganzesFeature(1) && await glaetten()) {
      check(`${name}: abgelehnt, es aendert sich nichts`,
        (await text("smoothSummary")) === "Glätten abgelehnt: dabei ändert sich nichts.",
        await text("smoothSummary"));
      await zweisprachig(name, gruende, de, en);
      await zweisprachig(`${name}: der Ring zaehlt einmal`, () => text("smoothKeptHead"),
        "1 Stelle bleibt ungeglättet:", "1 place stays unsmoothed:");
    }
  }

  /* Mit Vorschau: die Stellen, die bleiben, stehen darunter. */
  await load(sammlung([KURZE_KANTE], []));
  if (await glaetten()) {
    await zweisprachig("kurze Kante", gruende,
      "Nachbarkante zu kurz:2", "neighbouring edge too short:2");
  }

  await load(karte(EXCLUSION));
  if (await glaetten()) {
    await zweisprachig("Wegpunkttoleranz", gruende, "Wegpunkttoleranz:5", "waypoint tolerance:5");
  }
  await setzeFeld("smoothPerimeterLimitInput", "0");
  if (await ganzesFeature(0) && await glaetten()) {
    await zweisprachig("eine einzige Stelle", () => text("smoothKeptHead"),
      "1 Stelle bleibt ungeglättet:", "1 place stays unsmoothed:");
  }

  /* Abbrechen auf englisch. */
  await page.evaluate(() => setLanguage("en"));
  await knopfKlicken("smoothCancelBtn", "Cancel");
  check("auf englisch abgebrochen: die Meldung ist englisch",
    (await text("editStatus")) === "Smoothing cancelled – the map is unchanged.",
    await text("editStatus"));
  await page.evaluate(() => setLanguage("de"));
  check("und zurueck auf deutsch: deutsch",
    (await text("editStatus")) === "Glätten abgebrochen – die Karte ist unverändert.",
    await text("editStatus"));

  check("keine Rueckfrage beim Speichern", dialoge.length === 0, dialoge.join(" | "));
  check("keine Fehler in der Konsole", consoleErrors.length === 0, consoleErrors.join(" | "));
} catch (error) {
  check("Lauf ohne Abbruch", false, String(error?.stack || error));
} finally {
  await browser.close();
}

finish("Glätten: Vorschau, Anwenden, Abbrechen, Grenzwerte, Auswahl und Sprachwechsel verhalten sich wie beschrieben.");
