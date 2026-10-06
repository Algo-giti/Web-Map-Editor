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
  createUmformwerkzeug,
  elementGetroffen,
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
  const umformwerkzeug = createUmformwerkzeug(page, check);
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

  await menueBefehl("Karte", "Karte prüfen");
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
  await menueBefehl("Karte", "Karte prüfen");
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
   *
   * Erwartet war hier bis dahin der deutsche Text, also "0,02" in der
   * englischen Oberfläche - die Zusicherung schrieb damit genau den Mangel
   * fest, dass die Felder ihr Dezimalkomma behielten. Seitdem folgt die
   * Schreibweise der Sprache (reformatNumberInputs()); was diese Zusicherung
   * schützt, bleibt: dieselbe Zahl, kein Woerterbuch, nur das Zeichen.
   */
  for (const [id, deutsch] of [
    ["reduceToleranceInput", "0,02"],
    ["rectifyToleranceInput", "15"],
    ["circleRadiusInput", "1,00"],
  ]) {
    check(`#${id} behält seine Zahl, nur das Dezimalzeichen folgt der Sprache`,
      (await page.locator(`#${id}`).inputValue()) === deutsch.replace(",", "."),
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

  /* ---------------------------------------------------------------- */
  console.log("Die Cursor-Koordinaten unter dem ruhenden Zeiger");

  /*
   * #hud wurde nur bei pointermove geschrieben und behielt nach einem
   * Sprachwechsel das Dezimalzeichen der vorigen Sprache, bis der Zeiger
   * wieder ueber die Karte fuhr. Wie beim Tooltip: zwischen Wechsel und
   * Ablesen keine Mausbewegung. Die Zahlen sind eine Beziehung - dieselbe
   * Stelle, nur mit dem Zeichen der Sprache.
   */
  const hudText = () => page.locator("#hud").innerText();
  const hudZahlen = (text) =>
    [...text.matchAll(/-?\d+[.,]\d+/g)].map((m) => m[0].replace(",", "."));
  /*
   * #hud traegt pointer-events:none, elementFromPoint() liefert an seiner
   * Stelle deshalb bauartbedingt die Statuszeile darunter - dieselbe Grenze
   * wie bei Ghosts und Zeichenvorschau. Gemessen wird, was davon eine Wirkung
   * ist: der Text hat ein Rechteck, und an seiner Mitte zeichnet der Browser
   * die Zeile, in der er steht, nicht etwas, das ihn verdeckt.
   */
  const hudSteht = async (wo) => {
    const lage = await page.evaluate(() => {
      const el = document.getElementById("hud");
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { ok: false, grund: "keine Ausdehnung" };
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: !!t && t.contains(el), grund: t ? (t.id || t.className || t.tagName) : "nichts" };
    });
    check(`${wo}: die Koordinaten stehen unverdeckt in der Statuszeile`,
      lage.ok === true, lage.grund);
  };
  const karte = await page.locator("#svg").boundingBox();

  await page.mouse.move(karte.x + karte.width * 0.4, karte.y + karte.height * 0.6);
  await page.waitForTimeout(200);

  const hudDe = await hudText();

  await hudSteht("deutsch gemessen");
  check("deutsch gemessen: E und N mit Dezimalkomma",
    hudZahlen(hudDe).length === 2 && /\d,\d/.test(hudDe) && !/\d\.\d/.test(hudDe), hudDe);

  await page.evaluate(() => setLanguage("en"));
  const hudDeEn = await hudText();

  check("dann englisch, ohne Mausbewegung: dieselbe Stelle mit Dezimalpunkt",
    JSON.stringify(hudZahlen(hudDeEn)) === JSON.stringify(hudZahlen(hudDe)) &&
    !/\d,\d/.test(hudDeEn),
    `${hudDe} || ${hudDeEn}`);
  await hudSteht("dann englisch");

  await page.evaluate(() => setLanguage("de"));

  check("zurueckgeschaltet steht sie wortgleich wieder da",
    (await hudText()) === hudDe, `${hudDe} || ${await hudText()}`);

  await page.evaluate(() => setLanguage("en"));
  await page.mouse.move(karte.x + karte.width * 0.55, karte.y + karte.height * 0.45);
  await page.waitForTimeout(200);

  const hudEn = await hudText();

  check("englisch gemessen: E und N mit Dezimalpunkt",
    hudZahlen(hudEn).length === 2 && /\d\.\d/.test(hudEn) && !/\d,\d/.test(hudEn), hudEn);

  await page.evaluate(() => setLanguage("de"));
  const hudEnDe = await hudText();

  check("dann deutsch, ohne Mausbewegung: dieselbe Stelle mit Dezimalkomma",
    JSON.stringify(hudZahlen(hudEnDe)) === JSON.stringify(hudZahlen(hudEn)) &&
    !/\d\.\d/.test(hudEnDe),
    `${hudEn} || ${hudEnDe}`);
  await hudSteht("dann deutsch");

  /*
   * Neu geschrieben, nicht neu gerechnet: auch die Angabe, ob in Metern
   * gezaehlt wird, stammt aus dem Moment der Messung. Gemessen ueber einer
   * Karte mit unklarem Massstab, danach ein Massstab von Hand - die Stelle
   * davor ist in keinem Meterrahmen gemessen, und ein Sprachwechsel darf sie
   * nicht nachtraeglich in einen stellen.
   */
  await page.locator("#fileInput").setInputFiles({
    name: "i18n-unklar.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0],
        ]] },
      }],
    })),
  });
  await page.waitForTimeout(400);
  await openAllFolds(page);
  await page.mouse.move(karte.x + karte.width * 0.4, karte.y + karte.height * 0.6);
  await page.waitForTimeout(200);

  const hudUnklar = await hudText();

  check("unklarer Massstab: die Stelle steht ohne Meterangabe da",
    hudUnklar.startsWith("x:") && !hudUnklar.includes(" m"), hudUnklar);

  await page.fill("#scaleInput", "2");
  await page.locator("#applyScaleBtn").click();
  await page.waitForTimeout(400);

  check("Vorbedingung: der Massstab ist jetzt bekannt",
    await page.evaluate(() => hasKnownScale()));

  await page.evaluate(() => setLanguage("en"));

  check("der Wechsel deutet die alte Stelle nicht in Metern um",
    (await hudText()) === hudUnklar, `${hudUnklar} || ${await hudText()}`);

  await page.evaluate(() => setLanguage("de"));

  /* ---------------------------------------------------------------- */
  console.log("Die Zahlenfelder folgen dem Sprachwechsel, beide Richtungen");

  /*
   * Raster, Maeher, Kreis und Rechteck, Reduzieren, Rechtwinklig und Glaetten
   * tragen Zahlen in Eingabefeldern. Bis hierher wechselten nur die vier der
   * Glaettung ihr Dezimalzeichen mit der Sprache; die uebrigen zeigten in der
   * englischen Oberflaeche weiter "0,35", bis sie sich selbst neu schrieben.
   *
   * Gelesen wird der Text, der im Feld steht - und nur, wenn das Feld
   * gezeichnet ist: ein Feld in einem geschlossenen Fenster liefert seinen
   * Wert genauso. Die getippten Werte tragen schon die Stellenzahl, mit der
   * die Felder schreiben (zwei bei Metern, keine vorgegebene bei Grad); die
   * erwartete Fassung ist damit genau dieselbe Zahl mit dem anderen Zeichen,
   * und es steht keine zweite Rechnung im Test.
   *
   * Je Feld zwei Werte: der erste wird auf Deutsch getippt, der zweite auf
   * Englisch - mit Punkt, wie ein englischer Nutzer ihn tippt.
   */
  await page.locator("#fileInput").setInputFiles({
    name: "i18n.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(400);
  await openAllFolds(page);

  const ZAHLENFELDER = [
    { name: "Rasterfenster", zeigen: () => menueBefehl("Ansicht", "Raster…"),
      felder: [["gridStepInput", "0,37", "0,58"]] },
    { name: "Maeherfenster", zeigen: () => menueBefehl("Ansicht", "Mähroboter-Vorschau…"),
      felder: [["mowerLengthInput", "0,73", "0,81"], ["mowerWidthInput", "0,41", "0,47"]] },
    { name: "Kreis", zeigen: () => page.locator("#drawCircleBtn").click(),
      felder: [["circleRadiusInput", "2,37", "3,14"]] },
    { name: "Rechteck", zeigen: () => page.locator("#drawRectangleBtn").click(),
      felder: [["rectWidthInput", "3,25", "4,75"], ["rectHeightInput", "1,75", "2,25"],
               ["rectAngleInput", "12,5", "33,25"]] },
    /*
     * Bis zum 06.10.2026 eine Gruppe „Umformen“, gezeigt durch das Oeffnen des
     * Faltblocks. Seitdem steht jedes Werkzeug fuer sich in der Leiste, und
     * seine Felder stehen nur da, solange es gewaehlt ist - drei Gruppen.
     */
    { name: "Reduzieren", zeigen: () => umformwerkzeug("reduce"),
      felder: [["reduceToleranceInput", "0,03", "0,05"]] },
    { name: "Rechtwinklig", zeigen: () => umformwerkzeug("rectify"),
      felder: [["rectifyAngleInput", "12,5", "7,25"], ["rectifyToleranceInput", "7,5", "11,5"]] },
    { name: "Glaetten", zeigen: () => umformwerkzeug("smooth"),
      felder: [["smoothSpacingInput", "0,25", "0,35"], ["smoothKnickInput", "12,5", "17,5"],
               ["smoothPerimeterLimitInput", "0,03", "0,01"],
               ["smoothExclusionLimitInput", "0,04", "0,06"]] },
  ];

  const sprache = (wert) => page.evaluate((w) => setLanguage(w), wert);
  const englisch = (deutsch) => deutsch.replace(",", ".");

  /*
   * Der Text eines Feldes - oder null, wenn es nicht gezeichnet wird. Dann
   * gaebe es nichts zu lesen, das ein Nutzer saehe.
   */
  const feldText = async (id) => {
    /*
     * Gerollt wird im Seitenkontext: scrollIntoViewIfNeeded() wartete bei
     * einem Feld, das nicht gezeichnet wird, selbst dreissig Sekunden.
     */
    await page.evaluate((x) =>
      document.getElementById(x)?.scrollIntoView({ block: "nearest" }), id);
    const getroffen = await elementGetroffen(page, `#${id}`, { dy: 6 });
    return getroffen.ok ? page.locator(`#${id}`).inputValue() : null;
  };

  /* Tippen wie ein Nutzer, dann das Feld verlassen - kein Fokus bleibt stehen. */
  const tippen = async (id, text) => {
    await page.locator(`#${id}`).fill(text);
    await page.evaluate(() => document.activeElement?.blur());
  };

  for (const gruppe of ZAHLENFELDER) {
    await sprache("de");
    await gruppe.zeigen();
    await page.waitForTimeout(300);

    /*
     * Getippt wird nur in ein gezeichnetes Feld. Sonst wartete fill() dreissig
     * Sekunden auf ein Feld, das nie erscheint - gemessen, als ein Kreis unter
     * einer Mutation gar nicht erst startete -, und aus einer benannten
     * Zusicherung wuerde ein stummer Abbruch.
     */
    let gezeichnet = true;
    for (const [id] of gruppe.felder) {
      const steht = (await feldText(id)) !== null;
      check(`${gruppe.name}: #${id} ist gezeichnet`, steht);
      gezeichnet = gezeichnet && steht;
    }

    if (!gezeichnet) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      continue;
    }

    for (const [id, erster] of gruppe.felder) await tippen(id, erster);

    for (const [id, erster] of gruppe.felder) {
      check(`${gruppe.name}, deutsch getippt: #${id} steht sichtbar mit Komma da`,
        (await feldText(id)) === erster, String(await feldText(id)));
    }

    await sprache("en");

    for (const [id, erster] of gruppe.felder) {
      check(`${gruppe.name}, dann englisch, ohne Zutun: #${id} zeigt den Punkt`,
        (await feldText(id)) === englisch(erster), `${erster} -> ${await feldText(id)}`);
    }

    await sprache("de");

    for (const [id, erster] of gruppe.felder) {
      check(`${gruppe.name}, zurueck nach deutsch: #${id} zeigt wieder das Komma`,
        (await feldText(id)) === erster, `${erster} -> ${await feldText(id)}`);
    }

    /* Die Gegenrichtung: auf Englisch getippt, mit Punkt. */
    await sprache("en");
    for (const [id, , zweiter] of gruppe.felder) await tippen(id, englisch(zweiter));
    await sprache("de");

    for (const [id, , zweiter] of gruppe.felder) {
      check(`${gruppe.name}, englisch getippt, dann deutsch: #${id} zeigt das Komma`,
        (await feldText(id)) === zweiter, `${englisch(zweiter)} -> ${await feldText(id)}`);
    }

    await sprache("en");

    for (const [id, , zweiter] of gruppe.felder) {
      check(`${gruppe.name}, wieder englisch: #${id} zeigt den Punkt`,
        (await feldText(id)) === englisch(zweiter), `${zweiter} -> ${await feldText(id)}`);
    }

    /* Fenster schliessen bzw. Zeichnung verwerfen, auf Deutsch weiter. */
    await sprache("de");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }

  /*
   * Ein Feld, in dem gerade getippt wird, schreibt der Wechsel nicht um - es
   * behaelt den Text unter den Fingern. Gemessen ueber setLanguage(), weil ein
   * Klick auf den Schalter dem Feld vorher den Fokus naehme. Die Gegenprobe
   * steht im selben Zug: das Nachbarfeld ohne Fokus wechselt sehr wohl.
   *
   * Beide Felder stehen seit dem 06.10.2026 im Block von Rechtwinklig: ein
   * Nachbarfeld, das nicht gezeichnet wird, kann nichts belegen. Bis dahin
   * waren es die Toleranzen von Reduzieren und Rechtwinklig, die damals im
   * selben Faltblock standen.
   */
  await umformwerkzeug("rectify");
  await page.locator("#rectifyToleranceInput").fill("9,5");
  await page.locator("#rectifyAngleInput").fill("12,5");
  await page.evaluate(() => {
    document.getElementById("rectifyToleranceInput").focus();
    setLanguage("en");
  });

  check("im fokussierten Feld bleibt der getippte Text stehen",
    (await page.locator("#rectifyToleranceInput").inputValue()) === "9,5",
    await page.locator("#rectifyToleranceInput").inputValue());
  check("Gegenprobe: das Nachbarfeld ohne Fokus zeigt den Punkt",
    (await feldText("rectifyAngleInput")) === "12.5",
    String(await feldText("rectifyAngleInput")));

  /* Verlassen und erneut gewechselt: jetzt folgt auch es. */
  await page.evaluate(() => {
    document.activeElement?.blur();
    setLanguage("de");
  });
  await page.evaluate(() => setLanguage("en"));

  check("ohne Fokus folgt das Feld beim naechsten Wechsel",
    (await feldText("rectifyToleranceInput")) === "9.5",
    String(await feldText("rectifyToleranceInput")));

  await sprache("de");

  /* ---------------------------------------------------------------- */
  console.log("Die Felder des Bezugspunkts folgen dem Sprachwechsel, beide Richtungen");

  /*
   * Breite und Länge der RTK-Basis trugen in beiden Sprachen einen Punkt.
   * Anders als die Felder darueber schreibt sie updateOriginUi() aus dem
   * Zustand - ein getippter Wert erscheint also erst nach "Uebernehmen" in
   * der Schreibweise der Sprache, und genau das macht die Annahme sichtbar:
   * eine abgelehnte Eingabe bliebe so im Feld stehen, wie sie getippt wurde.
   *
   * Getippt wird je Richtung in der Schreibweise der ANDEREN Sprache. Die
   * Breite traegt zwoelf Nachkommastellen - so viele schreibt das Feld, und
   * mit weniger verloere eine Koordinate beim naechsten Uebernehmen mehr als
   * die Toleranz von 1 cm.
   */
  await openAllFolds(page);

  const BEZUG = ["originLatInput", "originLonInput"];
  let bezugGezeichnet = true;
  for (const id of BEZUG) {
    const steht = (await feldText(id)) !== null;
    check(`Bezugspunkt: #${id} ist gezeichnet`, steht);
    bezugGezeichnet = bezugGezeichnet && steht;
  }

  const bezugUebernehmen = async (lat, lon) => {
    await page.locator("#originLatInput").fill(lat);
    await page.locator("#originLonInput").fill(lon);
    await page.locator("#applyOriginBtn").click();
    await page.waitForTimeout(250);
  };
  const bezugFelder = async () =>
    `${await feldText("originLatInput")} / ${await feldText("originLonInput")}`;

  if (bezugGezeichnet) {
    check("Bezugspunkt: vorher steht dort ein anderer Wert",
      (await bezugFelder()) !== "48,123456789012 / 11,5", await bezugFelder());

    /* Deutsch, mit Punkt getippt. */
    await bezugUebernehmen("48.123456789012", "11.5");
    check("deutsch, mit Punkt getippt: angenommen, die Felder zeigen das Komma",
      (await bezugFelder()) === "48,123456789012 / 11,5", await bezugFelder());

    await sprache("en");
    check("dann englisch, ohne Zutun: die Felder zeigen den Punkt",
      (await bezugFelder()) === "48.123456789012 / 11.5", await bezugFelder());

    await sprache("de");
    check("zurueck nach deutsch: die Felder zeigen wieder das Komma",
      (await bezugFelder()) === "48,123456789012 / 11,5", await bezugFelder());

    /* Englisch, mit Komma getippt. */
    await sprache("en");
    await bezugUebernehmen("47,25", "9,125");
    check("englisch, mit Komma getippt: angenommen, die Felder zeigen den Punkt",
      (await bezugFelder()) === "47.25 / 9.125", await bezugFelder());

    await sprache("de");
    check("dann deutsch, ohne Zutun: die Felder zeigen das Komma",
      (await bezugFelder()) === "47,25 / 9,125", await bezugFelder());

    await sprache("en");
    check("zurueck nach englisch: die Felder zeigen wieder den Punkt",
      (await bezugFelder()) === "47.25 / 9.125", await bezugFelder());

    /*
     * Wer in der Breite gerade tippt, behaelt seinen Text; die Laenge ohne
     * Fokus wechselt im selben Zug - die Gegenprobe.
     */
    await page.locator("#originLatInput").fill("46.5");
    await page.evaluate(() => {
      document.getElementById("originLatInput").focus();
      setLanguage("de");
    });
    check("Bezugspunkt: im fokussierten Feld bleibt der getippte Text stehen",
      (await page.locator("#originLatInput").inputValue()) === "46.5",
      await page.locator("#originLatInput").inputValue());
    check("Bezugspunkt, Gegenprobe: die Laenge ohne Fokus zeigt das Komma",
      (await feldText("originLonInput")) === "9,125",
      String(await feldText("originLonInput")));

    /* Aufraeumen: kein Bezugspunkt, wie vorher. */
    await bezugUebernehmen("0", "0");
  }

  await sprache("de");

  /* ---------------------------------------------------------------- */
  console.log("Vor der ersten Pruefung steht die Kartenpruefung nicht da, beide Richtungen");

  /*
   * Bis zum 06.10.2026 stand hier der Platzhalter der Zusammenfassung -
   * „Noch keine Prüfung durchgeführt.“ / „Zuerst eine Karte laden.“ - mit
   * seinen beiden Sprachrichtungen. Entschieden vom Projektinhaber: der Block
   * KARTENPRÜFUNG erscheint nur, wenn die Karte tatsächlich geprüft wurde,
   * vorher gar nicht, und „nicht geprüft“ steht allein in der Statuszeile. Der
   * Platzhalter ist damit entfallen. Gemessen wird, was an seiner Stelle gilt:
   * der Block wird nicht gezeichnet - auch nicht, nachdem openAllFolds() alle
   * Faltbloecke geoeffnet hat -, und die Statuszeile sagt es, sichtbar und in
   * der Sprache, die gerade gilt.
   */
  const pruefblock = () => elementGetroffen(page, "#inspectorValidation > summary", { dy: 5 });
  const statuszeile = async () => ({
    getroffen: (await elementGetroffen(page, "#validationShort", { dy: 5 })).ok,
    text: (await page.locator("#validationShort").innerText()).trim(),
  });
  const ladeKarte = async () => {
    await page.locator("#fileInput").setInputFiles({
      name: "i18n.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(MAP),
    });
    await page.waitForTimeout(400);
    await openAllFolds(page);
  };
  const ohnePruefung = async (wo, erwartet) => {
    const block = await pruefblock();
    check(`${wo}: der Block „Kartenprüfung“ steht nicht da`, !block.ok, block.grund);
    const status = await statuszeile();
    check(`${wo}: die Statuszeile sagt „${erwartet}“, sichtbar`,
      status.getroffen && status.text === erwartet, JSON.stringify(status));
  };

  await ladeKarte();
  await ohnePruefung("deutsch erzeugt", "nicht geprüft");

  await page.evaluate(() => setLanguage("en"));
  await ohnePruefung("dann englisch, unmittelbar", "not validated");

  await page.evaluate(() => setLanguage("de"));
  await ohnePruefung("zurückgeschaltet", "nicht geprüft");

  await page.evaluate(() => setLanguage("en"));
  await ladeKarte();
  await ohnePruefung("englisch erzeugt", "not validated");

  await page.evaluate(() => setLanguage("de"));
  await ohnePruefung("dann deutsch, unmittelbar", "nicht geprüft");

  /*
   * Die Gegenprobe: dieselbe Messung findet den Block, sobald geprüft ist.
   * Ohne sie bestuende „steht nicht da“ auch dann, wenn der Block gar nicht
   * mehr existierte.
   */
  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(400);

  {
    const block = await pruefblock();
    check("nach „Karte prüfen“ steht der Block da und wird getroffen", block.ok, block.grund);
    const status = await statuszeile();
    check("und die Statuszeile nennt das Ergebnis statt „nicht geprüft“",
      status.getroffen && status.text !== "nicht geprüft", JSON.stringify(status));
  }

  /* Ohne Karte ebenso - neu geladen, als letzter Abschnitt. */
  await page.reload({ waitUntil: "load" });
  await openAllFolds(page);
  await ohnePruefung("ohne Karte", "nicht geprüft");

  await page.evaluate(() => setLanguage("en"));
  await ohnePruefung("ohne Karte, dann englisch", "not validated");

  await page.evaluate(() => setLanguage("de"));
  await ohnePruefung("ohne Karte, zurückgeschaltet", "nicht geprüft");

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Laufzeitinhalte wechseln die Sprache in beide Richtungen.");
