#!/usr/bin/env node
// Browsertest für das Verbinden zweier Karten.
//
// Zwei Dinge werden geprüft:
//
// 1. Dass die Kartenprüfung und der Export ausschliesslich den aktiven Slot
//    sehen. Wären die Slots nicht sauber getrennt, wäre auch der Export
//    betroffen - das wäre der ernstere Fehler.
// 2. Dass das Merge-Ergebnis die Singleton-Features nicht verdoppelt.
//    Docking-Pfad und Search Wire darf es pro Karte nur einmal geben;
//    Exclusions werden dagegen übernommen und neu nummeriert.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-merge.mjs

import { createChecker, indexUrl, launchBrowser, menueBefehl } from "./browser-harness.mjs";

const TOOL = "test-merge";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

const DEG = 111111;
const rel = ([east, north]) => [east / DEG, north / DEG];

/**
 * Karte mit Perimeter, einer Exclusion und je einem Platzhalter für
 * Docking-Pfad und Search Wire - genau die Ausgangslage, in der der Fehler
 * unsichtbar bleibt, weil beide Platzhalter leer sind.
 */
function mapWith(offsetEast, dockPoints = [], wirePoints = []) {
  const o = offsetEast;

  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [o, 0], [o + 40, 0], [o + 40, 40], [o, 40], [o, 0],
        ].map(rel)] },
      },
      {
        type: "Feature",
        idx: 0,
        properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [[
          [o + 10, 10], [o + 20, 10], [o + 20, 20], [o + 10, 20], [o + 10, 10],
        ].map(rel)] },
      },
      {
        type: "Feature",
        properties: { name: "dockpoints" },
        geometry: { type: "LineString", coordinates: dockPoints.map(rel) },
      },
      {
        type: "Feature",
        properties: { name: "search wire" },
        geometry: { type: "LineString", coordinates: wirePoints.map(rel) },
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

  /*
   * Ein dauerhafter Handler statt eines pro Aufruf: erscheint ein erwarteter
   * Bestätigungsdialog einmal nicht, bliebe ein once-Handler registriert und
   * kollidierte mit dem nächsten.
   */
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const expand = () =>
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

  await expand();

  const upload = async (selector, name, body) => {
    await page.locator(selector).setInputFiles({
      name,
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await expand();
  };

  /** Liest die aktive Karte über den Export zurück. */
  const exportActive = async () => {
    const pending = page
      .waitForEvent("download", { timeout: 5000 })
      .catch(() => null);

    await menueBefehl(page, "Datei", "GeoJSON speichern");

    const event = await pending;
    if (!event) return null;

    const stream = await event.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  };

  const countByName = (collection, name) =>
    collection.features.filter((f) => f.properties?.name === name).length;

  /* ---------------------------------------------------------------- */
  console.log("Gegenprobe: die Slots sind getrennt");

  await upload("#fileInput", "a.geojson", mapWith(0));
  await upload("#secondFileInput", "b.geojson", mapWith(60));

  /* Karte B ist nach dem Laden aktiv. Zurück auf A. */
  await page.locator("#mapAButton").click();
  await page.waitForTimeout(300);
  await expand();

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  const reportA = await page.locator("#validationReport").textContent();

  check("Kartenprüfung sieht nur einen Perimeter",
    !reportA.includes("Perimeter-Features"), reportA.slice(0, 200));
  check("Kartenprüfung meldet kein doppeltes Docking",
    !reportA.includes("Docking-Features"), reportA.slice(0, 200));

  const onlyA = await exportActive();
  check("Export der aktiven Karte gelingt", !!onlyA);

  if (onlyA) {
    check("Export enthält nur die vier Features von A",
      onlyA.features.length === 4, String(onlyA.features.length));
    check("Export enthält genau einen Docking-Pfad",
      countByName(onlyA, "dockpoints") === 1, String(countByName(onlyA, "dockpoints")));
    check("Export enthält genau eine Search Wire",
      countByName(onlyA, "search wire") === 1, String(countByName(onlyA, "search wire")));
  }

  /* ---------------------------------------------------------------- */
  console.log("Verbinden verdoppelt keine Singletons");

  await page.locator("#mergeMapsBtn").click();
  await page.waitForTimeout(500);
  await expand();

  const merged = await exportActive();
  check("Export des Ergebnisses gelingt", !!merged);

  if (merged) {
    check("genau ein Perimeter",
      countByName(merged, "perimeter") === 1, String(countByName(merged, "perimeter")));
    check("beide Exclusions übernommen",
      countByName(merged, "exclusion") === 2, String(countByName(merged, "exclusion")));
    check("Exclusions neu nummeriert",
      merged.features
        .filter((f) => f.properties?.name === "exclusion")
        .every((f, index) => f.idx === index),
      JSON.stringify(merged.features
        .filter((f) => f.properties?.name === "exclusion")
        .map((f) => f.idx)));

    check("genau ein Docking-Pfad",
      countByName(merged, "dockpoints") === 1, String(countByName(merged, "dockpoints")));
    check("genau eine Search Wire",
      countByName(merged, "search wire") === 1, String(countByName(merged, "search wire")));
  }

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  const reportMerged = await page.locator("#validationReport").textContent();

  check("Kartenprüfung meldet danach keine doppelten Features",
    !reportMerged.includes("Docking-Features vorhanden") &&
    !reportMerged.includes("Search-Wire-Features vorhanden"),
    reportMerged.slice(0, 260));

  /* ---------------------------------------------------------------- */
  console.log("Genau ein befüllter Pfad gewinnt");

  const reset = async (aBody, bBody) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expand();
    await upload("#fileInput", "a.geojson", aBody);
    await upload("#secondFileInput", "b.geojson", bBody);
    await page.locator("#mapAButton").click();
    await page.waitForTimeout(250);
    await expand();
  };

  /* Nur Karte B hat einen echten Docking-Pfad. */
  await reset(mapWith(0), mapWith(60, [[70, 5], [75, 5], [80, 5]]));

  check("Verbinden ist möglich", await page.locator("#mergeMapsBtn").isEnabled());

  await page.locator("#mergeMapsBtn").click();
  await page.waitForTimeout(500);
  await expand();

  const fromB = await exportActive();
  check("Export gelingt", !!fromB);

  if (fromB) {
    check("genau ein Docking-Pfad",
      countByName(fromB, "dockpoints") === 1, String(countByName(fromB, "dockpoints")));

    const dock = fromB.features.find((f) => f.properties?.name === "dockpoints");
    check("der befüllte Pfad aus Karte B hat gewonnen",
      dock?.geometry?.coordinates?.length === 3,
      JSON.stringify(dock?.geometry?.coordinates?.length));
  }

  /* ---------------------------------------------------------------- */
  console.log("Zwei befüllte Pfade sind ein Konflikt");

  await reset(
    mapWith(0, [[5, 5], [10, 5], [15, 5]]),
    mapWith(60, [[70, 5], [75, 5], [80, 5]])
  );

  check("Verbinden ist gesperrt", await page.locator("#mergeMapsBtn").isDisabled());

  const mergeStatus = await page.locator("#mergeStatus").textContent();
  check("der Grund wird genannt",
    mergeStatus.includes("Docking-Pfad") && mergeStatus.includes("löschen"),
    mergeStatus);

  /* Nach dem Löschen eines Pfades muss es wieder gehen. */
  await page.locator("#deleteDockBtn").click();
  await page.waitForTimeout(400);
  await expand();

  check("nach dem Löschen wieder freigegeben",
    await page.locator("#mergeMapsBtn").isEnabled(),
    await page.locator("#mergeStatus").textContent());

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Verbinden übernimmt Exclusions und hält Singletons einfach.");
