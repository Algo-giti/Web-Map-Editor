#!/usr/bin/env node
// Browsertest für den Docking-Pfad mit freier Punktzahl.
//
// tools/test-cassandra.mjs prüft die Validierungsregel. Hier geht es um das
// Bedienverhalten, das sich spürbar ändert: die automatische Fertigstellung
// nach dem dritten Punkt entfällt, der Pfad lässt sich verlängern, und
// einzelne Punkte lassen sich löschen, solange 2 übrig bleiben.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs; fehlt
// playwright-core oder startet kein Browser, gibt der Test eine Anleitung aus
// und endet mit 0.
//
// Alle Karten werden synthetisch erzeugt. Es liegt keine Kartendatei im
// Repository und es wird keine gelesen.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-dockpath.mjs

import {
  createChecker,
  createMenueBefehl,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-dockpath";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

const SCALE = 111111;

/** Karte mit Perimeter und optionalem Docking-Pfad, Angaben in Metern. */
function syntheticMap(dockMetres = null) {
  const size = 30 / SCALE;
  const features = [
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [size, 0], [size, size], [0, size], [0, 0],
      ]] },
    },
  ];

  if (dockMetres) {
    features.push({
      type: "Feature",
      properties: { name: "dockpoints" },
      geometry: {
        type: "LineString",
        coordinates: dockMetres.map(([east, north]) => [east / SCALE, north / SCALE]),
      },
    });
  }

  return JSON.stringify({ type: "FeatureCollection", features });
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

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  /*
   * Die Faltgeste kommt aus dem browser-harness, nicht aus einer eigenen Kopie.
   * openAllFolds() steht dort seit Etappe 6 b2 - er wurde nur nie benutzt, und
   * deshalb erreichte die Reparatur in 3c (die Feature-Karten der Navigation)
   * zunaechst keinen einzigen Test. Eine Geste an sieben Stellen wird an sechs
   * davon vergessen.
   */

  await openAllFolds(page);
  await menueBefehl("Ansicht", "Mäher am ausgewählten Punkt anzeigen");

  const load = async (body) => {
    await page.locator("#fileInput").setInputFiles({
      name: "dock.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await openAllFolds(page);
  };

  /** Klickt eine Position in Metern auf die Karte. */
  const clickMap = async (east, north) => {
    const point = await page.evaluate(([e, n]) => {
      const svg = document.getElementById("svg");
      const rect = svg.getBoundingClientRect();
      const box = svg.viewBox.baseVal;
      return [
        rect.left + ((e / 111111 * 111111) - box.x) / box.width * rect.width,
        rect.top + ((-n / 111111 * 111111) - box.y) / box.height * rect.height,
      ];
    }, [east, north]);

    await page.mouse.click(point[0], point[1]);
    await page.waitForTimeout(160);
  };

  const drawStatus = () => page.locator("#drawFeatureStatus").textContent();
  const editStatus = () => page.locator("#editStatus").textContent();

  /* ---------------------------------------------------------------- */
  console.log("Zeichnen ohne automatische Fertigstellung");
  await load(syntheticMap());

  await page.locator("#createDockBtn").click();
  await page.waitForTimeout(200);

  await clickMap(5, 5);
  await clickMap(10, 5);
  await clickMap(15, 5);

  /*
   * Genau hier lag die alte Automatik: nach dem dritten Punkt war die
   * Zeichnung beendet. Sie muss jetzt weiterlaufen.
   */
  check("Zeichnung läuft nach dem dritten Punkt weiter",
    (await drawStatus()).includes("3 Punkt"), await drawStatus());
  check("Abschluss-Button ist freigegeben",
    await page.locator("#finishDrawBtn").isEnabled());

  await clickMap(20, 5);
  check("vierter Punkt kommt an",
    (await drawStatus()).includes("4 Punkt"), await drawStatus());

  await page.locator("#finishDrawBtn").click();
  await page.waitForTimeout(300);

  check("Erfolgsmeldung nennt die Punktzahl",
    (await editStatus()).includes("4 Punkten erstellt"), await editStatus());
  check("vier Dockpunkte sind gezeichnet",
    (await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()) === 4,
    String(await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()));

  /* ---------------------------------------------------------------- */
  console.log("Enter mit nur einem Punkt");
  await load(syntheticMap());

  await page.locator("#createDockBtn").click();
  await page.waitForTimeout(200);
  await clickMap(5, 5);

  check("Abschluss-Button bleibt bei einem Punkt gesperrt",
    await page.locator("#finishDrawBtn").isDisabled());

  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);

  check("Enter beendet die Zeichnung nicht",
    (await drawStatus()).includes("1 Punkt"), await drawStatus());

  /*
   * Diese Zusicherung muss die WIRKUNG belegen, nicht ihr Ausbleiben.
   *
   * Vorher stand hier nur, dass die Meldung "mindestens 2" enthält - das tat
   * auch die Startmeldung "Docking-Pfad: mindestens 2 Punkte anklicken",
   * die ohnehin noch stand. Der Test bestand deshalb, obwohl Enter für den
   * Dockpfad gar nichts tat: der Tastaturpfad zählte die Modi einzeln auf und
   * kannte "dock" nicht. Gefunden hat es der Nutzer, nicht der Test.
   *
   * "benötigt mindestens 2" kommt ausschließlich aus der Ablehnung von
   * finishFeatureDrawing() und beweist damit, dass Enter angekommen ist.
   */
  check("Enter wird verarbeitet und lehnt begründet ab",
    (await editStatus()).includes("benötigt mindestens 2"), await editStatus());

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  console.log("Enter schließt den Dockpfad ab");
  await load(syntheticMap());

  await page.locator("#createDockBtn").click();
  await page.waitForTimeout(200);
  await clickMap(5, 5);
  await clickMap(10, 5);
  await clickMap(15, 5);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);

  check("die Zeichnung ist beendet",
    (await drawStatus()).includes("Kein Zeichenwerkzeug aktiv") ||
    !(await page.locator("#finishDrawBtn").isEnabled()),
    await drawStatus());
  check("das Feature ist entstanden",
    (await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()) === 3,
    String(await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()));
  check("die Erfolgsmeldung nennt die Punktzahl",
    (await editStatus()).includes("3 Punkten erstellt"), await editStatus());

  /* ---------------------------------------------------------------- */
  console.log("Verlängern");
  await load(syntheticMap([[5, 5], [10, 5], [15, 5]]));

  check("Verlängern ist freigegeben",
    await page.locator("#extendDockBtn").isEnabled());

  await page.locator("#extendDockBtn").click();
  await page.waitForTimeout(200);
  await clickMap(20, 5);
  await clickMap(25, 5);
  await page.locator("#finishDrawBtn").click();
  await page.waitForTimeout(300);

  check("Meldung bestätigt das Verlängern",
    (await editStatus()).includes("verlängert"), await editStatus());
  check("fünf Dockpunkte nach dem Verlängern",
    (await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()) === 5,
    String(await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()));

  /*
   * Ein Verlängern-Vorgang ist ein Undo-Schritt, auch wenn dabei mehrere
   * Punkte angehängt wurden: waehrend des Zeichnens wird nur der
   * Zeichenzustand veraendert, die Karte erst beim Abschluss.
   */
  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  check("ein Undo nimmt das ganze Verlängern zurück",
    (await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()) === 3,
    String(await page.locator('#vertexGroup circle[data-layer="dockpoints"]').count()));

  /* ---------------------------------------------------------------- */
  console.log("Einzelne Punkte löschen, Untergrenze 2");
  await load(syntheticMap([[5, 5], [10, 5], [15, 5]]));

  const dockMarkers = page.locator('#vertexGroup circle[data-layer="dockpoints"]');

  await dockMarkers.nth(2).click();
  await page.waitForTimeout(150);
  await page.locator("#deleteMultiSelectionBtn").click();
  await page.waitForTimeout(300);

  check("ein einzelner Dockpunkt lässt sich löschen",
    (await dockMarkers.count()) === 2, String(await dockMarkers.count()));

  await dockMarkers.nth(1).click();
  await page.waitForTimeout(150);
  await page.locator("#deleteMultiSelectionBtn").click();
  await page.waitForTimeout(300);

  check("bei 2 Punkten greift die Untergrenze",
    (await dockMarkers.count()) === 2, String(await dockMarkers.count()));
  check("die Untergrenze wird gemeldet",
    (await page.locator("#multiSelectionStatus").textContent()).includes("weniger als 2"),
    await page.locator("#multiSelectionStatus").textContent());

  /* ---------------------------------------------------------------- */
  console.log("Begradigen ist auf dem Dockpfad freigegeben");
  await load(syntheticMap([[0, 0], [10, 6], [20, -4], [30, 8], [40, 0]]));

  const marks = page.locator('#vertexGroup circle[data-layer="dockpoints"]');
  await marks.nth(0).click();
  await page.waitForTimeout(150);
  await marks.nth(4).click({ modifiers: ["Control"] });
  await page.waitForTimeout(200);

  check("Begradigen ist nicht mehr gesperrt",
    await page.locator("#straightenSelectionBtn").isEnabled(),
    await page.locator("#straightenSelectionBtn").getAttribute("title"));

  /* ---------------------------------------------------------------- */
  console.log("Bestehende 3-Punkte-Karte verhält sich unverändert");
  const classicDock = [[5, 5], [10, 5], [15, 5]];
  await load(syntheticMap(classicDock));

  /*
   * Geprüft wird die WIRKUNG, nicht das Ausbleiben: die alte Fassung sicherte
   * allein zu, dass "Docking-Pfad 1:" NICHT im Bericht steht - das bestünde
   * auch bei leerem Bericht und damit auch dann, wenn der Klick nichts
   * ausgelöst hätte. Die Zusammenfassung entsteht erst durch einen Lauf.
   */
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);

  const summary = (await page.locator("#validationSummary").textContent()).trim();
  const report = await page.locator("#validationReport").textContent();

  check("die Kartenprüfung ist wirklich gelaufen und meldet null Fehler",
    /^(Prüfung OK|Keine Fehler)/.test(summary), summary);
  check("drei Punkte erzeugen keinen Docking-Befund",
    !report.includes("Docking-Pfad 1:"), report.slice(0, 240));

  /* Ein anderes Feature bearbeiten und speichern. */
  await page.locator('#vertexGroup circle[data-layer="perimeter"]').nth(0).click();
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);

  const pendingExport = page
    .waitForEvent("download", { timeout: 5000 })
    .catch(() => null);

  await menueBefehl("Datei", "GeoJSON speichern");
  const exportEvent = await pendingExport;

  check("Speichern funktioniert", !!exportEvent);

  if (exportEvent) {
    const stream = await exportEvent.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const saved = JSON.parse(Buffer.concat(chunks).toString());

    const dock = saved.features.find(
      (item) => item.properties?.name === "dockpoints"
    );

    check("Docking-Pfad ist im Export vorhanden", !!dock);
    check("Docking-Pfad ist unverändert",
      dock &&
      JSON.stringify(dock.geometry.coordinates) ===
      JSON.stringify(classicDock.map(([e, n]) => [e / SCALE, n / SCALE])),
      dock ? JSON.stringify(dock.geometry.coordinates) : "fehlt");
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Docking-Pfad akzeptiert beliebige Punktzahlen ab 2.");
