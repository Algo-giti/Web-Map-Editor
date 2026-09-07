#!/usr/bin/env node
// Browsertest für die Statuszeile.
//
// Sie fasst sieben bisher verstreute Ausgaben zusammen, zehn davon lagen in
// einklappbaren Bereichen. Geprüft wird die Gliederung nach Beständigkeit:
// vier dauerhafte Angaben an festen Plätzen, EIN Platz für drei flüchtige
// Quellen, rechts die beiden Anzeigen, die sich ständig ändern.
//
// Der wichtigste Fall ist der letzte Abschnitt: der Zeichenstatus ist
// abgeleitet und wird bei jeder Geometrieänderung neu geschrieben. Ohne die
// Sonderregel überschriebe sein Leerlauftext jede Erfolgsmeldung genau in dem
// Moment, in dem sie erscheint.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-statusbar.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-statusbar";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

/** Karte in rohen Metern mit einem Befund, damit die Prüfung etwas meldet. */
const MAP = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [40, 0], [40, 40], [0, 40], [0, 0],
      ]] },
    },
    {
      type: "Feature",
      idx: 0,
      properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [[
        [50, 50], [60, 50], [60, 60], [50, 60], [50, 50],
      ]] },
    },
  ],
});

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const expandSidebar = () =>
    page.evaluate(() => {
      document.querySelectorAll("#sidebar details")
        .forEach((section) => section.setAttribute("open", ""));
    });

  const text = (id) => page.locator(`#${id}`).textContent();

  /** Welche der drei flüchtigen Quellen ist gerade sichtbar? */
  const visibleTransient = () =>
    page.evaluate(() =>
      ["editStatus", "drawFeatureStatus", "multiSelectionStatus"]
        .filter((id) => !document.getElementById(id).hidden));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  /* ---------------------------------------------------------------- */
  console.log("Zustand 1: nichts geladen");

  check("die Zeile ist sichtbar", await page.locator("#statusBar").isVisible());
  check("sie liegt in keinem aufklappbaren Bereich",
    await page.evaluate(() => !document.getElementById("statusBar").closest("details")));

  check("Dateiname", (await text("filename")).trim() === "Keine Karte geladen",
    await text("filename"));
  check("Maßstab ist leer", (await text("scaleStatus")).trim() === "–",
    await text("scaleStatus"));
  check("Bezugspunkt", (await text("originShort")).trim() === "nicht gesetzt",
    await text("originShort"));
  check("Prüfung", (await text("validationShort")).trim() === "nicht geprüft",
    await text("validationShort"));
  check("Auswahlzähler", (await text("multiSelectionInfo")).includes("0"),
    await text("multiSelectionInfo"));

  check("genau eine flüchtige Meldung sichtbar",
    (await visibleTransient()).length === 1,
    JSON.stringify(await visibleTransient()));

  /* ---------------------------------------------------------------- */
  console.log("Zustand 2: Karte geladen, keine Auswahl");

  await page.locator("#fileInput").setInputFiles({
    name: "bar.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(400);
  await expandSidebar();

  check("Dateiname nennt Slot und Datei",
    (await text("filename")).includes("Karte A") &&
    (await text("filename")).includes("bar.geojson"),
    await text("filename"));
  check("Maßstab wird als angenommen benannt",
    (await text("scaleStatus")).includes("angenommen"), await text("scaleStatus"));

  /* Kurzformen bleiben kurz - das ist die Bedingung, unter der sie taugen. */
  for (const id of ["scaleStatus", "originShort", "validationShort"]) {
    check(`#${id} bleibt unter 30 Zeichen`,
      (await text(id)).trim().length <= 30, `${id}: ${await text(id)}`);
  }

  /* ---------------------------------------------------------------- */
  console.log("Prüfergebnis als Kurzform");

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  const short = (await text("validationShort")).trim();

  check("die Kurzform nennt Zahlen", /\d/.test(short), short);
  check("sie nennt Warnungen", short.includes("Warnung"), short);
  check("sie bleibt kurz", short.length <= 30, `${short.length}: ${short}`);
  check("der ausführliche Bericht bleibt in der Seitenleiste",
    (await text("validationReport")).length > short.length,
    String((await text("validationReport")).length));

  /* ---------------------------------------------------------------- */
  console.log("Zustand 3: Punkt ausgewählt und gezogen");

  const marks = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  await marks.nth(0).click();
  await page.waitForTimeout(250);

  check("der Zähler zählt mit",
    (await text("multiSelectionInfo")).includes("1"), await text("multiSelectionInfo"));
  check("die Meldung kommt aus editStatus",
    (await visibleTransient())[0] === "editStatus",
    JSON.stringify(await visibleTransient()));
  check("weiterhin nur eine sichtbar",
    (await visibleTransient()).length === 1,
    JSON.stringify(await visibleTransient()));

  /* ---------------------------------------------------------------- */
  console.log("Zustand 4: Zeichenwerkzeug aktiv");

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  /*
   * Direkt nach dem Werkzeugklick gewinnt die Anweisung aus editStatus - sie
   * ist die jüngste Meldung und sagt genau das Richtige. Der Zeichenstatus
   * übernimmt, sobald er etwas Eigenes zu melden hat, also ab dem ersten
   * gesetzten Punkt.
   */
  check("zuerst steht die Anweisung",
    (await visibleTransient())[0] === "editStatus" &&
    (await text("editStatus")).includes("Exclusion"),
    `${JSON.stringify(await visibleTransient())} ${await text("editStatus")}`);

  const svg = await page.locator("#svg").boundingBox();
  await page.mouse.click(svg.x + svg.width * 0.4, svg.y + svg.height * 0.4);
  await page.waitForTimeout(300);

  check("nach dem ersten Punkt übernimmt der Zeichenstatus",
    (await visibleTransient())[0] === "drawFeatureStatus",
    JSON.stringify(await visibleTransient()));
  check("und nennt Werkzeug und Fortschritt",
    (await text("drawFeatureStatus")).includes("Exclusion") &&
    /\d/.test(await text("drawFeatureStatus")),
    await text("drawFeatureStatus"));

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------------- */
  console.log("Der abgeleitete Zeichenstatus verdrängt keine Erfolgsmeldung");

  /*
   * Genau hier lag die Gefahr der Zusammenlegung: setEditStatus() schreibt die
   * Erfolgsmeldung, unmittelbar danach läuft afterGeometryEdit() und mit ihm
   * updateFeatureDrawUi(). Dürfte der Zeichenstatus jederzeit übernehmen, wäre
   * die Meldung weg, bevor sie jemand lesen kann.
   */
  await marks.nth(0).click();
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);

  check("nach einer Geometrieänderung steht die Meldung noch",
    (await visibleTransient())[0] === "editStatus",
    JSON.stringify(await visibleTransient()));
  check("und sie hat Inhalt",
    (await text("editStatus")).trim().length > 0, await text("editStatus"));

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  check("auch nach Undo bleibt es bei einer Meldung",
    (await visibleTransient()).length === 1,
    JSON.stringify(await visibleTransient()));

  /* ---------------------------------------------------------------- */
  console.log("Sprachwechsel");

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("die Kurzform des Maßstabs ist übersetzt",
    (await text("scaleStatus")).includes("assumed"), await text("scaleStatus"));
  check("die Beschriftungen sind übersetzt",
    (await page.locator("#statusBar").textContent()).includes("Scale"),
    (await page.locator("#statusBar").textContent()).slice(0, 120));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und kommen zurück",
    (await text("scaleStatus")).includes("angenommen"), await text("scaleStatus"));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Die Statuszeile gliedert nach Beständigkeit und verliert keine Meldung.");
