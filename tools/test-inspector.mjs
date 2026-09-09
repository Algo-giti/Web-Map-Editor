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
if (!browser) process.exit(2);

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

  /*
   * „Letzten Punkt entfernen" und „Abbrechen" liegen seit Etappe 5 ebenfalls
   * im Inspektor. Beide werden ueber ihre WIRKUNG geprueft, nicht ueber einen
   * unveraenderten Zustand: eine Zusicherung ueber ein Ausbleiben besteht auch
   * dann, wenn der Knopf gar nichts tut.
   */
  await load();
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(200);
  await clickMap(10, 10);
  await clickMap(20, 10);
  await clickMap(20, 20);

  check("drei Punkte sind gesetzt",
    (await text("drawProgress")) === "3 Punkte gesetzt. Abschließen ist möglich.",
    await text("drawProgress"));

  await page.locator("#undoDrawPointBtn").click();
  await page.waitForTimeout(250);

  check("„Letzten Punkt entfernen“ nimmt einen zurück",
    (await text("drawProgress")) === "2 von mindestens 3 Punkten gesetzt.",
    await text("drawProgress"));
  check("und sperrt damit das Abschließen wieder",
    await page.locator("#finishDrawBtn").isDisabled());

  const vorAbbruch = await page.evaluate(() =>
    document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length);

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(300);

  check("„Abbrechen“ beendet den Zeichenzustand",
    (await sichtbareBloecke()).join(",") === "inspectorEmpty",
    (await sichtbareBloecke()).join(","));
  check("und legt nichts an",
    (await page.evaluate(() =>
      document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length))
      === vorAbbruch);

  /*
   * Formwerkzeuge zaehlen keine Punkte: ein Klick setzt den Bezugspunkt, und
   * die Form entsteht sofort. "0 Punkte gesetzt" waere dort eine Zaehlung,
   * die nie ueber 0 hinauskommt.
   */
  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);

  check("der Kreis fordert einen Bezugspunkt statt einer Punktzahl",
    (await head()).titel === "Bezugspunkt setzen" &&
    (await text("drawProgress")) === "Mittelpunkt auf der Karte anklicken.",
    `${(await head()).titel} / ${await text("drawProgress")}`);
  check("und nennt das Werkzeug",
    (await head()).unter === "Kreis-Exclusion", (await head()).unter);

  const vorKreis = await page.evaluate(() =>
    document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length);

  await clickMap(30, 30);
  await page.waitForTimeout(400);

  /*
   * Seit Etappe 5b setzt der Klick nur den Bezugspunkt - erzeugt wird beim
   * Abschliessen. So bleiben die Masse bis dahin veraenderbar.
   */
  check("der Klick setzt den Bezugspunkt, erzeugt aber noch nichts",
    (await page.evaluate(() =>
      document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length))
      === vorKreis &&
    (await head()).titel === "Bezugspunkt gesetzt",
    (await head()).titel);

  await page.locator("#finishDrawBtn").click();
  await page.waitForTimeout(400);

  check("das Abschliessen erzeugt die Kreis-Exclusion",
    (await page.evaluate(() =>
      document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length))
      > vorKreis + 10,
    String(await page.evaluate(() =>
      document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length)));

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
  console.log("Die Punktrolle steht nur da, wenn es eine gibt");

  /*
   * #pointMeta wiederholte bis hierher, was der Kopfblock seit Etappe 4
   * ohnehin sagt. Uebrig bleibt die Punktrolle - und auch die nur fuer Start-
   * und Endpunkt: "Zwischenpunkt" ist der Normalfall und sagt nichts.
   */
  await load();
  await marks.nth(0).click();
  await page.waitForTimeout(300);

  check("der Startpunkt wird benannt",
    (await visible("pointMeta")) && (await text("pointMeta")) === "Startpunkt",
    await text("pointMeta"));

  await marks.nth(3).click();
  await page.waitForTimeout(300);

  check("der Endpunkt ebenfalls",
    (await visible("pointMeta")) && (await text("pointMeta")) === "Endpunkt",
    await text("pointMeta"));

  await marks.nth(1).click();
  await page.waitForTimeout(300);

  check("ein gewöhnlicher Punkt bekommt keine Zeile",
    !(await visible("pointMeta")), await text("pointMeta"));

  /*
   * Und die Gegenprobe, dass nichts verlorengegangen ist: Punktnummer und
   * Feature stehen weiterhin da - im Kopfblock.
   */
  const nachKuerzung = await head();

  check("Punktnummer und Anzahl stehen weiterhin im Kopf",
    /^Punkt 2 von 4$/.test(nachKuerzung.titel), nachKuerzung.titel);
  check("Feature und Behälter ebenfalls",
    nachKuerzung.unter === "Perimeter · Polygon", nachKuerzung.unter);

  /* ---------------------------------------------------------------- */
  console.log("Der Bestandsblock haengt an der Karte, nicht an der Auswahl");

  await load([MIT_LOCH]);

  /*
   * Die Knoepfe fuer Search Wire und Docking-Pfad haengen am BESTAND der
   * Karte, nicht an einer Auswahl - sie muessen deshalb auch erreichbar sein,
   * wenn nichts ausgewaehlt ist.
   */
  check("ohne Auswahl steht der Bestandsblock",
    await visible("inspectorStock"));

  await page.locator("#inspectorStock > summary").click();
  await page.waitForTimeout(250);

  check("und seine Knoepfe sind ohne Auswahl sichtbar",
    (await visible("extendSearchWireBtn")) && (await visible("deleteSearchWireBtn")) &&
    (await visible("extendDockBtn")) && (await visible("deleteDockBtn")));

  check("der Bestand nennt die fehlende Search Wire",
    (await text("searchWireStock")) === "Nicht vorhanden.",
    await text("searchWireStock"));
  check("die Kopfzeile fasst ihn zusammen",
    (await text("stockSummary")) === "keine Search Wire · kein Dockpfad",
    await text("stockSummary"));

  /* Mit einer echten Search Wire aendert sich beides. */
  await load([{
    type: "Feature", properties: { name: "search wire" },
    geometry: { type: "LineString", coordinates: [[2, 2], [8, 2], [14, 2]] },
  }]);

  check("mit Search Wire nennt der Bestand ihre Punktzahl",
    (await text("searchWireStock")) === "Vorhanden, 3 Punkte.",
    await text("searchWireStock"));
  check("die Kopfzeile ebenfalls",
    (await text("stockSummary")) === "Search Wire · kein Dockpfad",
    await text("stockSummary"));
  check("und verlaengern ist freigegeben",
    !(await page.locator("#extendSearchWireBtn").isDisabled()));

  /* ---------------------------------------------------------------- */
  console.log("Die Punktknöpfe stehen als Paare");

  await load();
  await marks.nth(0).click();
  await page.waitForTimeout(300);

  const kasten = (id) => page.evaluate((x) => {
    const r = document.getElementById(x).getBoundingClientRect();
    return { links: Math.round(r.left), oben: Math.round(r.top),
      breit: Math.round(r.width) };
  }, id);

  const davor = await kasten("insertPointBeforeBtn");
  const danach = await kasten("insertPointAfterBtn");
  const start = await kasten("setStartPointBtn");
  const ende = await kasten("setEndPointBtn");
  const loeschen = await kasten("deletePointBtn");

  check("davor und danach stehen nebeneinander",
    davor.oben === danach.oben && danach.links > davor.links,
    `${JSON.stringify(davor)} / ${JSON.stringify(danach)}`);
  check("Start und Ende ebenfalls",
    start.oben === ende.oben && ende.links > start.links,
    `${JSON.stringify(start)} / ${JSON.stringify(ende)}`);
  check("und die Paare untereinander", start.oben > davor.oben,
    `${start.oben} / ${davor.oben}`);

  /*
   * Löschen ist die einzige zerstörende Aktion im Block und soll nicht wie
   * ein Paarpartner aussehen: eigene Zeile über die volle Breite.
   */
  check("Löschen steht allein über die volle Breite",
    loeschen.links === davor.links &&
    loeschen.breit > davor.breit + 100 &&
    loeschen.oben > start.oben,
    `${JSON.stringify(loeschen)} vs ${JSON.stringify(davor)}`);

  /*
   * Die Tab-Reihenfolge muss den Paaren folgen. Bei einem zweispaltigen
   * Raster ist das die DOM-Reihenfolge - aber genau das kann eine spätere
   * Umsortierung im Markup oder ein `order`/`grid-area` in CSS zerreißen,
   * ohne dass man es sieht.
   */
  await page.locator("#pointNorthInput").focus();
  const reihenfolge = [];
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Tab");
    reihenfolge.push(await page.evaluate(() => document.activeElement?.id));
  }

  check("Tab folgt den Paaren: davor, danach, Start, Ende, löschen",
    reihenfolge.join(",") ===
      "insertPointBeforeBtn,insertPointAfterBtn,setStartPointBtn,setEndPointBtn,deletePointBtn",
    reihenfolge.join(","));

  /*
   * Bei halber Spaltenbreite darf keine Beschriftung abgeschnitten werden -
   * Knöpfe tragen white-space:nowrap, ein zu langer Text liefe still über den
   * Rand. Gemessen wird die EIGENBREITE einer Kopie mit width:max-content;
   * scrollWidth meldet den Überlauf bei overflow:visible nicht.
   *
   * Die Kopie übernimmt Schrift und Polsterung vom Original: sie liegt
   * außerhalb von #inspectorPoint, wo die dortigen Regeln nicht mehr greifen.
   */
  const KNOEPFE = ["insertPointBeforeBtn", "insertPointAfterBtn",
    "setStartPointBtn", "setEndPointBtn", "deletePointBtn"];

  const zuEng = () => page.evaluate((ids) => {
    const buehne = document.createElement("div");
    buehne.style.cssText = "position:absolute;left:-9999px;top:0;";
    document.body.appendChild(buehne);

    const out = ids.filter((id) => {
      const el = document.getElementById(id);
      const cs = getComputedStyle(el);
      const kopie = el.cloneNode(true);
      kopie.removeAttribute("id");
      kopie.style.width = "max-content";
      kopie.style.font = cs.font;
      kopie.style.padding = cs.padding;
      kopie.style.borderWidth = cs.borderWidth;
      buehne.appendChild(kopie);
      const noetig = Math.ceil(kopie.getBoundingClientRect().width);
      kopie.remove();
      return noetig > Math.round(el.getBoundingClientRect().width);
    });

    buehne.remove();
    return out;
  }, KNOEPFE);

  check("keine deutsche Beschriftung wird abgeschnitten",
    (await zuEng()).length === 0, (await zuEng()).join(", "));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("keine englische ebenfalls",
    (await zuEng()).length === 0, (await zuEng()).join(", "));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

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
  check("der Bestandsblock steht", await visible("inspectorStock"));
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
  console.log("Höhenziel: bis 900 px scrollfrei, darunter darf sie scrollen");

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
  await page.waitForTimeout(300);

  check("bei 900 px Höhe passt es ebenfalls", await passt(), await hoehen());

  /*
   * Die Auswahlknoepfe stehen seit Etappe 7b nebeneinander - dieselbe
   * Anordnung und derselbe Grund wie bei den Punktknoepfen. Geprueft wird die
   * WIRKUNG: beide in einer Zeile, und ihre Beschriftung laeuft nicht ueber
   * den Rand. scrollWidth meldet den Ueberlauf bei overflow:visible nicht,
   * deshalb die Eigenbreite einer Kopie mit width:max-content - und die Kopie
   * muss IM Block haengen, sonst erbt sie 16 px statt der 14.
   */
  const auswahlknoepfe = await page.evaluate(() => {
    const block = document.getElementById("inspectorSelection");
    const knoepfe = [...block.querySelectorAll("button")];

    return knoepfe.map((btn) => {
      const kopie = btn.cloneNode(true);
      kopie.style.cssText =
        "position:absolute;visibility:hidden;left:-9999px;width:max-content;";
      block.appendChild(kopie);
      const eigen = kopie.getBoundingClientRect().width;
      kopie.remove();

      const r = btn.getBoundingClientRect();
      return {text: btn.textContent.trim(), oben: Math.round(r.top),
              luft: Math.round(r.width - eigen)};
    });
  });

  check("die beiden Auswahlknöpfe stehen in einer Zeile",
    auswahlknoepfe.length === 2 &&
    auswahlknoepfe[0].oben === auswahlknoepfe[1].oben,
    JSON.stringify(auswahlknoepfe));

  check("und keine Beschriftung läuft über den Rand",
    auswahlknoepfe.every((k) => k.luft >= 0), JSON.stringify(auswahlknoepfe));

  /*
   * Bei 800 px darf die Spalte scrollen - das ist der ZUGELASSENE Fall, kein
   * Zielverlust. Das Höhenziel lautet seit Etappe 6 b3 "bis 900 px
   * scrollfrei", nicht "keine Fenstergröße scrollt": die Fahrtrichtung des
   * ausgewählten Punktes gehört in den Punktzustand, und dort hat bei 800 px
   * ohnehin nichts mehr Platz - vor dem Umzug waren dort 2 px frei.
   *
   * Zugesichert wird deshalb nicht, DASS es scrollt (das wäre eine Zusicherung
   * über ein Ausbleiben), sondern dass die Spalte in diesem Fall wirklich
   * erreichbar bleibt: sie hat einen Scrollbereich, und er lässt sich nutzen.
   */
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.waitForTimeout(300);

  const scrollbar = await page.evaluate(() => {
    const el = document.getElementById("inspector");
    el.scrollTop = 9999;
    return { erreicht: el.scrollTop > 0, ueberschuss: el.scrollHeight - el.clientHeight };
  });

  check("bei 800 px bleibt der Inhalt über die Rollleiste erreichbar",
    scrollbar.erreicht || scrollbar.ueberschuss <= 0,
    JSON.stringify(scrollbar));

  /* ---------------------------------------------------------------- */
  console.log("Die Tooltips der Umformwerkzeuge erklären, statt zu benennen");

  await load([MIT_LOCH]);

  const UMFORMEN = ["straightenSelectionBtn", "reduceApplyBtn", "rectifyApplyBtn"];

  const tipps = () => page.evaluate((ids) => ids.map((id) =>
    document.getElementById(id).title), UMFORMEN);

  const beschriftungen = () => page.evaluate((ids) => ids.map((id) =>
    document.getElementById(id).textContent.trim()), UMFORMEN);

  const gesperrt = await tipps();
  const namen = await beschriftungen();

  /*
   * Ein Tooltip, der nur die Beschriftung wiederholt, sagt nichts: wer den
   * Knopf sieht, hat sie schon gelesen.
   */
  check("kein Tooltip wiederholt nur die Beschriftung",
    gesperrt.every((t, i) => t !== namen[i] && t.length > namen[i].length + 40),
    gesperrt.join(" | "));
  check("jeder nennt eine Wirkung",
    gesperrt.every((t) => /Punkt|Kante|Linie/.test(t)), gesperrt.join(" | "));

  /*
   * Der Ablehnungsgrund steht weiterhin SICHTBAR unter dem Knopf, nicht nur
   * im Tooltip - dort erschiene er auf einem Touchgerät nie.
   */
  const gruendeGesperrt = await gruende();

  check("und der Ablehnungsgrund steht sichtbar unter dem Knopf",
    Object.values(gruendeGesperrt).every((g) => g.length > 0),
    JSON.stringify(gruendeGesperrt));

  /*
   * Der Tooltip ändert sich nicht, wenn das Werkzeug verfügbar wird.
   * Ausgewählt wird an der Exclusion, nicht am Perimeter: dessen obere Ecken
   * liegen unter der Zoom-Leiste der Karte, die den Klick abfängt.
   */
  await ringe.nth(0).click();
  await ringe.nth(2).click({ modifiers: ["Control"] });
  await page.waitForTimeout(300);

  check("die Werkzeuge sind jetzt verfügbar",
    !(await page.locator("#straightenSelectionBtn").isDisabled()));
  check("der Tooltip erklärt weiterhin dasselbe",
    (await tipps()).join("|") === gesperrt.join("|"),
    (await tipps()).join(" | "));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  const englisch = await tipps();

  check("und ist auf Englisch übersetzt",
    englisch.every((t, i) => t !== gesperrt[i] && /[A-Za-z]/.test(t)),
    englisch.join(" | "));
  check("ohne deutschen Rest",
    !englisch.join(" ").match(/[äöüß]|Punkte|Kante|Linie/),
    englisch.join(" | "));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  check("und kommt deutsch zurück",
    (await tipps()).join("|") === gesperrt.join("|"), (await tipps()).join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Inspektor einklappen");

  await page.setViewportSize({ width: 1600, height: 900 });
  await load();
  await marks.nth(0).click();
  await page.waitForTimeout(300);

  const breite = (id) => page.evaluate((x) =>
    Math.round(document.getElementById(x).getBoundingClientRect().width), id);

  const offenBreit = await breite("inspector");
  const karteEng = await breite("viewer");

  check("ausgeklappt ist der Inspektor 320 px breit",
    offenBreit === 320, String(offenBreit));

  await page.locator("#inspectorToggle").click();
  await page.waitForTimeout(300);

  const zuBreit = await breite("inspector");

  check("eingeklappt bleibt ein schmaler Streifen",
    zuBreit > 0 && zuBreit < 40, String(zuBreit));
  check("und die Karte wird um die Differenz breiter",
    (await breite("viewer")) === karteEng + (offenBreit - zuBreit),
    `${await breite("viewer")} statt ${karteEng + (offenBreit - zuBreit)}`);

  /*
   * Der Inhalt muss wirklich weg sein, nicht nur überlaufen - sonst stünde er
   * weiterhin da und man könnte hineintabben.
   */
  check("der Inhalt ist nicht mehr sichtbar",
    !(await visible("inspectorPoint")) && !(await visible("inspectorTransform")));
  check("aber der Umschalter bleibt erreichbar",
    await visible("inspectorToggle"));

  const tabstopps = await page.evaluate(() =>
    [...document.getElementById("inspector").querySelectorAll(
      "a[href],button,input,select,textarea,summary,[tabindex]")]
      .filter((el) => el.offsetParent !== null).map((el) => el.id || el.tagName));

  check("und ist der einzige Tabstopp im eingeklappten Inspektor",
    tabstopps.join(",") === "inspectorToggle", tabstopps.join(","));

  /*
   * Anders als der Behelfsschalter der Seitenleiste ist das ein dauerhafter
   * Wunsch: wer breit arbeiten will, will das auch nach dem nächsten Start.
   */
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(400);

  check("der Zustand überlebt den Neuaufbau",
    (await breite("inspector")) < 40, String(await breite("inspector")));

  await page.locator("#inspectorToggle").click();
  await page.waitForTimeout(300);

  check("wieder ausklappen geht",
    (await breite("inspector")) === 320, String(await breite("inspector")));
  check("und der Inhalt ist zurück", await visible("inspectorEmpty"));

  await page.setViewportSize({ width: 1600, height: 900 });

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
  console.log("Kein Zwischenstands-Schalter mehr");

  /*
   * Der Behelfsschalter der Seitenleiste ist mit Etappe 6 ersatzlos
   * entfallen - samt Knopf, CSS und Logik. Die Zusicherung steht hier, damit
   * ein Wiederauftauchen auffaellt.
   */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
  await load();

  check("es gibt keinen Seitenleisten-Umschalter mehr",
    (await page.locator("#sidebarToggle").count()) === 0,
    String(await page.locator("#sidebarToggle").count()));
  check("und keine Restklasse im Raster",
    await page.evaluate(() =>
      !document.querySelector(".app").classList.contains("sidebar-collapsed")));

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
