#!/usr/bin/env node
// Browsertest für Kreis- und Rechteck-Exclusions.
//
// tools/test-geometry.mjs prüft die Punktberechnung. Hier geht es um den
// Klickpfad: ein Klick setzt den Bezugspunkt, das Ergebnis ist eine gewöhnliche
// Exclusion mit korrekter idx-Vergabe, und Snap-to-Grid wirkt auf den
// Bezugspunkt, nicht auf die Eckpunkte.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-shapes.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-shapes";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

const DEG = 111111;
const rel = ([e, n]) => [e / DEG, n / DEG];

/** Karte mit Perimeter und einer bereits vorhandenen Exclusion. */
const baseMap = JSON.stringify({
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
      geometry: { type: "Polygon", coordinates: [[
        [2, 2], [6, 2], [6, 6], [2, 6], [2, 2],
      ].map(rel)] },
    },
  ],
});

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const expand = () =>
    page.evaluate(() => {
      document.querySelectorAll("#sidebar details")
        .forEach((s) => s.setAttribute("open", ""));
    });

  await expand();
  await page.locator("#fileInput").setInputFiles({
    name: "shapes.geojson", mimeType: "application/geo+json",
    buffer: Buffer.from(baseMap),
  });
  await page.waitForTimeout(450);
  await expand();

  /*
   * Klickt eine Position in Metern auf die Karte.
   *
   * Die viewBox des SVG steht in WELTkoordinaten - bei erkanntem Relativformat
   * also in Metern, nicht in den Rohwerten der Datei. Die Nordachse zeigt im
   * SVG nach unten, daher das Vorzeichen.
   */
  const clickMap = async (east, north) => {
    const point = await page.evaluate(([e, n]) => {
      const svg = document.getElementById("svg");
      const rect = svg.getBoundingClientRect();
      const box = svg.viewBox.baseVal;
      return [
        rect.left + (e - box.x) / box.width * rect.width,
        rect.top + (-n - box.y) / box.height * rect.height,
      ];
    }, [east, north]);
    await page.mouse.click(point[0], point[1]);
    await page.waitForTimeout(350);
  };

  const exportMap = async () => {
    const pending = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.locator("#exportBtn").click();
    const ev = await pending;
    if (!ev) return null;
    const stream = await ev.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString());
  };

  const exclusions = (map) =>
    map.features.filter((f) => f.properties?.name === "exclusion");

  /* ---------------------------------------------------------------- */
  console.log("Kreis");

  check("Hinweis nennt die Abweichung",
    (await page.locator("#circleHint").textContent()).includes("Abweichung"),
    await page.locator("#circleHint").textContent());

  await page.fill("#circleRadiusInput", "3");
  await page.fill("#circleVerticesInput", "24");
  await page.waitForTimeout(200);

  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);

  const isActive = (selector) =>
    page.locator(selector).evaluate((el) => el.classList.contains("active"));

  check("Werkzeug ist aktiv", await isActive("#drawCircleBtn"));

  await clickMap(30, 30);

  check("Erfolgsmeldung nennt die Eckpunkte",
    (await page.locator("#editStatus").textContent()).includes("24 Eckpunkten"),
    await page.locator("#editStatus").textContent());

  const afterCircle = await exportMap();
  check("Export gelingt", !!afterCircle);

  if (afterCircle) {
    const list = exclusions(afterCircle);
    check("zwei Exclusions", list.length === 2, String(list.length));
    check("Indizes fortlaufend vergeben",
      list.every((f, i) => f.idx === i), JSON.stringify(list.map((f) => f.idx)));

    const ring = list[1].geometry.coordinates[0];
    check("Ring ist geschlossen",
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]);
    check("24 Ecken plus Ringschluss", ring.length === 25, String(ring.length));

    const radii = ring.slice(0, 24).map(([e, n]) =>
      Math.hypot(e * DEG - 30, n * DEG - 30));
    check("alle Punkte liegen auf dem Radius",
      radii.every((r) => Math.abs(r - 3) < 1e-6),
      JSON.stringify(radii.slice(0, 3)));

    check("keine zusätzlichen properties",
      Object.keys(list[1].properties).length === 1,
      JSON.stringify(list[1].properties));
  }

  /* Ein Undo nimmt die Form zurück. */
  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);
  const afterUndo = await exportMap();
  check("ein Undo entfernt die Kreis-Exclusion",
    afterUndo && exclusions(afterUndo).length === 1,
    String(afterUndo && exclusions(afterUndo).length));

  /* ---------------------------------------------------------------- */
  console.log("Rechteck");

  await expand();
  await page.fill("#rectWidthInput", "6");
  await page.fill("#rectHeightInput", "2");
  await page.fill("#rectAngleInput", "90");
  await page.waitForTimeout(200);

  await page.locator("#drawRectangleBtn").click();
  await page.waitForTimeout(250);
  await clickMap(40, 40);

  const afterRect = await exportMap();
  check("Export gelingt", !!afterRect);

  if (afterRect) {
    const list = exclusions(afterRect);
    check("zwei Exclusions", list.length === 2, String(list.length));

    const ring = list[1].geometry.coordinates[0];
    check("vier Ecken plus Ringschluss", ring.length === 5, String(ring.length));

    const metres = ring.slice(0, 4).map(([e, n]) => [e * DEG, n * DEG]);
    const side1 = Math.hypot(metres[1][0] - metres[0][0], metres[1][1] - metres[0][1]);
    const side2 = Math.hypot(metres[2][0] - metres[1][0], metres[2][1] - metres[1][1]);

    check("Seitenlängen stimmen",
      Math.abs(side1 - 6) < 1e-6 && Math.abs(side2 - 2) < 1e-6,
      `${side1} / ${side2}`);

    /* Um 90 Grad gedreht liegt die 6-m-Seite in North-Richtung. */
    check("Drehung um 90 Grad wirkt",
      Math.abs(metres[1][0] - metres[0][0]) < 1e-6,
      JSON.stringify(metres.slice(0, 2)));

    const centreEast = metres.reduce((sum, [e]) => sum + e, 0) / 4;
    const centreNorth = metres.reduce((sum, [, n]) => sum + n, 0) / 4;
    check("Mittelpunkt liegt am Klickpunkt",
      Math.abs(centreEast - 40) < 1e-6 && Math.abs(centreNorth - 40) < 1e-6,
      `${centreEast} / ${centreNorth}`);
  }

  /* ---------------------------------------------------------------- */
  console.log("Ungültige Eingaben werden abgelehnt");

  await expand();
  await page.fill("#circleRadiusInput", "0");
  await page.waitForTimeout(200);

  check("Hinweis meldet den Fehler",
    (await page.locator("#circleHint").getAttribute("class")).includes("error"),
    await page.locator("#circleHint").textContent());

  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);

  check("Werkzeug startet nicht", !(await isActive("#drawCircleBtn")));
  check("Grund wird genannt",
    (await page.locator("#editStatus").textContent()).includes("Radius"),
    await page.locator("#editStatus").textContent());

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Kreis und Rechteck erzeugen gewöhnliche Exclusions.");
