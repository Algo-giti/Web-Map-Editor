#!/usr/bin/env node
// Browsertest für den Wechsel zwischen Karte A und Karte B.
//
// Geprüft wird, dass die Mehrfachauswahl den Wechsel übersteht. Sie wurde
// vorher weggeworfen: activateMap() stellte nur den zuletzt einzeln gewählten
// Punkt wieder her, eine Gruppe von zwölf Punkten kam als ein Punkt zurück.
//
// Es genügt nicht, den Zähler zu prüfen - die wiederhergestellten Punkte
// müssen auch WEITER BENUTZBAR sein. Deshalb wird nach dem Wechsel begradigt.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-map-switch.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-map-switch";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

/**
 * Karte in rohen Metern. Der Perimeter hat acht Punkte, damit sich eine
 * Gruppe bilden lässt, die deutlich mehr als einen Punkt umfasst.
 */
function mapWith(offsetEast) {
  const o = offsetEast;

  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [o, 0], [o + 10, 0], [o + 20, 0], [o + 30, 0],
          [o + 30, 30], [o + 20, 30], [o + 10, 30], [o, 30],
          [o, 0],
        ]] },
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
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

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

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await expandSidebar();
  await page.uncheck("#showMowerPreview");

  const upload = async (selector, name, body) => {
    await page.locator(selector).setInputFiles({
      name,
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await expandSidebar();
  };

  await upload("#fileInput", "a.geojson", mapWith(0));
  await upload("#secondFileInput", "b.geojson", mapWith(100));

  const marks = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  const counter = () => page.locator("#multiSelectionInfo").textContent();

  const switchTo = async (which) => {
    await page.locator(`#map${which}Button`).click();
    await page.waitForTimeout(350);
    await expandSidebar();
  };

  /**
   * Wählt mehrere Punkte über Strg+Klick aus.
   *
   * Vorher wird die Auswahl aufgehoben: ein einfacher Klick auf einen bereits
   * markierten Punkt LÄSST die Gruppe bestehen, damit man sie ziehen kann.
   * Das ist gewolltes Verhalten und würde hier sonst Punkte aufsummieren.
   */
  const selectPoints = async (indices) => {
    if (await page.locator("#clearMultiSelectionBtn").isEnabled()) {
      await page.locator("#clearMultiSelectionBtn").click();
      await page.waitForTimeout(150);
    }

    await marks.nth(indices[0]).click();
    await page.waitForTimeout(150);

    for (const index of indices.slice(1)) {
      await marks.nth(index).click({ modifiers: ["Control"] });
      await page.waitForTimeout(150);
    }
  };

  /* ---------------------------------------------------------------- */
  console.log("Gruppe auf Karte A übersteht den Wechsel");

  await switchTo("A");

  check("Karte A hat acht Punkte", (await marks.count()) === 8,
    String(await marks.count()));

  await selectPoints([0, 2, 4, 6]);

  check("vier Punkte ausgewählt", (await counter()).includes("4"), await counter());

  await switchTo("B");

  check("auf Karte B ist die Auswahl leer",
    (await counter()).includes("0"), await counter());

  await switchTo("A");

  check("die Gruppe ist vollständig zurück",
    (await counter()).includes("4"), await counter());
  check("Löschen ist danach freigegeben",
    await page.locator("#deleteMultiSelectionBtn").isEnabled());

  /* ---------------------------------------------------------------- */
  console.log("Die zurückgeholten Punkte sind auch benutzbar");

  /*
   * Der Zähler allein beweist nichts: er könnte auf Punktbeschreibungen
   * zeigen, die nicht mehr auflösbar sind. Begradigen braucht genau zwei
   * gültige Punkte desselben Linienzugs und ist damit die schärfere Probe.
   */
  await selectPoints([0, 3]);
  await switchTo("B");
  await switchTo("A");

  check("zwei Punkte sind zurück", (await counter()).includes("2"), await counter());
  check("Begradigen ist freigegeben",
    await page.locator("#straightenSelectionBtn").isEnabled(),
    await page.locator("#straightenSelectionBtn").getAttribute("title"));

  await page.locator("#straightenSelectionBtn").click();
  await page.waitForTimeout(400);

  check("Begradigen wurde ausgeführt",
    (await page.locator("#editStatus").textContent()).includes("begradigt"),
    await page.locator("#editStatus").textContent());

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);

  /* ---------------------------------------------------------------- */
  console.log("Beide Karten halten ihre eigene Auswahl");

  await switchTo("B");
  await selectPoints([1, 3, 5]);

  check("drei Punkte auf Karte B", (await counter()).includes("3"), await counter());

  await switchTo("A");
  await switchTo("B");

  check("Karte B hat weiterhin drei", (await counter()).includes("3"), await counter());

  await switchTo("A");

  check("Karte A hat weiterhin zwei", (await counter()).includes("2"), await counter());

  /* ---------------------------------------------------------------- */
  console.log("Ein einzeln gewählter Punkt bleibt ein Punkt");

  await selectPoints([5]);

  check("ein Punkt ausgewählt", (await counter()).includes("1"), await counter());

  await switchTo("B");
  await switchTo("A");

  check("es bleibt bei einem", (await counter()).includes("1"), await counter());

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Die Mehrfachauswahl übersteht den Wechsel zwischen Karte A und B.");
