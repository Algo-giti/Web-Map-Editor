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

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-validation";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

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

  const validate = async (body) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });

    await page.locator("#fileInput").setInputFiles({
      name: "check.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.querySelectorAll("#sidebar details")
        .forEach((section) => section.setAttribute("open", ""));
    });

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
    narrow.warnings.some((text) => text.includes("0.20 m")),
    narrow.warnings.join(" | "));
  check("die Mäherbreite wird genannt",
    narrow.warnings.some((text) => text.includes("0.35 m breit")),
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

  await page.evaluate(() => {
    document.querySelectorAll("#sidebar details")
      .forEach((section) => section.setAttribute("open", ""));
  });

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  const english = await page.locator("#validationReport").textContent();

  check("Befund außerhalb ist übersetzt",
    english.includes("lies completely outside the perimeter"), english.slice(0, 400));
  check("Befund Überlappung ist übersetzt",
    english.includes("overlap"), english.slice(0, 400));
  check("kein deutscher Resttext im Bericht",
    !english.includes("liegt vollständig außerhalb"), english.slice(0, 400));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Erweiterte Geometrieprüfung meldet Warnungen und nennt ihre Grenzen.");
