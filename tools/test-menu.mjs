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
  createChecker, indexUrl, launchBrowser, menueBefehl,
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

  check("das offene Panel wird an seiner eigenen Stelle getroffen",
    await page.evaluate(() => {
      const panel = document.getElementById("menuFile");
      const r = panel.getBoundingClientRect();
      const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
      return panel.contains(treffer);
    }),
    await page.evaluate(() => {
      const r = document.getElementById("menuFile").getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
      return t ? (t.id || t.className || t.tagName) : "nichts";
    }));

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
  await page.keyboard.press("Alt+d");
  await page.waitForTimeout(150);
  check("Alt+D öffnet das Datei-Menü",
    (await offeneMenues()).join(",") === "menuFile", (await offeneMenues()).join(","));

  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  check("Tab schließt das Menü", (await offeneMenues()).length === 0);
  check("und der Fokus steht ausserhalb der Leiste",
    await page.evaluate(() =>
      !document.getElementById("menuBar").contains(document.activeElement)),
    await fokus());

  /* Enter löst wirklich aus - geprüft an einer Wirkung, nicht am Zustand. */
  await page.keyboard.press("Alt+h");
  await page.waitForTimeout(150);
  check("Alt+H öffnet das Hilfe-Menü und setzt den Fokus in den Eintrag",
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

  await page.keyboard.press("Alt+d");
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
  check("keine Konsolenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("alle Zusicherungen erfüllt");
