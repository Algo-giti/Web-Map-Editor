#!/usr/bin/env node
// Browsertest für "Linie begradigen".
//
// tools/test-geometry.mjs prüft die Mathematik. Hier geht es um den Klickpfad
// und um die Vorschau: die wird in renderSelectionGhost() gezeichnet, das
// zuvor früh ausstieg, wenn es keine Vergleichszustände gab. Dass die Vorschau
// auch ohne Ghosts erscheint, lässt sich nur in einem echten Browser zeigen.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs; fehlt
// playwright-core oder startet kein Browser, gibt der Test eine Anleitung aus
// und endet mit 0.
//
// Die Testkarte wird synthetisch erzeugt. Es liegt keine Kartendatei im
// Repository und es wird keine gelesen.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-straighten.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-straighten";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

/*
 * Eine offene Search Wire mit fünf Punkten. Die drei mittleren liegen deutlich
 * neben der Verbindung von Anfang und Ende, damit die Begradigung sichtbar
 * etwas tut. Relativdarstellung: Meter geteilt durch 111111.
 */
const SCALE = 111111;
const METRES = [
  [0, 0],
  [10, 6],
  [20, -4],
  [30, 8],
  [40, 0],
];

function syntheticMap() {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "search wire" },
        geometry: {
          type: "LineString",
          coordinates: METRES.map(([east, north]) => [east / SCALE, north / SCALE]),
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
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  /*
   * Die Mäher-Vorschau ersetzt den ausgewählten Punkt durch eine Mäherform.
   * Der zugehörige Kreis verschwindet dadurch aus #vertexGroup und die Indizes
   * der übrigen Marker verschieben sich. Für diesen Test wird sie abgeschaltet,
   * damit die Marker stabil adressierbar bleiben.
   */
  const expandSidebar = () =>
    page.evaluate(() => {
      document.querySelectorAll("#sidebar details")
        .forEach((section) => section.setAttribute("open", ""));
    });

  await expandSidebar();
  await page.uncheck("#showMowerPreview");

  await page.locator("#fileInput").setInputFiles({
    name: "synthetic-line.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(syntheticMap()),
  });
  await page.waitForTimeout(400);

  /** Alle editierbaren Punktmarker in der Reihenfolge des Linienzugs. */
  const markers = page.locator("#vertexGroup circle");
  check("fünf Punktmarker gezeichnet", (await markers.count()) === 5,
    String(await markers.count()));

  /** Liest die Geometrie direkt aus dem SVG-Pfad zurück - unabhängig vom Editor. */
  const readGeometry = () =>
    page.evaluate(() => {
      const circles = [...document.querySelectorAll("#vertexGroup circle")];
      return circles.map((circle) => [
        Number(circle.getAttribute("cx")),
        -Number(circle.getAttribute("cy")),
      ]);
    });

  const before = await readGeometry();

  /* ---------------------------------------------------------------- */
  console.log("Auswahl über Klick und Strg+Klick");

  const straighten = page.locator("#straightenSelectionBtn");

  check("Begradigen ist ohne Auswahl gesperrt", await straighten.isDisabled());
  check("Titel nennt den Grund",
    (await straighten.getAttribute("title")).includes("genau zwei Punkte"));

  await markers.nth(0).click();
  await page.waitForTimeout(150);

  check("mit einem Punkt weiterhin gesperrt", await straighten.isDisabled());

  await markers.nth(4).click({ modifiers: ["Control"] });
  await page.waitForTimeout(200);

  check("Zähler zeigt zwei Punkte",
    (await page.locator("#multiSelectionInfo").textContent()).startsWith("2"),
    await page.locator("#multiSelectionInfo").textContent());
  check("Begradigen ist jetzt freigegeben", await straighten.isEnabled());
  check("Titel nennt die Anzahl der betroffenen Punkte",
    (await straighten.getAttribute("title")).includes("3 Punkte"),
    await straighten.getAttribute("title"));

  /* ---------------------------------------------------------------- */
  console.log("Vorschau erscheint ohne vorhandene Vergleichszustände");

  check("Vorschaulinie ist gezeichnet",
    (await page.locator("#selectionGhostGroup .straighten-preview-line").count()) === 1);
  check("betroffene Punkte sind hervorgehoben",
    (await page.locator("#selectionGhostGroup .straighten-preview-node").count()) === 3,
    String(await page.locator("#selectionGhostGroup .straighten-preview-node").count()));

  /* ---------------------------------------------------------------- */
  console.log("Begradigen");

  await straighten.click();
  await page.waitForTimeout(300);

  const after = await readGeometry();

  /*
   * Der Titel des Zurück-Buttons nennt die oberste Historienmarke. Damit lässt
   * sich prüfen, dass die Begradigung genau EINEN Eintrag erzeugt hat - das
   * Laden der Karte ist selbst schon einer.
   */
  check("Begradigen erzeugt einen Historieneintrag",
    (await page.locator("#undoBtn").getAttribute("title")).includes("Linie begradigen"),
    await page.locator("#undoBtn").getAttribute("title"));

  check("Anzahl der Punkte unverändert", after.length === 5, String(after.length));
  check("Anker links unverändert",
    Math.abs(after[0][0] - before[0][0]) < 1e-9 &&
    Math.abs(after[0][1] - before[0][1]) < 1e-9);
  check("Anker rechts unverändert",
    Math.abs(after[4][0] - before[4][0]) < 1e-9 &&
    Math.abs(after[4][1] - before[4][1]) < 1e-9);

  /*
   * Die Anker liegen beide auf North = 0, die Gerade ist also die Ost-Achse.
   * Alle Zwischenpunkte müssen danach dort liegen.
   */
  const offLine = after.slice(1, 4).filter(([, north]) => Math.abs(north) > 1e-9);
  check("alle Zwischenpunkte liegen auf der Geraden", offLine.length === 0,
    JSON.stringify(after.slice(1, 4)));

  check("East-Werte der Zwischenpunkte bleiben erhalten",
    after.slice(1, 4).every((point, index) =>
      Math.abs(point[0] - before[index + 1][0]) < 1e-9),
    JSON.stringify(after.slice(1, 4).map((p) => p[0])));

  check("Erfolgsmeldung nennt die Anzahl",
    (await page.locator("#editStatus").textContent()).includes("3 Punkte begradigt"),
    await page.locator("#editStatus").textContent());

  /* ---------------------------------------------------------------- */
  console.log("Ein einziges Undo stellt alles wieder her");

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  const restored = await readGeometry();

  check("Undo stellt alle fünf Punkte wieder her",
    restored.length === before.length &&
    restored.every((point, index) =>
      Math.abs(point[0] - before[index][0]) < 1e-9 &&
      Math.abs(point[1] - before[index][1]) < 1e-9),
    JSON.stringify(restored));

  check("ein einziges Undo räumt die Begradigung ab",
    !(await page.locator("#undoBtn").getAttribute("title")).includes("Linie begradigen"),
    await page.locator("#undoBtn").getAttribute("title"));

  /* ---------------------------------------------------------------- */
  console.log("Nicht unterstützte Feature-Typen bleiben unangetastet");

  /*
   * Eine Karte mit zwei Exclusions, einem unbekannten und einem namenlosen
   * Feature. Das unbekannte Feature steht bewusst ZWISCHEN den Exclusions:
   * die idx-Vergabe läuft über alle Features und ist genau hier anfällig.
   */
  const mixedMap = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        idx: 0,
        properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [0.00002, 0], [0.00002, 0.00002], [0, 0.00002], [0, 0],
        ]] },
      },
      {
        type: "Feature",
        properties: { name: "mow path", customField: "unangetastet" },
        geometry: { type: "LineString", coordinates: [
          [0.0001, 0], [0.00012, 0.00003], [0.00014, 0],
        ] },
      },
      {
        type: "Feature",
        idx: 7,
        properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [[
          [0.0002, 0], [0.00022, 0], [0.00022, 0.00002], [0.0002, 0.00002], [0.0002, 0],
        ]] },
      },
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[0.0003, 0], [0.00032, 0]] },
      },
    ],
  };

  await page.locator("#fileInput").setInputFiles({
    name: "mixed.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify(mixedMap)),
  });
  await page.waitForTimeout(400);
  await expandSidebar();

  /* Zwei Exclusions à 4 editierbare Ecken; die beiden anderen bekommen nichts. */
  check("nur unterstützte Features bekommen Punktmarker",
    (await page.locator("#vertexGroup circle").count()) === 8,
    String(await page.locator("#vertexGroup circle").count()));

  /* Die Geometrie der nicht unterstützten Features wird trotzdem gezeichnet. */
  check("nicht unterstützte Features bleiben sichtbar",
    (await page.locator('#geometryGroup path[data-layer="other"]').count()) >= 2,
    String(await page.locator('#geometryGroup path[data-layer="other"]').count()));

  console.log("Kartenprüfung trennt die beiden Fälle");
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);

  const report = await page.locator("#validationReport").textContent();
  check("gesetzter, unbekannter Name ist ein Fehler",
    report.includes("mow path") && report.includes("unbekannter Typ"),
    report.slice(0, 200));
  check("namenlose Features werden zu einer Meldung zusammengefasst",
    report.includes("1 Feature ohne Typangabe"),
    report.slice(0, 200));

  console.log("Bearbeiten eines anderen Features und Speichern");

  /* An einer der Exclusions arbeiten - das unbekannte Feature bleibt unberührt. */
  await page.locator("#vertexGroup circle").nth(0).click();
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);

  const pendingExport = page
    .waitForEvent("download", { timeout: 5000 })
    .catch(() => null);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#exportBtn").click();

  const exportEvent = await pendingExport;
  check("Speichern ist trotz Validierungsfehler möglich", !!exportEvent);

  if (exportEvent) {
    const stream = await exportEvent.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const saved = JSON.parse(Buffer.concat(chunks).toString());

    check("kein Feature ist verloren gegangen",
      saved.features.length === 4, String(saved.features.length));

    const unknown = saved.features[1];
    check("unbekanntes Feature behält seinen Namen",
      unknown.properties.name === "mow path", JSON.stringify(unknown.properties));
    check("unbekanntes Feature behält fremde properties",
      unknown.properties.customField === "unangetastet");
    check("unbekanntes Feature behält seine Geometrie",
      JSON.stringify(unknown.geometry) ===
      JSON.stringify(mixedMap.features[1].geometry),
      JSON.stringify(unknown.geometry));
    check("unbekanntes Feature bekommt kein idx",
      unknown.idx === undefined && unknown.properties.idx === undefined);

    const nameless = saved.features[3];
    check("namenloses Feature bleibt ohne properties",
      nameless.properties === undefined,
      JSON.stringify(nameless.properties));
    check("namenloses Feature behält seine Geometrie",
      JSON.stringify(nameless.geometry) ===
      JSON.stringify(mixedMap.features[3].geometry));

    /*
     * Speichern nummeriert bewusst NICHT um - die geladenen Indizes bleiben
     * stehen, auch die Lücke zwischen 0 und 7.
     */
    check("Speichern lässt vorhandene Exclusion-Indizes unverändert",
      saved.features[0].idx === 0 && saved.features[2].idx === 7,
      `${saved.features[0].idx} / ${saved.features[2].idx}`);
  }

  /*
   * Die Neunummerierung läuft über ALLE Features und muss die
   * dazwischenliegenden nicht unterstützten überspringen, ohne sich zu
   * verzählen. Ausgelöst wird sie durch das Duplizieren einer Exclusion.
   */
  console.log("Neunummerierung überspringt nicht unterstützte Features");

  await page.locator('[data-action="duplicate-exclusion"]').first().click();
  await page.waitForTimeout(300);

  const pendingSecond = page
    .waitForEvent("download", { timeout: 5000 })
    .catch(() => null);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#exportBtn").click();

  const secondExport = await pendingSecond;
  check("Export nach dem Duplizieren", !!secondExport);

  if (secondExport) {
    const stream = await secondExport.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const renumbered = JSON.parse(Buffer.concat(chunks).toString());

    const exclusions = renumbered.features
      .filter((feature) => feature.properties?.name === "exclusion");

    check("drei Exclusions nach dem Duplizieren",
      exclusions.length === 3, String(exclusions.length));
    check("alle Exclusions sind lückenlos ab 0 nummeriert",
      exclusions.every((feature, index) => feature.idx === index),
      JSON.stringify(exclusions.map((feature) => feature.idx)));

    check("nicht unterstützte Features bekommen dabei kein idx",
      renumbered.features
        .filter((feature) => feature.properties?.name !== "exclusion")
        .every((feature) => feature.idx === undefined),
      JSON.stringify(renumbered.features.map((feature) =>
        [feature.properties?.name ?? null, feature.idx])));

    check("nicht unterstützte Features sind auch danach unverändert",
      renumbered.features.some((feature) =>
        feature.properties?.name === "mow path" &&
        feature.properties?.customField === "unangetastet"));
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Begradigen funktioniert über den Klickpfad, Vorschau und Undo inbegriffen.");
