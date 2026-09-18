#!/usr/bin/env node
// Optional real-browser smoke test for index.html.
//
// This is the automated stand-in for the "browser runtime check" that
// AGENTS.md / DEVELOPMENT.md ask for before structural UI changes. It is
// intentionally NOT a project dependency (the app itself must stay
// framework-free/build-free/dependency-free) - it only requires
// `playwright-core` to be available in the environment you run it from.
//
// Playwright and browser discovery live in tools/browser-harness.mjs, so this
// script and tools/test-origin-conflict.mjs share one implementation and no
// concrete path or version number has to be documented anywhere.
//
// Run from the repo root:
//   node tools/smoke-test.mjs
//
// index.html has no fetch()/XHR/external resources, so it is loaded
// directly via a file:// URL - no dev server needed.
//
// What real hardware/browser interaction this CANNOT verify:
//   - actual ESP32/Sunray firmware behavior or map compatibility
//   - real touch input on an Android device (only synthetic taps)
//   - the native file picker (the file input is filled programmatically)
//   - the actual download of an exported file (export content is covered by
//     tools/test-cassandra.mjs and tools/test-origin-conflict.mjs instead)

import { indexUrl, launchBrowser } from "./browser-harness.mjs";

const browser = await launchBrowser("smoke-test");
if (!browser) process.exit(2);

const consoleErrors = [];
const pageErrors = [];
let failed = false;

try {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(indexUrl(), { waitUntil: "load" });

  const title = await page.title();
  if (title !== "Web Map Editor") {
    console.error(`smoke-test: unexpected <title>: "${title}"`);
    failed = true;
  }

  const svgVisible = await page.locator("#svg").isVisible();
  if (!svgVisible) {
    console.error("smoke-test: #svg (map canvas) is not visible after load.");
    failed = true;
  }

  // Der Leerzustand wird am Inspektor abgelesen. Das Dateinamenfeld der
  // Statuszeile ist mit dem sechsten Durchgang entfallen - der Name steht
  // seitdem im Menue "Karte".
  const initialEmptyText = await page.locator("#inspectorSubtitle").innerText();
  if (!/keine karte geladen/i.test(initialEmptyText)) {
    console.error(`smoke-test: unexpected initial #inspectorSubtitle text: "${initialEmptyText}"`);
    failed = true;
  }

  // Toggle language and verify translated UI text actually changes.
  const langToggle = page.locator("#languageToggle, [id*='lang' i]").first();
  if (await langToggle.count()) {
    await langToggle.click();
    await page.waitForTimeout(100);
    const afterToggle = await page.locator("#inspectorSubtitle").innerText();
    if (!/no map loaded/i.test(afterToggle)) {
      console.error(`smoke-test: language toggle did not translate #inspectorSubtitle (got "${afterToggle}").`);
      failed = true;
    }
  } else {
    console.error("smoke-test: could not find a language toggle control to test (selector may be stale).");
    failed = true;
  }

  // Coordinate reference UI + absolute WGS84 import, end to end in the browser.
  // A synthetic 40 x 50 m map near Berlin - never a real user map.
  const origin = { lat: 52.5, lon: 13.4 };
  const lonStep = 40 / (111111 * Math.cos((origin.lat * Math.PI) / 180));
  const latStep = 50 / 111111;

  const absoluteMap = {
    type: "FeatureCollection",
    referenceOrigin: origin,
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [origin.lon, origin.lat],
            [origin.lon + lonStep, origin.lat],
            [origin.lon + lonStep, origin.lat + latStep],
            [origin.lon, origin.lat + latStep],
            [origin.lon, origin.lat],
          ]],
        },
      },
    ],
  };

  await page.locator("#fileInput").setInputFiles({
    name: "smoke-test-map.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify(absoluteMap)),
  });
  await page.waitForTimeout(300);

  // textContent, not innerText: these live inside collapsed <details> sections.
  const width = await page.locator("#widthStat").textContent();
  const height = await page.locator("#heightStat").textContent();

  // Converted correctly, the synthetic map must measure ~40 m x ~50 m.
  const widthMeters = Number.parseFloat(width);
  const heightMeters = Number.parseFloat(height);

  if (!(Math.abs(widthMeters - 40) < 0.5 && Math.abs(heightMeters - 50) < 0.5)) {
    console.error(
      `smoke-test: absolute WGS84 import produced wrong dimensions: ${width} x ${height} (expected ~40 m x ~50 m).`
    );
    failed = true;
  }

  const originStatus = await page.locator("#originStatus").textContent();
  if (!/absolute WGS84|absolutem WGS84/i.test(originStatus)) {
    console.error(`smoke-test: unexpected #originStatus after absolute import: "${originStatus}"`);
    failed = true;
  }

  if (pageErrors.length > 0) {
    console.error(`smoke-test: ${pageErrors.length} uncaught page error(s):`);
    for (const e of pageErrors) console.error(`  - ${e}`);
    failed = true;
  }
  if (consoleErrors.length > 0) {
    console.error(`smoke-test: ${consoleErrors.length} console.error() call(s):`);
    for (const e of consoleErrors) console.error(`  - ${e}`);
    failed = true;
  }
} finally {
  await browser.close();
}

console.log(
  failed
    ? "smoke-test: FAILED"
    : "smoke-test: OK - app loads, language toggle works, absolute WGS84 import converts correctly, no console/page errors."
);
process.exitCode = failed ? 1 : 0;
