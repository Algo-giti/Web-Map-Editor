#!/usr/bin/env node
// Browsertest für die Werkzeugleiste links.
//
// Geprüft wird die Gliederung (drei Gruppen, getrennt nach "verändert die
// Karte" und "verändert sie nicht"), dass die Werkzeuge von dort aus wirklich
// arbeiten, und das Verhalten in den drei Breitenstufen.
//
// Die Stufen sind der unintuitive Teil: eine senkrechte Leiste ist immer so
// breit wie ihre längste Beschriftung. Einzelnen Gruppen den Text zu nehmen
// spart deshalb Höhe, nicht Breite - erst wenn alle ihn verlieren, wird die
// Leiste schmal.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-toolbar.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-toolbar";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

const MAP = JSON.stringify({
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "perimeter" },
    geometry: { type: "Polygon", coordinates: [[
      [0, 0], [40, 0], [40, 40], [0, 40], [0, 0],
    ]] },
  }],
});

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const rail = page.locator("#toolRail");

  /* ---------------------------------------------------------------- */
  console.log("Gliederung");

  check("die Leiste ist da", await rail.isVisible());

  const groups = await page.locator("#toolRail .tool-group-title").allTextContents();
  check("drei Gruppen in der geplanten Reihenfolge",
    JSON.stringify(groups.map((t) => t.trim())) ===
      JSON.stringify(["Auswählen", "Zeichnen", "Prüfen"]),
    JSON.stringify(groups));

  check("Prüfen bleibt eigene Gruppe mit zwei Einträgen",
    (await page.locator("#toolRail .tool-group").nth(2).locator("button").count()) === 2,
    String(await page.locator("#toolRail .tool-group").nth(2).locator("button").count()));

  /* Die Umformwerkzeuge gehören nicht hierher - sie hängen an der Auswahl. */
  for (const id of ["straightenSelectionBtn", "reduceApplyBtn", "rectifyApplyBtn"]) {
    check(`#${id} steht nicht in der Leiste`,
      await page.evaluate((x) =>
        !document.getElementById("toolRail").contains(document.getElementById(x)), id));
  }

  /* Der Verschieben-Knopf war reine Doppelung des Zeigers und ist entfallen. */
  check("der doppelte Verschieben-Knopf ist weg",
    (await page.locator("#mapMoveSelectionBtn").count()) === 0);

  /* ---------------------------------------------------------------- */
  console.log("Zoom und Einpassen liegen an der Karte");

  for (const id of ["fitBtn", "zoomInBtn", "zoomOutBtn"]) {
    check(`#${id} liegt im Kartenbereich`,
      await page.evaluate((x) =>
        document.getElementById("viewer").contains(document.getElementById(x)), id));
    check(`#${id} steht nicht mehr in der Kopfzeile`,
      await page.evaluate((x) =>
        !document.querySelector("header").contains(document.getElementById(x)), id));
  }

  /* ---------------------------------------------------------------- */
  console.log("Die Werkzeuge arbeiten von dort aus");

  await page.locator("#fileInput").setInputFiles({
    name: "rail.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(400);

  const activeTools = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#toolRail .tool-button.active")]
        .map((b) => b.dataset.selectionTool || b.id));

  await page.locator('[data-selection-tool="lasso"]').click();
  await page.waitForTimeout(200);

  check("das Lasso wird als aktiv markiert",
    (await activeTools()).includes("lasso"), JSON.stringify(await activeTools()));

  await page.locator('[data-selection-tool="pointer"]').click();
  await page.waitForTimeout(200);

  check("und der Zeiger löst es wieder ab",
    (await activeTools()).includes("pointer") &&
    !(await activeTools()).includes("lasso"),
    JSON.stringify(await activeTools()));

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  check("das Zeichenwerkzeug startet",
    (await activeTools()).includes("drawExclusionBtn"),
    JSON.stringify(await activeTools()));
  check("und meldet sich in der Statuszeile",
    (await page.locator("#editStatus").textContent()).includes("Exclusion"),
    await page.locator("#editStatus").textContent());

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  check("die Kartenprüfung läuft von der Leiste aus",
    (await page.locator("#validationShort").textContent()).trim() !== "nicht geprüft",
    await page.locator("#validationShort").textContent());

  /* ---------------------------------------------------------------- */
  console.log("Gesperrte Werkzeuge nennen ihren Grund");

  /*
   * Ein gesperrter Knopf ohne Begründung war der Befund beim Durchklicken:
   * "Search Wire zeichnen" blieb grau, weil die Karte schon eine hat - nur
   * stand das nirgends. Ein natives disabled kann es auch nicht sagen: es
   * schluckt jeden Klick, und sein Tooltip erscheint auf Touch nie.
   */
  const WITH_WIRE = JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [40, 0], [40, 40], [0, 40], [0, 0]]] } },
      { type: "Feature", properties: { name: "search wire" },
        geometry: { type: "LineString", coordinates: [[5, 5], [10, 5], [15, 5]] } },
    ],
  });

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.locator("#fileInput").setInputFiles({
    name: "wire.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(WITH_WIRE),
  });
  await page.waitForTimeout(400);

  const wireButton = page.locator("#drawSearchWireBtn");

  check("der Knopf ist als gesperrt ausgezeichnet",
    (await wireButton.getAttribute("aria-disabled")) === "true",
    await wireButton.getAttribute("aria-disabled"));
  check("der Grund steht im Tooltip",
    (await wireButton.getAttribute("title")).includes("bereits eine Search Wire"),
    await wireButton.getAttribute("title"));

  /*
   * Entscheidend: der Klick kommt an und der Grund wird sichtbar.
   *
   * force ist nötig, weil Playwright aria-disabled="true" als "nicht
   * bedienbar" wertet und den Klick sonst gar nicht erst schickt. Die
   * Auszeichnung ist trotzdem richtig - aria-disabled beschreibt den Zustand
   * für Screenreader und unterdrückt keine Ereignisse; ein echter Nutzer
   * klickt den Knopf ohne Weiteres.
   */
  await wireButton.click({ force: true });
  await page.waitForTimeout(300);

  check("der Klick nennt den Grund in der Meldungszeile",
    (await page.locator("#editStatus").textContent()).includes("bereits eine Search Wire"),
    await page.locator("#editStatus").textContent());
  check("und startet keine Zeichnung",
    (await page.locator("#cancelDrawBtn").isDisabled()),
    "Zeichnung wurde gestartet");

  /* Der Dockpfad daneben ist frei - dieselbe Karte, anderes Feature. */
  check("der Dockpfad ist nicht gesperrt",
    (await page.locator("#createDockBtn").getAttribute("aria-disabled")) === "false",
    await page.locator("#createDockBtn").getAttribute("aria-disabled"));

  await page.locator("#createDockBtn").click();
  await page.waitForTimeout(250);

  check("und lässt sich starten",
    await page.locator("#cancelDrawBtn").isEnabled());

  /* Während einer Zeichnung sind die übrigen gesperrt - ebenfalls mit Grund. */
  check("laufende Zeichnung sperrt die anderen",
    (await page.locator("#drawExclusionBtn").getAttribute("title"))
      .includes("bereits gezeichnet"),
    await page.locator("#drawExclusionBtn").getAttribute("title"));

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Mauszeiger zeigt das Werkzeug");

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.locator("#fileInput").setInputFiles({
    name: "cursor.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(400);

  const cursorOf = (selector) =>
    page.evaluate((s) => getComputedStyle(document.querySelector(s)).cursor, selector);

  check("Zeiger: die Karte lässt sich greifen",
    (await cursorOf("#svg")) === "grab", await cursorOf("#svg"));

  await page.locator('[data-selection-tool="lasso"]').click();
  await page.waitForTimeout(200);
  check("Lasso: Fadenkreuz", (await cursorOf("#svg")) === "crosshair",
    await cursorOf("#svg"));

  await page.locator('[data-selection-tool="pointer"]').click();
  await page.waitForTimeout(200);

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);
  check("Zeichnen: Fadenkreuz", (await cursorOf("#svg")) === "crosshair",
    await cursorOf("#svg"));

  /* Auch über einem Punktmarker - das Werkzeug schlägt den Marker. */
  check("beim Zeichnen auch über einem Punkt",
    (await cursorOf('#vertexGroup circle[data-layer="perimeter"]')) === "crosshair",
    await cursorOf('#vertexGroup circle[data-layer="perimeter"]'));

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  check("ohne Werkzeug zeigt der Punkt Verschieben an",
    (await cursorOf('#vertexGroup circle[data-layer="perimeter"]')) === "move",
    await cursorOf('#vertexGroup circle[data-layer="perimeter"]'));

  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);
  check("Messen: Fadenkreuz", (await cursorOf("#svg")) === "crosshair",
    await cursorOf("#svg"));
  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Aktive Markierung überlebt die Sperre");

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  const marked = await page.evaluate(() => {
    const b = document.getElementById("drawExclusionBtn");
    return {
      aktiv: b.classList.contains("active"),
      gesperrt: b.getAttribute("aria-disabled") === "true",
      deckkraft: getComputedStyle(b).opacity,
    };
  });

  check("das laufende Werkzeug ist aktiv und gesperrt zugleich",
    marked.aktiv && marked.gesperrt, JSON.stringify(marked));
  check("und behält seine volle Deckkraft",
    Number(marked.deckkraft) === 1, JSON.stringify(marked));

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Drei Breitenstufen");

  const measure = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);

    return page.evaluate(() => {
      const visible = (el) => el.getClientRects().length > 0;
      const labels = (scope) =>
        [...document.querySelectorAll(`${scope} .tool-label`)].filter(visible).length;

      return {
        breite: Math.round(document.getElementById("toolRail").getBoundingClientRect().width),
        auswahl: labels("#toolGroupSelect"),
        uebrige: labels("#toolRail") - labels("#toolGroupSelect"),
      };
    });
  };

  const weit = await measure(1440);
  check("breit: alle Beschriftungen sichtbar",
    weit.auswahl === 3 && weit.uebrige === 7, JSON.stringify(weit));
  check("breit: 168 px", weit.breite === 168, JSON.stringify(weit));

  const mittel = await measure(1050);
  check("mittel: die Auswahlwerkzeuge verlieren den Text zuerst",
    mittel.auswahl === 0 && mittel.uebrige === 7, JSON.stringify(mittel));
  check("mittel: die Breite bleibt - sie hängt an der längsten Beschriftung",
    mittel.breite === weit.breite, JSON.stringify(mittel));

  const eng = await measure(960);
  check("eng: keine Beschriftung mehr",
    eng.auswahl === 0 && eng.uebrige === 0, JSON.stringify(eng));
  check("eng: die Leiste ist schmal", eng.breite === 56, JSON.stringify(eng));

  /* Die Erklärung darf dabei nicht verschwinden, nur ihr Platz. */
  for (const id of ["drawCircleBtn", "measureBtn", "validateMapBtn"]) {
    const title = await page.locator(`#${id}`).getAttribute("title");
    check(`#${id} behält eingeklappt seinen Tooltip`,
      !!title && title.length > 20, `${id}: ${title}`);
  }

  check("bei erzwungener Enge ist der Umschalter gesperrt",
    await page.locator("#toolRailToggle").isDisabled());

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Einklappen von Hand");

  check("breit ist der Umschalter freigegeben",
    await page.locator("#toolRailToggle").isEnabled());

  const railWidth = () =>
    page.evaluate(() =>
      Math.round(document.getElementById("toolRail").getBoundingClientRect().width));

  check("ausgeklappt 168 px", (await railWidth()) === 168, String(await railWidth()));

  await page.locator("#toolRailToggle").click();
  await page.waitForTimeout(250);

  check("eingeklappt 56 px", (await railWidth()) === 56, String(await railWidth()));
  check("die Werkzeuge sind weiterhin da",
    (await page.locator("#toolRail .tool-button").count()) === 10,
    String(await page.locator("#toolRail .tool-button").count()));
  check("und behalten ihren Tooltip",
    (await page.locator("#drawCircleBtn").getAttribute("title")).includes("Mittelpunkt"));

  /* Der Zustand muss den Neuaufbau der Seite überleben. */
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);

  check("der Zustand wird gemerkt", (await railWidth()) === 56, String(await railWidth()));

  await page.locator("#toolRailToggle").click();
  await page.waitForTimeout(250);

  check("wieder ausklappen geht", (await railWidth()) === 168, String(await railWidth()));

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);

  check("und wird ebenfalls gemerkt", (await railWidth()) === 168, String(await railWidth()));

  /*
   * Die Leiste und ihre Rasterspalte muessen dieselbe Breite haben. Sie lasen
   * ihre Zahl frueher aus zwei Quellen - der Variablen an .app und einem
   * eigenen width - und konnten auseinanderlaufen; unter 980 px taten sie es
   * auch: das Raster reservierte 168 px fuer ein 56 px breites Element.
   *
   * Geprueft wird die WIRKUNG in beiden Zustaenden, nicht der Quelltext: die
   * berechnete Spaltenbreite gegen die gemessene Elementbreite.
   */
  const spalteGegenLeiste = () =>
    page.evaluate(() => {
      const spalten = getComputedStyle(document.querySelector("main"))
        .gridTemplateColumns.split(" ");
      return {
        spalte: Math.round(parseFloat(spalten[1])),
        leiste: Math.round(
          document.getElementById("toolRail").getBoundingClientRect().width),
      };
    });

  let paar = await spalteGegenLeiste();
  check("ausgeklappt fuellt die Leiste ihre Rasterspalte genau",
    paar.spalte === paar.leiste, JSON.stringify(paar));

  await page.locator("#toolRailToggle").click();
  await page.waitForTimeout(250);

  paar = await spalteGegenLeiste();
  check("eingeklappt ebenso", paar.spalte === paar.leiste, JSON.stringify(paar));

  /* Und auch dort, wo die Enge erzwungen ist und eine eigene Medienregel gilt. */
  await page.setViewportSize({ width: 940, height: 800 });
  await page.waitForTimeout(300);

  paar = await spalteGegenLeiste();
  check("und bei erzwungener Enge unter 980 px auch",
    paar.spalte === paar.leiste, JSON.stringify(paar));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Übersetzung");

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  const english = await page.locator("#toolRail").textContent();

  check("die Gruppennamen sind übersetzt",
    english.includes("Select") && english.includes("Draw") && english.includes("Validate"),
    english.slice(0, 120));
  check("kein deutscher Rest in der Leiste",
    !english.includes("Auswählen") && !english.includes("Zeichnen"),
    english.slice(0, 120));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Die Werkzeugleiste gliedert nach Wirkung und verhält sich in drei Stufen.");
