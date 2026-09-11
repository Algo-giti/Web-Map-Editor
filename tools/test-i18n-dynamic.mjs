#!/usr/bin/env node
// Browsertest für die Übersetzung von Inhalten, die erst zur Laufzeit
// entstehen.
//
// Der Schnappschuss-Mechanismus kennt nur die Textknoten vom Seitenaufbau.
// Alles, was später entsteht - Prüfbericht, Feature-Navigation, Statusmeldungen,
// die Titel von Zurück/Vor - blieb beim Sprachwechsel deutsch. Der Umbau der
// Oberfläche baut den Inspektor vollständig zur Laufzeit auf und wäre davon
// vollständig betroffen; deshalb wird der Weg hier vorher belegt.
//
// Geprüft wird ausdrücklich in BEIDE Richtungen: übersetzen können viele
// Mechanismen, zurückschalten ist der schwierige Teil, weil dafür das deutsche
// Original gebraucht wird.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-i18n-dynamic.mjs

import {
  createChecker,
  indexUrl,
  launchBrowser,
  menueBefehl,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-i18n-dynamic";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/** Karte in rohen Metern mit einem Befund, damit der Bericht Inhalt hat. */
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

  /*
   * Die Faltgeste kommt aus dem browser-harness, nicht aus einer eigenen Kopie.
   * openAllFolds() steht dort seit Etappe 6 b2 - er wurde nur nie benutzt, und
   * deshalb erreichte die Reparatur in 3c (die Feature-Karten der Navigation)
   * zunaechst keinen einzigen Test. Eine Geste an sieben Stellen wird an sechs
   * davon vergessen.
   */

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await openAllFolds(page);
  await menueBefehl(page, "Ansicht", "Mäher am ausgewählten Punkt anzeigen");

  await page.locator("#fileInput").setInputFiles({
    name: "i18n.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(400);
  await openAllFolds(page);

  const toggle = async () => {
    await page.locator("#languageToggle").click();
    await page.waitForTimeout(400);
    await openAllFolds(page);
  };

  const report = () => page.locator("#validationReport").textContent();
  const navigator = () => page.locator("#featureNavigator").textContent();
  const editStatus = () => page.locator("#editStatus").textContent();
  const undoTitle = () => page.locator("#undoBtn").getAttribute("title");

  /* ---------------------------------------------------------------- */
  console.log("Prüfbericht: auf Deutsch erzeugt, dann umgeschaltet");

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  check("der Bericht ist zunächst deutsch",
    (await report()).includes("liegt vollständig außerhalb des Perimeters"),
    (await report()).slice(0, 160));

  await toggle();

  check("nach dem Umschalten ist er englisch",
    (await report()).includes("lies completely outside the perimeter"),
    (await report()).slice(0, 160));
  check("und enthält keinen deutschen Rest",
    !(await report()).includes("liegt vollständig außerhalb"),
    (await report()).slice(0, 160));

  await toggle();

  check("zurückgeschaltet ist er wieder deutsch",
    (await report()).includes("liegt vollständig außerhalb des Perimeters"),
    (await report()).slice(0, 160));

  /* ---------------------------------------------------------------- */
  console.log("Feature-Navigation");

  check("die Navigation ist deutsch",
    (await navigator()).includes("Perimeter"), (await navigator()).slice(0, 120));

  await toggle();
  const englishNavigator = await navigator();
  await toggle();

  check("die Navigation wechselt mit",
    englishNavigator !== (await navigator()),
    `${englishNavigator.slice(0, 80)} || ${(await navigator()).slice(0, 80)}`);

  /* ---------------------------------------------------------------- */
  console.log("Einmalmeldung: eine Statuszeile, die niemand nachrechnen kann");

  /*
   * "Kartenprüfung: N Warnungen." statt einer Verschiebemeldung: der Text
   * entsteht einmalig und hat ein Übersetzungsmuster.
   *
   * Sie ist damit der Fall, den Schritt 2 des dritten Durchgangs ausdrücklich
   * NICHT verwirft: "2 Warnungen" ist eine ganze Zahl ohne Dezimalzeichen und
   * hat eine englische Fassung, kann also nicht veralten. Verworfen wird nur,
   * was veralten kann - diese Zusicherung hält genau diese Grenze fest.
   */
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  const germanStatus = await editStatus();
  check("die Meldung ist deutsch",
    germanStatus.startsWith("Kartenprüfung:"), germanStatus);

  await toggle();
  const englishStatus = await editStatus();

  check("sie wird übersetzt", englishStatus !== germanStatus,
    `${germanStatus} || ${englishStatus}`);
  check("und wird nicht verworfen, weil sie nicht veralten kann",
    englishStatus.startsWith("Map validation:"), englishStatus);

  await toggle();

  check("und kommt unverändert zurück", (await editStatus()) === germanStatus,
    `${germanStatus} || ${await editStatus()}`);

  /* ---------------------------------------------------------------- */
  console.log("Titel von Zurück/Vor samt Historienmarke");

  const germanTitle = await undoTitle();

  check("der Titel nennt die Marke auf Deutsch",
    germanTitle.startsWith("Rückgängig: ") && germanTitle.length > 12, germanTitle);

  await toggle();
  const englishTitle = await undoTitle();

  check("Präfix ist übersetzt",
    englishTitle.startsWith("Undo: "), englishTitle);
  check("die Marke selbst ist mitübersetzt",
    !/[äöüßÄÖÜ]/.test(englishTitle) &&
    englishTitle !== `Undo: ${germanTitle.slice("Rückgängig: ".length)}`,
    `${germanTitle} || ${englishTitle}`);

  await toggle();

  check("zurückgeschaltet steht wieder die deutsche Marke",
    (await undoTitle()) === germanTitle, `${germanTitle} || ${await undoTitle()}`);

  /* ---------------------------------------------------------------- */
  console.log("Auswahlfelder: option-Beschriftungen");

  const optionText = (id) =>
    page.locator(`#${id} option`).allTextContents();

  const germanOptions = await optionText("rectifyAngleMode");
  check("deutsche Beschriftung vorhanden",
    germanOptions.includes("automatisch erkennen"), JSON.stringify(germanOptions));

  await toggle();
  const englishOptions = await optionText("rectifyAngleMode");

  check("option-Beschriftungen werden übersetzt",
    englishOptions.includes("detect automatically"), JSON.stringify(englishOptions));
  check("auch in weiteren Auswahlfeldern",
    (await optionText("exportFrameSelect")).some((t) => t.includes("as loaded")),
    JSON.stringify(await optionText("exportFrameSelect")));

  /* Die getroffene Auswahl darf sich dabei nicht verstellen. */
  check("die Auswahl bleibt stehen",
    (await page.locator("#rectifyAngleMode").inputValue()) === "auto",
    await page.locator("#rectifyAngleMode").inputValue());

  /* ---------------------------------------------------------------- */
  console.log("value-Attribute bleiben unangetastet");

  /*
   * value wird von translateDynamicElement bewusst NICHT behandelt - dort
   * stehen Zahlen, keine Sprache. Der Test hält das fest, damit es nicht
   * versehentlich ergänzt wird und dann "0,02" zu übersetzen versucht.
   */
  for (const [id, expected] of [
    ["reduceToleranceInput", "0,02"],
    ["rectifyToleranceInput", "15"],
    ["circleRadiusInput", "1,00"],
  ]) {
    check(`#${id} behält seinen Wert`,
      (await page.locator(`#${id}`).inputValue()) === expected,
      `${id}: ${await page.locator(`#${id}`).inputValue()}`);
  }

  await toggle();

  check("und auch nach dem Zurückschalten",
    (await page.locator("#reduceToleranceInput").inputValue()) === "0,02",
    await page.locator("#reduceToleranceInput").inputValue());

  /* ---------------------------------------------------------------- */
  console.log("Rasterhinweis und Zeichenstatus, beide Richtungen");

  /*
   * Vier Texte des Rasterhinweises und zwei des Zeichenstatus hatten keine
   * englische Fassung. Gefunden hat sie nicht dieser Test, sondern
   * tools/scan-i18n.mjs - und zwar erst, als die Zustandsliste dort um das
   * weite Herauszoomen und den leeren Grundzustand erweitert wurde: eine
   * Laufzeitsuche ist nur so vollstaendig wie die Zustaende, die sie besucht.
   *
   * Der Sprachwechsel laeuft hier ueber setLanguage() und wird unmittelbar
   * danach gemessen, ohne weitere Handlung.
   */
  const gridStatus = () => page.locator("#gridStatus").textContent();
  const drawStatus = () => page.locator("#drawFeatureStatus").textContent();

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(300);

  /*
   * Die herausgezoomte Fassung: sie erscheint erst, wenn das eingestellte
   * Raster feiner waere als ein Bildschirmpixel. Ein kleiner Rasterwert allein
   * genuegt nicht - es muss wirklich herausgezoomt sein.
   */
  await menueBefehl(page, "Ansicht", "Raster…");
  await page.waitForTimeout(250);
  await page.fill("#gridStepInput", "0,01");
  await page.locator("#gridStepInput").press("Enter");
  await page.waitForTimeout(250);
  for (let i = 0; i < 12; i++) {
    await page.locator("#zoomOutBtn").click();
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(350);

  const rasterDe = await gridStatus();

  check("deutsch: der Rasterhinweis nennt beide Weiten",
    rasterDe.includes("Eingestellt:") && rasterDe.includes("Sichtbar dargestellt:"),
    rasterDe);
  check("deutsch: und begründet die gröbere Darstellung",
    rasterDe.includes("kleiner als ein Bildschirmpixel"), rasterDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);
  const rasterEn = await gridStatus();

  check("englisch: derselbe Hinweis ist übersetzt",
    rasterEn.includes("Set:") && rasterEn.includes("Shown:"), rasterEn);
  check("englisch: auch die Begründung",
    rasterEn.includes("smaller than one screen pixel"), rasterEn);
  check("englisch: kein deutscher Rest im Rasterhinweis",
    !/Eingestellt|Sichtbar dargestellt|Bildschirmpixel/.test(rasterEn), rasterEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  check("und er kommt unverändert zurück", (await gridStatus()) === rasterDe,
    `${rasterDe} || ${await gridStatus()}`);

  /*
   * Der Text OHNE geladene Karte - der Zustand, in dem der Editor startet.
   * Er entsteht in renderGrid() und lief deshalb nie ueber eine Uebersetzung.
   */
  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const leerEn = await gridStatus();
  check("englisch: der Rasterhinweis ohne Karte ist übersetzt",
    leerEn.includes("The grid is shown once a map is open."), leerEn);

  /*
   * Der Zeichenstatus, in der ENGLISCHEN Oberflaeche erzeugt: er entsteht hier
   * gar nicht erst auf Deutsch. Das ist die Gegenrichtung zu allem darueber -
   * eine Zusicherung, die nur in der einen Sprache erzeugt, sieht nicht, was
   * beim Erzeugen schiefgeht.
   */
  await page.locator("#fileInput").setInputFiles({
    name: "i18n.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(500);
  await openAllFolds(page);

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  const startEn = await editStatus();
  check("englisch erzeugt: der Zeichenhinweis ist englisch",
    startEn.includes("Draw exclusion: click the corner points."), startEn);

  await page.locator("#svg").click({ position: { x: 300, y: 300 } });
  await page.waitForTimeout(300);

  const fortschrittEn = await drawStatus();
  check("englisch erzeugt: der Fortschritt zählt in der Einzahl",
    fortschrittEn.includes("1 point placed.") &&
    fortschrittEn.includes("2 more points required."),
    fortschrittEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  const fortschrittDe = await drawStatus();
  check("und auf deutsch steht dort die deutsche Einzahl",
    fortschrittDe.includes("1 Punkt gesetzt.") &&
    fortschrittDe.includes("Noch 2 Punkte erforderlich."),
    fortschrittDe);

  /*
   * Der zweite Punkt dreht die Einzahl um: jetzt fehlt genau EINER. Ohne
   * diesen Fall bliebe die deutsche Einzahlform ungedeckt - eine Mutation an
   * ihr veraenderte den Text bei zwei fehlenden Punkten gar nicht.
   */
  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(350);
  await page.locator("#svg").click({ position: { x: 380, y: 320 } });
  await page.waitForTimeout(300);

  const zweiterEn = await drawStatus();
  check("englisch: beim vorletzten Punkt steht die Einzahl",
    zweiterEn.includes("2 points placed.") &&
    zweiterEn.includes("1 more point required."),
    zweiterEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  const zweiterDe = await drawStatus();
  check("deutsch: dort ebenfalls die Einzahl",
    zweiterDe.includes("2 Punkte gesetzt.") &&
    zweiterDe.includes("Noch 1 Punkt erforderlich."),
    zweiterDe);

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(300);

  /*
   * "Perimeter vollstaendig ausgewaehlt · 4 Punkte." Der Anzeigename bleibt im
   * Muster als $1 stehen und wird nicht uebersetzt - bei "Perimeter" ist das
   * richtig, denn er lautet englisch gleich.
   */
  await openAllFolds(page);
  const ganzesFeature = page.locator(
    '[data-action="select-whole-feature"][data-feature-index="0"]');

  if (await ganzesFeature.count()) {
    await ganzesFeature.click();
    await page.waitForTimeout(400);

    const ganzDe = await editStatus();
    check("deutsch: die Vollauswahl nennt Feature und Punktzahl",
      /vollständig ausgewählt · \d+ Punkte\.$/.test(ganzDe.trim()), ganzDe);

    await page.evaluate(() => setLanguage("en"));
    await page.waitForTimeout(400);

    const ganzEn = await editStatus();
    check("englisch: dieselbe Meldung ist übersetzt",
      /fully selected · \d+ points\.$/.test(ganzEn.trim()), ganzEn);
    check("englisch: und kein deutscher Rest bleibt stehen",
      !/vollständig|ausgewählt|Punkte/.test(ganzEn), ganzEn);

    await page.evaluate(() => setLanguage("de"));
    await page.waitForTimeout(400);
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Laufzeitinhalte wechseln die Sprache in beide Richtungen.");
