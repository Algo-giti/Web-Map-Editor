#!/usr/bin/env node
// Browsertest für den Inspektor (Etappe 4: Gerüst und zwei Zustände).
//
// Drei Dinge, die beim Verschieben von Markup lautlos verlorengehen und
// deshalb ausdrücklich zugesichert werden:
//
//   1. Enter in den E/N-Feldern übernimmt weiterhin.
//   2. Die Tab-Reihenfolge führt durch den sichtbaren Block.
//   3. Ein ausgeblendeter Block hat KEINE Tabstopps.
//
// Sichtbarkeit wird über den BERECHNETEN Stil geprüft, nie über das
// hidden-Attribut: eine Regel wie `.inspector-block { display:flex; }` schlägt
// die Browser-Vorgabe [hidden]{display:none}, während element.hidden weiterhin
// true meldet. Genau das ist beim Bau passiert.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-inspector.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-inspector";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

const PERIMETER = {
  type: "Feature",
  properties: { name: "perimeter" },
  geometry: { type: "Polygon", coordinates: [[
    [0, 0], [40, 0], [40, 40], [0, 40], [0, 0],
  ]] },
};

/** Exclusion mit Loch - zwei Ringe im selben Feature. */
const MIT_LOCH = {
  type: "Feature", idx: 0, properties: { name: "exclusion" },
  geometry: { type: "Polygon", coordinates: [
    [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]],
    [[8, 8], [12, 8], [12, 12], [8, 12], [8, 8]],
  ] },
};

/** Search Wire aus zwei getrennten Linien. */
const ZWEI_LINIEN = {
  type: "Feature", properties: { name: "search wire" },
  geometry: { type: "MultiLineString", coordinates: [
    [[20, 20], [25, 20], [30, 20]],
    [[20, 30], [25, 30]],
  ] },
};

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.setViewportSize({ width: 1600, height: 900 });

  const load = async (extra = []) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.locator("#fileInput").setInputFiles({
      name: "inspector.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify({
        type: "FeatureCollection", features: [PERIMETER, ...extra],
      })),
    });
    await page.waitForTimeout(450);
  };

  /** Sichtbarkeit über den berechneten Stil, nicht über das Attribut. */
  const visible = (id) =>
    page.evaluate((x) =>
      getComputedStyle(document.getElementById(x)).display !== "none", id);

  const head = () =>
    page.evaluate(() => ({
      titel: document.getElementById("inspectorTitle").textContent.trim(),
      unter: document.getElementById("inspectorSubtitle").textContent.trim(),
      hoehe: Math.round(
        document.querySelector(".inspector-head").getBoundingClientRect().height),
      oben: Math.round(
        document.querySelector(".inspector-head").getBoundingClientRect().top),
    }));

  /* ---------------------------------------------------------------- */
  console.log("Zwei Zustände, genau einer sichtbar");

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  check("der Inspektor ist 320 px breit",
    (await page.evaluate(() =>
      Math.round(document.getElementById("inspector").getBoundingClientRect().width))) === 320,
    String(await page.evaluate(() =>
      Math.round(document.getElementById("inspector").getBoundingClientRect().width))));

  check("ohne Karte: der leere Zustand steht", await visible("inspectorEmpty"));
  check("und der Punktzustand nicht", !(await visible("inspectorPoint")));

  const leer = await head();
  check("der Kopf sagt, dass nichts ausgewählt ist",
    leer.titel === "Nichts ausgewählt", leer.titel);
  check("und nennt den Grund", leer.unter === "Keine Karte geladen", leer.unter);

  await load();
  const geladen = await head();
  check("mit Karte fordert er zum Klicken auf",
    geladen.unter === "Punkt auf der Karte anklicken", geladen.unter);

  const marks = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  await marks.nth(2).click();
  await page.waitForTimeout(300);

  check("nach dem Klick steht der Punktzustand", await visible("inspectorPoint"));
  check("und der leere nicht mehr", !(await visible("inspectorEmpty")));

  const punkt = await head();
  check("der Kopf nennt Nummer und Anzahl",
    /^Punkt \d+ von \d+$/.test(punkt.titel), punkt.titel);

  /* Der Anker darf nicht wandern - das ist der Zweck des Kopfblocks. */
  check("der Kopfblock steht an derselben Stelle",
    punkt.oben === geladen.oben, `${punkt.oben} statt ${geladen.oben}`);
  check("und ist gleich hoch",
    punkt.hoehe === geladen.hoehe, `${punkt.hoehe} statt ${geladen.hoehe}`);

  /* ---------------------------------------------------------------- */
  console.log("Behälter werden nur benannt, wenn es mehrere gibt");

  check("ein einfaches Polygon heißt schlicht Polygon",
    punkt.unter.endsWith("· Polygon"), punkt.unter);

  await load([MIT_LOCH]);
  const ringe = page.locator('#vertexGroup circle[data-layer="exclusion"]');

  check("beide Ringe sind editierbar", (await ringe.count()) === 8,
    String(await ringe.count()));

  await ringe.nth(0).click();
  await page.waitForTimeout(250);
  const ring1 = await head();

  await ringe.nth(5).click();
  await page.waitForTimeout(250);
  const ring2 = await head();

  check("der äußere Ring wird benannt",
    ring1.unter.includes("Ring 1 von 2"), ring1.unter);
  check("das Loch wird als zweiter Ring benannt",
    ring2.unter.includes("Ring 2 von 2"), ring2.unter);
  check("zwei Punkte mit gleicher Nummer sind unterscheidbar",
    ring1.unter !== ring2.unter, `${ring1.unter} / ${ring2.unter}`);

  await load([ZWEI_LINIEN]);
  const linien = page.locator('#vertexGroup circle[data-layer="searchwire"]');
  await linien.nth(4).click();
  await page.waitForTimeout(250);

  check("bei mehreren Linien wird die Linie benannt",
    (await head()).unter.includes("Linie 2 von 2"), (await head()).unter);

  /* ---------------------------------------------------------------- */
  console.log("Tastaturbedienung");

  await load();
  await marks.nth(1).click();
  await page.waitForTimeout(300);

  /* Enter übernimmt - der Handler hängt an der id, nicht am Ort. */
  await page.fill("#pointEastInput", "12,50");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);

  check("Enter in East übernimmt den Wert",
    (await page.locator("#editStatus").textContent()).length > 0 &&
    (await page.locator("#pointEastInput").inputValue()).includes("12,50"),
    `${await page.locator("#editStatus").textContent()} | ${await page.locator("#pointEastInput").inputValue()}`);

  await page.fill("#pointNorthInput", "7,25");
  await page.locator("#pointNorthInput").press("Enter");
  await page.waitForTimeout(350);

  check("Enter in North übernimmt ebenfalls",
    (await page.locator("#pointNorthInput").inputValue()).includes("7,25"),
    await page.locator("#pointNorthInput").inputValue());

  /* Tab führt durch den sichtbaren Block. */
  const focusAfterTabs = async (start, count) => {
    await page.locator(`#${start}`).focus();
    for (let i = 0; i < count; i++) await page.keyboard.press("Tab");
    return page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  };

  check("von East führt Tab nach North",
    (await focusAfterTabs("pointEastInput", 1)) === "pointNorthInput",
    await focusAfterTabs("pointEastInput", 1));
  check("von North zum ersten Knopf des Blocks",
    (await focusAfterTabs("pointNorthInput", 1)) === "insertPointBeforeBtn",
    await focusAfterTabs("pointNorthInput", 1));

  /*
   * Der entscheidende Punkt: aus dem sichtbaren Block darf man nicht in den
   * ausgeblendeten tabben. Mit display:none ist das automatisch - mit
   * visibility oder Deckkraft wäre es das NICHT.
   */
  const wegVomBlock = await page.evaluate(() => {
    const versteckt = document.getElementById("inspectorEmpty");
    return [...versteckt.querySelectorAll(
      "a[href],button,input,select,textarea,summary,[tabindex]")]
      .filter((el) => el.offsetParent !== null).length;
  });

  check("der ausgeblendete Block hat keine erreichbaren Tabstopps",
    wegVomBlock === 0, String(wegVomBlock));

  /* ---------------------------------------------------------------- */
  console.log("Der Erklärtext frisst keinen Platz");

  await load();

  check("die Darstellungs-Erklärung ist eingeklappt",
    await page.evaluate(() =>
      !document.querySelector("#inspectorEmpty .inspector-note").open));

  check("das Karteninfo-Fenster liegt nicht mehr auf der Karte",
    (await page.locator(".map-info-window").count()) === 0);

  /* ---------------------------------------------------------------- */
  console.log("Seitenleiste einklappen (Zwischenstand)");

  /*
   * Solange Seitenleiste UND Inspektor stehen, belegen sie zusammen bis zu
   * 680 px. Bei 1280 px Fensterbreite blieben der Karte 544 px - weniger als
   * die 600, ab denen Zeichnen und Rechteckauswahl brauchbar sind. Der
   * Schalter macht den Zwischenstand beurteilbar. Entfällt mit Etappe 6.
   */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);

  const mapWidth = () =>
    page.evaluate(() =>
      Math.round(document.getElementById("viewer").getBoundingClientRect().width));

  const sidebarShown = () =>
    page.evaluate(() =>
      getComputedStyle(document.getElementById("sidebar")).display !== "none");

  const schmal = await mapWidth();

  check("mit Seitenleiste ist die Karte eng", schmal < 600, String(schmal));
  check("die Seitenleiste steht", await sidebarShown());

  await page.locator("#sidebarToggle").click();
  await page.waitForTimeout(300);

  check("eingeklappt ist die Seitenleiste weg", !(await sidebarShown()));
  check("und die Karte deutlich breiter",
    (await mapWidth()) > schmal + 300, `${await mapWidth()} statt >${schmal + 300}`);
  check("die Karte ist wieder brauchbar breit",
    (await mapWidth()) >= 600, String(await mapWidth()));

  /*
   * Die Spalte der Werkzeugleiste ist fest, nicht `auto`: ein auto-Track nahm
   * sich beim Einklappen seine max-content-Breite (659 statt 168 px) und fraß
   * den Gewinn auf. Und das eingeklappte Raster hat DREI Spalten - mit einer
   * 0-Spalte landete die Karte in der Spalte der Werkzeugleiste.
   */
  check("die Werkzeugleiste bleibt schmal",
    (await page.evaluate(() =>
      Math.round(document.getElementById("toolRail").getBoundingClientRect().width))) <= 168,
    String(await page.evaluate(() =>
      Math.round(document.getElementById("toolRail").getBoundingClientRect().width))));
  check("der Inspektor behält seine 320 px",
    (await page.evaluate(() =>
      Math.round(document.getElementById("inspector").getBoundingClientRect().width))) === 320);

  await page.locator("#sidebarToggle").click();
  await page.waitForTimeout(300);

  check("wieder ausklappen geht", await sidebarShown());
  check("und die Karte ist wieder eng", (await mapWidth()) === schmal);

  /* Der Zustand ist vorübergehend - er darf den Neuaufbau NICHT überleben. */
  await page.locator("#sidebarToggle").click();
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);

  check("nach dem Neuladen steht die Seitenleiste wieder",
    await sidebarShown(), "Zustand hat den Neuaufbau überlebt");

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(250);
  await load();
  await marks.nth(0).click();
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Übersetzung");

  await marks.nth(0).click();
  await page.waitForTimeout(250);
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  const english = await head();
  check("der Kopf ist übersetzt",
    /^Point \d+ of \d+$/.test(english.titel), english.titel);
  check("auch der Behälter",
    english.unter.includes("polygon"), english.unter);

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und kommt zurück",
    /^Punkt \d+ von \d+$/.test((await head()).titel), (await head()).titel);

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Der Inspektor zeigt genau einen Zustand und bleibt tastaturbedienbar.");
