#!/usr/bin/env node
// Browsertest: was gilt als leerer Platzhalter?
//
// CaSSAndRA schreibt beim Export IMMER ein Feature "search wire" und eines
// "dockpoints", auch wenn keine Punkte da sind (mapdata.py, Zeile 358-360).
// Leere Platzhalter sind also reguläre CaSSAndRA-Ausgabe und kein Fehler - die
// zugehörigen Zeichenwerkzeuge müssen benutzbar bleiben.
//
// Die Freigabe zählte vorher Einträge in coordinates statt Punkte. Ein leerer
// Ring [[]] ist ein Eintrag ohne Punkt und galt damit als befüllte Linie:
// Zeichnen gesperrt, stattdessen "verlängern" angeboten. Der Test deckt
// deshalb ALLE Formen ab, in denen ein leerer Platzhalter auftreten kann - für
// Search Wire und Docking-Pfad gleichermaßen.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-placeholders.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-placeholders";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

const PERIMETER = {
  type: "Feature",
  properties: { name: "perimeter" },
  geometry: { type: "Polygon", coordinates: [[
    [0, 0], [40, 0], [40, 40], [0, 40], [0, 0],
  ]] },
};

/** Die sieben Formen, in denen ein leerer Platzhalter auftreten kann. */
const FORMEN = [
  ["geometry fehlt ganz", (name) => [{ type: "Feature", properties: { name } }]],
  ["geometry ist null", (name) => [{ type: "Feature", properties: { name }, geometry: null }]],
  ["coordinates ist leer", (name) => [{ type: "Feature", properties: { name },
    geometry: { type: "LineString", coordinates: [] } }]],
  ["ein leerer Ring", (name) => [{ type: "Feature", properties: { name },
    geometry: { type: "LineString", coordinates: [[]] } }]],
  ["coordinates fehlt", (name) => [{ type: "Feature", properties: { name },
    geometry: { type: "LineString" } }]],
  ["MultiLineString mit leerem Ring", (name) => [{ type: "Feature", properties: { name },
    geometry: { type: "MultiLineString", coordinates: [[]] } }]],
];

/** Zwei Platzhalter - das ist der Fall, der sperren MUSS. */
const ZWEIMAL = (name) => [
  { type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates: [] } },
  { type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates: [] } },
];

const TYPEN = [
  { name: "search wire", label: "Search Wire", draw: "drawSearchWireBtn",
    extend: "extendSearchWireBtn", ursache: "nur die erste" },
  { name: "dockpoints", label: "Docking-Pfad", draw: "createDockBtn",
    extend: "extendDockBtn", ursache: "nur das erste" },
];

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const load = async (features) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.locator("#fileInput").setInputFiles({
      name: "platzhalter.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify({
        type: "FeatureCollection", features: [PERIMETER, ...features],
      })),
    });
    await page.waitForTimeout(350);
  };

  const state = (typ) =>
    page.evaluate(([draw, extend]) => {
      const b = document.getElementById(draw);
      return {
        gesperrt: b.getAttribute("aria-disabled") === "true",
        grund: b.getAttribute("title") || "",
        verlaengern: !document.getElementById(extend).disabled,
      };
    }, [typ.draw, typ.extend]);

  for (const typ of TYPEN) {
    /* ---------------------------------------------------------------- */
    console.log(`${typ.label}: leere Platzhalter geben das Zeichnen frei`);

    for (const [titel, build] of FORMEN) {
      await load(build(typ.name));
      const s = await state(typ);

      check(`${titel}: Zeichnen ist frei`, !s.gesperrt, s.grund.slice(0, 90));
      check(`${titel}: Verlängern bleibt gesperrt`, !s.verlaengern);
    }

    /* ---------------------------------------------------------------- */
    console.log(`${typ.label}: zwei Platzhalter sperren`);

    await load(ZWEIMAL(typ.name));
    const zwei = await state(typ);

    check("zwei Features sperren das Zeichnen", zwei.gesperrt, zwei.grund.slice(0, 90));
    check("und die Begründung nennt die Ursache",
      zwei.grund.includes("CaSSAndRA") && zwei.grund.includes(typ.ursache),
      zwei.grund.slice(0, 120));

    /* ---------------------------------------------------------------- */
    console.log(`${typ.label}: eine befüllte Linie sperrt weiterhin`);

    await load([{ type: "Feature", properties: { name: typ.name },
      geometry: { type: "LineString", coordinates: [[5, 5], [10, 5], [15, 5]] } }]);
    const voll = await state(typ);

    check("befüllt sperrt das Zeichnen", voll.gesperrt, voll.grund.slice(0, 90));
    check("dafür ist Verlängern frei", voll.verlaengern);
    check("die Begründung nennt die Punktzahl",
      /3 Punkten/.test(voll.grund), voll.grund.slice(0, 120));

    /* ---------------------------------------------------------------- */
    console.log(`${typ.label}: ein leerer Platzhalter lässt sich bezeichnen`);

    await load([{ type: "Feature", properties: { name: typ.name },
      geometry: { type: "LineString", coordinates: [[]] } }]);

    await page.locator(`#${typ.draw}`).click();
    await page.waitForTimeout(250);

    check("das Werkzeug startet wirklich",
      await page.locator("#cancelDrawBtn").isEnabled(),
      await page.locator("#editStatus").textContent());

    await page.locator("#cancelDrawBtn").click();
    await page.waitForTimeout(200);
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Leere Platzhalter sperren nicht, zwei Features schon.");
