#!/usr/bin/env node
// Browsertest für das Verbinden zweier Karten.
//
// Zwei Dinge werden geprüft:
//
// 1. Dass die Kartenprüfung und der Export ausschliesslich den aktiven Slot
//    sehen. Wären die Slots nicht sauber getrennt, wäre auch der Export
//    betroffen - das wäre der ernstere Fehler.
// 2. Dass das Merge-Ergebnis die Singleton-Features nicht verdoppelt.
//    Docking-Pfad und Search Wire darf es pro Karte nur einmal geben;
//    Exclusions werden dagegen übernommen und neu nummeriert.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-merge.mjs

import {
  createChecker,
  indexUrl,
  launchBrowser,
  elementGetroffen,
  menueBefehl,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-merge";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

const DEG = 111111;
const rel = ([east, north]) => [east / DEG, north / DEG];

/**
 * Karte mit Perimeter, einer Exclusion und je einem Platzhalter für
 * Docking-Pfad und Search Wire - genau die Ausgangslage, in der der Fehler
 * unsichtbar bleibt, weil beide Platzhalter leer sind.
 */
function mapWith(offsetEast, dockPoints = [], wirePoints = []) {
  const o = offsetEast;

  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [o, 0], [o + 40, 0], [o + 40, 40], [o, 40], [o, 0],
        ].map(rel)] },
      },
      {
        type: "Feature",
        idx: 0,
        properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [[
          [o + 10, 10], [o + 20, 10], [o + 20, 20], [o + 10, 20], [o + 10, 10],
        ].map(rel)] },
      },
      {
        type: "Feature",
        properties: { name: "dockpoints" },
        geometry: { type: "LineString", coordinates: dockPoints.map(rel) },
      },
      {
        type: "Feature",
        properties: { name: "search wire" },
        geometry: { type: "LineString", coordinates: wirePoints.map(rel) },
      },
    ],
  });
}

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  /*
   * Ein dauerhafter Handler statt eines pro Aufruf: erscheint ein erwarteter
   * Bestätigungsdialog einmal nicht, bliebe ein once-Handler registriert und
   * kollidierte mit dem nächsten.
   */
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  /*
   * Die Faltgeste kommt aus dem browser-harness. Sie stand bis 3f achtmal
   * kopiert im Bestand - b2s Nachricht zaehlte sie bereits so ("die bisher acht
   * Mal kopierte Faltgeste") und beschrieb openAllFolds() als ihre Buendelung;
   * aufgerufen hat den Helfer danach kein einziger Test.
   */

  /*
   * Die Verbinden-Bedienung liegt seit Etappe 7e in einem Kartenfenster, das
   * ueber das Menue "Karte" aufgeht - vorher stand sie im letzten Abschnitt
   * der Seitenleiste, die mit dieser Etappe entfallen ist. Die fuenf ids sind
   * unveraendert; nur der Weg dorthin ist ein anderer.
   *
   * Das Fenster bleibt offen, bis ein anderes geoeffnet oder Escape gedrueckt
   * wird - einmal oeffnen genuegt also. Es steht unten links und deckt die
   * Karte nur dort ab.
   */
  const openMergeWindow = async () => {
    if (await page.locator("#mergeWindow").isVisible()) return;
    await menueBefehl(page, "Karte", "Karten verbinden…");
    await page.locator("#mergeWindow").waitFor({ state: "visible" });
  };

  await openAllFolds(page);

  await openMergeWindow();

  const upload = async (selector, name, body) => {
    await page.locator(selector).setInputFiles({
      name,
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await openAllFolds(page);
    await openMergeWindow();
  };

  /** Liest die aktive Karte über den Export zurück. */
  const exportActive = async () => {
    const pending = page
      .waitForEvent("download", { timeout: 5000 })
      .catch(() => null);

    await menueBefehl(page, "Datei", "GeoJSON speichern");

    const event = await pending;
    if (!event) return null;

    const stream = await event.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  };

  const countByName = (collection, name) =>
    collection.features.filter((f) => f.properties?.name === name).length;

  /**
   * Zaehlt die Features der AKTIVEN Karte nach Typ - ueber getFeatureType(),
   * also nach derselben Regel, nach der der Editor selbst entscheidet.
   *
   * Die drei Zusicherungen an dieser Stelle fragten frueher den Pruefbericht,
   * ob er schweigt. Ein Bericht schweigt aber auch, wenn er nichts prueft, und
   * zwei leere Platzhalter sehen im Bericht gleich aus, egal wie sie heissen.
   * Gezaehlt wird deshalb das Ergebnis.
   */
  const typen = () =>
    page.evaluate(() => {
      const zaehlung = {};

      for (const feature of data.features) {
        const typ = getFeatureType(feature);
        zaehlung[typ] = (zaehlung[typ] || 0) + 1;
      }

      return zaehlung;
    });

  /* ---------------------------------------------------------------- */
  console.log("Gegenprobe: die Slots sind getrennt");

  await upload("#fileInput", "a.geojson", mapWith(0));
  await upload("#secondFileInput", "b.geojson", mapWith(60));

  /* Karte B ist nach dem Laden aktiv. Zurück auf A. */
  await menueBefehl(page, "Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await openMergeWindow();

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  const reportA = await page.locator("#validationReport").textContent();

  check("der Bericht ist überhaupt gefüllt",
    reportA.trim().length > 0, `${reportA.length} Zeichen`);

  /*
   * Gezaehlt statt befragt: genau ein Perimeter, genau ein Docking-Pfad, und
   * KEIN Feature vom Typ "other" - ein unerkannter Dockpfad aus Karte B
   * landete genau dort und waere im Bericht nicht als Doppelung zu sehen.
   */
  const typenA = await typen();

  check("Karte A hat genau einen Perimeter",
    typenA.perimeter === 1, JSON.stringify(typenA));
  check("Karte A hat genau einen Docking-Pfad",
    typenA.dockpoints === 1, JSON.stringify(typenA));
  check("und kein Feature ohne erkennbaren Typ",
    (typenA.other || 0) === 0, JSON.stringify(typenA));

  const onlyA = await exportActive();
  check("Export der aktiven Karte gelingt", !!onlyA);

  if (onlyA) {
    check("Export enthält nur die vier Features von A",
      onlyA.features.length === 4, String(onlyA.features.length));
    check("Export enthält genau einen Docking-Pfad",
      countByName(onlyA, "dockpoints") === 1, String(countByName(onlyA, "dockpoints")));
    check("Export enthält genau eine Search Wire",
      countByName(onlyA, "search wire") === 1, String(countByName(onlyA, "search wire")));
  }

  /* ---------------------------------------------------------------- */
  console.log("Verbinden verdoppelt keine Singletons");

  await page.locator("#mergeMapsBtn").click();
  await page.waitForTimeout(500);
  await openAllFolds(page);
  await openMergeWindow();

  const merged = await exportActive();
  check("Export des Ergebnisses gelingt", !!merged);

  if (merged) {
    check("genau ein Perimeter",
      countByName(merged, "perimeter") === 1, String(countByName(merged, "perimeter")));
    check("beide Exclusions übernommen",
      countByName(merged, "exclusion") === 2, String(countByName(merged, "exclusion")));
    check("Exclusions neu nummeriert",
      merged.features
        .filter((f) => f.properties?.name === "exclusion")
        .every((f, index) => f.idx === index),
      JSON.stringify(merged.features
        .filter((f) => f.properties?.name === "exclusion")
        .map((f) => f.idx)));

    check("genau ein Docking-Pfad",
      countByName(merged, "dockpoints") === 1, String(countByName(merged, "dockpoints")));
    check("genau eine Search Wire",
      countByName(merged, "search wire") === 1, String(countByName(merged, "search wire")));
  }

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  const reportMerged = await page.locator("#validationReport").textContent();

  check("der Bericht ist auch danach gefüllt",
    reportMerged.trim().length > 0, `${reportMerged.length} Zeichen`);

  /*
   * Dieselbe Zaehlung am Ergebnis. Der Perimeterring muss ausserdem so viele
   * eindeutige Punkte tragen wie A und B zusammen - sonst waere "genau ein
   * Perimeter" auch dann erfuellt, wenn Bs Punkte gar nicht angekommen sind.
   */
  const typenMerged = await typen();

  check("das Ergebnis hat genau einen Perimeter",
    typenMerged.perimeter === 1, JSON.stringify(typenMerged));
  check("genau einen Docking-Pfad und eine Search Wire",
    typenMerged.dockpoints === 1 && typenMerged.searchwire === 1,
    JSON.stringify(typenMerged));
  check("und kein Feature ohne erkennbaren Typ",
    (typenMerged.other || 0) === 0, JSON.stringify(typenMerged));

  check("der Perimeterring trägt die Punkte beider Karten",
    await page.evaluate(() => {
      const ring = data.features.find((f) => getFeatureType(f) === "perimeter")
        .geometry.coordinates[0];

      /* Letzter Punkt ist der technische Ringschluss. */
      return ring.length - 1 === 8;
    }),
    await page.evaluate(() =>
      String(data.features.find((f) => getFeatureType(f) === "perimeter")
        .geometry.coordinates[0].length)));

  /* ---------------------------------------------------------------- */
  console.log("Genau ein befüllter Pfad gewinnt");

  const reset = async (aBody, bBody) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await openAllFolds(page);
    await openMergeWindow();
    await upload("#fileInput", "a.geojson", aBody);
    await upload("#secondFileInput", "b.geojson", bBody);
    await menueBefehl(page, "Karte", "Karte A");
    await page.waitForTimeout(250);
    await openAllFolds(page);
    await openMergeWindow();
  };

  /* Nur Karte B hat einen echten Docking-Pfad. */
  await reset(mapWith(0), mapWith(60, [[70, 5], [75, 5], [80, 5]]));

  check("Verbinden ist möglich", await page.locator("#mergeMapsBtn").isEnabled());

  await page.locator("#mergeMapsBtn").click();
  await page.waitForTimeout(500);
  await openAllFolds(page);
  await openMergeWindow();

  const fromB = await exportActive();
  check("Export gelingt", !!fromB);

  if (fromB) {
    check("genau ein Docking-Pfad",
      countByName(fromB, "dockpoints") === 1, String(countByName(fromB, "dockpoints")));

    const dock = fromB.features.find((f) => f.properties?.name === "dockpoints");
    check("der befüllte Pfad aus Karte B hat gewonnen",
      dock?.geometry?.coordinates?.length === 3,
      JSON.stringify(dock?.geometry?.coordinates?.length));
  }

  /* ---------------------------------------------------------------- */
  console.log("Zwei befüllte Pfade sind ein Konflikt");

  await reset(
    mapWith(0, [[5, 5], [10, 5], [15, 5]]),
    mapWith(60, [[70, 5], [75, 5], [80, 5]])
  );

  check("Verbinden ist gesperrt", await page.locator("#mergeMapsBtn").isDisabled());

  const mergeStatus = await page.locator("#mergeStatus").textContent();
  check("der Grund wird genannt",
    mergeStatus.includes("Docking-Pfad") && mergeStatus.includes("löschen"),
    mergeStatus);

  /* Nach dem Löschen eines Pfades muss es wieder gehen. */
  await page.locator("#deleteDockBtn").click();
  await page.waitForTimeout(400);
  await openAllFolds(page);
  await openMergeWindow();

  check("nach dem Löschen wieder freigegeben",
    await page.locator("#mergeMapsBtn").isEnabled(),
    await page.locator("#mergeStatus").textContent());

  /* ---------------------------------------------------------------- */
  console.log("Eine Linie ohne erkennbaren Typ wird angehängt UND genannt");

  /*
   * Der positive Gegenfall. Ohne ihn bestuenden die Zaehlungen oben auch
   * dann, wenn der Editor unerkannte Linien stillschweigend wegwuerfe - und
   * genau das soll er NICHT tun.
   *
   * Karte B traegt hier einen Docking-Pfad, dessen Name nicht zu den sechs
   * bekannten Schreibweisen gehoert. getFeatureType() liefert dafuer "other",
   * der Merge haengt ihn an (Wegwerfen waere schlimmer als Verdoppeln) - und
   * muss das sagen.
   */
  const mitUnbenanntemDock = JSON.parse(mapWith(60));
  mitUnbenanntemDock.features.push({
    type: "Feature",
    properties: { name: "dockingpfad" },
    geometry: { type: "LineString", coordinates: [] },
  });

  await reset(mapWith(0), JSON.stringify(mitUnbenanntemDock));

  const vorher = await typen();
  check("Karte A hat vorher kein Feature ohne erkennbaren Typ",
    (vorher.other || 0) === 0, JSON.stringify(vorher));

  check("Verbinden ist möglich", await page.locator("#mergeMapsBtn").isEnabled());

  await page.locator("#mergeMapsBtn").click();
  await page.waitForTimeout(600);
  await openAllFolds(page);
  await openMergeWindow();

  const nachher = await typen();

  check("die unerkannte Linie ist im Ergebnis angekommen",
    (nachher.other || 0) === 1, JSON.stringify(nachher));
  check("und hat den echten Docking-Pfad nicht verdrängt",
    nachher.dockpoints === 1, JSON.stringify(nachher));

  /*
   * Die Wirkung, um die es geht: der Zuwachs wird GENANNT. Ein stiller
   * Zuwachs ist der Fehler, nicht der Zuwachs selbst.
   */
  const meldung = await page.locator("#editStatus").textContent();

  check("die Meldung nennt die unerkannte Linie",
    meldung.includes("ohne erkennbaren Typ") && meldung.includes("dockingpfad"),
    meldung);

  /* ---------------------------------------------------------------- */
  console.log("Das Fenster ist in jeder Fenstergroesse wirklich getroffen");

  /*
   * Nicht getComputedStyle, sondern die Trefferpruefung: display beantwortet
   * "will sichtbar sein", elementFromPoint "ist sichtbar". Ueber dem Fenster
   * liegt .viewer mit overflow:hidden - ein Fenster, das ueber die
   * Kartenflaeche hinausragt, waere gerechnet da und trotzdem nicht bedienbar.
   * Genau so waren in Etappe 6 alle Menuetests gruen, waehrend das Menue
   * unsichtbar war.
   */
  for (const [breite, hoehe] of [[1920, 1080], [1440, 900], [1280, 800], [400, 800]]) {
    await page.setViewportSize({ width: breite, height: hoehe });
    await page.waitForTimeout(250);

    /*
     * In JEDER Groesse neu oeffnen, nicht nur wenn zu: openMapWindow() setzt
     * den Fokus in das Fenster, und erst der bringt es auf einem Telefon in
     * den Blick - dort scrollt die Seite, und die Karte samt Fenster steht
     * unterhalb von Menue und Werkzeugleiste. Ohne das Neuoeffnen prueft man
     * bei 400 px eine Stelle, an der der Browser gar nichts zeichnet.
     */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await menueBefehl(page, "Karte", "Karten verbinden…");
    await page.locator("#mergeWindow").waitFor({ state: "visible" });
    await page.waitForTimeout(200);

    const treffer = await elementGetroffen(page, "#mergeWindow");
    check(`Fenster ist bei ${breite}x${hoehe} getroffen`,
      treffer.ok, JSON.stringify(treffer));
    check(`und der Verbinden-Knopf ist bei ${breite}x${hoehe} sichtbar`,
      await page.locator("#mergeMapsBtn").isVisible());
  }

  /*
   * Escape schliesst und gibt den Fokus an den Menueeintrag zurueck - dieselbe
   * Zusicherung, die die beiden anderen Kartenfenster tragen.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  check("Escape schliesst das Fenster",
    !(await page.locator("#mergeWindow").isVisible()));
  /*
   * Der Fokus geht an den Menuetitel, nicht an den Eintrag selbst: der Eintrag
   * ist bei geschlossenem Menue unsichtbar, und focusVisibleOpener() weicht
   * dann bewusst auf ".menu-title" aus. Ein Fokus auf einem unsichtbaren
   * Element waere fuer die Tastatur eine Sackgasse.
   */
  check("und der Fokus steht auf dem Menue, das den Eintrag traegt",
    (await page.evaluate(() => document.activeElement?.id)) === "menuMapBtn",
    await page.evaluate(() => document.activeElement?.id));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Verbinden übernimmt Exclusions und hält Singletons einfach.");
