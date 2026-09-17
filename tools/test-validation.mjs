#!/usr/bin/env node
// Browsertest für die erweiterte Geometrieprüfung.
//
// tools/test-geometry.mjs prüft die Verfahren selbst. Hier geht es um den
// Prüfbericht: dass die vier Befunde als WARNUNG und nicht als Fehler
// erscheinen, dass eine saubere Karte weiterhin ohne Befund durchläuft, dass
// die Korridorprüfung bei unbekanntem Maßstab als übersprungen gemeldet wird
// und dass die Meldungen übersetzt sind.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-validation.mjs

import {
  createChecker,
  elementGetroffen,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-validation";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/** Achsparalleles Rechteck als geschlossener Ring. */
const box = (x0, y0, x1, y1) => [
  [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
];

/**
 * Karte in rohen Metern - die Ausdehnung von 40 liegt weit über der Schwelle,
 * der Maßstab gilt damit als bekannt ("metrisch angenommen").
 */
function mapWith(exclusionRings, options = {}) {
  const size = options.size ?? 40;
  const features = [
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: {
        type: "Polygon",
        coordinates: [options.perimeter ?? box(0, 0, size, size)],
      },
    },
  ];

  exclusionRings.forEach((ring, index) => {
    features.push({
      type: "Feature",
      idx: index,
      properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  });

  return JSON.stringify({ type: "FeatureCollection", features });
}

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const validate = async (body, options = {}) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });

    /*
     * Hier wird VOR dem Pruefen umgeschaltet - der Bericht entsteht dann
     * gleich auf Englisch. Der Fall "auf Deutsch geprueft, dann umgeschaltet"
     * steht als eigener Abschnitt weiter unten: genau dort fror der Bericht
     * bis zum vierten Durchgang sein Zahlenformat ein, und eine Zusicherung,
     * die nur in der Zielsprache erzeugt, sah das nie.
     */
    if (options.englisch) {
      await page.locator("#languageToggle").click();
      await page.waitForTimeout(300);
    }

    await page.locator("#fileInput").setInputFiles({
      name: "check.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);

    await openAllFolds(page);

    await page.locator("#validateMapBtn").click();
    await page.waitForTimeout(400);

    return {
      report: await page.locator("#validationReport").textContent(),
      warnings: await page
        .locator("#validationReport .validation-item.warning")
        .allTextContents(),
      errors: await page
        .locator("#validationReport .validation-item.error")
        .allTextContents(),
      info: await page
        .locator("#validationReport .validation-item.info")
        .allTextContents(),
    };
  };

  /* Denselben, bereits dargestellten Bericht noch einmal auslesen - ohne
     neu zu pruefen und ohne weitere Handlung. */
  const berichtJetzt = async () => ({
    report: await page.locator("#validationReport").textContent(),
    warnings: await page
      .locator("#validationReport .validation-item.warning")
      .allTextContents(),
    info: await page
      .locator("#validationReport .validation-item.info")
      .allTextContents(),
  });

  const hasWarning = (result, needle) =>
    result.warnings.some((text) => text.includes(needle));

  /* ---------------------------------------------------------------- */
  console.log("Saubere Karte bleibt ohne Geometriebefund");

  const clean = await validate(mapWith([box(10, 10, 20, 20)]));

  check("keine Fehler", clean.errors.length === 0, clean.errors.join(" | "));
  check("kein Befund zum Perimeter",
    !hasWarning(clean, "Perimeter") || !hasWarning(clean, "außerhalb"),
    clean.warnings.join(" | "));
  check("keine Überlappung gemeldet",
    !hasWarning(clean, "überlappen"), clean.warnings.join(" | "));
  check("keine Selbstüberschneidung gemeldet",
    !hasWarning(clean, "überschneidet sich selbst"), clean.warnings.join(" | "));
  check("keine enge Stelle gemeldet",
    !hasWarning(clean, "Enge Stelle"), clean.warnings.join(" | "));

  /* Die Grenze der Korridorprüfung steht im Bericht, nicht nur in der Doku. */
  check("die Korridorprüfung nennt ihre Grenze",
    clean.info.some((text) =>
      text.includes("Wendekreis") && text.includes("nicht, dass ein Korridor befahrbar ist")),
    clean.info.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Exclusion außerhalb des Perimeters");

  const outside = await validate(mapWith([box(50, 50, 60, 60)]));

  check("wird gemeldet",
    hasWarning(outside, "liegt vollständig außerhalb des Perimeters"),
    outside.warnings.join(" | "));
  check("als Warnung, nicht als Fehler",
    !outside.errors.some((text) => text.includes("Perimeter")),
    outside.errors.join(" | "));

  const straddling = await validate(mapWith([box(35, 10, 45, 20)]));

  check("teilweise draußen wird unterschieden",
    hasWarning(straddling, "ragt über den Perimeterrand hinaus"),
    straddling.warnings.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Überlappende und verschachtelte Exclusions");

  const overlapping = await validate(
    mapWith([box(5, 5, 15, 15), box(10, 10, 20, 20)])
  );

  check("Überlappung wird gemeldet",
    hasWarning(overlapping, "überlappen sich"),
    overlapping.warnings.join(" | "));
  check("als Warnung, nicht als Fehler",
    overlapping.errors.length === 0, overlapping.errors.join(" | "));

  const nested = await validate(
    mapWith([box(5, 5, 25, 25), box(10, 10, 15, 15)])
  );

  check("Verschachtelung wird gemeldet",
    hasWarning(nested, "liegt vollständig in Exclusion"),
    nested.warnings.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Selbstüberschneidung");

  const bowtie = await validate(
    mapWith([[[5, 5], [15, 15], [15, 5], [5, 15], [5, 5]]])
  );

  check("die Schleife wird gefunden",
    hasWarning(bowtie, "überschneidet sich selbst"),
    bowtie.warnings.join(" | "));
  check("die Meldung nennt die Segmente",
    bowtie.warnings.some((text) => /Segment \d+→\d+ und Segment \d+→\d+/.test(text)),
    bowtie.warnings.join(" | "));

  /*
   * Nur der neue Befund muss eine Warnung sein. Dass die Schleife zusätzlich
   * "Fläche ist 0" auslöst, ist richtig und älter: die Gaußsche Trapezformel
   * liefert für eine Sanduhr 0, weil sich die beiden Hälften aufheben.
   */
  check("die Selbstüberschneidung ist kein Fehler",
    !bowtie.errors.some((text) => text.includes("überschneidet")),
    bowtie.errors.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Enger Korridor zwischen Perimeter und Exclusion");

  /* 20 cm Luft zur Ostkante bei 35 cm Arbeitsbreite. */
  const narrow = await validate(mapWith([box(10, 10, 39.8, 30)]));

  check("die enge Stelle wird gemeldet",
    hasWarning(narrow, "Enge Stelle"), narrow.warnings.join(" | "));
  check("der gemessene Abstand steht dabei",
    narrow.warnings.some((text) => text.includes("0,20 m")),
    narrow.warnings.join(" | "));
  check("die Mäherbreite wird genannt",
    narrow.warnings.some((text) => text.includes("0,35 m breit")),
    narrow.warnings.join(" | "));
  check("als Warnung, nicht als Fehler",
    narrow.errors.length === 0, narrow.errors.join(" | "));

  /*
   * Gegenprobe: derselbe Abstand INNERHALB der Exclusion darf nicht melden -
   * dort fährt der Mäher ohnehin nicht.
   */
  const insideSpike = await validate(mapWith([[
    [10, 10], [30, 10], [30, 20], [12, 20],
    [12, 19.8], [29.8, 19.8], [29.8, 10.2], [10, 10.2], [10, 10],
  ]]));

  check("enge Stelle innerhalb der Exclusion meldet nicht",
    !hasWarning(insideSpike, "Enge Stelle"),
    insideSpike.warnings.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Enge Stelle INNERHALB eines Features");

  /*
   * collectGeometryFindings() meldet enge Korridore in zwei Fassungen -
   * zwischen zwei Features und innerhalb eines einzelnen. Die zweite war bis
   * hierher durch keine Zusicherung abgedeckt: kein Test des Bestandes
   * erreichte den Zweig, und die Bauvorschrift "engeStelleInnerhalb" liess
   * sich einfrieren, ohne dass etwas riss.
   *
   * Der Zweig verlangt eine Engstelle, deren MITTE im maehbaren Bereich liegt
   * (pointIsMowable()). Genau daran scheitern die naheliegenden Formen: bei
   * einem U-foermigen Perimeter liegt die Mitte im Schlitz und damit
   * ausserhalb, bei einer U-foermigen Exclusion innerhalb der Exclusion.
   *
   * Was traegt, ist ein SANDUHRFOERMIGER Perimeter - zwei Kammern, verbunden
   * durch einen Hals. Der engste Abstand ist von Hand nachzurechnen: der Hals
   * misst 10,1 - 9,9 = 0,20 m, und der Maeher ist breiter.
   */
  const sanduhr = await validate(mapWith([], { perimeter: [
    [0, 0], [20, 0], [20, 9], [10.1, 9], [10.1, 11], [20, 11],
    [20, 20], [0, 20], [0, 11], [9.9, 11], [9.9, 9], [0, 9], [0, 0],
  ] }));

  /**
   * Zerlegt den Befund in seine Bestandteile - in beiden Sprachen ueber
   * dieselbe Stellung der Zahlen. Gelesen wird, was dasteht; nichts davon ist
   * als erwarteter Messwert im Test hinterlegt.
   */
  const engeStelle = (warnungen) => {
    const zeile = warnungen.find((text) =>
      text.includes("innerhalb von Feature") || text.includes("within feature"));

    if (!zeile) return null;

    /* Nur echte Zahlen, kein Satzzeichen: "(perimeter): 7 Stellen, engste"
       liefert mit [\d.,]+ auch das Komma und den Doppelpunkt als Treffer. */
    const zahlen = zeile.match(/\d+(?:[.,]\d+)?/g) || [];

    return { zeile, feature: zahlen[0], anzahl: zahlen[1],
             abstand: zahlen[2], breite: zahlen[zahlen.length - 1] };
  };

  const innenDe = engeStelle(sanduhr.warnings);

  check("die enge Stelle INNERHALB des Perimeters wird gemeldet",
    !!innenDe, sanduhr.warnings.join(" | "));

  if (innenDe) {
    check("sie nennt das Feature und seinen Typ",
      innenDe.zeile.includes("innerhalb von Feature 0 (perimeter)"),
      innenDe.zeile);

    /* Der Hals misst 10,1 - 9,9; die Zahl folgt aus der Karte, nicht aus einer
       Messung am Bildschirm. */
    check("deutsch: der engste Abstand ist der Hals der Sanduhr",
      innenDe.abstand === "0,20", innenDe.abstand);

    /* Die Maeherbreite wird nicht als Zahl erwartet, sondern gegen die Quelle
       gehalten, aus der die Pruefung sie nimmt. */
    const breiteImFeld = await page.locator("#mowerWidthInput").inputValue();

    check("deutsch: die genannte Breite ist die eingestellte Maeherbreite",
      innenDe.breite === breiteImFeld,
      `${innenDe.breite} gegen ${breiteImFeld}`);

    check("deutsch: die Zahlen tragen das Komma",
      !/\d\.\d/.test(innenDe.zeile), innenDe.zeile);

    check("als Warnung, nicht als Fehler",
      sanduhr.errors.length === 0, sanduhr.errors.join(" | "));

    /* Auf deutsch geprueft, dann umgeschaltet - die Richtung, in der der
       Bericht bis zum vierten Durchgang sein Zahlenformat einfror. */
    await page.evaluate(() => setLanguage("en"));

    const innenEn = engeStelle((await berichtJetzt()).warnings);

    check("auf deutsch geprueft, dann englisch: der Befund ist uebersetzt",
      !!innenEn && innenEn.zeile.includes("within feature 0 (perimeter)"),
      innenEn ? innenEn.zeile : "(kein Befund)");

    if (innenEn) {
      check("englisch: dieselben Zahlen, nur mit Punkt",
        innenEn.anzahl === innenDe.anzahl &&
        innenEn.abstand === innenDe.abstand.replace(",", ".") &&
        innenEn.breite === innenDe.breite.replace(",", "."),
        `${innenEn.anzahl}/${innenEn.abstand}/${innenEn.breite} gegen ` +
        `${innenDe.anzahl}/${innenDe.abstand}/${innenDe.breite}`);

      check("englisch: kein Komma als Dezimalzeichen",
        !/\d,\d/.test(innenEn.zeile), innenEn.zeile);
    }

    await page.evaluate(() => setLanguage("de"));

    check("und zurueck auf deutsch steht wieder der deutsche Befund da",
      (engeStelle((await berichtJetzt()).warnings) || {}).zeile === innenDe.zeile,
      (engeStelle((await berichtJetzt()).warnings) || {}).zeile);
  }

  /* Die Gegenrichtung: auf ENGLISCH geprueft, dann auf deutsch gemessen. */
  const sanduhrEn = await validate(mapWith([], { perimeter: [
    [0, 0], [20, 0], [20, 9], [10.1, 9], [10.1, 11], [20, 11],
    [20, 20], [0, 20], [0, 11], [9.9, 11], [9.9, 9], [0, 9], [0, 0],
  ] }), { englisch: true });

  const innenEnErzeugt = engeStelle(sanduhrEn.warnings);

  check("auf englisch erzeugt: der Befund steht englisch da",
    !!innenEnErzeugt &&
    innenEnErzeugt.zeile.includes("within feature 0 (perimeter)") &&
    innenEnErzeugt.abstand === "0.20",
    innenEnErzeugt ? innenEnErzeugt.zeile : sanduhrEn.warnings.join(" | "));

  if (innenEnErzeugt) {
    await page.evaluate(() => setLanguage("de"));

    const zurueck = engeStelle((await berichtJetzt()).warnings);

    check("auf englisch erzeugt, dann deutsch: der Befund traegt das Komma",
      !!zurueck &&
      zurueck.zeile.includes("innerhalb von Feature 0 (perimeter)") &&
      zurueck.abstand === "0,20",
      zurueck ? zurueck.zeile : "(kein Befund)");
  }

  /* ---------------------------------------------------------------- */
  console.log("Die Meterwerte des Berichts folgen der Sprache");

  /*
   * Bis Schritt D rechnete der Pruefbericht mit toFixed() und zeigte damit in
   * BEIDEN Sprachen einen Punkt - im Deutschen also durchgehend falsch. Seit
   * er durch formatMeters() laeuft, traegt er deutsch das Komma und englisch
   * den Punkt, und zwar an jeder seiner Meterstellen.
   *
   * Geprueft wird der sichtbare Berichtstext, nicht die Formatierfunktion.
   */
  const flaechen = await validate(mapWith([box(10, 10, 39.8, 30)]));

  check("deutsch: die Perimeterflaeche traegt das Komma",
    flaechen.info.some((text) => text.includes("Perimeterfläche: 1600,00 m²")),
    flaechen.info.join(" | "));
  check("deutsch: die Exclusionflaeche ebenfalls",
    flaechen.info.some((text) => text.includes("Exclusion 0: 596,00 m²")),
    flaechen.info.join(" | "));
  check("deutsch: die Korridorgrenze nennt die Maeherbreite mit Komma",
    flaechen.info.some((text) => text.includes("Mäherbreite von 0,35 m")),
    flaechen.info.join(" | "));
  check("deutsch: kein Punkt als Dezimalzeichen im ganzen Bericht",
    !/\d\.\d/.test(flaechen.report), flaechen.report);

  /*
   * Das auffaellig grosse Segment ist die fuenfte Meterstelle des Berichts und
   * braucht eine eigene Karte: gemeldet wird erst ueber 50 m UND ueber 75 %
   * der Kartendiagonale. Ein 300 x 10 m langes Rechteck reisst beide Schwellen.
   */
  const langes = await validate(mapWith([], {
    perimeter: box(0, 0, 300, 10),
  }));

  check("deutsch: das auffaellig grosse Segment traegt das Komma",
    langes.warnings.some((text) =>
      text.includes("Auffällig großes Segment") && text.includes("300,00 m")),
    langes.warnings.join(" | "));

  const flaechenEn = await validate(mapWith([box(10, 10, 39.8, 30)]),
    { englisch: true });

  check("englisch: die beiden Flaechen tragen den Punkt",
    flaechenEn.info.some((text) => text.includes("Perimeter area: 1600.00 m²")) &&
    flaechenEn.info.some((text) => text.includes("Exclusion 0: 596.00 m²")),
    flaechenEn.info.join(" | "));
  check("englisch: engste Stelle und Maeherbreite ebenfalls",
    flaechenEn.warnings.some((text) =>
      text.includes("narrowest 0.20 m") && text.includes("0.35 m wide")),
    flaechenEn.warnings.join(" | "));
  check("englisch: kein Komma als Dezimalzeichen im ganzen Bericht",
    !/\d,\d/.test(flaechenEn.report), flaechenEn.report);

  /*
   * Schritt 1, dritter Durchgang: der RANG jedes Befundes stand als
   * "Fehler: " / "Warnung: " / "Info: " in einem eigenen <strong> und hatte
   * keinen Woerterbucheintrag - die englische Oberflaeche zeigte ihn deutsch.
   * Geprueft wird die sichtbare Beschriftung, nicht das Woerterbuch.
   */
  check("deutsch: jeder Befund traegt seinen Rang als Beschriftung",
    flaechen.warnings.every((text) => text.startsWith("Warnung:")) &&
    flaechen.info.every((text) => text.startsWith("Info:")),
    flaechen.warnings.concat(flaechen.info).join(" | "));

  check("englisch: derselbe Rang ist uebersetzt",
    flaechenEn.warnings.every((text) => text.startsWith("Warning:")) &&
    flaechenEn.info.every((text) => text.startsWith("Info:")),
    flaechenEn.warnings.concat(flaechenEn.info).join(" | "));

  check("englisch: und kein Befund traegt noch die deutsche Beschriftung",
    !/(^|\s)(Warnung|Fehler):/.test(flaechenEn.report), flaechenEn.report);

  /* ---------------------------------------------------------------- */
  console.log("Einzahl und Mehrzahl in der Prüfmeldung");

  /*
   * "Kartenprüfung: 1 Warnungen." war in beiden Sprachen falsch - deutsch die
   * Mehrzahl bei eins, englisch "1 warnings". Der Quelltext unterscheidet
   * jetzt, und im Woerterbuch steht das Einzahlmuster VOR dem allgemeinen;
   * andernfalls faengt /^Kartenprüfung: (\d+) Warnungen\.$/ den Einzahlfall
   * ab, wie es "1 Fehler" schon einmal zu "1 errors" gemacht hat.
   *
   * Eine saubere Karte ohne Docking liefert genau eine Warnung; die Karte mit
   * Exclusion liefert mehrere. Beide Faelle werden in beiden Richtungen
   * geprueft - der Mehrzahlfall belegt, dass die Umstellung nicht einfach
   * ueberall die Einzahl schreibt.
   */
  const meldung = () => page.locator("#editStatus").textContent();

  await validate(mapWith([]));

  const eineDe = await meldung();
  check("deutsch: eine einzelne Warnung steht in der Einzahl",
    eineDe === "Kartenprüfung: 1 Warnung.", eineDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);
  const eineEn = await meldung();
  check("englisch: dieselbe Meldung ebenfalls in der Einzahl",
    eineEn === "Map validation: 1 warning.", eineEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);
  check("und sie kommt unverändert zurück",
    (await meldung()) === "Kartenprüfung: 1 Warnung.", await meldung());

  /* Mehrzahl: die Karte mit enger Stelle bringt eine zweite Warnung dazu. */
  await validate(mapWith([box(10, 10, 39.8, 30)]));

  const mehrDe = await meldung();
  check("deutsch: mehrere Warnungen bleiben in der Mehrzahl",
    /^Kartenprüfung: [2-9]\d* Warnungen\.$/.test(mehrDe), mehrDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);
  const mehrEn = await meldung();
  check("englisch: ebenfalls in der Mehrzahl",
    /^Map validation: [2-9]\d* warnings\.$/.test(mehrEn), mehrEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------------- */
  console.log("Der Bericht folgt einem Sprachwechsel NACH der Prüfung");

  /*
   * Bis zum vierten Durchgang legte die Pruefung fertig formatierte Texte ab.
   * Beim Sprachwechsel uebersetzte das Muster die Beschriftung und reichte die
   * Zahl als $1 unveraendert durch: es stand "Perimeter area: 1600,00 m²" mit
   * deutschem Komma unter englischer Beschriftung.
   *
   * Seitdem haelt ein Befund seine Rohwerte, und der Text entsteht erst beim
   * Darstellen. Zugesichert wird deshalb in BEIDEN Richtungen - in der einen
   * Sprache erzeugen, umschalten, messen. Der Wechsel laeuft ueber
   * setLanguage(), und gemessen wird unmittelbar danach: ein Klick auf
   * #languageToggle nimmt den Fokus, und jede Handlung dazwischen koennte
   * einen abgeleiteten Text neu bauen, der dadurch richtig aussieht.
   *
   * Neu geprueft wird dabei NICHT - der Bericht beschreibt weiterhin den
   * Stand, den die Pruefung vorgefunden hat.
   */
  await validate(mapWith([box(10, 10, 39.8, 30)]));

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);
  const nachEn = await berichtJetzt();

  check("auf deutsch geprüft, dann englisch: die Beschriftung ist übersetzt",
    nachEn.info.some((text) => text.includes("Perimeter area:")),
    nachEn.info.join(" | "));
  check("auf deutsch geprüft, dann englisch: die Zahl trägt den Punkt",
    nachEn.info.some((text) => text.includes("Perimeter area: 1600.00 m²")),
    nachEn.info.join(" | "));
  check("auf deutsch geprüft, dann englisch: kein Komma als Dezimalzeichen",
    !/\d,\d/.test(nachEn.report), nachEn.report);

  await validate(mapWith([box(10, 10, 39.8, 30)]), { englisch: true });

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);
  const nachDe = await berichtJetzt();

  check("auf englisch geprüft, dann deutsch: die Beschriftung ist deutsch",
    nachDe.info.some((text) => text.includes("Perimeterfläche:")),
    nachDe.info.join(" | "));
  check("auf englisch geprüft, dann deutsch: die Zahl trägt das Komma",
    nachDe.info.some((text) => text.includes("Perimeterfläche: 1600,00 m²")),
    nachDe.info.join(" | "));
  check("auf englisch geprüft, dann deutsch: kein Punkt als Dezimalzeichen",
    !/\d\.\d/.test(nachDe.report), nachDe.report);

  /* Auch die Warnung mit zwei Zahlen im selben Satz zieht mit. */
  check("auf englisch geprüft, dann deutsch: auch die enge Stelle trägt das Komma",
    nachDe.warnings.some((text) =>
      text.includes("engste 0,20 m") && text.includes("0,35 m breit")),
    nachDe.warnings.join(" | "));

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------------- */
  console.log("Unbekannter Maßstab: übersprungen, nicht bestanden");

  const ambiguous = await validate(mapWith([box(0.1, 0.1, 0.2, 0.2)], {
    perimeter: box(0, 0, 0.5, 0.5),
    size: 0.5,
  }));

  check("die Korridorprüfung meldet sich als übersprungen",
    ambiguous.info.some((text) => text.includes("übersprungen")),
    ambiguous.info.join(" | "));
  check("und behauptet keine enge Stelle",
    !hasWarning(ambiguous, "Enge Stelle"), ambiguous.warnings.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Übersetzung");

  /*
   * Erst umschalten, dann prüfen. Ein bereits gerenderter Bericht wird beim
   * Sprachwechsel nicht nachübersetzt - der Schnappschuss-Mechanismus kennt
   * nur die Knoten vom Seitenaufbau. Das gilt für alle Meldungen der
   * Kartenprüfung gleichermaßen, ist älter als diese Prüfungen und in
   * CLAUDE.md unter den offenen Punkten festgehalten.
   */
  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(300);

  await page.locator("#fileInput").setInputFiles({
    name: "check.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(mapWith([box(50, 50, 60, 60), box(52, 52, 62, 62)])),
  });
  await page.waitForTimeout(400);

  await openAllFolds(page);

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  const english = await page.locator("#validationReport").textContent();

  check("Befund außerhalb ist übersetzt",
    english.includes("lies completely outside the perimeter"), english.slice(0, 400));
  check("Befund Überlappung ist übersetzt",
    english.includes("overlap"), english.slice(0, 400));
  check("kein deutscher Resttext im Bericht",
    !english.includes("liegt vollständig außerhalb"), english.slice(0, 400));

  /* ---------------------------------------------------------------- */
  console.log("Loecher in Polygonen werden abgezogen");

  /*
   * Bis zu dieser Umstellung las die Flaechenrechnung nur coordinates[0].
   * Eine Sperrflaeche von 20 x 20 m mit einem Loch von 10 x 10 m stand mit
   * 400 statt 300 m² da - ein Drittel zu viel -, und ein MultiPolygon
   * lieferte 0 m². Gemessen wird deshalb der SICHTBARE Text der
   * Perimeterflaeche und nicht die Funktion.
   *
   * Die erwarteten Werte werden aus der Geometrie gerechnet, nicht als Zahl
   * gefuehrt - und zwar ueber die Bounding-Box achsparalleler Rechtecke. Das
   * ist absichtlich NICHT dieselbe Rechnung wie im Bestand: eine Kopie der
   * Shoelace-Formel traege denselben Fehler wie sie.
   */
  const rechteckFlaeche = (ring) => {
    const xs = ring.map((punkt) => punkt[0]);
    const ys = ring.map((punkt) => punkt[1]);

    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };

  /* Das Zahlenformat kommt aus der QUELLE, damit kein Dezimalzeichen als
     Literal im Test steht. Der WERT stammt aus der Rechnung darueber. */
  const alsFlaechentext = (wert) =>
    page.evaluate((w) => `${formatMeters(w, 1, 1)} m²`, wert);

  const karte = (features) =>
    JSON.stringify({ type: "FeatureCollection", features });

  const perimeterMit = (coordinates, type = "Polygon") => ({
    type: "Feature",
    properties: { name: "perimeter" },
    geometry: { type, coordinates },
  });

  const flaechentext = () => page.locator("#areaStat").textContent();

  /* --- Polygon mit Loch: die Differenz ---------------------------- */
  const AUSSEN = box(10, 10, 30, 30);
  const LOCH = box(15, 15, 25, 25);

  check("die drei Werte sind wirklich verschieden",
    rechteckFlaeche(AUSSEN) !== rechteckFlaeche(LOCH) &&
    rechteckFlaeche(AUSSEN) !== rechteckFlaeche(AUSSEN) - rechteckFlaeche(LOCH),
    `${rechteckFlaeche(AUSSEN)} / ${rechteckFlaeche(LOCH)}`);

  await validate(karte([perimeterMit([AUSSEN, LOCH])]));

  const erwartetMitLoch =
    await alsFlaechentext(rechteckFlaeche(AUSSEN) - rechteckFlaeche(LOCH));
  const gezeigtMitLoch = await flaechentext();

  check("Polygon mit Loch: die gezeigte Flaeche ist die Differenz",
    gezeigtMitLoch === erwartetMitLoch,
    `gezeigt ${gezeigtMitLoch}, erwartet ${erwartetMitLoch}`);
  check("und nicht der aeussere Ring allein",
    gezeigtMitLoch !== (await alsFlaechentext(rechteckFlaeche(AUSSEN))),
    gezeigtMitLoch);

  /*
   * Die Zeile ist wirklich zu sehen und nicht nur im DOM: elementFromPoint()
   * antwortet, was der Browser an dieser Stelle zeichnet - ein abschneidender
   * Vorfahr sitzt eine Ebene hoeher und bliebe sonst unsichtbar.
   */
  check("und sie steht sichtbar da",
    await elementGetroffen(page, "#areaStat"));

  /* --- MultiPolygon: die Summe, nicht 0 --------------------------- */
  const TEIL_A = box(0, 0, 8, 8);
  const TEIL_A_LOCH = box(2, 2, 4, 4);
  const TEIL_B = box(12, 0, 15, 3);

  await validate(karte([
    perimeterMit([[TEIL_A, TEIL_A_LOCH], [TEIL_B]], "MultiPolygon"),
  ]));

  const erwartetMulti = await alsFlaechentext(
    rechteckFlaeche(TEIL_A) - rechteckFlaeche(TEIL_A_LOCH) + rechteckFlaeche(TEIL_B)
  );
  const gezeigtMulti = await flaechentext();

  check("MultiPolygon: die gezeigte Flaeche ist die Summe seiner Teile",
    gezeigtMulti === erwartetMulti,
    `gezeigt ${gezeigtMulti}, erwartet ${erwartetMulti}`);
  check("und nicht null",
    gezeigtMulti !== (await alsFlaechentext(0)), gezeigtMulti);
  check("und auch im MultiPolygon ist das Loch abgezogen",
    gezeigtMulti !== (await alsFlaechentext(
      rechteckFlaeche(TEIL_A) + rechteckFlaeche(TEIL_B))),
    gezeigtMulti);

  /* --- Gegenprobe ohne Loch: unveraendert ------------------------- */
  const OHNE_LOCH = box(0, 0, 40, 40);

  await validate(karte([perimeterMit([OHNE_LOCH])]));

  check("Polygon ohne Loch: die gezeigte Flaeche ist der Ring selbst",
    (await flaechentext()) === (await alsFlaechentext(rechteckFlaeche(OHNE_LOCH))),
    await flaechentext());

  /* --- der Ring eines Lochs wird geprueft ------------------------- */
  /*
   * Ein Loch ist bearbeitbar - enumerateEditableVertices() laeuft seit jeher
   * ueber alle Ringe -, wurde aber von keiner Pruefung angesehen. Beide
   * Meldungen nennen das Loch beim Namen; ohne das stuenden bei zwei
   * fehlerhaften Loechern zwei gleichlautende Saetze untereinander.
   */
  const fehlerJetzt = () => page
    .locator("#validationReport .validation-item.error")
    .allTextContents();

  const kaputteLoecher = karte([
    perimeterMit([box(0, 0, 40, 40), [[5, 5], [7, 5], [5, 7]]]),
    {
      type: "Feature",
      idx: 0,
      properties: { name: "exclusion" },
      geometry: {
        type: "Polygon",
        coordinates: [
          box(10, 10, 30, 30),
          [[15, 15], [25, 15], [25, 25], [15, 25]],
        ],
      },
    },
  ]);

  const loecher = await validate(kaputteLoecher);

  check("das entartete Loch des Perimeters wird gemeldet",
    loecher.errors.some((text) =>
      text.includes("Perimeter 1, Loch 1: weniger als 3 Eckpunkte plus Schließpunkt.")),
    loecher.errors.join(" | "));
  check("das offene Loch der Exclusion ebenfalls",
    loecher.errors.some((text) =>
      text.includes("Exclusion 0, Loch 1: Polygonring ist nicht geschlossen.")),
    loecher.errors.join(" | "));
  check("und der aeussere Ring beider bleibt unbeanstandet",
    !loecher.errors.some((text) =>
      text.includes("Perimeter 1: Polygonring ist nicht geschlossen.") ||
      text.includes("Exclusion 0: Polygonring ist nicht geschlossen.")),
    loecher.errors.join(" | "));

  /* auf deutsch erzeugt, dann englisch gemessen */
  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(300);

  const loecherEn = await fehlerJetzt();

  check("auf deutsch erzeugt, dann englisch: das Perimeterloch ist uebersetzt",
    loecherEn.some((text) =>
      text.includes("Perimeter 1, hole 1: fewer than 3 corner points plus closing point.")),
    loecherEn.join(" | "));
  check("auf deutsch erzeugt, dann englisch: das Exclusionloch ebenfalls",
    loecherEn.some((text) =>
      text.includes("Exclusion 0, hole 1: polygon ring is not closed.")),
    loecherEn.join(" | "));

  /* und die Gegenrichtung: auf englisch erzeugt, dann deutsch gemessen */
  await validate(kaputteLoecher, { englisch: true });

  const erzeugtEn = await fehlerJetzt();

  check("auf englisch erzeugt: die beiden Loecher stehen englisch da",
    erzeugtEn.some((text) => text.includes("hole 1: fewer than 3 corner points")) &&
    erzeugtEn.some((text) => text.includes("hole 1: polygon ring is not closed")),
    erzeugtEn.join(" | "));

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(300);

  const zurueckDe = await fehlerJetzt();

  check("auf englisch erzeugt, dann deutsch: beide stehen wieder deutsch da",
    zurueckDe.some((text) =>
      text.includes("Perimeter 1, Loch 1: weniger als 3 Eckpunkte plus Schließpunkt.")) &&
    zurueckDe.some((text) =>
      text.includes("Exclusion 0, Loch 1: Polygonring ist nicht geschlossen.")),
    zurueckDe.join(" | "));

  /* --- ein Lochbefund ist ein Sprungziel ------------------------- */
  /*
   * findValidationTarget() erkannte "^Perimeter (\d+)[:\s]" - und hinter der
   * Zahl steht bei einem Loch ein KOMMA. Bei EINEM Perimeter fing der
   * Anzeigename den Fall noch auf ("Perimeter" kommt genau einmal vor); bei
   * ZWEIEN ist der Name mehrdeutig, und der Befund war kein Sprungziel mehr.
   * Gemessen wird deshalb an zwei Perimetern.
   *
   * Die Exclusion war nie eines, auch ohne Loch und auch bei nur einer: ueber
   * den Anzeigenamen sucht die Funktion "Exclusion #0", die Meldung sagt
   * "Exclusion 0".
   */
  const befund = (needle) => page.evaluate((text) => {
    const treffer = [...document.querySelectorAll("#validationReport .validation-item")]
      .find((el) => el.textContent.includes(text));

    if (!treffer) return { gefunden: false };

    return {
      gefunden: true,
      knopf: treffer.tagName === "BUTTON",
      ziel: treffer.dataset.validationTarget ?? null,
    };
  }, needle);

  const kaputtesLoch = [[55, 5], [57, 5], [55, 7]];

  await validate(karte([
    perimeterMit([box(0, 0, 40, 40)]),
    perimeterMit([box(50, 0, 90, 40), kaputtesLoch]),
    {
      type: "Feature",
      idx: 0,
      properties: { name: "exclusion" },
      geometry: {
        type: "Polygon",
        coordinates: [box(10, 10, 30, 30), [[15, 15], [25, 15], [25, 25], [15, 25]]],
      },
    },
  ]));

  /* Die Vorbedingung selbst zugesichert: mit nur einem Perimeter traege der
     Anzeigename den Fall, und die Messung sagte ueber das Muster nichts. */
  check("die Karte hat wirklich zwei Perimeter",
    (await page.evaluate(() =>
      (data.features || []).filter((f) => getFeatureType(f) === "perimeter").length)) === 2);

  const perimeterLoch = await befund("Perimeter 2, Loch 1:");
  const exclusionLoch = await befund("Exclusion 0, Loch 1:");

  check("das Loch des zweiten Perimeters ist ein anspringbarer Knopf",
    perimeterLoch.knopf === true, JSON.stringify(perimeterLoch));
  check("und es zeigt auf den zweiten Perimeter",
    perimeterLoch.ziel === "1", JSON.stringify(perimeterLoch));
  check("das Exclusionloch ist ebenfalls ein Knopf",
    exclusionLoch.knopf === true, JSON.stringify(exclusionLoch));
  check("und es zeigt auf die Exclusion",
    exclusionLoch.ziel === "2", JSON.stringify(exclusionLoch));

  /*
   * Die Wirkung, nicht das Attribut: der Klick waehlt das Feature wirklich
   * aus. Ein data-validation-target am Knopf bewiese nur die Absicht.
   */
  const gewaehlteFeatures = () => page.evaluate(() =>
    [...new Set(getEffectiveSelectedVertices().map((d) => d.featureIndex))]);

  check("vor dem Klick ist nichts ausgewaehlt",
    (await gewaehlteFeatures()).length === 0);

  await page.locator("#validationReport .validation-item", {
    hasText: "Exclusion 0, Loch 1:",
  }).first().click();
  await page.waitForTimeout(300);

  check("der Klick auf den Lochbefund waehlt die Exclusion aus",
    JSON.stringify(await gewaehlteFeatures()) === "[2]",
    JSON.stringify(await gewaehlteFeatures()));

  /* --- die Flaechenzeile des Inspektors kennt MultiPolygon -------- */
  /*
   * polygonAreaMeters() summiert seit der Lochumstellung auch MultiPolygone -
   * der Inspektor zeigte die Zeile trotzdem nicht, weil sie an
   * geometry.type === "Polygon" hing. Damit wurde ein Wert, den es gibt und
   * der berechenbar ist, wie ein Wert behandelt, den es fuer diesen Typ nicht
   * gibt: genau die Verwechslung, die die Hausregel "Weglassen oder
   * Gedankenstrich" verbietet.
   */
  const MP_A = box(5, 5, 15, 15);
  const MP_A_LOCH = box(8, 8, 12, 12);
  const MP_B = box(20, 20, 26, 26);

  await validate(karte([
    perimeterMit([box(0, 0, 40, 40)]),
    {
      type: "Feature",
      idx: 0,
      properties: { name: "exclusion" },
      geometry: { type: "MultiPolygon", coordinates: [[MP_A, MP_A_LOCH], [MP_B]] },
    },
  ]));

  await openAllFolds(page);
  await page
    .locator('[data-action="select-whole-feature"][data-feature-index="1"]')
    .first()
    .click();
  await page.waitForTimeout(300);
  await openAllFolds(page);

  const zeileSichtbar = await page.evaluate(() => {
    const zeile = document.getElementById("featureAreaRow");

    return Boolean(zeile) && !zeile.hidden &&
      getComputedStyle(zeile).display !== "none";
  });

  check("MultiPolygon: die Flaechenzeile des Inspektors steht da",
    zeileSichtbar === true);

  const erwartetInspektor = await page.evaluate(
    (wert) => `${formatMeters(wert, 1)} m²`,
    rechteckFlaeche(MP_A) - rechteckFlaeche(MP_A_LOCH) + rechteckFlaeche(MP_B)
  );
  const gezeigtInspektor = await page.locator("#featureAreaStat").textContent();

  check("und sie nennt die Summe der Teile, Loch abgezogen",
    gezeigtInspektor === erwartetInspektor,
    `gezeigt ${gezeigtInspektor}, erwartet ${erwartetInspektor}`);
  check("und sie steht sichtbar da",
    await elementGetroffen(page, "#featureAreaStat"));

  /* --- die Perimetermeldungen haben eine englische Fassung -------- */
  /*
   * Die drei Ringmeldungen des Perimeters und sein Flaechenfehler standen im
   * Englischen deutsch da, waehrend ihre drei Exclusion-Geschwister seit
   * jeher uebersetzt sind.
   */
  const kaputtePerimeter = karte([
    /* 1: vier Punkte, aber der Ring schliesst nicht */
    perimeterMit([[[0, 0], [40, 0], [40, 40], [0, 40]]]),
    /* 2: zu wenige Punkte */
    perimeterMit([[[0, 50], [10, 50], [0, 60]]]),
    /* 3: gar kein Polygon */
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "LineString", coordinates: [[0, 70], [10, 70]] },
    },
    /* 4: geschlossen, aber kollinear - Flaeche 0 */
    perimeterMit([[[0, 80], [10, 80], [20, 80], [0, 80]]]),
  ]);

  const vierDe = await validate(kaputtePerimeter);

  const DEUTSCH = [
    "Perimeter 1: Polygonring ist nicht geschlossen.",
    "Perimeter 2: weniger als 3 Eckpunkte plus Schließpunkt.",
    "Perimeter 3: Geometrietyp ist nicht Polygon.",
    "Perimeter 4: Fläche ist 0 oder ungültig.",
  ];
  const ENGLISCH = [
    "Perimeter 1: polygon ring is not closed.",
    "Perimeter 2: fewer than 3 corner points plus closing point.",
    "Perimeter 3: geometry type is not Polygon.",
    "Perimeter 4: area is 0 or invalid.",
  ];

  DEUTSCH.forEach((text, index) => {
    check(`deutsch: Perimeterbefund ${index + 1} steht da`,
      vierDe.errors.some((zeile) => zeile.includes(text)),
      vierDe.errors.join(" | "));
  });

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(300);

  const vierEn = await fehlerJetzt();

  ENGLISCH.forEach((text, index) => {
    check(`auf deutsch erzeugt, dann englisch: Perimeterbefund ${index + 1} ist uebersetzt`,
      vierEn.some((zeile) => zeile.includes(text)), vierEn.join(" | "));
  });
  check("und kein Perimeterbefund steht noch deutsch da",
    !DEUTSCH.some((text) => vierEn.some((zeile) => zeile.includes(text))),
    vierEn.join(" | "));

  /* und die Gegenrichtung */
  await validate(kaputtePerimeter, { englisch: true });

  const vierErzeugtEn = await fehlerJetzt();

  check("auf englisch erzeugt: alle vier stehen englisch da",
    ENGLISCH.every((text) => vierErzeugtEn.some((zeile) => zeile.includes(text))),
    vierErzeugtEn.join(" | "));

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(300);

  const vierZurueckDe = await fehlerJetzt();

  check("auf englisch erzeugt, dann deutsch: alle vier stehen wieder deutsch da",
    DEUTSCH.every((text) => vierZurueckDe.some((zeile) => zeile.includes(text))),
    vierZurueckDe.join(" | "));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Erweiterte Geometrieprüfung meldet Warnungen und nennt ihre Grenzen.");
