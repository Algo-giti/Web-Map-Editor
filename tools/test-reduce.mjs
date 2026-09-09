#!/usr/bin/env node
// Browsertest für "Punkte reduzieren" (Douglas-Peucker).
//
// tools/test-geometry.mjs prüft das Verfahren selbst. Hier geht es um die
// Einbindung: beide Betriebsarten, die Vorschau, die Flächenmeldung bei
// Exclusions, die Ablehnung bei zu großer Toleranz und die Undo-Grenze.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-reduce.mjs

import { createChecker, indexUrl, launchBrowser, menueBefehl } from "./browser-harness.mjs";

const TOOL = "test-reduce";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

const SCALE = 111111;

/*
 * Auf Zentimeter runden, bevor in die Relativdarstellung umgerechnet wird.
 *
 * Das ist nicht Kosmetik: detectSunray() erkennt eine Karte nur dann als
 * RTK-Relativformat, wenn die Werte mal 111111 Zentimeter-Vielfache ergeben.
 * Ohne die Rundung bleibt scaleFactor bei 1, "Weltkoordinaten" sind dann die
 * Rohwerte, und eine Toleranz von 0,02 "Metern" wäre größer als die gesamte
 * Geometrie. Echte RTK-Karten haben ohnehin Zentimeterauflösung.
 */
const cm = (value) => Math.round(value * 100) / 100;
const rel = ([east, north]) => [cm(east) / SCALE, cm(north) / SCALE];

/*
 * Fein digitalisierter Kreis - der Fall, in dem Reduzieren etwas bringt.
 *
 * Radius 6 m mit 100 Punkten. Der Winkelschritt beträgt 3,6°, die
 * Sehnenabweichung eines einzelnen Punktes damit r·(1−cos 3,6°) ≈ 12 mm und
 * liegt unter der Toleranz von 2 cm - es fällt also wirklich etwas weg
 * (101 → 65 Punkte).
 *
 * Der Flächenverlust liegt dabei bei 0,16 m². Das sind nur 0,14 % der Fläche
 * von 113 m², also DEUTLICH UNTER der relativen Schwelle von 1 % - aber über
 * dem absoluten Schwellwert (Quadrat der Arbeitsbreite, 0,12 m²). Der Testfall
 * prüft damit gezielt den absoluten Zweig der ODER-Regel, den eine rein
 * relative Schwelle übersehen würde.
 */
function circle(centreEast, centreNorth, radius, count) {
  const points = [];

  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    points.push([
      centreEast + Math.cos(angle) * radius,
      centreNorth + Math.sin(angle) * radius,
    ]);
  }

  points.push([...points[0]]);
  return points;
}

/** Zickzack-Linie mit klar entbehrlichen Zwischenpunkten. */
function zigzag(count) {
  const points = [];

  for (let index = 0; index < count; index++) {
    points.push([index * 1.5, index % 2 === 0 ? 0 : 0.01]);
  }

  return points;
}

function syntheticMap() {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [60, 0], [60, 60], [0, 60], [0, 0],
        ].map(rel)] },
      },
      {
        type: "Feature",
        idx: 0,
        properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [circle(25, 25, 6, 100).map(rel)] },
      },
      {
        type: "Feature",
        properties: { name: "search wire" },
        geometry: { type: "LineString", coordinates: zigzag(9).map(rel) },
      },
    ],
  });
}

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const expandSidebar = () =>
    page.evaluate(() => {
      /*
       * Seit Etappe 5 D sind "Umformen" und "Kartenpruefung" im Inspektor
       * einklappbar und beim ersten Start ZU. Wer ihre Knoepfe bedienen will,
       * klappt sie auf - der Test tut dasselbe.
       */
      /*
       * Seit Etappe 6 stehen die Werkzeugeinstellungen als eingeklapptes
       * <details> unter ihrem Knopf im Inspektor (.tool-settings).
       */
      document.querySelectorAll(
        "#sidebar details, .inspector-fold, .tool-settings"
      ).forEach((section) => section.setAttribute("open", ""));
    });

  await expandSidebar();
  await menueBefehl(page, "Ansicht", "Mäher am ausgewählten Punkt anzeigen");

  await page.locator("#fileInput").setInputFiles({
    name: "reduce.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(syntheticMap()),
  });
  await page.waitForTimeout(400);
  await expandSidebar();

  const status = () => page.locator("#reduceStatus").textContent();
  const applyButton = page.locator("#reduceApplyBtn");
  const wireMarks = page.locator('#vertexGroup circle[data-layer="searchwire"]');
  const ringMarks = page.locator('#vertexGroup circle[data-layer="exclusion"]');

  const setTolerance = async (value) => {
    await page.fill("#reduceToleranceInput", value);
    await page.locator("#applyReduceToleranceBtn").click();
    await page.waitForTimeout(250);
  };

  check("ohne Auswahl ist Reduzieren gesperrt", await applyButton.isDisabled());
  check("Statuszeile erklärt die Auswahl",
    (await status()).includes("Punkt auswählen"), await status());

  /* ---------------------------------------------------------------- */
  console.log("Ganzes Feature: offene Linie");

  check("neun Punkte auf der Search Wire",
    (await wireMarks.count()) === 9, String(await wireMarks.count()));

  await wireMarks.nth(0).click();
  await page.waitForTimeout(250);

  check("ganzes Feature wird erkannt",
    (await status()).includes("ganzes Feature"), await status());
  check("Statuszeile nennt vorher und nachher",
    /9 → \d+ Punkte/.test(await status()), await status());
  check("Reduzieren ist freigegeben", await applyButton.isEnabled());

  check("Vorschaulinie ist gezeichnet",
    (await page.locator("#selectionGhostGroup .straighten-preview-line").count()) >= 1);
  check("wegfallende Punkte sind markiert",
    (await page.locator("#selectionGhostGroup .reduce-preview-node").count()) >= 1,
    String(await page.locator("#selectionGhostGroup .reduce-preview-node").count()));

  await applyButton.click();
  await page.waitForTimeout(350);

  const wireAfter = await wireMarks.count();
  check("Punkte wurden entfernt", wireAfter < 9, String(wireAfter));
  check("Endpunkte bleiben erhalten", wireAfter >= 2, String(wireAfter));
  check("Erfolgsmeldung nennt die Bilanz",
    (await page.locator("#editStatus").textContent()).includes("Punkte entfernt"),
    await page.locator("#editStatus").textContent());

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);
  check("ein Undo stellt alle neun Punkte wieder her",
    (await wireMarks.count()) === 9, String(await wireMarks.count()));

  /* ---------------------------------------------------------------- */
  console.log("Abschnitt zwischen zwei Punkten");

  await wireMarks.nth(2).click();
  await page.waitForTimeout(150);
  await wireMarks.nth(6).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);

  check("Abschnitt wird erkannt",
    (await status()).includes("Abschnitt"), await status());

  await applyButton.click();
  await page.waitForTimeout(350);

  const sectionAfter = await wireMarks.count();
  check("nur der Abschnitt wurde ausgedünnt",
    sectionAfter > 2 && sectionAfter < 9, String(sectionAfter));

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);

  /* ---------------------------------------------------------------- */
  console.log("Exclusion: Ring und Flächenmeldung");

  const ringBefore = await ringMarks.count();
  check("Kreis hat 100 Eckpunkte", ringBefore === 100, String(ringBefore));

  /*
   * Über die Feature-Navigation auswählen statt über einen einzelnen Marker:
   * bei 60 Punkten auf 38 m Umfang liegen die Marker so dicht, dass sich
   * benachbarte Kreise am Bildschirm überdecken. Das ist eine Eigenheit des
   * Testaufbaus, kein Fehler der Anwendung - ein Nutzer würde hineinzoomen.
   */
  await expandSidebar();
  await page.locator('[data-action="select-whole-feature"]').first().click();
  await page.waitForTimeout(300);

  check("Ring wird als ganzes Feature erkannt",
    (await status()).includes("ganzes Feature"), await status());

  await applyButton.click();
  await page.waitForTimeout(400);

  const ringAfter = await ringMarks.count();
  check("Ring wurde ausgedünnt", ringAfter < ringBefore, String(ringAfter));
  check("Ring behält mindestens 3 Punkte", ringAfter >= 3, String(ringAfter));
  check("Flächenänderung wird gemeldet",
    (await status()).includes("Fläche"), await status());
  check("Schrumpfen wird als Warnung gefärbt",
    (await page.locator("#reduceStatus").getAttribute("class")).includes("error"),
    await page.locator("#reduceStatus").getAttribute("class"));

  /* Der Ring muss geschlossen geblieben sein - über die Kartenprüfung. */
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  const report = await page.locator("#validationReport").textContent();
  check("Ring ist nach dem Reduzieren noch geschlossen",
    !report.includes("nicht geschlossen"), report.slice(0, 200));

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);
  check("ein Undo stellt den Kreis wieder her",
    (await ringMarks.count()) === ringBefore, String(await ringMarks.count()));

  /* ---------------------------------------------------------------- */
  console.log("Zu große Toleranz wird abgelehnt");

  await setTolerance("50");
  await page.waitForTimeout(250);

  check("Reduzieren ist bei zu großer Toleranz gesperrt",
    await applyButton.isDisabled());
  check("Meldung nennt die Mindestpunktzahl",
    (await status()).includes("mindestens 3"), await status());

  await setTolerance("0,02");

  check("nach dem Zurücksetzen wieder freigegeben",
    await applyButton.isEnabled(), await status());

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Punkte reduzieren funktioniert in beiden Betriebsarten.");
