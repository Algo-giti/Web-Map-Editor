#!/usr/bin/env node
// Browsertest für den Bezugspunkt-Konflikt zwischen zwei geladenen Karten.
//
// Deckt den Fehlerfall ab, den tools/test-cassandra.mjs nur auf Funktionsebene
// prüfen kann: das Zusammenspiel aus zwei Kartenslots, Warnanzeige, Merge- und
// Exportsperre sowie dem Auflösen des Konflikts über die Eingabefelder. Diese
// Kette lässt sich ohne echtes DOM nicht sinnvoll nachbilden.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie
// tools/smoke-test.mjs ist dieser Test bewusst NICHT Teil von check-all.mjs:
// check-all bleibt die abhängigkeitsfreie Stufe. Fehlt playwright-core oder
// startet kein Browser, gibt der Test eine Anleitung aus und endet mit 0.
//
// Alle Karten werden hier synthetisch erzeugt. Es liegt keine Kartendatei im
// Repository und es wird keine gelesen.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-origin-conflict.mjs

import { createChecker, indexUrl, launchBrowser, menueBefehl } from "./browser-harness.mjs";

const TOOL = "test-origin-conflict";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

/* Zwei RTK-Basen rund 1,1 km auseinander - eindeutig verschiedene Standorte. */
const BASE_A = { lat: 52.5, lon: 13.4 };
const BASE_B = { lat: 52.51, lon: 13.4 };

/** Synthetische 40-m-Quadratkarte um eine gegebene RTK-Basis. */
function syntheticMap(origin) {
  const step = 40 / 111111;

  return JSON.stringify({
    type: "FeatureCollection",
    referenceOrigin: { lat: origin.lat, lon: origin.lon },
    features: [
      {
        type: "Feature",
        idx: 0,
        properties: { name: "perimeter" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [origin.lon, origin.lat],
            [origin.lon + step, origin.lat],
            [origin.lon + step, origin.lat + step],
            [origin.lon, origin.lat + step],
            [origin.lon, origin.lat],
          ]],
        },
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

  /*
   * Der Bezugspunkt wird im localStorage gemerkt. Ein Rest aus einem früheren
   * Lauf würde die Ausgangslage verfälschen.
   */
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const upload = async (selector, name, body) => {
    await page.locator(selector).setInputFiles({
      name,
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(350);
  };

  const originClass = () => page.locator("#originStatus").getAttribute("class");

  /* ---------------------------------------------------------------- */
  console.log("Karte A laden");
  await upload("#fileInput", "synthetic-a.geojson", syntheticMap(BASE_A));

  check("erste Karte erzeugt keinen Konflikt", !(await originClass()).includes("error"));
  check(
    "Bezugspunkt der Datei wurde uebernommen",
    (await page.locator("#originLatInput").inputValue()) === String(BASE_A.lat),
    await page.locator("#originLatInput").inputValue()
  );

  /* ---------------------------------------------------------------- */
  console.log("Karte B mit abweichender RTK-Basis laden");
  await upload("#secondFileInput", "synthetic-b.geojson", syntheticMap(BASE_B));

  check("Konflikt wird angezeigt", (await originClass()).includes("error"), await originClass());
  check(
    "Bereich Koordinatenbezug ist aufgeklappt",
    await page.locator("#originSection").evaluate((element) => element.open)
  );
  check(
    "aktiver Bezugspunkt wurde NICHT ueberschrieben",
    (await page.locator("#originLatInput").inputValue()) === String(BASE_A.lat),
    await page.locator("#originLatInput").inputValue()
  );
  check(
    "Ladestatus meldet den Konflikt",
    (await page.locator("#editStatus").textContent()).includes("abweichenden")
  );
  check("Merge-Button ist gesperrt", await page.locator("#mergeMapsBtn").isDisabled());
  check(
    "Merge-Status nennt den Grund",
    (await page.locator("#mergeStatus").textContent()).includes("abweichenden RTK-Bezugspunkt")
  );

  /* ---------------------------------------------------------------- */
  console.log("Export beider Modi muss gesperrt sein");

  for (const mode of ["loaded", "absolute"]) {
    await page.selectOption("#exportFrameSelect", mode);

    let downloaded = false;
    const noteDownload = () => {
      downloaded = true;
    };
    page.on("download", noteDownload);

    await menueBefehl(page, "Datei", "GeoJSON speichern");
    await page.waitForTimeout(400);
    page.off("download", noteDownload);

    check(`kein Download im Modus "${mode}"`, !downloaded);
    check(
      `Exportsperre gemeldet im Modus "${mode}"`,
      (await page.locator("#editStatus").textContent()).includes("Export blockiert")
    );
  }

  /* ---------------------------------------------------------------- */
  console.log("Konflikt ueber die Eingabefelder aufloesen");
  await page.fill("#originLatInput", String(BASE_B.lat));
  await page.fill("#originLonInput", String(BASE_B.lon));
  await page.locator("#applyOriginBtn").click();
  await page.waitForTimeout(350);

  check("Konfliktanzeige verschwindet", !(await originClass()).includes("error"), await originClass());
  check("Merge-Sperre bleibt bestehen", await page.locator("#mergeMapsBtn").isDisabled());

  /* ---------------------------------------------------------------- */
  console.log("Export nach dem Aufloesen");
  await page.selectOption("#exportFrameSelect", "absolute");

  /* Erst auf das Ereignis lauschen, dann klicken - sonst geht es verloren. */
  const pendingDownload = page
    .waitForEvent("download", { timeout: 5000 })
    .catch(() => null);

  await menueBefehl(page, "Datei", "GeoJSON speichern");

  const download = await pendingDownload;
  let exported = null;

  if (download) {
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    exported = JSON.parse(Buffer.concat(chunks).toString());
  }

  check("Export laeuft wieder", !!exported);

  if (exported) {
    const [lon, lat] = exported.features[0].geometry.coordinates[0][0];

    /*
     * Der eigentliche Beweis für rebaseConvertedMaps(): ohne die Neubasierung
     * läge das Ergebnis um die Differenz beider Basen daneben.
     */
    check(
      "Export trifft die urspruengliche RTK-Basis exakt",
      Math.abs(lat - BASE_B.lat) < 1e-9 && Math.abs(lon - BASE_B.lon) < 1e-9,
      `lat=${lat} lon=${lon} (erwartet ${BASE_B.lat} / ${BASE_B.lon})`
    );
    check(
      "Export schreibt den aufgeloesten Bezugspunkt",
      Math.abs(exported.referenceOrigin.lat - BASE_B.lat) < 1e-9
    );
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0, consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Bezugspunkt-Konflikt wird erkannt, gesperrt und laesst sich aufloesen.");
