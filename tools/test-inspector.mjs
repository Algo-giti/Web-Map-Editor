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

    /*
     * Die Maehervorschau ERSETZT den Marker des ausgewaehlten Punktes - mit
     * ihr fehlt in #vertexGroup genau ein Kreis, sobald etwas ausgewaehlt
     * ist, und jede Zaehlung darueber waere falsch.
     */
    await page.evaluate(() => {
      const box = document.getElementById("showMowerPreview");
      if (!box.checked) return;
      box.checked = false;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(200);
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
  console.log("Alle Zustände");

  /*
   * Sieben Zustände, und zu jedem gehört eine Menge sichtbarer Blöcke. Die
   * Zusicherung lautet deshalb nicht "Block X ist da", sondern "genau diese
   * Blöcke sind da" - sonst bliebe ein liegengebliebener Block unbemerkt.
   */
  const BLOECKE = [
    "inspectorEmpty", "inspectorPoint", "inspectorMulti", "inspectorMixed",
    "inspectorFeature", "inspectorDraw", "inspectorMeasure",
    "inspectorSelection",
  ];

  const sichtbareBloecke = () =>
    page.evaluate((ids) => ids.filter((id) =>
      getComputedStyle(document.getElementById(id)).display !== "none"), BLOECKE);

  const text = (id) =>
    page.evaluate((x) => document.getElementById(x).textContent.trim(), id);

  /** Klickt eine Position in Weltkoordinaten auf die Karte. */
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
    await page.waitForTimeout(170);
  };

  await load([MIT_LOCH]);

  check("ohne Auswahl steht nur der leere Zustand",
    (await sichtbareBloecke()).join(",") === "inspectorEmpty",
    (await sichtbareBloecke()).join(","));

  /* Die Auswahlleiste ist von der Karte verschwunden. */
  check("auf der Karte liegt keine Auswahlleiste mehr",
    (await page.locator(".map-selection-toolbar").count()) === 0);

  /* --- ein Punkt ------------------------------------------------- */
  await marks.nth(0).click();
  await page.waitForTimeout(250);

  check("ein Punkt: Punktzustand plus Auswahlaktionen",
    (await sichtbareBloecke()).join(",") === "inspectorPoint,inspectorSelection",
    (await sichtbareBloecke()).join(","));
  check("die Auswahlaktionen sind bedienbar",
    !(await page.locator("#deleteMultiSelectionBtn").isDisabled()) &&
    !(await page.locator("#clearMultiSelectionBtn").isDisabled()));

  /* --- zwei Punkte desselben Features ---------------------------- */
  await marks.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);

  const zwei = await head();

  check("zwei Punkte: Gruppenzustand statt Punktzustand",
    (await sichtbareBloecke()).join(",") === "inspectorMulti,inspectorSelection",
    (await sichtbareBloecke()).join(","));

  /*
   * DER BEFUND AUS ETAPPE 4: getInspectorState() war
   * `selectedVertex ? "single" : "empty"`, und selectedVertex haelt bei einer
   * Gruppe weiterhin den zuletzt angeklickten Punkt. Der Kopf behauptete
   * "Punkt 138 von 208", waehrend darunter "2 Punkte ausgewaehlt" stand.
   */
  check("der Kopf behauptet keinen einzelnen Punkt",
    !/^Punkt \d+ von \d+$/.test(zwei.titel), zwei.titel);
  check("sondern nennt die Anzahl", zwei.titel === "2 Punkte ausgewählt",
    zwei.titel);
  check("und das Feature", zwei.unter === "Perimeter", zwei.unter);
  check("die Zusammenfassung nennt beides",
    (await text("multiSummary")) === "2 Punkte in Perimeter.",
    await text("multiSummary"));

  /* --- ganzes Feature -------------------------------------------- */
  await marks.nth(2).click({ modifiers: ["Control"] });
  await marks.nth(3).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);

  const ganz = await head();

  check("alle Punkte: der Feature-Block kommt dazu",
    (await sichtbareBloecke()).join(",") ===
      "inspectorMulti,inspectorFeature,inspectorSelection",
    (await sichtbareBloecke()).join(","));
  check("der Kopf sagt, dass es vollständig ist",
    ganz.unter === "Perimeter · vollständig", ganz.unter);
  check("die Punktzahl steht im Block",
    (await text("featurePointStat")) === "4", await text("featurePointStat"));
  check("und der Typ", (await text("featureTypeStat")) === "Perimeter",
    await text("featureTypeStat"));
  check("die Fläche wird beziffert",
    /^[\d.,]+ m²$/.test(await text("featureAreaStat")),
    await text("featureAreaStat"));

  /*
   * Typabhängige Kennzahlen werden WEGGELASSEN, nicht platzhaltert: ein "–"
   * bei idx behauptete, es gäbe dort einen Wert, den man nur nicht kennt.
   * Ein Perimeter hat aber keinen idx.
   */
  check("ein Perimeter zeigt keine idx-Zeile",
    !(await visible("featureIdxRow")));
  check("aber die Flächenzeile, die es bei ihm gibt",
    await visible("featureAreaRow"));
  check("duplizieren gilt nur für Exclusions und ist hier weg",
    !(await visible("duplicateFeatureBtn")));

  /* Gegenprobe an der Exclusion: dort gibt es beides. */
  await page.locator("#clearMultiSelectionBtn").click();
  await page.waitForTimeout(200);
  /* Beide Ringe: die Exclusion hat ein Loch, das sind acht Punkte. */
  await ringe.nth(0).click();
  for (let i = 1; i < 8; i += 1) {
    await ringe.nth(i).click({ modifiers: ["Control"] });
  }
  await page.waitForTimeout(300);

  check("die Exclusion ist vollständig ausgewählt",
    (await sichtbareBloecke()).includes("inspectorFeature"),
    (await sichtbareBloecke()).join(","));
  check("und zeigt ihre idx-Zeile",
    (await visible("featureIdxRow")) && (await text("featureIdxStat")) === "0",
    await text("featureIdxStat"));
  check("und den Duplizieren-Knopf",
    await visible("duplicateFeatureBtn"));

  await page.locator("#clearMultiSelectionBtn").click();
  await page.waitForTimeout(200);
  await marks.nth(0).click();
  for (let i = 1; i < 4; i += 1) {
    await marks.nth(i).click({ modifiers: ["Control"] });
  }
  await page.waitForTimeout(250);

  /* --- gemischte Auswahl ------------------------------------------ */
  await ringe.nth(0).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);

  check("Punkte aus zwei Features: gemischter Zustand",
    (await sichtbareBloecke()).join(",") === "inspectorMixed,inspectorSelection",
    (await sichtbareBloecke()).join(","));
  check("die Zusammenfassung zählt Punkte und Features",
    (await text("mixedSummary")) === "5 Punkte aus 2 Features.",
    await text("mixedSummary"));
  check("der Kopf nennt die Zahl der Features",
    (await head()).unter === "aus 2 Features", (await head()).unter);

  /* --- Umformen ist immer da, mit Grund ---------------------------- */
  const gruende = () => page.evaluate(() => ({
    begradigen: document.getElementById("straightenReason").textContent.trim(),
    reduzieren: document.getElementById("reduceReason").textContent.trim(),
    rechtwinklig: document.getElementById("rectifyReason").textContent.trim(),
  }));

  const gemischt = await gruende();

  check("der Umformblock steht auch bei gemischter Auswahl",
    await visible("inspectorTransform"));
  check("und jedes Werkzeug nennt seinen Grund",
    gemischt.begradigen.length > 0 && gemischt.reduzieren.length > 0 &&
    gemischt.rechtwinklig.length > 0, JSON.stringify(gemischt));
  check("die Werkzeuge sind dabei gesperrt",
    await page.locator("#straightenSelectionBtn").isDisabled() &&
    await page.locator("#reduceApplyBtn").isDisabled() &&
    await page.locator("#rectifyApplyBtn").isDisabled());

  /*
   * Zwei Punkte EINES Features geben den Abschnitt frei. Vorher aufheben:
   * ein einfacher Klick auf einen bereits markierten Punkt hebt die Gruppe
   * bewusst NICHT auf - sie soll ziehbar bleiben.
   */
  await page.locator("#clearMultiSelectionBtn").click();
  await page.waitForTimeout(200);
  await marks.nth(0).click();
  await marks.nth(2).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);

  const frei = await gruende();

  check("bei einem gültigen Abschnitt ändert sich der Grund",
    frei.begradigen !== gemischt.begradigen,
    `${frei.begradigen} / ${gemischt.begradigen}`);
  check("und der Knopf wird frei",
    !(await page.locator("#straightenSelectionBtn").isDisabled()),
    frei.begradigen);

  /* --- Zeichnen ---------------------------------------------------- */
  await load();
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(200);

  check("Zeichnen: nur der Zeichenblock steht",
    (await sichtbareBloecke()).join(",") === "inspectorDraw",
    (await sichtbareBloecke()).join(","));

  await clickMap(10, 10);
  await clickMap(20, 10);
  await page.waitForTimeout(200);

  check("der Fortschritt nennt die fehlenden Punkte",
    (await text("drawProgress")) === "2 von mindestens 3 Punkten gesetzt.",
    await text("drawProgress"));
  check("abschließen geht noch nicht",
    await page.locator("#finishDrawBtn").isDisabled());

  await clickMap(20, 20);
  await page.waitForTimeout(220);

  check("nach dem dritten Punkt ist abschließen möglich",
    !(await page.locator("#finishDrawBtn").isDisabled()));
  check("und der Fortschritt sagt es",
    (await text("drawProgress")) === "3 Punkte gesetzt. Abschließen ist möglich.",
    await text("drawProgress"));
  check("der Kopf nennt Werkzeug und Punktzahl",
    (await head()).titel === "3 Punkte gesetzt" &&
    (await head()).unter === "Exclusion zeichnen",
    `${(await head()).titel} / ${(await head()).unter}`);

  /* Der sichtbare Knopf schließt wirklich ab - nicht nur Enter. */
  const vorher = await page.evaluate(() =>
    document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length);

  await page.locator("#finishDrawBtn").click();
  await page.waitForTimeout(350);

  const nachher = await page.evaluate(() =>
    document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length);

  check("„Zeichnung abschließen“ legt die Exclusion an",
    nachher === vorher + 3, `${vorher} -> ${nachher}`);

  /* --- Messen ------------------------------------------------------ */
  await load();
  await page.locator("#measureBtn").click();
  await page.waitForTimeout(200);

  check("Messen: nur der Messblock steht",
    (await sichtbareBloecke()).join(",") === "inspectorMeasure",
    (await sichtbareBloecke()).join(","));

  await clickMap(5, 5);
  await clickMap(15, 5);
  await page.waitForTimeout(250);

  check("die Messung nennt eine Distanz",
    (await text("measureStatus")).includes("Distanz"),
    await text("measureStatus"));
  check("und „Messung löschen“ ist frei",
    !(await page.locator("#clearMeasureBtn").isDisabled()));

  await page.locator("#clearMeasureBtn").click();
  await page.waitForTimeout(250);

  check("löschen entfernt die Messlinie",
    (await page.locator(".measurement-line").count()) === 0);
  check("und der Inspektor kehrt zurück",
    (await sichtbareBloecke()).join(",") === "inspectorEmpty",
    (await sichtbareBloecke()).join(","));

  /* --- Prüfbericht ------------------------------------------------- */
  await load([MIT_LOCH]);

  /*
   * Der Prueftext vom Seitenaufbau blieb stehen, bis jemand pruefte - im
   * eingeklappten Seitenleistenabschnitt fiel das nicht auf, im Inspektor
   * steht es dauerhaft im Blick.
   */
  check("mit geladener Karte fordert die Prüfung nicht mehr zum Laden auf",
    (await text("validationSummary")) === "Noch keine Prüfung durchgeführt.",
    await text("validationSummary"));

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  /*
   * Der Prüfblock ist zugeklappt und klappt bewusst nicht von selbst auf. Um
   * die Liste zu benutzen, öffnet man ihn - genau wie ein Nutzer.
   */
  await page.locator("#inspectorValidation > summary").click();
  await page.waitForTimeout(250);

  const befunde = await page.locator("#validationReport .validation-item").count();

  check("der Bericht steht im Inspektor", befunde > 0, String(befunde));

  const anspringbar =
    await page.locator("#validationReport button[data-validation-target]").count();

  check("mindestens ein Befund ist anspringbar", anspringbar > 0,
    String(anspringbar));

  await page.locator("#validationReport button[data-validation-target]")
    .first().click();
  await page.waitForTimeout(300);

  check("der Klick wählt das genannte Feature vollständig aus",
    (await sichtbareBloecke()).includes("inspectorFeature"),
    (await sichtbareBloecke()).join(","));

  /* ---------------------------------------------------------------- */
  console.log("Leere Felder sagen, warum sie leer sind");

  await load();
  await marks.nth(0).click();
  await marks.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);

  check("bei mehreren Punkten erklären die E/N-Felder ihre Leere",
    (await page.locator("#pointEastInput").getAttribute("placeholder")) ===
      "mehrere Punkte ausgewählt",
    await page.locator("#pointEastInput").getAttribute("placeholder"));

  await page.locator("#clearMultiSelectionBtn").click();
  await page.waitForTimeout(250);

  check("ohne Auswahl sagen sie das",
    (await page.locator("#pointNorthInput").getAttribute("placeholder")) ===
      "kein Punkt ausgewählt",
    await page.locator("#pointNorthInput").getAttribute("placeholder"));

  await marks.nth(0).click();
  await page.waitForTimeout(250);

  check("mit einem Punkt steht wieder ein Wert statt einer Erklärung",
    (await page.locator("#pointEastInput").getAttribute("placeholder")) === "" &&
    (await page.locator("#pointEastInput").inputValue()).length > 0,
    await page.locator("#pointEastInput").inputValue());

  /* ---------------------------------------------------------------- */
  console.log("Umformen und Kartenprüfung sind eingeklappt, nicht weg");

  await load([MIT_LOCH]);

  const offen = (id) => page.evaluate((x) => document.getElementById(x).open, id);

  /* Sichtbar im Sinne von "der Block steht da" - auch zugeklappt. */
  check("der Umformblock steht", await visible("inspectorTransform"));
  check("der Prüfblock steht", await visible("inspectorValidation"));
  check("beide sind beim ersten Start zu",
    !(await offen("inspectorTransform")) && !(await offen("inspectorValidation")));

  /*
   * Zugeklappt heißt: der Inhalt ist wirklich weg, nicht nur optisch. Sonst
   * wäre nichts gewonnen und man könnte hineintabben.
   */
  /*
   * Gemessen wird die Höhe des BLOCKS, nicht die seines Inhalts. Ein
   * zugeklapptes <details> versteckt den Inhalt über content-visibility:
   * der berechnete Stil meldet weiterhin "flex", und getBoundingClientRect()
   * liefert dort weiterhin die volle Höhe - der Inhalt ist gelayoutet, nur
   * nicht gerendert. Dieselbe Lehre wie beim [hidden]-Fund, nur andersherum:
   * es zählt, was der Block tatsächlich an Platz belegt.
   */
  const blockhoehe = (id) => page.evaluate((x) =>
    Math.round(document.getElementById(x).getBoundingClientRect().height), id);

  const zu = await blockhoehe("inspectorTransform");

  check("zugeklappt kostet der Umformblock nur seine Kopfzeile",
    zu < 40, String(zu));

  const marken = () => page.evaluate(() =>
    [...document.querySelectorAll("#transformSummary > span")]
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => el.textContent.trim()));

  check("ohne Auswahl sagt die Kopfzeile, dass nichts geht",
    (await marken()).join(",") === "nichts möglich", (await marken()).join(","));

  await marks.nth(0).click();
  await marks.nth(2).click({ modifiers: ["Control"] });
  await page.waitForTimeout(300);

  /*
   * Alle drei: der Abschnitt gibt Begradigen frei, Reduzieren arbeitet auf ihm
   * und Rechtwinklig fällt auf das ganze Feature zurück.
   */
  check("mit gültigem Abschnitt nennt sie die Werkzeuge",
    (await marken()).join(" · ") === "Begradigen · Reduzieren · Rechtwinklig",
    (await marken()).join(" · "));

  /*
   * DAS ist der Punkt: der Block klappt NICHT von selbst auf, obwohl gerade
   * zwei Werkzeuge ausführbar geworden sind. Selbsttätiges Aufklappen wäre
   * genau die Unruhe, gegen die der feste Kopfblock gebaut wurde.
   */
  check("und der Block bleibt trotzdem zu",
    !(await offen("inspectorTransform")));

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(500);

  const kurz = () =>
    page.evaluate(() =>
      document.getElementById("validationFoldShort").textContent.trim());

  check("die Prüfung schreibt ihre Kurzform in die Kopfzeile",
    /Fehler|Warnung|keine Befunde/.test(await kurz()), await kurz());
  check("und klappt den Block ebenfalls nicht auf",
    !(await offen("inspectorValidation")));

  /* Aufklappen geht - und der Wunsch überlebt den Neuaufbau. */
  await page.locator("#inspectorTransform > summary").click();
  await page.waitForTimeout(250);

  check("aufklappen zeigt die Werkzeuge",
    (await offen("inspectorTransform")) &&
    (await blockhoehe("inspectorTransform")) > zu + 200,
    `${await blockhoehe("inspectorTransform")} statt >${zu + 200}`);

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(400);

  check("nach dem Neuladen ist er noch offen",
    await offen("inspectorTransform"), "Zustand ging verloren");
  check("und der Prüfblock weiterhin zu",
    !(await offen("inspectorValidation")));

  /* ---------------------------------------------------------------- */
  console.log("Die Spalte kommt bei 1000 px Höhe ohne Scrollen aus");

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await load([MIT_LOCH]);

  const passt = () => page.evaluate(() => {
    const el = document.getElementById("inspector");
    return el.scrollHeight <= el.clientHeight;
  });

  const hoehen = () => page.evaluate(() => {
    const el = document.getElementById("inspector");
    return `${el.scrollHeight} in ${el.clientHeight}`;
  });

  await marks.nth(0).click();
  await page.waitForTimeout(300);

  check("Zustand ein Punkt passt ohne Scrollen", await passt(), await hoehen());

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(500);

  check("mit Prüfergebnis ebenfalls", await passt(), await hoehen());

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(250);

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
  const wegVomBlock = await page.evaluate((ids) => {
    const versteckt = ids
      .map((id) => document.getElementById(id))
      .filter((el) => getComputedStyle(el).display === "none");

    return versteckt.flatMap((block) => [...block.querySelectorAll(
      "a[href],button,input,select,textarea,summary,[tabindex]")])
      .filter((el) => el.offsetParent !== null).length;
  }, BLOECKE);

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

  /*
   * Die neuen Zustaende bringen neue Muster mit. Geprueft wird an der Gruppe,
   * weil dort Kopfblock, Zusammenfassung und Blockueberschrift zusammenkommen.
   */
  await marks.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("die Gruppe wird übersetzt",
    (await head()).titel === "2 points selected", (await head()).titel);
  check("und ihre Zusammenfassung",
    (await text("multiSummary")) === "2 points in Perimeter.",
    await text("multiSummary"));
  check("auch die Überschrift des Umformblocks",
    (await page.evaluate(() =>
      document.querySelector("#inspectorTransform .inspector-section-title")
        .textContent.trim())) === "Reshape",
    await page.evaluate(() =>
      document.querySelector("#inspectorTransform .inspector-section-title")
        .textContent.trim()));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und alles kommt deutsch zurück",
    (await head()).titel === "2 Punkte ausgewählt" &&
    (await text("multiSummary")) === "2 Punkte in Perimeter.",
    `${(await head()).titel} | ${await text("multiSummary")}`);

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Der Inspektor zeigt genau einen Zustand und bleibt tastaturbedienbar.");
