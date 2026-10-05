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

import {
  createChecker,
  createMenueBefehl,
  elementGetroffen,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

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
  const menueBefehl = createMenueBefehl(page, check);
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
   * eigenen width - und konnten auseinanderlaufen; in der erzwungenen Enge
   * taten sie es auch: das Raster reservierte 168 px fuer ein 56 px breites
   * Element.
   *
   * Geprueft wird die WIRKUNG in beiden Zustaenden, nicht der Quelltext: die
   * berechnete Spaltenbreite gegen die gemessene Elementbreite.
   */
  const spalteGegenLeiste = () =>
    page.evaluate(() => {
      const spalten = getComputedStyle(document.querySelector("main"))
        .gridTemplateColumns.split(" ");
      return {
        /*
         * Seit Etappe 7e hat main DREI Spalten: Leiste, Karte, Inspektor. Die
         * Leiste ist damit die erste; bis dahin stand die Seitenleiste davor.
         */
        spalte: Math.round(parseFloat(spalten[0])),
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

  /*
   * Und auch dort, wo die Enge ERZWUNGEN ist. Die Schwelle dafuer sind
   * 1000 px und sie steht in JS (TOOL_RAIL_NARROW_QUERY), nicht in einer
   * Medienregel - die Zusicherung nannte frueher 980 px und meinte damit die
   * Medienregel, die mit Etappe 7e entfallen ist. 940 liegt unter beiden
   * Zahlen, gemessen hat der Test also immer das Richtige; benannt hat er es
   * falsch.
   */
  await page.setViewportSize({ width: 940, height: 800 });
  await page.waitForTimeout(300);

  paar = await spalteGegenLeiste();
  check("und bei erzwungener Enge unter 1000 px auch",
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

  /* ---------------------------------------------------------------- */
  console.log("Eingeklappt entfallen die Gruppenueberschriften");

  /*
   * Eingeklappt standen die Ueberschriften mit 9 px da und passten trotzdem
   * nicht: „Auswählen“ braucht 61 px, die Leiste hat 43 - abgeschnitten wurde
   * auf Deutsch sichtbar, auf Englisch („Validate“, 46 px) nur knapp. Sie
   * entfallen jetzt in diesem Zustand; die Begruendung steht in CLAUDE.md.
   *
   * Gemessen wird, was gezeichnet wird: eine Ueberschrift gilt als da, wenn
   * elementFromPoint() an ihrer Mitte sie selbst liefert. Und weil „nicht
   * getroffen“ auch dann bestuende, wenn die Ueberschriften nirgends mehr
   * gezeichnet wuerden, steht die Gegenprobe daneben: ausgeklappt sind sie
   * wieder da, ganz und getroffen.
   */
  const UEBERSCHRIFTEN = {
    de: ["Auswählen", "Zeichnen", "Prüfen"],
    en: ["Select", "Draw", "Validate"],
  };

  const leistenText = (seite) => seite.evaluate(() => {
    const rail = document.getElementById("toolRail");
    const kasten = rail.getBoundingClientRect();
    const links = kasten.left + rail.clientLeft;
    const rechts = links + rail.clientWidth;

    const titel = [...rail.querySelectorAll(".tool-group-title")];
    const getroffen = titel.filter((t) => {
      const r = t.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!treffer && t.contains(treffer);
    }).map((t) => t.textContent.trim());

    /* Jeder gezeichnete Textbehaelter der Leiste, nicht nur die erwarteten. */
    const abgeschnitten = [];
    let behaelter = 0;
    for (const el of rail.querySelectorAll("*")) {
      const eigen = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!eigen || !el.getClientRects().length) continue;
      behaelter += 1;
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth || r.left < links - 0.5 || r.right > rechts + 0.5) {
        abgeschnitten.push(`${el.textContent.trim()}: ${el.scrollWidth}/${el.clientWidth}`);
      }
    }

    return {
      getroffen,
      abgeschnitten,
      behaelter,
      woerter: titel.map((t) => t.textContent.trim()),
      sichtbar: rail.innerText.toLowerCase(),
      beschriftungen: [...rail.querySelectorAll(".tool-label")]
        .filter((l) => l.getClientRects().length).length,
    };
  });

  for (const breite of [1280, 960, 744]) {
    for (const sprache of ["de", "en"]) {
      const andere = sprache === "de" ? "en" : "de";
      const seite = await browser.newPage();
      await seite.setViewportSize({ width: breite, height: 900 });
      await seite.goto(indexUrl(), { waitUntil: "load" });
      await seite.evaluate(() => localStorage.clear());
      await seite.reload({ waitUntil: "load" });
      await seite.evaluate((l) => setLanguage(l), sprache);

      /* Unter 1000 px ist die Leiste erzwungen eingeklappt, darueber von Hand. */
      const vonHand = await seite.locator("#toolRailToggle").isEnabled();
      if (vonHand) {
        await seite.locator("#toolRailToggle").click();
        await seite.waitForTimeout(250);
      }

      const vorher = await leistenText(seite);
      check(`${breite} px, ${sprache}: die Leiste ist eingeklappt - keine Werkzeugbeschriftung wird gezeichnet`,
        vorher.beschriftungen === 0, JSON.stringify(vorher.beschriftungen));

      for (const lage of [sprache, andere]) {
        if (lage !== sprache) await seite.evaluate((l) => setLanguage(l), lage);
        const wie = lage === sprache
          ? `${breite} px, ${sprache} eingeklappt`
          : `${breite} px, ${sprache} eingeklappt, dann ${lage}`;
        const m = await leistenText(seite);

        check(`${wie}: keine Gruppenueberschrift wird getroffen`,
          m.getroffen.length === 0, JSON.stringify(m.getroffen));
        check(`${wie}: und keine steht im sichtbaren Text der Leiste`,
          !UEBERSCHRIFTEN[lage].some((w) => m.sichtbar.includes(w.toLowerCase())),
          JSON.stringify(m.sichtbar));
        check(`${wie}: kein Text der Leiste ist abgeschnitten`,
          m.abgeschnitten.length === 0, JSON.stringify(m.abgeschnitten));
        check(`${wie}: die Ueberschriften sind dabei in dieser Sprache gefuehrt`,
          JSON.stringify(m.woerter) === JSON.stringify(UEBERSCHRIFTEN[lage]),
          JSON.stringify(m.woerter));
      }

      /*
       * Ausklappen geht nur, wo es nicht erzwungen ist. Gemessen wird in der
       * Sprache, in der zuletzt eingeklappt gelesen wurde, und danach wieder
       * zurueck - beide Richtungen.
       */
      if (vonHand) {
        await seite.locator("#toolRailToggle").click();
        await seite.waitForTimeout(250);

        for (const lage of [andere, sprache]) {
          if (lage === sprache) await seite.evaluate((l) => setLanguage(l), lage);
          const wie = `${breite} px, ${sprache} eingeklappt, ${lage} ausgeklappt`;
          const m = await leistenText(seite);

          check(`${wie}: alle drei Ueberschriften sind wieder da und getroffen`,
            JSON.stringify(m.getroffen) === JSON.stringify(UEBERSCHRIFTEN[lage]),
            JSON.stringify(m.getroffen));
          check(`${wie}: und kein Text der Leiste ist abgeschnitten`,
            m.behaelter > 0 && m.abgeschnitten.length === 0,
            JSON.stringify(m.abgeschnitten));
        }
      }

      await seite.close();
    }
  }

  /* ---------------------------------------------------------------- */
  console.log("Zurueck und Vor stehen ueber der Karte");

  /*
   * Seit dem 05.10.2026 stehen die beiden Knoepfe nicht mehr in der
   * Kopfzeile, sondern oben in der Mitte ueber der Karte - dieselbe Machart
   * wie die Zoom-Leiste, nur die Symbole. Zugesichert wird nach der Wirkung:
   * wo sie gezeichnet und getroffen werden, dass sie wie die Zoom-Leiste
   * aussehen (gegen die Zoom-Leiste gemessen, nicht gegen eine Zahl), dass
   * sie nichts ueberdecken, was dort sonst steht, und was ein Klick an der
   * Geometrie bewirkt.
   */

  /** Gemessenes Rechteck - oder null, wenn nichts gezeichnet wird. */
  const rechteck = (seite, selektor) => seite.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
             width: r.width, height: r.height };
  }, selektor);

  const MIT_EXCLUSION = JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [40, 0], [40, 40], [0, 40], [0, 0]]] } },
      { type: "Feature", properties: { name: "exclusion" }, idx: 0,
        geometry: { type: "Polygon", coordinates: [[
          [10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]] } },
    ],
  });

  const ueberdecken = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  /*
   * Der Marker an einer WELTKOORDINATE, nie ueber seinen Index - dieselbe
   * Lesart wie in tools/test-auswahlangaben.mjs: cx ist East, cy North mit
   * umgekehrtem Vorzeichen.
   */
  const markerBei = (seite, east, north) => seite.evaluate(([e, n]) => {
    const treffer = [...document.querySelectorAll("circle.vertex")].filter((m) =>
      Math.abs(Number(m.getAttribute("cx")) - e) < 1e-6 &&
      Math.abs(Number(m.getAttribute("cy")) + n) < 1e-6);
    return treffer.length === 1 ? treffer[0].dataset.vertexKey : null;
  }, [east, north]);

  /** Waehlt den Punkt an einer Koordinate - nur, wenn sein Marker getroffen wird. */
  const punktWaehlen = async (seite, east, north, name) => {
    const schluessel = await markerBei(seite, east, north);
    check(`${name}: der Marker bei E ${east} / N ${north} ist eindeutig`,
      schluessel !== null, "kein oder mehr als ein Marker");
    if (!schluessel) return false;
    await seite.locator(`circle.vertex[data-vertex-key="${schluessel}"]`).click();
    await seite.waitForTimeout(250);
    return true;
  };

  /*
   * Dazu die schmalste Karte, ueber der die Auswahlleiste steht: knapp ueber
   * der Schwelle, unter der die Werkzeugleiste erzwungen einklappt, steht sie
   * wieder ausgeklappt da und nimmt der Karte 112 px mehr. Die Zahl kommt aus
   * dem Bestand (TOOL_RAIL_NARROW_QUERY), nicht aus dem Test.
   */
  const schmalsteMitLeiste = await page.evaluate(() =>
    Number(/max-width:\s*(\d+)px/.exec(TOOL_RAIL_NARROW_QUERY)[1]) + 1);

  for (const grob of [false, true]) {
    for (const breite of [1280, schmalsteMitLeiste, 960, 744]) {
      const name = `${grob ? "grob" : "fein"}, ${breite} px`;
      const kontext = await browser.newContext({
        viewport: { width: breite, height: 900 },
        ...(grob ? { hasTouch: true } : {}),
      });
      const seite = await kontext.newPage();
      await seite.goto(indexUrl(), { waitUntil: "load" });
      await seite.evaluate(() => localStorage.clear());
      await seite.reload({ waitUntil: "load" });

      check(`${name}: die Bedienart ist wirklich emuliert`,
        (await seite.evaluate(() => matchMedia("(pointer: coarse)").matches)) === grob);

      await seite.locator("#fileInput").setInputFiles({
        name: "verlauf.geojson",
        mimeType: "application/geo+json",
        buffer: Buffer.from(MIT_EXCLUSION),
      });
      await seite.waitForTimeout(400);

      /*
       * Die ganze Exclusion ist gewaehlt: dann stehen auch die Auswahlleiste
       * (ab der Schwelle ueber der Karte) und die Angaben zur Auswahl da -
       * genau die Ebenen, die Zurueck und Vor nicht ueberdecken duerfen -,
       * und die Leiste traegt mit „Exclusion duplizieren“ ihre breiteste
       * Beschriftung. Gewaehlt wird ueber die Feature-Navigation, wie ein
       * Nutzer es tut.
       */
      await openAllFolds(seite);
      const ganzes = seite.locator('[data-action="select-whole-feature"][data-feature-index="1"]');
      const waehlbar = (await ganzes.count()) === 1 && await ganzes.isVisible();
      check(`${name}: die Exclusion laesst sich ganz waehlen`, waehlbar);
      if (waehlbar) {
        await ganzes.click();
        await seite.waitForTimeout(300);
      }
      check(`${name}: die Auswahlleiste traegt ihre breiteste Beschriftung`,
        await seite.locator("#duplicateFeatureBtn").isVisible());

      for (const id of ["undoBtn", "redoBtn"]) {
        const ort = await seite.evaluate((x) => {
          const el = document.getElementById(x);
          const r = el.getBoundingClientRect();
          const v = document.getElementById("viewer").getBoundingClientRect();
          return {
            inKarte: r.left >= v.left && r.right <= v.right &&
                     r.top >= v.top && r.bottom <= v.bottom,
            inKopf: !!el.closest("header"),
            text: el.innerText.trim(),
          };
        }, id);
        const treffer = await elementGetroffen(seite, `#${id}`, { dy: 8 });

        check(`${name}: #${id} steht ueber der Karte`, ort.inKarte, JSON.stringify(ort));
        check(`${name}: #${id} wird dort getroffen`, treffer.ok, treffer.grund);
        check(`${name}: #${id} steht nicht mehr in der Kopfzeile`, !ort.inKopf);
        check(`${name}: #${id} traegt nur das Symbol, kein Wort`,
          ort.text === "", JSON.stringify(ort.text));
      }

      const verlauf = await rechteck(seite, "#historyToolbar");
      const zoom = await rechteck(seite, ".map-view-toolbar:not(.map-history-toolbar)");
      const karte = await rechteck(seite, "#viewer");

      check(`${name}: Zurueck/Vor und die Zoom-Leiste sind gezeichnet`,
        !!verlauf && !!zoom, JSON.stringify({ verlauf, zoom }));

      if (verlauf && zoom && karte) {
        /*
         * Mittig, soweit die Zoom-Leiste es zulaesst: ist die Karte zu schmal,
         * rueckt die Leiste nach links, bis zur Luecke der Zeile vor der
         * Zoom-Leiste - nicht weiter und nicht darueber. Luecke und Breiten
         * sind gemessen.
         */
        const luecke = await seite.evaluate(() =>
          parseFloat(getComputedStyle(document.querySelector(".map-top-row")).columnGap));
        const soll = Math.min((karte.left + karte.right) / 2,
          zoom.left - luecke - verlauf.width / 2);
        const ist = (verlauf.left + verlauf.right) / 2;
        check(`${name}: Zurueck/Vor stehen in der Mitte der Karte, soweit die Zoom-Leiste es zulaesst`,
          Math.abs(ist - soll) <= 1,
          `Mitte ${ist.toFixed(1)}, erwartet ${soll.toFixed(1)}, Karte ${((karte.left + karte.right) / 2).toFixed(1)}`);
        /*
         * Die Zeile spannt sich ueber die ganze Kartenbreite. Zwischen den
         * beiden Leisten muss die Karte darunter getroffen werden - sonst
         * finge die Zeile jeden Klick in ihrem Streifen ab.
         */
        const zwischen = await seite.evaluate(([x, y]) => {
          const treffer = document.elementFromPoint(x, y);
          return { karte: !!treffer && document.getElementById("svg").contains(treffer),
                   grund: treffer ? (treffer.id || treffer.className?.baseVal || treffer.className || treffer.tagName) : "nichts" };
        }, [(verlauf.right + zoom.left) / 2, (verlauf.top + verlauf.bottom) / 2]);
        check(`${name}: zwischen Zurueck/Vor und der Zoom-Leiste bleibt die Karte anklickbar`,
          zoom.left - verlauf.right > 1 && zwischen.karte, JSON.stringify(zwischen));

        check(`${name}: und oben, auf der Hoehe der Zoom-Leiste`,
          Math.abs(verlauf.top - zoom.top) <= 0.5 && Math.abs(verlauf.height - zoom.height) <= 0.5,
          JSON.stringify({ verlauf: verlauf.top, zoom: zoom.top }));
      }

      /* Dieselbe Machart: gegen die Zoom-Leiste gemessen, nicht gegen Zahlen. */
      const machart = await seite.evaluate(() => {
        const stil = (id) => {
          const el = document.getElementById(id);
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
                   grund: cs.backgroundImage, rand: cs.borderColor, ecke: cs.borderRadius };
        };
        const leiste = (el) => getComputedStyle(el).columnGap;
        return {
          zurueck: stil("undoBtn"),
          vor: stil("redoBtn"),
          zoom: stil("zoomInBtn"),
          luecke: leiste(document.getElementById("historyToolbar")),
          zoomLuecke: leiste(document.querySelector(".map-view-toolbar:not(.map-history-toolbar)")),
        };
      });

      check(`${name}: Zurueck und Vor sind so gross und so durchsichtig wie die Zoom-Knoepfe`,
        JSON.stringify(machart.zurueck) === JSON.stringify(machart.zoom) &&
        JSON.stringify(machart.vor) === JSON.stringify(machart.zoom),
        JSON.stringify(machart));
      check(`${name}: und stehen im selben Abstand zueinander`,
        machart.luecke === machart.zoomLuecke, `${machart.luecke} / ${machart.zoomLuecke}`);

      /*
       * Was einander nicht ueberdecken darf. Die Auswahlleiste zaehlt nur, wo
       * sie ueber der Karte steht - unter der Schwelle steht sie im Inspektor.
       */
      const leiste = await seite.evaluate(() =>
        !!document.getElementById("selectionActions").closest("#viewer"));
      const ebenen = {
        "Zurueck/Vor": verlauf,
        "Zoom-Leiste": zoom,
        "Angaben zur Auswahl": await rechteck(seite, "#selectionOverlay"),
        ...(leiste ? { "Auswahlleiste": await rechteck(seite, "#selectionActions") } : {}),
      };

      check(`${name}: alle Ebenen sind gezeichnet`,
        Object.values(ebenen).every(Boolean),
        JSON.stringify(Object.fromEntries(Object.entries(ebenen).map(([k, v]) => [k, !!v]))));

      const namen = Object.keys(ebenen);
      for (let i = 0; i < namen.length; i += 1) {
        for (let j = i + 1; j < namen.length; j += 1) {
          const a = ebenen[namen[i]];
          const b = ebenen[namen[j]];
          if (!a || !b) continue;
          check(`${name}: ${namen[i]} und ${namen[j]} ueberdecken einander nicht`,
            !ueberdecken(a, b), JSON.stringify({ [namen[i]]: a, [namen[j]]: b }));
        }
      }

      /*
       * Die Kopfzeile ist dadurch kuerzer geworden. Gemessen brauchte sie
       * vorher 886 px (deutsch, fein) und passte bei 744 px nicht: die Marke
       * wurde gestaucht, ihr Titel lief in die Menueleiste, und die beiden
       * Knoepfe ueberlagerten einander. Zugesichert ist die Wirkung: kein
       * Teil der Kopfzeile ist gestaucht, keiner ragt ueber ihren Rand.
       */
      for (const sprache of ["de", "en"]) {
        await seite.evaluate((l) => setLanguage(l), sprache);
        const kopf = await seite.evaluate(() => {
          const h = document.querySelector("header");
          const rechts = h.getBoundingClientRect().right;
          return [...h.children]
            .filter((k) => k.getClientRects().length)
            .filter((k) => k.scrollWidth > k.clientWidth || k.getBoundingClientRect().right > rechts + 0.5)
            .map((k) => `${k.className}: ${k.scrollWidth}/${k.clientWidth}`);
        });
        check(`${name}, ${sprache}: die Kopfzeile passt - kein Teil ist gestaucht`,
          kopf.length === 0, JSON.stringify(kopf));
      }
      await seite.evaluate(() => setLanguage("de"));

      await kontext.close();
    }
  }

  /*
   * Die Wirkung und die Erklaerung beim Ueberfahren, in beiden Richtungen:
   * einmal deutsch erzeugt und englisch gelesen, einmal umgekehrt. Der
   * Sprachwechsel laeuft ueber setLanguage(), und gelesen wird unmittelbar
   * danach.
   */
  const ERKLAERUNG = {
    de: {
      zurueck: "Rückgängig: Punktkoordinate ändern",
      vor: "Wiederholen: Punktkoordinate ändern",
      keinZurueck: "Keine Änderung zum Rückgängigmachen",
      keinVor: "Keine Änderung zum Wiederholen",
      geladen: "Rückgängig: Karte A öffnen/ersetzen",
      namen: ["Zurück", "Vor", "Bearbeitungsverlauf"],
    },
    en: {
      zurueck: "Undo: Change point coordinate",
      vor: "Redo: Change point coordinate",
      keinZurueck: "No change to undo",
      keinVor: "No change to redo",
      geladen: "Undo: Open/replace map A",
      namen: ["Undo", "Redo", "Edit history"],
    },
  };

  const knopfTexte = (seite) => seite.evaluate(() => ({
    zurueck: document.getElementById("undoBtn").title,
    vor: document.getElementById("redoBtn").title,
    namen: [
      document.getElementById("undoBtn").getAttribute("aria-label"),
      document.getElementById("redoBtn").getAttribute("aria-label"),
      document.getElementById("historyToolbar").getAttribute("aria-label"),
    ],
  }));

  for (const sprache of ["de", "en"]) {
    const andere = sprache === "de" ? "en" : "de";
    const seite = await browser.newPage();
    await seite.setViewportSize({ width: 1280, height: 900 });
    await seite.goto(indexUrl(), { waitUntil: "load" });
    await seite.evaluate(() => localStorage.clear());
    await seite.reload({ waitUntil: "load" });
    await seite.evaluate((l) => setLanguage(l), sprache);

    const lesen = async (lage, erwartet) => {
      for (const l of [sprache, andere]) {
        if (l !== sprache) await seite.evaluate((x) => setLanguage(x), l);
        const t = await knopfTexte(seite);
        const e = ERKLAERUNG[l];
        const wie = l === sprache ? `${sprache}, ${lage}` : `${sprache}, ${lage}, dann ${l}`;
        check(`${wie}: Zurueck erklaert sich beim Ueberfahren`,
          t.zurueck === e[erwartet.zurueck], JSON.stringify(t.zurueck));
        check(`${wie}: Vor ebenso`, t.vor === e[erwartet.vor], JSON.stringify(t.vor));
        check(`${wie}: Knoepfe und Leiste tragen ihren Namen in dieser Sprache`,
          JSON.stringify(t.namen) === JSON.stringify(e.namen), JSON.stringify(t.namen));
      }
      await seite.evaluate((x) => setLanguage(x), sprache);
    };

    /* Vor dem Laden gibt es nichts zurueckzunehmen - auch das erklaert sich. */
    await lesen("ohne Karte", { zurueck: "keinZurueck", vor: "keinVor" });

    await seite.locator("#fileInput").setInputFiles({
      name: "verlauf.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(MAP),
    });
    await seite.waitForTimeout(400);

    if (!(await punktWaehlen(seite, 0, 0, `${sprache}, Verlauf`))) {
      await seite.close();
      continue;
    }

    await seite.locator("#pointEastInput").fill("5");
    await seite.locator("#pointEastInput").press("Enter");
    await seite.waitForTimeout(300);

    check(`${sprache}: die Eingabe hat den Punkt nach E 5 verschoben`,
      (await markerBei(seite, 5, 0)) !== null && (await markerBei(seite, 0, 0)) === null,
      `${await markerBei(seite, 5, 0)} / ${await markerBei(seite, 0, 0)}`);

    await lesen("nach der Aenderung", { zurueck: "zurueck", vor: "keinVor" });

    const zurueckGetroffen = await elementGetroffen(seite, "#undoBtn", { dy: 8 });
    check(`${sprache}: Zurueck ist frei und getroffen`,
      zurueckGetroffen.ok && await seite.locator("#undoBtn").isEnabled(),
      zurueckGetroffen.grund);
    if (!zurueckGetroffen.ok || !(await seite.locator("#undoBtn").isEnabled())) {
      await seite.close();
      continue;
    }

    await seite.locator("#undoBtn").click();
    await seite.waitForTimeout(300);

    check(`${sprache}: ein Klick auf Zurueck holt den Punkt nach E 0 zurueck`,
      (await markerBei(seite, 0, 0)) !== null && (await markerBei(seite, 5, 0)) === null,
      `${await markerBei(seite, 0, 0)} / ${await markerBei(seite, 5, 0)}`);

    /* Das Laden selbst ist ein Schritt - Zurueck nennt jetzt ihn. */
    await lesen("nach Zurueck", { zurueck: "geladen", vor: "vor" });

    const vorGetroffen = await elementGetroffen(seite, "#redoBtn", { dy: 8 });
    check(`${sprache}: Vor ist frei und getroffen`,
      vorGetroffen.ok && await seite.locator("#redoBtn").isEnabled(), vorGetroffen.grund);
    if (vorGetroffen.ok && await seite.locator("#redoBtn").isEnabled()) {
      await seite.locator("#redoBtn").click();
      await seite.waitForTimeout(300);

      check(`${sprache}: ein Klick auf Vor stellt die Aenderung wieder her`,
        (await markerBei(seite, 5, 0)) !== null && (await markerBei(seite, 0, 0)) === null,
        `${await markerBei(seite, 5, 0)} / ${await markerBei(seite, 0, 0)}`);

      await lesen("nach Vor", { zurueck: "zurueck", vor: "keinVor" });
    }

    await seite.close();
  }

  /* ---------------------------------------------------------------- */
  console.log("Mobil: 400x800, alles erreichbar");

  /*
   * Seit Etappe 7e gibt es die Seitenleiste nicht mehr, und mit ihr ist
   * #mobilePanelBtn entfallen. Der Knopf war bis dahin der EINZIGE Weg zum
   * Verbinden-Befehl auf einem Telefon - nachgemessen: ohne ihn hatte
   * #mergeMapsBtn dort einen Kasten von 0x0 und isVisible() === false.
   *
   * Deshalb steht hier die Gegenprobe: sechs Dinge muessen bei 400x800
   * erreichbar sein, und das letzte ausdruecklich.
   */
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);

  for (const [name, selektor] of [
    ["Menueleiste", ".menu-bar"],
    ["Werkzeugleiste", "#toolRail"],
    ["Karte", "#viewer"],
    ["Inspektor", "#inspector"],
    ["Statuszeile", "#statusBar"],
  ]) {
    const sichtbar = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return "fehlt";
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0
        ? "da" : `${getComputedStyle(el).display} ${Math.round(r.width)}x${Math.round(r.height)}`;
    }, selektor);

    check(`${name} ist bei 400x800 vorhanden`, sichtbar === "da", String(sichtbar));
  }

  /*
   * Der Verbinden-Befehl, und zwar ueber den Weg, den ein Nutzer geht: Menue
   * "Karte" oeffnen, Eintrag anklicken, Knopf bedienen. Die Trefferpruefung
   * statt display - das Fenster liegt in der Kartenflaeche, die auf einem
   * Telefon unter der Werkzeugleiste steht.
   */
  await menueBefehl("Karte", "Karten verbinden…");
  await page.locator("#mergeWindow").waitFor({ state: "visible" });
  await page.waitForTimeout(250);

  const treffer = await elementGetroffen(page, "#mergeWindow");
  check("das Verbinden-Fenster ist bei 400x800 getroffen",
    treffer.ok, JSON.stringify(treffer));
  check("und der Verbinden-Knopf ist dort bedienbar",
    await page.locator("#mergeMapsBtn").isVisible());

  /* Die Huelle ist wirklich weg - nicht nur unsichtbar. */
  check("es gibt keine Seitenleiste mehr",
    (await page.locator("#sidebar").count()) === 0,
    String(await page.locator("#sidebar").count()));
  check("und keinen mobilen Bedienknopf",
    (await page.locator("#mobilePanelBtn").count()) === 0,
    String(await page.locator("#mobilePanelBtn").count()));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Etappe 8d: Breite und Bedienart, je einzeln");

  /*
   * Seit Etappe 8a haengen Stapeln und Zielgroessen an verschiedenen Dingen:
   * das Stapeln an der Breite (unter 744 px), die 44-px-Ziele und die 16-px-
   * Schrift an der Bedienart (`pointer: coarse`). Beide Achsen werden deshalb
   * einzeln geprueft - eine Zusicherung, die nur eine schmale Breite ansieht,
   * haette den Fall "Tablet im Querformat" wieder nicht gesehen, und genau der
   * war der Befund.
   *
   * DIE BEDIENART WIRD EMULIERT, nicht simuliert: ein Playwright-Kontext mit
   * `hasTouch: true` laesst `(pointer: coarse)` greifen und `(pointer: fine)`
   * nicht. Das ist kein Vertrauensvorschuss - die Gegenprobe unten liest
   * `matchMedia()` in BEIDEN Kontexten aus und sichert zu, dass sie sich
   * unterscheiden. Ohne sie bewiesen alle folgenden Zusicherungen nur, dass
   * zweimal dasselbe gemessen wurde.
   */
  const zeigerSeite = async (grob) => {
    const kontext = await browser.newContext(grob ? { hasTouch: true } : {});
    const seite = await kontext.newPage();
    return { kontext, seite };
  };

  /** Niedrigste sichtbare Hoehe einer Gruppe, in CSS-Pixeln. */
  const niedrigste = (seite, selektor) => seite.evaluate((sel) => {
    const sichtbar = [...document.querySelectorAll(sel)]
      .filter((element) => element.getBoundingClientRect().height > 0);
    return sichtbar.length
      ? Math.round(Math.min(...sichtbar.map((e) => e.getBoundingClientRect().height)))
      : null;
  }, selektor);

  const BREITEN = [[1920, 1080], [1440, 900], [1280, 800], [860, 800], [744, 1133]];

  for (const grob of [false, true]) {
    const name = grob ? "grob" : "fein";
    const { kontext, seite } = await zeigerSeite(grob);

    for (const [breite, hoehe] of BREITEN) {
      await seite.setViewportSize({ width: breite, height: hoehe });
      await seite.goto(indexUrl(), { waitUntil: "load" });
      await seite.evaluate(() => localStorage.clear());
      await seite.reload({ waitUntil: "load" });
      await seite.locator("#fileInput").setInputFiles({
        name: "toolbar.geojson",
        mimeType: "application/geo+json",
        buffer: Buffer.from(MAP),
      });
      await seite.waitForTimeout(400);
      await openAllFolds(seite);

      const medien = await seite.evaluate(() => ({
        coarse: matchMedia("(pointer: coarse)").matches,
        fine: matchMedia("(pointer: fine)").matches,
      }));

      /* Die Gegenprobe: greift die Media Query hier ueberhaupt? */
      check(`${name}, ${breite} px: die Bedienart ist wirklich emuliert`,
        medien.coarse === grob && medien.fine === !grob,
        JSON.stringify(medien));

      /*
       * 744 px ist Tablet, nicht Telefon: drei Rasterspalten, keine
       * gestapelte Spalte. Geprueft wird die WIRKUNG - die berechnete
       * Rastervorlage von `main` -, nicht die Medienregel.
       */
      const raster = await seite.evaluate(() => {
        const m = getComputedStyle(document.querySelector("main"));
        return `${m.display}:${m.gridTemplateColumns.split(" ").length}`;
      });

      check(`${name}, ${breite} px: main ist ein Raster mit drei Spalten`,
        raster === "grid:3", raster);

      /*
       * Die Breite steckt in ZWEI Bloecken: der eine stapelt `main`, der
       * andere legt die Werkzeugleiste waagerecht und den Inspektor auf volle
       * Breite. Eine Zusicherung auf `main` allein sieht den zweiten nicht -
       * gemessen an einer Mutation, die nur dessen Grenze zurueckstellte und
       * nichts zum Reissen brachte. Geprueft wird deshalb auch die Leiste.
       */
      const leiste = await seite.evaluate(() => {
        const r = getComputedStyle(document.getElementById("toolRail"));
        const a = document.querySelector("aside").getBoundingClientRect().width;
        return `${r.flexDirection}/${Math.round(a)}`;
      });

      check(`${name}, ${breite} px: die Leiste steht senkrecht, der Inspektor ist 320 px`,
        leiste === "column/320", leiste);

      /*
       * Schritt 5, dritter Durchgang: die KARTE muss dabei breiter bleiben als
       * der Inspektor. Sonst traegt die Spalte, in der gearbeitet wird,
       * weniger Platz als die Spalte, die sie beschreibt - und das waere ein
       * Grund, die Anordnung bei 744 px neu zu entscheiden.
       *
       * Geprueft wird die BEZIEHUNG, nicht der gemessene Wert. Hier stand bis
       * zum vierten Durchgang zusaetzlich eine feste Pixelbreite fuer 744 px -
       * eine Zahl, die nur festhielt, was am Messtag herauskam, und bei jeder
       * Layoutaenderung ohne Erkenntnisgewinn gerissen waere. Die Messwerte
       * selbst stehen in CLAUDE.md, wo sie hingehoeren.
       *
       * Auch die 320 auf der rechten Seite des Vergleichs war eine solche
       * Zahl. Sie machte aus der Beziehung eine halbe: waechst der Inspektor,
       * ohne dass die Karte mitwaechst, bliebe die Zusicherung gruen, obwohl
       * sie gerade das ausschliessen soll. Nachgemessen an einem auf 360 px
       * verbreiterten Inspektor bei 744 px - die Karte hat dann 328 px, und
       * mit der festen 320 haette nichts gemeldet. Gemessen werden deshalb
       * BEIDE Spalten, und zwar in EINEM Durchgang: zwei getrennte Messungen
       * koennten aus zwei verschiedenen Layoutzustaenden stammen.
       */
      const spalten = await seite.evaluate(() => ({
        karte: Math.round(
          document.getElementById("viewer").getBoundingClientRect().width),
        inspektor: Math.round(
          document.querySelector("aside").getBoundingClientRect().width),
      }));

      check(`${name}, ${breite} px: die Karte ist breiter als der Inspektor`,
        spalten.karte > spalten.inspektor,
        `${spalten.karte} px Karte gegen ${spalten.inspektor} px Inspektor`);

      /*
       * Die Zielgroesse kommt aus dem BESTAND, nicht als Zahl aus dem Test:
       * sie steht seit dem einundzwanzigsten Durchgang als eine Variable
       * --touch-target an :root. Vorher stand die 44 sechsmal im CSS und
       * dreimal hier.
       */
      const ziel = await seite.evaluate(() => parseFloat(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--touch-target")));

      /*
       * Und die eine Zahl, die als Literal dastehen DARF: 44 px ist die
       * Entscheidung aus Etappe 8a und keine Messung. Ohne diese Zusicherung
       * folgte der ganze Rest einer Variablen, die jemand auf 10 px setzen
       * koennte, ohne dass etwas meldet.
       */
      check(`${name}, ${breite} px: die Zielgroesse ist mindestens 44 px`,
        ziel >= 44, String(ziel));

      const menue = await niedrigste(seite, ".menu-title");
      const inspektor = await niedrigste(seite, "aside button");
      const schrift = await seite.evaluate(() =>
        getComputedStyle(document.getElementById("pointEastInput")).fontSize);

      /*
       * Ueber der Karte galt bis zum einundzwanzigsten Durchgang gar keine
       * oder eine ZWEITE Zielgroesse: die Zoom-Leiste bekam 42 px, die
       * Knoepfe der Auswahlleiste ueberhaupt keine - `aside button` trifft
       * sie dort nicht. Ein Tablet bekam damit 34-px-Ziele auf dem
       * erklaerten Zielgeraet.
       *
       * Die Leiste braucht dafuer eine Auswahl; der erste Klick trifft den
       * Marker sicher, weil sie bei leerer Auswahl unsichtbar ist.
       */
      await seite.locator("circle.vertex").first().click();
      await seite.waitForTimeout(300);

      const kartenknopf = await niedrigste(seite, ".map-tool-button");
      const leistenknopf = await niedrigste(seite, "#selectionActions button");

      if (grob) {
        check(`grob, ${breite} px: Menuetitel und Inspektorknopf tragen die Zielgroesse`,
          menue >= ziel && inspektor >= ziel, `${menue} / ${inspektor}`);
        check(`grob, ${breite} px: das E/N-Feld traegt 16 px`,
          schrift === "16px", schrift);
        check(`grob, ${breite} px: auch Zoom-Leiste und Auswahlleiste tragen sie`,
          kartenknopf >= ziel && leistenknopf >= ziel,
          `${kartenknopf} / ${leistenknopf}`);
      } else {
        /*
         * Und die Gegenrichtung: am Mausarbeitsplatz bleibt die Oberflaeche
         * dicht. Ohne diese Zusicherung bestuende die obige auch dann, wenn
         * die Zielgroesse schlicht ueberall gaelte.
         */
        check(`fein, ${breite} px: die Oberflaeche bleibt dicht`,
          menue < ziel && inspektor < ziel, `${menue} / ${inspektor}`);
        check(`fein, ${breite} px: das E/N-Feld traegt seine 12 px`,
          schrift === "12px", schrift);
        check(`fein, ${breite} px: und die beiden Leisten ueber der Karte ebenfalls`,
          kartenknopf < ziel && leistenknopf < ziel,
          `${kartenknopf} / ${leistenknopf}`);
      }
    }

    /*
     * Unterhalb von 744 px wird NICHTS abgewiesen - kein Hinweisbildschirm,
     * keine Mindestbreite. Gestapelt wird dort, und die Seite scrollt; beides
     * ist der zugelassene Zustand, kein Zielverlust.
     */
    await seite.setViewportSize({ width: 400, height: 800 });
    await seite.waitForTimeout(300);

    const schmal = await seite.evaluate(() => {
      const m = getComputedStyle(document.querySelector("main"));
      return {
        /*
         * Unter 744 px ist `main` kein Raster mehr, sondern eine Spalte.
         * gridTemplateColumns taugt dort NICHT als Mass - es meldet weiter
         * die Rastervorlage, obwohl display:flex gilt; nachgemessen liefert
         * es bei 400 px vier Werte. Gefragt ist die Wirkung, und die ist
         * "untereinander".
         */
        anzeige: `${m.display}/${m.flexDirection}`,
        karte: !!document.getElementById("svg"),
        leiste: !!document.getElementById("toolRail"),
        inspektor: getComputedStyle(document.querySelector("aside")).display,
      };
    });

    check(`${name}, 400 px: gestapelt statt dreispaltig`,
      schmal.anzeige === "flex/column", schmal.anzeige);
    check(`${name}, 400 px: nichts wird abgewiesen`,
      schmal.karte && schmal.leiste && schmal.inspektor !== "none",
      JSON.stringify(schmal));

    await kontext.close();
  }
} finally {
  await browser.close();
}

finish("Die Werkzeugleiste gliedert nach Wirkung und verhält sich in drei Stufen.");
