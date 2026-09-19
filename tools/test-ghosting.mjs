#!/usr/bin/env node
// Browsertest für das Ghosting - den blassen Umriss des Zustands vor der
// Bearbeitung.
//
// Gegenstand ist die Frage, WEM ein Ghost gehört. Ein Vergleichszustand kennt
// seinen Punkt über die Array-Referenz seiner Koordinate und - als Rückfall
// nach Undo oder nach einem Umformwerkzeug - über Feature-Index und
// Anzeigenamen. Beide verschieben sich, sobald ein Feature eingefügt oder
// entfernt wird. Ohne Neuverankerung erbt eine frisch entstandene Fläche den
// Ghost ihres Nachbarn, und eine frisch entstandene Fläche hat keinen
// Zustand von vorher.
//
// WARUM HIER KEIN elementGetroffen(): die Ghost-Gruppe trägt
// `pointer-events:none`, damit sie Kartenklicks nicht schluckt.
// `document.elementFromPoint()` liefert an ihrer Stelle deshalb bauartbedingt
// das `svg` darunter - eine Trefferprüfung auf den Ghost selbst könnte NIE
// gelingen. Dieselbe Grenze wie bei der Zeichenvorschau in
// tools/test-shapes.mjs. Gemessen wird stattdessen, was davon übrig bleibt
// und trotzdem eine Wirkung ist: der Ghost hat ein Rechteck, er steht an der
// Weltkoordinate, an der er stehen soll, und seine Mitte liegt auf der
// gezeichneten Karte.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-ghosting.mjs

import {
  createChecker,
  createMenueBefehl,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-ghosting";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/** Perimeter mit drei weit auseinanderliegenden Exclusions. */
function karte() {
  const kasten = (x) => [
    [x, 5], [x + 7, 5], [x + 7, 12], [x, 12], [x, 5],
  ];

  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [60, 0], [60, 60], [0, 60], [0, 0]]] } },
      { type: "Feature", idx: 0, properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [kasten(5)] } },
      { type: "Feature", idx: 1, properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [kasten(20)] } },
      { type: "Feature", idx: 2, properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [kasten(35)] } },
    ],
  });
}

/**
 * Perimeter, eine Exclusion und die beiden Einzelstücke - wobei das zuerst
 * genannte auf Index 2 liegt und gleich gelöscht wird.
 *
 * BEIDE Linien tragen denselben Anzeigenamen. Das ist der Fall, in dem der
 * Rückfall überhaupt danebengreifen kann: `describeFeature()` liefert für
 * „Search Wire" und „Dockpoints" sonst verschiedene Namen, ein vom Nutzer
 * vergebenes `properties.label` dagegen kann zweimal dasselbe sagen.
 */
function karteMitLinien(zuerst) {
  const linie = (name, koordinaten) => ({
    type: "Feature",
    properties: { name, label: "Kabel" },
    geometry: { type: "LineString", coordinates: koordinaten },
  });

  const wire = linie("search wire", [[20, 30], [30, 30]]);
  const dock = linie("dockpoints", [[40, 45], [50, 45]]);

  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [60, 0], [60, 60], [0, 60], [0, 0]]] } },
      { type: "Feature", idx: 0, properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [[
          [5, 5], [12, 5], [12, 12], [5, 12], [5, 5]]] } },
      zuerst === "search wire" ? wire : dock,
      zuerst === "search wire" ? dock : wire,
    ],
  });
}

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  const menueBefehl = createMenueBefehl(page, check);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("dialog", (dialog) => dialog.accept());

  const laden = async (inhalt = karte()) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await openAllFolds(page);
    await page.locator("#fileInput").setInputFiles({
      name: "ghosting.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(inhalt),
    });
    await page.waitForTimeout(400);
    await openAllFolds(page);
  };

  /*
   * Jeder gezeichnete Ghost mit seiner Weltkoordinate, seinem Rechteck und
   * dem, was der Browser an seiner Mitte wirklich zeichnet.
   */
  const geister = () => page.evaluate(() =>
    [...document.querySelectorAll(
      "#selectionGhostGroup circle.selection-ghost-point")].map((kreis) => {
      const rechteck = kreis.getBoundingClientRect();
      const mitteX = rechteck.left + rechteck.width / 2;
      const mitteY = rechteck.top + rechteck.height / 2;
      const darunter = document.elementFromPoint(mitteX, mitteY);

      return {
        east: Number(kreis.getAttribute("cx")),
        north: -Number(kreis.getAttribute("cy")),
        titel: kreis.querySelector("title")?.textContent || "",
        breite: rechteck.width,
        hoehe: rechteck.height,
        aufDerKarte: !!darunter?.closest("#svg"),
      };
    }));

  /** Die gestrichelten Verbindungen von vorher nach jetzt. */
  const linien = () => page.evaluate(() =>
    [...document.querySelectorAll(
      "#selectionGhostGroup path.selection-ghost-line")]
      .map((pfad) => pfad.getAttribute("d")));

  /** Weltausdehnung des äußeren Rings eines Features. */
  const bereich = (featureIndex) => page.evaluate((index) => {
    const ring = data.features?.[index]?.geometry?.coordinates?.[0] || [];
    const punkte = ring.map((punkt) => toWorld(punkt));

    return {
      minE: Math.min(...punkte.map((p) => p[0])),
      maxE: Math.max(...punkte.map((p) => p[0])),
      minN: Math.min(...punkte.map((p) => p[1])),
      maxN: Math.max(...punkte.map((p) => p[1])),
    };
  }, featureIndex);

  /* Ein Rand von 1 m, damit ein Ghost am Eckpunkt mitzählt. */
  const imBereich = (liste, box) => liste.filter((geist) =>
    geist.east >= box.minE - 1 && geist.east <= box.maxE + 1 &&
    geist.north >= box.minN - 1 && geist.north <= box.maxN + 1);

  /** Weltkoordinate eines Punktes, bevor er bewegt wird. */
  const punktAt = (featureIndex, pointIndex) => page.evaluate(
    ([f, p]) => toWorld(data.features[f].geometry.coordinates[0][p]),
    [featureIndex, pointIndex]);

  const waehlePunkt = async (featureIndex, pointIndex) => {
    await page.evaluate(([f, p]) => {
      setVertexSelection([{ featureIndex: f, containerPath: [0], pointIndex: p }]);
      renderGeometry();
      updateSelectionPanel();
    }, [featureIndex, pointIndex]);
    await page.waitForTimeout(150);
  };

  const typen = () => page.evaluate(() =>
    (data.features || []).map((f) => getFeatureType(f)));

  /* ---------------------------------------------------------------- */
  console.log("Eine frisch duplizierte Exclusion hat keinen Zustand von vorher");

  await laden();

  /*
   * Erst einen echten Ghost erzeugen, und zwar an einer WEIT entfernten
   * Exclusion. Ohne ihn sagte „an der Kopie steht kein Ghost" nichts - es
   * stünde dann nirgends einer.
   */
  await waehlePunkt(3, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  await page.evaluate(() => clearVertexSelection());
  await page.waitForTimeout(200);

  const nachbarBereich = await bereich(3);
  let liste = await geister();

  check("vor dem Duplizieren steht genau ein Ghost auf der Karte",
    liste.length === 1, String(liste.length));
  check("und zwar an der bewegten Exclusion",
    imBereich(liste, nachbarBereich).length === 1,
    JSON.stringify(liste.map((g) => [g.east, g.north])));
  check("er hat ein Rechteck und liegt auf der gezeichneten Karte",
    !!liste[0] && liste[0].breite > 0 && liste[0].hoehe > 0 && liste[0].aufDerKarte,
    JSON.stringify(liste[0]));

  /*
   * Die mittlere Exclusion duplizieren - über die Oberfläche, nicht direkt.
   * Die Navigation wird bei jeder Auswahländerung neu gebaut, und die Karten
   * nicht ausgewählter Features entstehen dabei ZU; deshalb vorher aufklappen.
   */
  await openAllFolds(page);
  await page.locator(
    '[data-action="select-whole-feature"][data-feature-index="2"]').click();
  await page.waitForTimeout(250);
  await openAllFolds(page);
  await page.locator("#duplicateFeatureBtn").click();
  await page.waitForTimeout(400);

  check("die Kopie ist da: vier Exclusions",
    (await typen()).filter((t) => t === "exclusion").length === 4,
    JSON.stringify(await typen()));

  const kopieBereich = await bereich(3);
  liste = await geister();

  check("an der Stelle der Kopie steht kein Ghost",
    imBereich(liste, kopieBereich).length === 0,
    JSON.stringify(imBereich(liste, kopieBereich)));
  check("der Ghost des Nachbarn steht weiter an seiner eigenen Stelle",
    imBereich(liste, await bereich(4)).length === 1,
    JSON.stringify(liste.map((g) => [g.east, g.north])));

  /*
   * Die Gegenprobe: bewegt man einen Punkt der Kopie, MUSS dort ein Ghost
   * erscheinen. Ohne sie bestünde die Zusicherung darüber auch bei komplett
   * abgeschaltetem Ghosting.
   */
  const vorher = await punktAt(3, 0);

  await waehlePunkt(3, 0);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);

  liste = await geister();
  const eigene = imBereich(liste, kopieBereich);

  check("nach dem Bewegen steht ein Ghost an der Kopie",
    eigene.length === 1, JSON.stringify(liste.map((g) => [g.east, g.north])));
  check("und er liegt auf ihrer eigenen vorherigen Position",
    !!eigene[0] &&
    Math.abs(eigene[0].east - vorher[0]) < 0.001 &&
    Math.abs(eigene[0].north - vorher[1]) < 0.001,
    JSON.stringify([eigene[0]?.east, eigene[0]?.north, vorher]));
  check("er nennt die Kopie und nicht den Nachbarn",
    !!eigene[0] && eigene[0].titel.startsWith("Exclusion #2 ·"),
    eigene[0]?.titel);
  check("der Ghost des Nachbarn steht unverändert daneben",
    imBereich(liste, await bereich(4)).length === 1,
    String(liste.length));

  /* ---------------------------------------------------------------- */
  console.log("Der Ghost-Titel wechselt die Sprache in beide Richtungen");

  const titelDerKopie = async () =>
    (imBereich(await geister(), kopieBereich)[0] || {}).titel || "";

  check("auf deutsch erzeugt: der Titel ist deutsch",
    (await titelDerKopie()).includes("Position vor Bearbeitung/Speichern"),
    await titelDerKopie());

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(250);

  check("auf deutsch erzeugt, dann englisch: der Titel ist übersetzt",
    (await titelDerKopie()).includes("position before editing/saving"),
    await titelDerKopie());

  /* Die Gegenrichtung: in der englischen Oberfläche erzeugen. */
  const vorherZwei = await punktAt(3, 1);

  await waehlePunkt(3, 1);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);

  const zweiterTitel = async () => {
    const treffer = (await geister()).find((geist) =>
      Math.abs(geist.east - vorherZwei[0]) < 0.001 &&
      Math.abs(geist.north - vorherZwei[1]) < 0.001);
    return treffer?.titel || "";
  };

  check("auf englisch erzeugt: der Titel steht englisch da",
    (await zweiterTitel()).includes("position before editing/saving"),
    await zweiterTitel());

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(250);

  check("auf englisch erzeugt, dann deutsch: der Titel ist wieder deutsch",
    (await zweiterTitel()).includes("Position vor Bearbeitung/Speichern"),
    await zweiterTitel());

  /* ---------------------------------------------------------------- */
  console.log("Eine frisch GEZEICHNETE Exclusion erbt ebenso wenig");

  await laden();

  /*
   * Derselbe Fall in der anderen Richtung: das Löschen rückt die
   * nachfolgenden Features auf, und die neu gezeichnete Fläche landet auf
   * dem frei gewordenen Index samt frei gewordener Nummer.
   */
  await waehlePunkt(3, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  await page.evaluate(() => clearVertexSelection());
  await page.waitForTimeout(200);

  const altBereich = await bereich(3);

  check("der Ghost der letzten Exclusion steht",
    imBereich(await geister(), altBereich).length === 1);

  /* Seine Stelle wird GELESEN, nicht als Zahl geführt. */
  const alterGeist = imBereich(await geister(), altBereich)[0];

  const alterGeistSteht = async () =>
    (await geister()).some((geist) =>
      Math.abs(geist.east - alterGeist.east) < 0.001 &&
      Math.abs(geist.north - alterGeist.north) < 0.001);

  await openAllFolds(page);
  await page.locator(
    '[data-action="delete-exclusion"][data-feature-index="2"]').click();
  await page.waitForTimeout(400);

  check("die mittlere Exclusion ist weg",
    (await typen()).filter((t) => t === "exclusion").length === 2,
    JSON.stringify(await typen()));
  check("der Ghost steht weiter an seiner eigenen Stelle",
    imBereich(await geister(), await bereich(2)).length === 1,
    JSON.stringify((await geister()).map((g) => [g.east, g.north])));

  /*
   * Und er überlebt einen neu aufgebauten Ring. `rebuildClosedRing()` legt
   * neue Arrays an - danach trägt nur noch der Rückfall, und der stimmt bloß,
   * wenn das Löschen der Fläche ihn mitgezogen hat.
   */
  await waehlePunkt(2, 2);
  await page.locator("#deletePointBtn").click();
  await page.waitForTimeout(400);

  check("nach dem Punktlöschen hat der Ghost weiterhin seine Linie",
    (await linien()).some((d) =>
      d.startsWith(`M ${alterGeist.east} ${-alterGeist.north} L `)),
    JSON.stringify(await linien()));

  await page.evaluate(() => clearVertexSelection());
  await page.waitForTimeout(200);

  /* Ein Rechteck zeichnen: ein Klick setzt den Bezugspunkt, dann abschließen. */
  await page.locator("#drawRectangleBtn").click();
  await page.waitForTimeout(250);
  await page.fill("#rectWidthInput", "6");
  await page.fill("#rectHeightInput", "6");
  await page.waitForTimeout(150);

  const stelle = await page.evaluate(([e, n]) => {
    const svg = document.getElementById("svg");
    const rect = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    return [
      rect.left + (e - box.x) / box.width * rect.width,
      rect.top + (-n - box.y) / box.height * rect.height,
    ];
  }, [45, 40]);

  await page.mouse.click(stelle[0], stelle[1]);
  await page.waitForTimeout(300);
  await page.locator("#finishDrawBtn").click();
  await page.waitForTimeout(400);
  await openAllFolds(page);

  check("das Rechteck ist entstanden: drei Exclusions",
    (await typen()).filter((t) => t === "exclusion").length === 3,
    JSON.stringify(await typen()));

  const neuBereich = await bereich(3);

  check("an der neuen Fläche steht kein Ghost",
    imBereich(await geister(), neuBereich).length === 0,
    JSON.stringify(imBereich(await geister(), neuBereich)));
  check("und der alte Ghost steht immer noch an seiner Stelle",
    await alterGeistSteht(),
    JSON.stringify((await geister()).map((g) => [g.east, g.north])));

  /* ---------------------------------------------------------------- */
  console.log("Der Ghost einer GELÖSCHTEN Fläche bindet sich an nichts mehr");

  await laden();

  /*
   * Diesmal trägt die Fläche den Ghost, die gleich verschwindet. Ihre
   * Koordinatenreferenz stirbt mit ihr - danach kann nur noch der Rückfall
   * etwas sagen, und genau der zeigt dann auf ein fremdes Feature.
   */
  await waehlePunkt(2, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  await page.evaluate(() => clearVertexSelection());
  await page.waitForTimeout(200);

  const opferBereich = await bereich(2);

  check("der Ghost der mittleren Exclusion steht",
    imBereich(await geister(), opferBereich).length === 1);
  check("und er hat eine Verbindungslinie zu seinem Punkt",
    (await linien()).length === 1, JSON.stringify(await linien()));

  await openAllFolds(page);
  await page.locator(
    '[data-action="delete-exclusion"][data-feature-index="2"]').click();
  await page.waitForTimeout(400);

  check("die Fläche ist weg, ihr Ghost bleibt stehen",
    imBereich(await geister(), opferBereich).length === 1,
    JSON.stringify((await geister()).map((g) => [g.east, g.north])));
  check("aber er zeigt auf keinen Punkt mehr",
    (await linien()).length === 0, JSON.stringify(await linien()));

  /* Die erste Exclusion duplizieren: die Kopie rückt auf Index und Nummer
     der gelöschten nach. */
  await openAllFolds(page);
  await page.locator(
    '[data-action="select-whole-feature"][data-feature-index="1"]').click();
  await page.waitForTimeout(250);
  await openAllFolds(page);
  await page.locator("#duplicateFeatureBtn").click();
  await page.waitForTimeout(400);

  const nachrueckerBereich = await bereich(2);

  check("die Kopie steht auf dem frei gewordenen Platz",
    (await page.evaluate(() => describeFeature(data.features[2]))) ===
      "Exclusion #1",
    await page.evaluate(() => describeFeature(data.features[2])));
  check("an der Kopie steht kein Ghost",
    imBereich(await geister(), nachrueckerBereich).length === 0,
    JSON.stringify(imBereich(await geister(), nachrueckerBereich)));

  const vorherDrei = await punktAt(2, 0);

  await waehlePunkt(2, 0);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);

  const eigenerGeist = (await geister()).find((geist) =>
    Math.abs(geist.east - vorherDrei[0]) < 0.001 &&
    Math.abs(geist.north - vorherDrei[1]) < 0.001);

  check("nach dem Bewegen bekommt die Kopie ihren eigenen Ghost",
    !!eigenerGeist,
    JSON.stringify((await geister()).map((g) => [g.east, g.north])));
  check("der Ghost der gelöschten Fläche steht unverändert daneben",
    imBereich(await geister(), opferBereich).length === 1,
    String((await geister()).length));

  /* ---------------------------------------------------------------- */
  console.log("Zwei Löschungen nacheinander verwechseln nichts");

  await laden();

  /*
   * Die erste Löschung rückt die Nummern auf: aus „Feature 2, Exclusion #1"
   * wird die Beschreibung einer ANDEREN Fläche. Bleibt der Anker darauf
   * stehen, legt die zweite Löschung den falschen Vergleichszustand still.
   */
  await waehlePunkt(2, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  await page.evaluate(() => clearVertexSelection());
  await page.waitForTimeout(200);

  check("der Ghost hat zu Beginn seine Linie",
    (await linien()).length === 1, JSON.stringify(await linien()));

  await openAllFolds(page);
  await page.locator(
    '[data-action="delete-exclusion"][data-feature-index="1"]').click();
  await page.waitForTimeout(400);
  await openAllFolds(page);
  await page.locator(
    '[data-action="delete-exclusion"][data-feature-index="2"]').click();
  await page.waitForTimeout(400);

  check("nach beiden Löschungen ist noch eine Exclusion da",
    (await typen()).filter((t) => t === "exclusion").length === 1,
    JSON.stringify(await typen()));
  check("und der Ghost der überlebenden zeigt weiter auf seinen Punkt",
    (await linien()).length === 1, JSON.stringify(await linien()));

  /* ---------------------------------------------------------------- */
  console.log("Dasselbe gilt für Search Wire und Docking-Pfad");

  for (const [name, typ, knopf] of [
    ["Search Wire", "search wire", "#deleteSearchWireBtn"],
    ["Docking-Pfad", "dockpoints", "#deleteDockBtn"],
  ]) {
    await laden(karteMitLinien(typ));

    await page.evaluate(() => {
      setVertexSelection([{ featureIndex: 2, containerPath: [], pointIndex: 0 }]);
      renderGeometry();
      updateSelectionPanel();
    });
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    await page.evaluate(() => clearVertexSelection());
    await page.waitForTimeout(200);

    check(`${name}: der Ghost des bewegten Punktes steht`,
      (await geister()).length === 1, String((await geister()).length));
    check(`${name}: und er hat seine Verbindungslinie`,
      (await linien()).length === 1, JSON.stringify(await linien()));

    await openAllFolds(page);
    await page.locator(knopf).click();
    await page.waitForTimeout(400);

    check(`${name}: nach dem Löschen bleibt der Ghost stehen`,
      (await geister()).length === 1, String((await geister()).length));
    check(`${name}: aber er zeigt auf keinen Punkt mehr`,
      (await linien()).length === 0, JSON.stringify(await linien()));
  }

  /* ---------------------------------------------------------------- */
  console.log("Das Ghosting lässt sich im Menü „Ansicht“ abschalten");

  await laden();

  await waehlePunkt(2, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);

  check("eingeschaltet steht der Ghost da",
    (await geister()).length === 1, String((await geister()).length));

  await menueBefehl("Ansicht", "Vorher-Ghosts anzeigen");
  await page.waitForTimeout(250);

  check("abgeschaltet ist kein Ghost mehr gezeichnet",
    (await geister()).length === 0, String((await geister()).length));
  check("und auch keine Vergleichslinie",
    (await linien()).length === 0, JSON.stringify(await linien()));

  /*
   * Ein Auswahlwechsel baut die Gruppe neu auf - der Schaltzustand darf das
   * nicht vergessen. Gewählt werden zwei Punkte desselben Rings: damit steht
   * zugleich die Vorschau des Begradigens da, und die ist KEIN Ghost.
   */
  await page.evaluate(() => {
    setVertexSelection([
      { featureIndex: 2, containerPath: [0], pointIndex: 0 },
      { featureIndex: 2, containerPath: [0], pointIndex: 2 },
    ]);
    renderGeometry();
    updateSelectionPanel();
  });
  await page.waitForTimeout(250);

  check("der Schaltzustand überlebt den Auswahlwechsel",
    (await geister()).length === 0, String((await geister()).length));
  check("die Vorschau des Begradigens steht trotzdem da",
    await page.evaluate(() =>
      document.querySelectorAll(
        "#toolPreviewGroup .straighten-preview-line").length === 1),
    await page.evaluate(() =>
      String(document.querySelectorAll(
        "#toolPreviewGroup .straighten-preview-line").length)));

  await menueBefehl("Ansicht", "Vorher-Ghosts anzeigen");
  await page.waitForTimeout(250);

  check("wieder eingeschaltet steht der Ghost wieder da",
    (await geister()).length === 1, String((await geister()).length));

  /* Der Eintrag selbst, in beiden Richtungen. */
  const eintrag = () => page.evaluate(() =>
    document.getElementById("showSelectionGhosts")
      ?.closest("label")?.textContent?.trim() || "");

  check("deutsch heißt der Eintrag „Vorher-Ghosts anzeigen“",
    (await eintrag()) === "Vorher-Ghosts anzeigen", await eintrag());

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(250);

  check("auf deutsch gestartet, dann englisch: der Eintrag ist übersetzt",
    (await eintrag()) === "Show previous-position ghosts", await eintrag());

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(250);

  check("und zurückgeschaltet steht wieder der deutsche Eintrag",
    (await eintrag()) === "Vorher-Ghosts anzeigen", await eintrag());

  /*
   * Und er wirkt auch in der englischen Oberfläche. Angesprochen wird er
   * über den Text, der wirklich dasteht - ein fest geschriebener englischer
   * Name träfe bei fehlender Übersetzung nichts und liefe in einen stummen
   * Timeout statt in die benannte Zusicherung darüber.
   */
  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(250);

  const englisch = await eintrag();

  await menueBefehl("View", englisch);
  await page.waitForTimeout(250);

  check("englisch abgeschaltet: kein Ghost",
    (await geister()).length === 0, String((await geister()).length));

  await menueBefehl("View", englisch);
  await page.waitForTimeout(250);

  check("englisch wieder eingeschaltet: der Ghost ist zurück",
    (await geister()).length === 1, String((await geister()).length));

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  check("keine Konsolenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));

  await browser.close();
} catch (error) {
  console.error(`${TOOL}: ABBRUCH`, error);
  await browser.close();
  process.exit(1);
}

finish("Ein frisch entstandenes Feature zeigt keinen fremden Ghost.");
