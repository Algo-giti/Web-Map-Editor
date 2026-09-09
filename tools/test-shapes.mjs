#!/usr/bin/env node
// Browsertest für Kreis- und Rechteck-Exclusions.
//
// tools/test-geometry.mjs prüft die Punktberechnung. Hier geht es um den
// Klickpfad: ein Klick setzt den Bezugspunkt, das Ergebnis ist eine gewöhnliche
// Exclusion mit korrekter idx-Vergabe, und Snap-to-Grid wirkt auf den
// Bezugspunkt, nicht auf die Eckpunkte.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-shapes.mjs

import { createChecker, indexUrl, launchBrowser, menueBefehl } from "./browser-harness.mjs";

const TOOL = "test-shapes";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

const DEG = 111111;
const rel = ([e, n]) => [e / DEG, n / DEG];

/** Karte mit Perimeter und einer bereits vorhandenen Exclusion. */
const baseMap = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [60, 0], [60, 60], [0, 60], [0, 0],
      ].map(rel)] },
    },
    {
      type: "Feature",
      idx: 0,
      properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [[
        [2, 2], [6, 2], [6, 6], [2, 6], [2, 2],
      ].map(rel)] },
    },
  ],
});

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const expand = () =>
    page.evaluate(() => {
      document.querySelectorAll("#sidebar details")
        .forEach((s) => s.setAttribute("open", ""));
    });

  await expand();
  await page.locator("#fileInput").setInputFiles({
    name: "shapes.geojson", mimeType: "application/geo+json",
    buffer: Buffer.from(baseMap),
  });
  await page.waitForTimeout(450);
  await expand();

  /*
   * Klickt eine Position in Metern auf die Karte.
   *
   * Die viewBox des SVG steht in WELTkoordinaten - bei erkanntem Relativformat
   * also in Metern, nicht in den Rohwerten der Datei. Die Nordachse zeigt im
   * SVG nach unten, daher das Vorzeichen.
   */
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
    await page.waitForTimeout(350);
  };

  /*
   * Seit Etappe 5b setzt ein Klick nur den BEZUGSPUNKT; erzeugt wird beim
   * Abschliessen. Und die Massfelder stehen im Zeichenzustand des Inspektors,
   * nicht mehr in der Seitenleiste - sie sind also erst erreichbar, wenn das
   * Werkzeug laeuft. Beide Aenderungen zusammen ergeben diese Reihenfolge:
   * Werkzeug starten, Masse setzen, Bezugspunkt klicken, abschliessen.
   */
  const finishShape = async () => {
    await page.locator("#finishDrawBtn").click();
    await page.waitForTimeout(350);
  };

  /** Wie clickMap, aber als Doppelklick - die Abschlussgeste. */
  const doubleClickMap = async (east, north) => {
    const point = await page.evaluate(([e, n]) => {
      const svg = document.getElementById("svg");
      const rect = svg.getBoundingClientRect();
      const box = svg.viewBox.baseVal;
      return [
        rect.left + (e - box.x) / box.width * rect.width,
        rect.top + (-n - box.y) / box.height * rect.height,
      ];
    }, [east, north]);
    await page.mouse.dblclick(point[0], point[1]);
    await page.waitForTimeout(350);
  };

  /** Lädt die Ausgangskarte erneut in Slot A. */
  const reload = async () => {
    await page.locator("#fileInput").setInputFiles({
      name: "shapes.geojson", mimeType: "application/geo+json",
      buffer: Buffer.from(baseMap),
    });
    await page.waitForTimeout(450);
    await expand();
  };

  const exportMap = async () => {
    const pending = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await menueBefehl(page, "Datei", "GeoJSON speichern");
    const ev = await pending;
    if (!ev) return null;
    const stream = await ev.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString());
  };

  const exclusions = (map) =>
    map.features.filter((f) => f.properties?.name === "exclusion");

  /* ---------------------------------------------------------------- */
  console.log("Kreis");

  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);

  const isActive = (selector) =>
    page.locator(selector).evaluate((el) => el.classList.contains("active"));

  check("Werkzeug ist aktiv", await isActive("#drawCircleBtn"));
  check("die Maßfelder stehen im Zeichenzustand",
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("drawCircleFields")).display !== "none"));

  check("Hinweis nennt die Abweichung",
    (await page.locator("#circleHint").textContent()).includes("Abweichung"),
    await page.locator("#circleHint").textContent());

  await page.fill("#circleRadiusInput", "3");
  await page.fill("#circleVerticesInput", "24");
  await page.waitForTimeout(200);

  await clickMap(30, 30);

  check("der Klick erzeugt noch nichts",
    (await page.evaluate(() => data.features.length)) === 2,
    String(await page.evaluate(() => data.features.length)));

  await finishShape();

  check("Erfolgsmeldung nennt die Eckpunkte",
    (await page.locator("#editStatus").textContent()).includes("24 Eckpunkten"),
    await page.locator("#editStatus").textContent());

  const afterCircle = await exportMap();
  check("Export gelingt", !!afterCircle);

  if (afterCircle) {
    const list = exclusions(afterCircle);
    check("zwei Exclusions", list.length === 2, String(list.length));
    check("Indizes fortlaufend vergeben",
      list.every((f, i) => f.idx === i), JSON.stringify(list.map((f) => f.idx)));

    const ring = list[1].geometry.coordinates[0];
    check("Ring ist geschlossen",
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]);
    check("24 Ecken plus Ringschluss", ring.length === 25, String(ring.length));

    const radii = ring.slice(0, 24).map(([e, n]) =>
      Math.hypot(e * DEG - 30, n * DEG - 30));
    check("alle Punkte liegen auf dem Radius",
      radii.every((r) => Math.abs(r - 3) < 1e-6),
      JSON.stringify(radii.slice(0, 3)));

    check("keine zusätzlichen properties",
      Object.keys(list[1].properties).length === 1,
      JSON.stringify(list[1].properties));
  }

  /* Ein Undo nimmt die Form zurück. */
  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);
  const afterUndo = await exportMap();
  check("ein Undo entfernt die Kreis-Exclusion",
    afterUndo && exclusions(afterUndo).length === 1,
    String(afterUndo && exclusions(afterUndo).length));

  /* ---------------------------------------------------------------- */
  console.log("Rechteck");

  await page.locator("#drawRectangleBtn").click();
  await page.waitForTimeout(250);

  check("die Rechteckfelder stehen im Zeichenzustand",
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("drawRectFields")).display !== "none"));
  check("die Kreisfelder dagegen nicht",
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("drawCircleFields")).display === "none"));

  await page.fill("#rectWidthInput", "6");
  await page.fill("#rectHeightInput", "2");
  await page.fill("#rectAngleInput", "90");
  await page.waitForTimeout(200);

  await clickMap(40, 40);
  await finishShape();

  const afterRect = await exportMap();
  check("Export gelingt", !!afterRect);

  if (afterRect) {
    const list = exclusions(afterRect);
    check("zwei Exclusions", list.length === 2, String(list.length));

    const ring = list[1].geometry.coordinates[0];
    check("vier Ecken plus Ringschluss", ring.length === 5, String(ring.length));

    const metres = ring.slice(0, 4).map(([e, n]) => [e * DEG, n * DEG]);
    const side1 = Math.hypot(metres[1][0] - metres[0][0], metres[1][1] - metres[0][1]);
    const side2 = Math.hypot(metres[2][0] - metres[1][0], metres[2][1] - metres[1][1]);

    check("Seitenlängen stimmen",
      Math.abs(side1 - 6) < 1e-6 && Math.abs(side2 - 2) < 1e-6,
      `${side1} / ${side2}`);

    /* Um 90 Grad gedreht liegt die 6-m-Seite in North-Richtung. */
    check("Drehung um 90 Grad wirkt",
      Math.abs(metres[1][0] - metres[0][0]) < 1e-6,
      JSON.stringify(metres.slice(0, 2)));

    const centreEast = metres.reduce((sum, [e]) => sum + e, 0) / 4;
    const centreNorth = metres.reduce((sum, [, n]) => sum + n, 0) / 4;
    check("Mittelpunkt liegt am Klickpunkt",
      Math.abs(centreEast - 40) < 1e-6 && Math.abs(centreNorth - 40) < 1e-6,
      `${centreEast} / ${centreNorth}`);
  }

  /* ---------------------------------------------------------------- */
  console.log("Ungültige Eingaben werden abgelehnt");

  /*
   * Seit die Massfelder im Zeichenzustand stehen, entsteht ein ungueltiger
   * Wert erst WAEHREND des Zeichnens. Geprueft wird deshalb die Wirkung: der
   * Abschluss ist gesperrt und der Grund steht sichtbar da - nicht bloss,
   * dass nichts passiert.
   */
  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);
  await clickMap(12, 12);

  const vorFehler = await page.evaluate(() => data.features.length);

  check("mit gueltigem Radius ist der Abschluss frei",
    !(await page.locator("#finishDrawBtn").isDisabled()));

  await page.fill("#circleRadiusInput", "0");
  await page.waitForTimeout(250);

  check("Hinweis meldet den Fehler",
    (await page.locator("#circleHint").getAttribute("class")).includes("error"),
    await page.locator("#circleHint").textContent());
  check("der Abschluss ist jetzt gesperrt",
    await page.locator("#finishDrawBtn").isDisabled());
  check("und der Fortschritt nennt den Grund",
    (await page.locator("#drawProgress").textContent()).includes("Radius"),
    await page.locator("#drawProgress").textContent());

  await page.fill("#circleRadiusInput", "1,5");
  await page.waitForTimeout(250);

  check("ein gueltiger Wert gibt ihn wieder frei",
    !(await page.locator("#finishDrawBtn").isDisabled()));

  await finishShape();

  check("und dann entsteht die Form wirklich",
    (await page.evaluate(() => data.features.length)) === vorFehler + 1,
    `${vorFehler} -> ${await page.evaluate(() => data.features.length)}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  console.log("Aufziehen");

  await reload();

  /** Bildschirmpunkt zu einer Weltposition. */
  const screenOf = (east, north) => page.evaluate(([e, n]) => {
    const svg = document.getElementById("svg");
    const rect = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    return [
      rect.left + (e - box.x) / box.width * rect.width,
      rect.top + (-n - box.y) / box.height * rect.height,
    ];
  }, [east, north]);

  /** Zieht von einer Weltposition zur anderen. */
  const dragMap = async (von, nach, schritte = 8) => {
    const a = await screenOf(...von);
    const b = await screenOf(...nach);
    await page.mouse.move(a[0], a[1]);
    await page.mouse.down();
    for (let i = 1; i <= schritte; i++) {
      await page.mouse.move(
        a[0] + (b[0] - a[0]) * i / schritte,
        a[1] + (b[1] - a[1]) * i / schritte);
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
  };

  const undoLen = () => page.evaluate(() => undoStack.length);
  const featureCount = () => page.evaluate(() => data.features.length);

  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(250);

  const stapelVorher = await undoLen();
  const featuresVorher = await featureCount();

  /* Unter der Schwelle bleibt es ein Klick: die Feldwerte gelten. */
  await page.fill("#circleRadiusInput", "1,00");
  await page.waitForTimeout(150);

  const nah = await screenOf(20, 20);
  await page.mouse.move(nah[0], nah[1]);
  await page.mouse.down();
  await page.mouse.move(nah[0] + 2, nah[1]);
  await page.mouse.up();
  await page.waitForTimeout(250);

  check("2 px sind noch ein Klick, der Radius bleibt",
    (await page.locator("#circleRadiusInput").inputValue()) === "1,00",
    await page.locator("#circleRadiusInput").inputValue());

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* Aufziehen setzt das Mass. */
  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(200);
  await dragMap([20, 20], [23, 20]);

  check("Aufziehen schreibt den Radius ins Feld",
    (await page.locator("#circleRadiusInput").inputValue()) === "3,00",
    await page.locator("#circleRadiusInput").inputValue());
  check("erzeugt ist dabei noch nichts",
    (await featureCount()) === featuresVorher, String(await featureCount()));
  check("und kein Undo-Eintrag entstanden",
    (await undoLen()) === stapelVorher,
    `${await undoLen()} statt ${stapelVorher}`);

  /* Das Feld ist gleichberechtigt: der gezogene Wert laesst sich nachtragen. */
  await page.fill("#circleRadiusInput", "2,50");
  await page.waitForTimeout(250);

  /*
   * DIE zentrale Zusicherung: Vorschau und erzeugte Geometrie kommen aus
   * derselben Funktion. Verglichen wird Punkt fuer Punkt. Sie faellt sofort
   * um, wenn jemand spaeter einen zweiten Rechenweg einbaut.
   */
  const vorschau = await page.evaluate(() =>
    document.querySelector(".draw-preview-polygon").getAttribute("d")
      .replace(/[MLZ]/g, "").trim().split(/\s+/).map(Number));

  await finishShape();

  const erzeugt = await page.evaluate(() => {
    const f = data.features[data.features.length - 1];
    return f.geometry.coordinates[0].slice(0, -1)
      .flatMap(([e, n]) => {
        const [x, y] = toWorld([e, n]);
        return [x, -y];
      });
  });

  check("Vorschau und erzeugte Geometrie sind Punkt fuer Punkt gleich",
    vorschau.length === erzeugt.length && vorschau.length > 0 &&
    vorschau.every((v, i) => Math.abs(v - erzeugt[i]) < 1e-9),
    `${vorschau.length} gegen ${erzeugt.length}`);
  check("und genau ein Undo-Schritt ist entstanden",
    (await undoLen()) === stapelVorher + 1,
    `${await undoLen()} statt ${stapelVorher + 1}`);

  /* Escape verwirft, ohne etwas zu hinterlassen. */
  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(200);
  await dragMap([8, 30], [12, 30]);

  const stapelVorEscape = await undoLen();
  const featuresVorEscape = await featureCount();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  check("Escape entfernt die Vorschau",
    (await page.locator(".draw-preview-polygon").count()) === 0);
  check("ohne Feature", (await featureCount()) === featuresVorEscape);
  check("und ohne Undo-Eintrag", (await undoLen()) === stapelVorEscape,
    `${await undoLen()} statt ${stapelVorEscape}`);

  /*
   * Escape wirkt AUCH aus einem Massfeld heraus. Seit die Felder im
   * Zeichenzustand stehen, ist "tippen und dann doch abbrechen" der normale
   * Ablauf - vorher lag der Cursor beim Zeichnen praktisch nie in einem Feld,
   * und die Sperre fuer Texteingaben fiel deshalb nicht auf.
   */
  await page.locator("#drawCircleBtn").click();
  await page.waitForTimeout(200);
  await clickMap(15, 25);
  await page.locator("#circleRadiusInput").focus();
  await page.locator("#circleRadiusInput").press("Escape");
  await page.waitForTimeout(250);

  check("Escape aus dem Massfeld bricht die Zeichnung ab",
    (await page.evaluate(() => featureDrawState)) === null);
  check("und nimmt den Fokus aus dem Feld",
    (await page.evaluate(() => document.activeElement?.id)) !== "circleRadiusInput",
    await page.evaluate(() => document.activeElement?.id));

  /* Ein zweiter Klick setzt den Bezugspunkt um, statt zu erzeugen. */
  await page.locator("#drawRectangleBtn").click();
  await page.waitForTimeout(200);
  await clickMap(10, 10);

  const ersterAnker = await page.evaluate(() => featureDrawState.points[0]);

  await clickMap(30, 12);

  const zweiterAnker = await page.evaluate(() => featureDrawState.points[0]);

  check("ein weiterer Klick verschiebt den Bezugspunkt",
    Math.abs(zweiterAnker[0] - ersterAnker[0]) > 10,
    `${JSON.stringify(ersterAnker)} -> ${JSON.stringify(zweiterAnker)}`);
  check("es bleibt bei genau einem Punkt",
    (await page.evaluate(() => featureDrawState.points.length)) === 1);
  check("und erzeugt wurde weiterhin nichts",
    (await featureCount()) === featuresVorEscape, String(await featureCount()));

  /* Gedrehtes Rechteck: das Ziehen folgt der eigenen Achse. */
  await page.fill("#rectAngleInput", "90");
  await page.fill("#rectHeightInput", "1,00");
  await page.waitForTimeout(200);
  await dragMap([20, 20], [20, 26]);

  check("bei 90 Grad wird aus 6 m nach Norden die BREITE",
    (await page.locator("#rectWidthInput").inputValue()) === "12,00",
    await page.locator("#rectWidthInput").inputValue());
  check("und die Hoehe bleibt unberuehrt",
    (await page.locator("#rectHeightInput").inputValue()) === "1,00",
    await page.locator("#rectHeightInput").inputValue());

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  console.log("Kontur schließen: erster Punkt und Doppelklick");

  await reload();

  const exclusionRings = () =>
    page.locator('#geometryGroup .exclusion').count();

  const before = await exclusionRings();
  const baseMarks = await page.evaluate(() =>
    document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length);

  /* Klick auf den ersten Punkt schliesst den Ring. */
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(200);

  await clickMap(6, 6);
  await clickMap(14, 6);
  await clickMap(14, 14);
  await clickMap(6, 6);
  await page.waitForTimeout(350);

  check("der Klick auf den ersten Punkt schließt die Kontur",
    (await exclusionRings()) === before + 1,
    `${await exclusionRings()} statt ${before + 1}`);
  check("die Zeichnung ist beendet",
    await page.locator("#cancelDrawBtn").isDisabled());

  /* Gezählt wird gegen den Bestand der Ausgangskarte, nicht absolut. */
  const marksOf = () =>
    page.evaluate(() =>
      document.querySelectorAll('#vertexGroup circle[data-layer="exclusion"]').length);

  check("der Schließklick setzt keinen vierten Punkt",
    (await marksOf()) === baseMarks + 3, `${await marksOf()} statt ${baseMarks + 3}`);

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  /* Doppelklick beendet ebenfalls - ohne zusätzlichen Punkt. */
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(200);

  await clickMap(20, 20);
  await clickMap(28, 20);
  await doubleClickMap(28, 28);
  await page.waitForTimeout(350);

  check("der Doppelklick beendet die Zeichnung",
    await page.locator("#cancelDrawBtn").isDisabled());
  check("er erzeugt genau drei Punkte, nicht vier",
    (await marksOf()) === baseMarks + 3, `${await marksOf()} statt ${baseMarks + 3}`);

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  /*
   * Offene Linien schliessen NICHT: ein Treffer auf den ersten Punkt setzt
   * dort bewusst einen weiteren Punkt. Ein geschlossener Ring wäre für eine
   * Search Wire schlicht falsch.
   */
  await page.locator("#drawSearchWireBtn").click();
  await page.waitForTimeout(200);

  await clickMap(6, 30);
  await clickMap(14, 30);
  await clickMap(14, 34);
  await clickMap(6, 30);
  await page.waitForTimeout(300);

  check("die Search Wire läuft nach dem Treffer weiter",
    await page.locator("#cancelDrawBtn").isEnabled());
  check("und hat einen vierten Punkt bekommen",
    (await page.locator("#drawFeatureStatus").textContent()).includes("4 Punkt"),
    await page.locator("#drawFeatureStatus").textContent());

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Kreis und Rechteck erzeugen gewöhnliche Exclusions.");
