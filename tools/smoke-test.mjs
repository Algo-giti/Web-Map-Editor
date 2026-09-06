#!/usr/bin/env node
// Optional real-browser smoke test for index.html.
//
// This is the automated stand-in for the "browser runtime check" that
// AGENTS.md / DEVELOPMENT.md ask for before structural UI changes. It is
// intentionally NOT a project dependency (the app itself must stay
// framework-free/build-free/dependency-free) - it only requires
// `playwright-core` to be available in the environment you run it from.
//
// Setup (once per machine, outside the repo - e.g. in your scratch dir):
//   npm init -y && npm install playwright-core
//   npx --yes playwright install chromium   # or point CHROME_PATH at an
//                                            # already-cached Chrome/Chromium
//
// Then run from the repo root:
//   CHROME_PATH=/path/to/chrome node tools/smoke-test.mjs
// (CHROME_PATH is optional; if unset, playwright-core's own managed
// browser is used if installed.)
//
// index.html has no fetch()/XHR/external resources, so it is loaded
// directly via a file:// URL - no dev server needed.
//
// What real hardware/browser interaction this CANNOT verify:
//   - actual ESP32/Sunray firmware behavior or map compatibility
//   - real touch input on an Android device (only synthetic taps)
//   - the native file picker (file loading is simulated via test setup,
//     not exercised end-to-end)

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error(
    "smoke-test: playwright-core is not installed in this environment.\n" +
      "This check is optional and skipped by check-all.mjs on purpose.\n" +
      "See the setup instructions at the top of tools/smoke-test.mjs."
  );
  process.exit(0);
}

const indexUrl = pathToFileURL(new URL("../index.html", import.meta.url).pathname).href;

const launchOptions = {};
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;

let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch (err) {
  console.error(
    "smoke-test: could not launch a browser (" + err.message + ").\n" +
      "Set CHROME_PATH to a cached Chrome/Chromium executable, or run:\n" +
      "  npx --yes playwright install chromium"
  );
  process.exit(0);
}

const consoleErrors = [];
const pageErrors = [];
let failed = false;

try {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(indexUrl, { waitUntil: "load" });

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

  const initialFilename = await page.locator("#filename").innerText();
  if (!/keine karte geladen/i.test(initialFilename)) {
    console.error(`smoke-test: unexpected initial #filename text: "${initialFilename}"`);
    failed = true;
  }

  // Toggle language and verify translated UI text actually changes.
  const langToggle = page.locator("#languageToggle, [id*='lang' i]").first();
  if (await langToggle.count()) {
    await langToggle.click();
    await page.waitForTimeout(100);
    const afterToggle = await page.locator("#filename").innerText();
    if (!/no map loaded/i.test(afterToggle)) {
      console.error(`smoke-test: language toggle did not translate #filename (got "${afterToggle}").`);
      failed = true;
    }
  } else {
    console.error("smoke-test: could not find a language toggle control to test (selector may be stale).");
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

console.log(failed ? "smoke-test: FAILED" : "smoke-test: OK - app loads and language toggle works, no console/page errors.");
process.exitCode = failed ? 1 : 0;
