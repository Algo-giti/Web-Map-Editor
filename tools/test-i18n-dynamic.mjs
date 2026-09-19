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
  createMenueBefehl,
  indexUrl,
  launchBrowser,
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
  const menueBefehl = createMenueBefehl(page, check);
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
  await menueBefehl("Ansicht", "Mäher am ausgewählten Punkt anzeigen");

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
  await menueBefehl("Ansicht", "Raster…");
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
   * Der Zeichenstatus der OFFENEN LINIEN. Er stand bis zum einundzwanzigsten
   * Durchgang vollstaendig deutsch da - die Search Wire hatte gar kein
   * Muster, der Docking-Pfad zwei, die das <strong>-Markup mitschrieben und
   * die Klammerform "Punkt(e)" trugen. Gefunden hat es keine Zusicherung,
   * sondern die Erweiterung von tools/scan-i18n.mjs um diese Zustaende.
   */
  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(300);

  await page.locator("#drawSearchWireBtn").click();
  await page.waitForTimeout(250);
  await page.locator("#svg").click({ position: { x: 420, y: 260 } });
  await page.waitForTimeout(300);

  const wireEinsDe = await drawStatus();

  check("deutsch: die Search Wire zaehlt den ersten Punkt in der Einzahl",
    wireEinsDe.includes("1 Punkt gesetzt.") &&
    wireEinsDe.includes("Mindestens 2 Punkte erforderlich."), wireEinsDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const wireEinsEn = await drawStatus();

  check("auf deutsch erzeugt, dann englisch: derselbe Satz ist uebersetzt",
    wireEinsEn.includes("1 point placed.") &&
    wireEinsEn.includes("At least 2 points required."), wireEinsEn);
  check("und kein deutscher Rest bleibt stehen",
    !/Punkt gesetzt|erforderlich/.test(wireEinsEn), wireEinsEn);

  /* Der zweite Punkt wechselt den Nachsatz - und die Zahl in die Mehrzahl. */
  await page.locator("#svg").click({ position: { x: 440, y: 300 } });
  await page.waitForTimeout(300);

  const wireZweiEn = await drawStatus();

  check("auf englisch erzeugt: die Mehrzahl und der andere Nachsatz",
    wireZweiEn.includes("2 points placed.") &&
    wireZweiEn.includes("Finish search wire"), wireZweiEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  const wireZweiDe = await drawStatus();

  check("auf englisch erzeugt, dann deutsch: dort steht wieder der deutsche Satz",
    wireZweiDe.includes("2 Punkte gesetzt.") &&
    wireZweiDe.includes("Search Wire abschließen"), wireZweiDe);

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(300);

  /*
   * Und der Docking-Pfad, an dem die Klammerform im DEUTSCHEN Quelltext
   * stand: "1 Punkt(e) gesetzt." Sein Zwilling zwei Zeilen darueber - die
   * Search Wire - beugte seit jeher richtig.
   */
  await page.locator("#createDockBtn").click();
  await page.waitForTimeout(250);
  await page.locator("#svg").click({ position: { x: 460, y: 320 } });
  await page.waitForTimeout(300);

  const dockDe = await drawStatus();

  check("deutsch: der Docking-Pfad beugt die Einzahl statt sie einzuklammern",
    dockDe.includes("1 Punkt gesetzt.") && !dockDe.includes("Punkt(e)"), dockDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const dockEn = await drawStatus();

  check("englisch: derselbe Satz, ohne Klammerform",
    dockEn.includes("1 point placed.") && !dockEn.includes("point(s)"), dockEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);
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

  /* ---------------------------------------------------------------- */
  console.log("Fehlermeldungen, beide Richtungen");

  /*
   * 28 Statustexte hatten bis zum einundzwanzigsten Durchgang keine englische
   * Fassung - ueberwiegend Fehlermeldungen seltener Faelle. Sie laufen
   * saemtlich ueber setLocalizedText(); zugesichert wird deshalb nicht jede
   * einzeln, sondern der Weg an zwei Vertretern - einem aus jeder der beiden
   * Mechaniken, die dafuer angefasst wurden.
   *
   * Dass KEINER mehr fehlt, prueft die statische Stufe: die Bestandszahl
   * statustexte-ohne-englisch steht auf 0 und reisst, sobald einer dazukommt.
   */

  /* --- Vertreter 1: die Rastermeldung, neu ueber setLocalizedText() --- */
  /*
   * #gridStatus ist ABGELEITET: renderGrid() steht in refreshDerivedUi() und
   * baut die Zeile beim Sprachwechsel neu auf. Die Fehlermeldung ueberlebt
   * ihn deshalb NICHT - gemessen wird sie darum in jeder Sprache EINZELN
   * erzeugt. Das ist die Ausnahme von Regel (e) und hier keine Auslassung,
   * sondern die Eigenschaft der Zeile; die Gegenrichtung steht unmittelbar
   * darunter am abgeleiteten Text, den der Wechsel wirklich anfasst.
   */
  const rasterFehler = async () => {
    await page.fill("#gridStepInput", "keine Zahl");
    await page.locator("#gridStepInput").press("Enter");
    await page.waitForTimeout(350);

    return gridStatus();
  };

  await menueBefehl("Ansicht", "Raster…");
  await page.waitForTimeout(250);

  const rasterFehlerDe = await rasterFehler();

  check("deutsch: die Rasterfehlermeldung nennt den zulaessigen Bereich",
    rasterFehlerDe.includes("Bitte einen Wert zwischen 0,001 m und 100 m eingeben."),
    rasterFehlerDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const rasterFehlerEn = await rasterFehler();

  check("englisch erzeugt: dieselbe Meldung steht englisch da",
    rasterFehlerEn.includes("Please enter a value between 0.001 m and 100 m."),
    rasterFehlerEn);
  check("englisch erzeugt: und kein deutscher Rest bleibt stehen",
    !/Bitte einen Wert/.test(rasterFehlerEn), rasterFehlerEn);

  /*
   * Und jetzt der ABGELEITETE Text an derselben Stelle, ueber den
   * Sprachwechsel hinweg. Er entsteht ueber innerHTML; bliebe die Marke der
   * Fehlermeldung am Element stehen, schriebe applyI18nSnapshot() sie beim
   * Wechsel wieder hinein - reiner Text statt Markup, und in der falschen
   * Sprache.
   */
  await page.fill("#gridStepInput", "0.25");
  await page.locator("#gridStepInput").press("Enter");
  await page.waitForTimeout(350);

  const rasterWertEn = await gridStatus();

  check("englisch: nach einem gueltigen Wert steht wieder der Rasterabstand da",
    rasterWertEn.startsWith("Grid spacing:"), rasterWertEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  const rasterWertDe = await gridStatus();

  check("und auf deutsch ebenso, nicht von der alten Meldung ueberschrieben",
    rasterWertDe.startsWith("Rasterabstand:") &&
    !rasterWertDe.includes("Bitte einen Wert"), rasterWertDe);

  /* --- Vertreter 2: eine Meldung ueber setEditStatus() --------------- */
  /*
   * "Bitte gueltige Zahlen fuer East und North eingeben." war zugleich ein
   * Fall fuer transientStatusCanGoStale(): eine Meldung OHNE englische
   * Fassung wird beim Sprachwechsel verworfen. Dass sie jetzt stehen bleibt
   * und uebersetzt wird, belegt beides zugleich.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await page.locator("circle.vertex").first().click();
  await page.waitForTimeout(300);
  await openAllFolds(page);

  await page.fill("#pointEastInput", "keine Zahl");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);

  const zahlFehlerDe = await editStatus();

  check("deutsch: das Koordinatenfeld meldet die ungueltige Eingabe",
    zahlFehlerDe.includes("Bitte gültige Zahlen für East und North eingeben."),
    zahlFehlerDe);

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const zahlFehlerEn = await editStatus();

  check("englisch: sie ist uebersetzt statt verworfen",
    zahlFehlerEn.includes("Please enter valid numbers for East and North."),
    zahlFehlerEn);

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  check("und auch sie kommt unveraendert zurueck",
    (await editStatus()) === zahlFehlerDe,
    `${zahlFehlerDe} || ${await editStatus()}`);

  /* ---------------------------------------------------------------- */
  console.log("Der Tooltip unter dem ruhenden Zeiger");

  /*
   * #tip wurde bis zum vierten Durchgang nur bei pointermove geschrieben und
   * stand nach einem Sprachwechsel in der alten Sprache da, solange der Zeiger
   * liegen blieb. Er beschreibt aber, was UNTER dem Zeiger liegt - das laesst
   * sich jederzeit neu berechnen, und damit gehoert er auf den abgeleiteten
   * Weg.
   *
   * Gemessen wird OHNE Mausbewegung zwischen Wechsel und Ablesen: eine
   * Bewegung wuerde den Tooltip ohnehin neu schreiben und den Fall zudecken.
   */
  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(350);

  const tipText = () => page.locator("#tip").textContent();
  const perimeterLinie = page.locator('path[data-layer="perimeter"]').first();

  if (await perimeterLinie.count()) {
    const kasten = await perimeterLinie.boundingBox();

    if (kasten) {
      await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + 1);
      await page.waitForTimeout(300);

      const tipDe = await tipText();

      check("deutsch: der Tooltip nennt Typ und Index",
        tipDe.includes("Typ:") && tipDe.includes("Index:"), tipDe);

      /* Kein mouse.move dazwischen - genau das ist der Fall. */
      await page.evaluate(() => setLanguage("en"));
      await page.waitForTimeout(400);

      const tipEn = await tipText();

      check("englisch: derselbe Tooltip ist übersetzt, ohne Mausbewegung",
        tipEn.includes("Type:") && tipEn.includes("Index:"), tipEn);
      check("englisch: und kein deutscher Rest bleibt stehen",
        !tipEn.includes("Typ:"), tipEn);

      await page.evaluate(() => setLanguage("de"));
      await page.waitForTimeout(400);

      check("und er kommt unverändert zurück", (await tipText()) === tipDe,
        `${tipDe} || ${await tipText()}`);
    }
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Laufzeitinhalte wechseln die Sprache in beide Richtungen.");
