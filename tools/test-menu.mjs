#!/usr/bin/env node
// Browsertest für die Menüleiste (Etappe 6 b1).
//
// Die beiden ersten Abschnitte entstanden VOR dem Umzug, solange "Aktive
// zurücksetzen" und "Kurzüberblick" noch als Knöpfe in der Kopfzeile standen:
// keiner der beiden wurde je von einem Test angefasst, und "Aktive
// zurücksetzen" ist eine zerstörende Aktion. Sie liefen dort grün und laufen
// hier unverändert weiter - nur die Geste führt jetzt über das Menü.
//
// Sichtbarkeit wird über den BERECHNETEN Stil geprüft, nie über das
// hidden-Attribut oder eine Klasse: eine Regel wie `.menu-panel{display:flex}`
// schlägt die Browser-Vorgabe [hidden]{display:none}, während element.hidden
// weiterhin true meldet.
//
// Jede Zusicherung prüft eine WIRKUNG. "Escape schließt das Menü" allein
// bestünde auch, wenn die Taste nie ankäme - deshalb wird zusätzlich geprüft,
// dass der Fokus beim Öffner gelandet ist, und bei der Rangfolge, dass die
// laufende Zeichnung den ersten Escape ÜBERLEBT.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-menu.mjs

import {
  createChecker, elementGetroffen, indexUrl, launchBrowser, menueBefehl,
} from "./browser-harness.mjs";

const TOOL = "test-menu";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

const PERIMETER = {
  type: "Feature",
  properties: { name: "perimeter" },
  geometry: { type: "Polygon", coordinates: [[
    [0, 0], [40, 0], [40, 40], [0, 40], [0, 0],
  ]] },
};

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.setViewportSize({ width: 1600, height: 900 });

  /** Sichtbarkeit über den berechneten Stil, nicht über das Attribut. */
  const sichtbar = (selector) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      return !!el && getComputedStyle(el).display !== "none";
    }, selector);

  /** Ids aller offenen Menüpanels - über den berechneten Stil ermittelt. */
  const offeneMenues = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".menu-panel")]
        .filter((p) => getComputedStyle(p).display !== "none")
        .map((p) => p.id));

  const fokus = () => page.evaluate(() => document.activeElement?.id || "");

  /*
   * Der Alt-Buchstabe ist abgeleitet und wechselt mit der Sprache: deutsch
   * Alt+D fuer "Datei", englisch Alt+F fuer "File". Ein fest verdrahtetes
   * Alt+D braeche deshalb erst im englischen Durchlauf - also spaet und an
   * einer Stelle, die mit dem Kuerzel nichts zu tun zu haben scheint.
   */
  const altTaste = (id) =>
    page.evaluate((x) =>
      document.getElementById(x).textContent.trim().charAt(0).toLowerCase(), id);

  const druckeAlt = async (id) =>
    page.keyboard.press(`Alt+${await altTaste(id)}`);

  const load = async () => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.locator("#fileInput").setInputFiles({
      name: "menue.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify({
        type: "FeatureCollection", features: [PERIMETER],
      })),
    });
    await page.waitForTimeout(450);
  };

  /* Der East-Wert eines Perimeterpunktes, direkt aus den Daten. */
  const eastOf = (index) =>
    page.evaluate((i) => data.features[0].geometry.coordinates[0][i][0], index);

  /* ---------------------------------------------------------------- */
  console.log("Aktive zurücksetzen holt die Ausgangslage zurück");

  await load();

  const vorher = await eastOf(1);

  await page.locator('#vertexGroup circle[data-layer="perimeter"]').nth(1).click();
  await page.waitForTimeout(300);

  await page.fill("#pointEastInput", String(vorher + 5).replace(".", ","));
  await page.press("#pointEastInput", "Enter");
  await page.waitForTimeout(300);

  /*
   * Ohne diese Zusicherung bestünde der Test auch dann, wenn das Verschieben
   * gar nichts täte - "zurückgesetzt" wäre dann eine Aussage über nichts.
   */
  check("der Punkt liegt vorher wirklich woanders",
    Math.abs((await eastOf(1)) - (vorher + 5)) < 1e-6,
    `${await eastOf(1)} statt ${vorher + 5}`);

  await menueBefehl(page, "Datei", "Aktive zurücksetzen");
  await page.waitForTimeout(400);

  check("nach dem Zurücksetzen liegt er wieder am Ausgangsort",
    Math.abs((await eastOf(1)) - vorher) < 1e-6,
    `${await eastOf(1)} statt ${vorher}`);

  check("das Menü ist nach dem Befehl wieder zu",
    (await offeneMenues()).length === 0, (await offeneMenues()).join(","));

  /*
   * Ein aufgeklapptes Panel muss an seinen eigenen Koordinaten auch WIRKLICH
   * getroffen werden. Eine Prüfung auf display allein sagt darüber nichts:
   * die Kopfzeile trug overflow:hidden und schnitt das Panel ab - gerechnet
   * war es da, sichtbar und anklickbar nicht. Genau das hat der erste
   * Bildschirmabzug gefunden, nicht der Test.
   */
  await page.locator("#menuFileBtn").click();
  await page.waitForTimeout(200);

  const trefferDatei = await elementGetroffen(page, "#menuFile");
  check("das offene Panel wird an seiner eigenen Stelle getroffen",
    trefferDatei.ok, trefferDatei.grund);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  /* ---------------------------------------------------------------- */
  console.log("Kurzüberblick öffnet und Escape schließt");

  check("das Overlay ist zunächst unsichtbar", !(await sichtbar("#helpOverlay")));

  await menueBefehl(page, "Hilfe", "Kurzüberblick");
  await page.waitForTimeout(250);

  check("nach dem Befehl ist es sichtbar", await sichtbar("#helpOverlay"));
  check("und trägt seinen Inhalt",
    (await page.locator("#helpOverlay").textContent()).includes("Kurzüberblick"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("Escape schließt es wieder", !(await sichtbar("#helpOverlay")));
  /*
   * Der Öffner selbst ist ein Menüeintrag und beim Schließen unsichtbar -
   * focus() liefe dort ins Leere. Sichtbar und zuständig ist der Menütitel.
   */
  check("und gibt den Fokus an den sichtbaren Öffner zurück",
    (await fokus()) === "menuHelpBtn", await fokus());

  /* ---------------------------------------------------------------- */
  console.log("Tastaturvertrag der Leiste");

  await page.locator("#svg").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("F10");
  await page.waitForTimeout(150);

  check("F10 betritt die Leiste", (await fokus()) === "menuFileBtn", await fokus());
  check("öffnet aber noch nichts", (await offeneMenues()).length === 0);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(120);
  check("Pfeil rechts wechselt zum nächsten Titel",
    (await fokus()) === "menuViewBtn", await fokus());

  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(120);
  check("Pfeil links wieder zurück",
    (await fokus()) === "menuFileBtn", await fokus());

  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);

  check("Pfeil runter öffnet das Menü",
    (await offeneMenues()).join(",") === "menuFile", (await offeneMenues()).join(","));
  check("und setzt den Fokus auf den ersten Eintrag",
    (await fokus()) === "", await fokus());
  check("der erste Eintrag ist die Beschriftung von Karte A öffnen",
    await page.evaluate(() =>
      document.activeElement?.getAttribute("for") === "fileInput"),
    await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 60)));

  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(120);
  check("Pfeil runter läuft weiter",
    await page.evaluate(() =>
      document.activeElement?.getAttribute("for") === "secondFileInput"));

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(120);
  check("Pfeil hoch läuft zurück",
    await page.evaluate(() =>
      document.activeElement?.getAttribute("for") === "fileInput"));

  /* Im offenen Menü wechselt links/rechts das Menü, nicht den Eintrag. */
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  check("links/rechts wechselt auch im offenen Zustand das Menü",
    (await offeneMenues()).join(",") === "menuView", (await offeneMenues()).join(","));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Escape schließt das Menü", (await offeneMenues()).length === 0);
  check("und gibt den Fokus an den Titel zurück",
    (await fokus()) === "menuViewBtn", await fokus());

  /* Tab verlässt die Leiste vollständig - nicht von Eintrag zu Eintrag. */
  await druckeAlt("menuFileBtn");
  await page.waitForTimeout(150);
  check("Alt+Anfangsbuchstabe öffnet das Datei-Menü",
    (await offeneMenues()).join(",") === "menuFile", (await offeneMenues()).join(","));

  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  check("Tab schließt das Menü", (await offeneMenues()).length === 0);
  check("und der Fokus steht ausserhalb der Leiste",
    await page.evaluate(() =>
      !document.getElementById("menuBar").contains(document.activeElement)),
    await fokus());

  /* Enter löst wirklich aus - geprüft an einer Wirkung, nicht am Zustand. */
  await druckeAlt("menuHelpBtn");
  await page.waitForTimeout(150);
  check("Alt+Anfangsbuchstabe öffnet das Hilfe-Menü und setzt den Fokus in den Eintrag",
    (await fokus()) === "helpBtn", await fokus());

  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  check("Enter löst den Eintrag aus", await sichtbar("#helpOverlay"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  console.log("Tastenkürzel");

  let heruntergeladen = false;
  page.on("download", () => { heruntergeladen = true; });

  await page.keyboard.press("Control+s");
  await page.waitForTimeout(700);

  check("Strg+S speichert wirklich", heruntergeladen);

  await page.keyboard.press("F1");
  await page.waitForTimeout(250);
  check("F1 öffnet die Hilfe", await sichtbar("#helpOverlay"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  console.log("Escape-Rangfolge: die oberste Ebene gewinnt");

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  check("es wird gezeichnet", await sichtbar("#inspectorDraw"));

  await druckeAlt("menuFileBtn");
  await page.waitForTimeout(150);
  check("und ein Menü ist offen",
    (await offeneMenues()).join(",") === "menuFile");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  check("der erste Escape schließt nur das Menü",
    (await offeneMenues()).length === 0);
  /*
   * Der Kern der Rangfolge: die Zeichnung muss den ersten Escape ÜBERLEBEN.
   * Ohne diese Zusicherung bestünde der Test auch, wenn Escape beides auf
   * einmal abräumte.
   */
  check("die Zeichnung läuft weiter", await sichtbar("#inspectorDraw"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("der zweite Escape bricht die Zeichnung ab",
    !(await sichtbar("#inspectorDraw")));

  /* ---------------------------------------------------------------- */
  console.log("Ansicht: eine Ebene ausschalten wirkt im SVG");

  await load();

  /*
   * Geprueft wird die WIRKUNG, nicht der Ankreuzzustand: checkbox.checked
   * waere auch dann false, wenn syncVisibility() gar nicht liefe.
   */
  const perimeterSichtbar = () =>
    page.evaluate(() => {
      const el = document.querySelector('#svg [data-layer="perimeter"]');
      return !!el && getComputedStyle(el).display !== "none";
    });

  check("der Perimeter ist zunächst sichtbar", await perimeterSichtbar());

  await page.locator("#menuViewBtn").click();
  await page.waitForTimeout(200);

  const trefferAnsicht = await elementGetroffen(page, "#menuView");
  check("das Ansicht-Panel wird an seiner eigenen Stelle getroffen",
    trefferAnsicht.ok, trefferAnsicht.grund);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  await menueBefehl(page, "Ansicht", "Perimeter");
  await page.waitForTimeout(250);

  check("nach dem Ausschalten ist er im SVG weg", !(await perimeterSichtbar()));

  await menueBefehl(page, "Ansicht", "Perimeter");
  await page.waitForTimeout(250);

  check("und nach dem Wiedereinschalten wieder da", await perimeterSichtbar());

  /* ---------------------------------------------------------------- */
  console.log("Karte: zwei Slots als Radiogruppe");

  const marker = () =>
    page.locator('#vertexGroup circle[data-layer="perimeter"]').count();

  const angekreuzt = () =>
    page.evaluate(() => [...document.querySelectorAll(".menu-map-slot")]
      .map((b) => `${b.dataset.mapId}:${b.getAttribute("aria-checked")}`)
      .join(" "));

  check("Karte A ist nach dem Laden angekreuzt",
    (await angekreuzt()) === "A:true B:false", await angekreuzt());

  check("Karte B ist ohne Datei gesperrt",
    await page.locator("#mapBButton").isDisabled());

  await page.locator("#secondFileInput").setInputFiles({
    name: "zweite.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [30, 0], [30, 10], [20, 20], [10, 20], [0, 10], [0, 0],
        ]] },
      }],
    })),
  });
  await page.waitForTimeout(500);

  check("nach dem Laden ist B angekreuzt",
    (await angekreuzt()) === "A:false B:true", await angekreuzt());

  const marktB = await marker();
  check("und B liegt mit sechs Punkten auf der Karte", marktB === 6, String(marktB));

  await page.locator("#menuMapBtn").click();
  await page.waitForTimeout(200);

  const trefferKarte = await elementGetroffen(page, "#menuMap");
  check("das Karte-Panel wird an seiner eigenen Stelle getroffen",
    trefferKarte.ok, trefferKarte.grund);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  await menueBefehl(page, "Karte", "Karte A");
  await page.waitForTimeout(400);

  /*
   * Die Wirkung steht im SVG, nicht im Attribut: A hat vier Eckpunkte, B
   * sechs. Ein Test nur auf aria-checked bestünde auch, wenn activateMap()
   * gar nicht liefe.
   */
  const marktA = await marker();
  check("der Wechsel bringt Karte A mit vier Punkten zurück",
    marktA === 4, String(marktA));
  check("und das Kreuz sitzt wieder bei A",
    (await angekreuzt()) === "A:true B:false", await angekreuzt());

  /* ---------------------------------------------------------------- */
  console.log("Sprachwechsel: die Menüs und die abgeleiteten Slot-Texte");

  const slotTitel = () =>
    page.evaluate(() => document.querySelector("#mapAButton .map-slot-title")
      .textContent.trim());
  const menueTitel = () =>
    page.evaluate(() => [...document.querySelectorAll(".menu-title")]
      .map((t) => t.textContent.trim()).join(" "));

  check("deutsch nennt Karte A aktiv", (await slotTitel()) === "Karte A · aktiv",
    await slotTitel());

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  check("die Menütitel sind übersetzt",
    (await menueTitel()) === "File View Map Help", await menueTitel());
  check("und der abgeleitete Slot-Text auch",
    (await slotTitel()) === "Map A · active", await slotTitel());

  /*
   * Der Rückweg ist der eigentliche Prüfstein. Der Schnappschuss hält
   * "Karte A · nicht geladen" fest - stünde das hier, wäre der Text als
   * Schnappschuss behandelt worden statt neu aufgebaut.
   */
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  check("zurück auf Deutsch stehen die Menütitel wieder da",
    (await menueTitel()) === "Datei Ansicht Karte Hilfe", await menueTitel());
  check("und der Slot-Text ist neu aufgebaut, nicht aus dem Schnappschuss",
    (await slotTitel()) === "Karte A · aktiv", await slotTitel());

  /* ---------------------------------------------------------------- */
  console.log("Rasterfenster: die eingestellte Weite wirkt wirklich");

  await page.setViewportSize({ width: 1600, height: 900 });
  await load();

  check("das Rasterfenster ist zunächst zu", !(await sichtbar("#gridWindow")));

  await menueBefehl(page, "Ansicht", "Raster…");
  await page.waitForTimeout(250);

  check("nach dem Menübefehl steht es da", await sichtbar("#gridWindow"));
  check("und das Menü ist zu", (await offeneMenues()).length === 0);

  /*
   * Über den Fenstern sitzt .viewer mit overflow:hidden. display sagt darüber
   * nichts - ein abschneidender Vorfahr sitzt eine Ebene höher. Deshalb in
   * allen drei Fenstergrößen die Trefferprüfung.
   */
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const t = await elementGetroffen(page, "#gridWindow");
    check(`das Rasterfenster wird bei ${w}x${h} getroffen`, t.ok, t.grund);
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(250);

  await page.fill("#gridStepInput", "1,00");
  await page.locator("#applyGridBtn").click();
  await page.waitForTimeout(250);

  check("die Kurzform in der Statuszeile zieht mit",
    (await page.locator("#gridShort").textContent()).trim() === "1,00 m",
    (await page.locator("#gridShort").textContent()).trim());

  /*
   * Die eigentliche Wirkung: die Rasterweite ist zugleich die Schrittweite
   * der Pfeiltasten. Ein Test auf den Feldinhalt allein bestünde auch dann,
   * wenn "Übernehmen" gar nichts täte.
   */
  await page.locator('#vertexGroup circle[data-layer="perimeter"]').nth(1).click();
  await page.waitForTimeout(300);

  const vorPfeil = await eastOf(1);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);

  check("ein Pfeiltastendruck verschiebt um genau die eingestellte Weite",
    Math.abs((await eastOf(1)) - (vorPfeil + 1)) < 1e-6,
    `${await eastOf(1)} statt ${vorPfeil + 1}`);

  /* ---------------------------------------------------------------- */
  console.log("Mäherfenster: höchstens eines ist offen");

  await menueBefehl(page, "Ansicht", "Mähroboter-Vorschau…");
  await page.waitForTimeout(250);

  check("das Mäherfenster steht da", await sichtbar("#mowerWindow"));
  check("und das Rasterfenster ist zugegangen", !(await sichtbar("#gridWindow")));

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const t = await elementGetroffen(page, "#mowerWindow");
    check(`das Mäherfenster wird bei ${w}x${h} getroffen`, t.ok, t.grund);
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(250);

  check("der Hinweis nennt Korridorprüfung und Flächenwarnung",
    (await page.locator("#mowerWindow .hint").textContent())
      .includes("Korridorprüfung") &&
    (await page.locator("#mowerWindow .hint").textContent())
      .includes("Flächenwarnung"));

  /* Wirkung im SVG: der gezeichnete Mäher wird wirklich breiter. */
  const mowerBreite = () =>
    page.evaluate(() => {
      const el = document.querySelector(".mower-body");
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    });

  const schmal = await mowerBreite();
  check("der Mäher wird überhaupt gezeichnet", schmal > 0, String(schmal));

  await page.fill("#mowerWidthInput", "1,40");
  await page.locator("#applyMowerSizeBtn").click();
  await page.waitForTimeout(350);

  const breit = await mowerBreite();
  check("nach dem Übernehmen ist er im SVG breiter",
    breit > schmal * 1.5, `${schmal} -> ${breit}`);
  check("und die Größenzeile im Fenster nennt den neuen Wert",
    (await page.locator("#mowerSizeInfo").textContent()).includes("140 cm"),
    await page.locator("#mowerSizeInfo").textContent());

  /* ---------------------------------------------------------------- */
  console.log("Escape-Rangfolge mit Fenster");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("Escape schließt das Fenster", !(await sichtbar("#mowerWindow")));
  check("und der Fokus steht beim sichtbaren Öffner",
    (await fokus()) === "menuViewBtn", await fokus());

  await menueBefehl(page, "Ansicht", "Raster…");
  await page.waitForTimeout(250);

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  check("es wird gezeichnet und das Fenster steht noch",
    (await sichtbar("#inspectorDraw")) && (await sichtbar("#gridWindow")));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("der erste Escape schließt nur das Fenster",
    !(await sichtbar("#gridWindow")));
  check("die Zeichnung läuft weiter", await sichtbar("#inspectorDraw"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("der zweite Escape bricht die Zeichnung ab",
    !(await sichtbar("#inspectorDraw")));

  /* Ein offenes Menü schlägt ein offenes Fenster. */
  await menueBefehl(page, "Ansicht", "Raster…");
  await page.waitForTimeout(250);
  await druckeAlt("menuFileBtn");
  await page.waitForTimeout(200);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("bei Menü UND Fenster gewinnt das Menü",
    (await offeneMenues()).length === 0 && (await sichtbar("#gridWindow")));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("der zweite Escape nimmt dann das Fenster",
    !(await sichtbar("#gridWindow")));

  /* ---------------------------------------------------------------- */
  console.log("Der Vergleichspunkt verschwindet, wenn der Punkt zurückkehrt");

  await load();

  const ghost = () =>
    page.evaluate(() => ({
      punkte: document.querySelectorAll(".selection-ghost-point").length,
      linien: document.querySelectorAll(".selection-ghost-line").length,
      maeher: document.querySelectorAll(".selection-ghost-mower-body").length,
    }));

  const ausgang = await eastOf(1);

  await page.locator('#vertexGroup circle[data-layer="perimeter"]').nth(1).click();
  await page.waitForTimeout(350);

  await page.fill("#pointEastInput", String(ausgang - 8).replace(".", ","));
  await page.press("#pointEastInput", "Enter");
  await page.waitForTimeout(400);

  /*
   * Erst der positive Beleg: der Punkt liegt wirklich woanders UND alle drei
   * Vergleichselemente stehen da. Ohne ihn bewiese ihr Verschwinden nichts.
   */
  check("nach dem Verschieben liegt der Punkt woanders",
    Math.abs((await eastOf(1)) - (ausgang - 8)) < 1e-9,
    String(await eastOf(1)));

  let g = await ghost();
  check("und alle drei Vergleichselemente stehen da",
    g.punkte === 1 && g.linien === 1 && g.maeher === 1, JSON.stringify(g));

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(500);

  check("nach dem Undo liegt der Punkt wieder am Ausgangsort",
    Math.abs((await eastOf(1)) - ausgang) < 1e-9, String(await eastOf(1)));

  g = await ghost();
  check("und keines der drei Vergleichselemente steht mehr da",
    g.punkte === 0 && g.linien === 0 && g.maeher === 0, JSON.stringify(g));

  /*
   * Der Gegenfall. Ohne ihn bestünde der Test auch dann, wenn die Ghosts
   * gar nicht mehr gezeichnet würden.
   */
  /*
   * Nicht erneut anklicken: der zurueckgenommene Punkt ist nach dem Undo
   * weiterhin ausgewaehlt, und die Maehervorschau ersetzt seinen Marker -
   * nth(1) traefe deshalb einen anderen Punkt.
   */
  check("der Punkt ist nach dem Undo weiterhin ausgewählt",
    await page.evaluate(() => !!selectedVertex));

  await page.fill("#pointEastInput", String(ausgang - 3).replace(".", ","));
  await page.press("#pointEastInput", "Enter");
  await page.waitForTimeout(400);

  check("nach erneutem Verschieben liegt der Punkt wieder woanders",
    Math.abs((await eastOf(1)) - (ausgang - 3)) < 1e-9,
    String(await eastOf(1)));

  g = await ghost();
  check("und der Vergleich ist wieder da",
    g.punkte === 1 && g.linien === 1 && g.maeher === 1, JSON.stringify(g));

  /* ---------------------------------------------------------------- */
  console.log("Der Tastaturvertrag gilt in BEIDEN Sprachen");

  /*
   * Der Buchstabe ist abgeleitet, also wechselt er mit der Sprache. Ein Test
   * nur in der laufenden Sprache belegte davon nichts - und der Fehlerfall
   * (zwei Titel mit demselben Anfangsbuchstaben) traete genau dort auf, wo
   * niemand hinsieht.
   *
   * Geprueft wird die WIRKUNG: das zugehoerige Panel steht offen, und es wird
   * an seinen eigenen Koordinaten getroffen - display allein sagt darueber
   * nichts, ein abschneidender Vorfahr sitzt eine Ebene hoeher.
   */
  const menues = [
    ["menuFileBtn", "menuFile"],
    ["menuViewBtn", "menuView"],
    ["menuMapBtn", "menuMap"],
    ["menuHelpBtn", "menuHelp"],
  ];

  for (const sprache of ["deutsch", "englisch"]) {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });

    if (sprache === "englisch") {
      await page.locator("#languageToggle").click();
      await page.waitForTimeout(500);
    }

    const gesehen = [];

    for (const [titelId, panelId] of menues) {
      const taste = await altTaste(titelId);
      gesehen.push(taste);

      await page.keyboard.press(`Alt+${taste}`);
      await page.waitForTimeout(200);

      const offen = await offeneMenues();
      check(`${sprache}: Alt+${taste.toUpperCase()} öffnet #${panelId}`,
        offen.join(",") === panelId, offen.join(","));

      const treffer = await elementGetroffen(page, `#${panelId}`);
      check(`${sprache}: #${panelId} wird an seiner eigenen Stelle getroffen`,
        treffer.ok, treffer.grund);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }

    check(`${sprache}: die vier Buchstaben sind verschieden`,
      new Set(gesehen).size === 4, gesehen.join(","));

    /* Und die Markierung im Titel zeigt genau diesen Buchstaben. */
    const markiert = await page.evaluate(() =>
      [...document.querySelectorAll(".menu-title")].map((t) =>
        getComputedStyle(t, "::first-letter").textDecorationLine));

    check(`${sprache}: jeder Titel markiert seinen ersten Buchstaben`,
      markiert.every((d) => d.includes("underline")), JSON.stringify(markiert));
  }

  /* ---------------------------------------------------------------- */
  check("keine Konsolenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("alle Zusicherungen erfüllt");
