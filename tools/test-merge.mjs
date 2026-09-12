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
  createKlicker,
  createMenueBefehl,
  elementGetroffen,
  indexUrl,
  launchBrowser,
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
  const menueBefehl = createMenueBefehl(page, check);
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
    await menueBefehl("Karte", "Karten verbinden…");
    await page.locator("#mergeWindow").waitFor({ state: "visible" });
  };

  await openAllFolds(page);

  await openMergeWindow();

  /**
   * Klickt einen Knopf, der gesperrt sein KANN - und sichert vorher benannt
   * zu, dass er frei ist.
   *
   * Der Klick unterbleibt, wenn der Knopf gesperrt ist. Ohne das wird aus
   * einer klaren, benannten Ablehnung ein stummer Timeout: Playwright wartet
   * dreissig Sekunden auf einen Knopf, der nie frei wird, und der Lauf bricht
   * ab, statt zu sagen, welche Zusicherung gerissen ist. Gemessen an der
   * Mutation "Klickreihenfolge statt min/max": mit blosser Zusicherung riss
   * die Zusicherung zwar, der Lauf endete danach trotzdem im Abbruch.
   *
   * Ein Helfer, nicht dreizehn Kopien - dieselbe Regel wie bei openAllFolds().
   */
  /* Der Helfer liegt seit dem vierten Durchgang im Harness - eine Stelle
     statt einer Kopie je Test. Verhalten unveraendert. */
  const klickeFreienKnopf = createKlicker(page, check);

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

    await menueBefehl("Datei", "GeoJSON speichern");

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
  await menueBefehl("Karte", "Karte A");
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

  await klickeFreienKnopf("#mergeMapsBtn",
    "Verbinden ist mit zwei geladenen Karten frei", "#mergeStatus");
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
    await menueBefehl("Karte", "Karte A");
    await page.waitForTimeout(250);
    await openAllFolds(page);
    await openMergeWindow();
  };

  /* Nur Karte B hat einen echten Docking-Pfad. */
  await reset(mapWith(0), mapWith(60, [[70, 5], [75, 5], [80, 5]]));

  await klickeFreienKnopf("#mergeMapsBtn", "Verbinden ist möglich",
    "#mergeStatus");
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
  await klickeFreienKnopf("#deleteDockBtn",
    "Docking-Pfad löschen ist bei vorhandenem Pfad frei");
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

  await klickeFreienKnopf("#mergeMapsBtn",
    "Verbinden ist möglich", "#mergeStatus");
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
  console.log("Auftrennstelle: setzen, ueberschreiben, zuruecknehmen");

  /*
   * Bis hierher hat kein einziger Test dieses Verzeichnisses je einen Start-
   * oder Endpunkt gesetzt - saemtliche Merge-Zusicherungen liefen gegen die
   * Reihenfolge, die zufaellig in der Datei stand. Genau deshalb konnte die
   * stille Ueberschreibung durch die beiden Punktknoepfe beliebig lange
   * bestehen: die Fuehrung war nie geprueft.
   *
   * Geprueft wird ausschliesslich die SICHTBARE Wirkung - der Text in
   * #mergeAInfo / #mergeBInfo und in #mergeStatus -, nie slot.cutEdgeChosen
   * oder eine andere interne Groesse. Die Marke ist ein Speicherdetail; wie
   * sie dargestellt wird, kann sich aendern, ohne dass diese Zusicherungen
   * etwas anderes bedeuten sollen.
   */

  /** Nackte Karte fuer die Auftrennstelle - Punktfolge von Hand nachrechenbar. */
  const cutMap = (ring, exclusion = null) => JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]].map(rel)] },
      },
      ...(exclusion ? [{
        type: "Feature",
        idx: 0,
        properties: { name: "exclusion" },
        geometry: {
          type: "Polygon",
          coordinates: [[...exclusion, exclusion[0]].map(rel)],
        },
      }] : []),
      /* Leere Platzhalter, sonst spraeche der Singleton-Konflikt gegen das Verbinden. */
      { type: "Feature", properties: { name: "dockpoints" },
        geometry: { type: "LineString", coordinates: [] } },
      { type: "Feature", properties: { name: "search wire" },
        geometry: { type: "LineString", coordinates: [] } },
    ],
  });

  const RING_A = [[0, 0], [40, 0], [40, 40], [0, 40]];
  const EXCLUSION_A = [[10, 10], [20, 10], [20, 20], [10, 20]];
  const RING_B = [[-20, 40], [-60, 40], [-60, 0], [-20, 0]];
  const RING_B_GEDREHT = [[-20, 0], [-60, 0], [-60, 40], [-20, 40]];

  /**
   * Die Punktfolge des Perimeters als Zeichenkette, im Format der Anzeige.
   *
   * Verglichen wird die WELTkoordinate mit toFixed(2), nicht der Rohwert aus
   * der Datei: 40 / 111111 * 111111 ist in Gleitkomma nicht zwingend wieder
   * genau 40. Das Ergebnis ist trotzdem ein exakter Zeichenkettenvergleich -
   * keine Toleranz, nur dieselbe Rundung, die der Nutzer auch sieht.
   */
  const perimeterFolge = () => page.evaluate(() => {
    const feature = data.features.find((f) => getFeatureType(f) === "perimeter");
    const ring = feature.geometry.coordinates[0];

    /* Der letzte Eintrag ist der technische Ringschluss, kein eigener Punkt. */
    return ring.slice(0, -1)
      .map((point) => {
        const [east, north] = toWorld(point);
        return `${east.toFixed(2)}/${north.toFixed(2)}`;
      })
      .join(" ");
  });

  const folge = (punkte) =>
    punkte.map(([e, n]) => `${e.toFixed(2)}/${n.toFixed(2)}`).join(" ");

  const mergeText = async (selector) =>
    (await page.locator(selector).innerText()).replace(/\s+/g, " ").trim();

  /**
   * Findet den Punktmarker ueber seine KOORDINATE, nicht ueber seinen Index.
   *
   * Der Index ist genau die Groesse, die das Auftrennen veraendert - ein Test,
   * der Punkte ueber Indizes anspricht, waehlt nach jeder Drehung etwas
   * anderes aus und merkt es nicht. Die Marker tragen ihre Weltlage in cx/cy,
   * wobei cy nach unten zeigt und deshalb das negative North ist.
   */
  const markerSchluessel = ([east, north], layer = "perimeter") =>
    page.evaluate(([e, n, ebene]) => {
      const treffer = [...document.querySelectorAll("circle.vertex")].filter(
        (circle) =>
          circle.dataset.layer === ebene &&
          Math.abs(Number(circle.getAttribute("cx")) - e) < 0.005 &&
          Math.abs(Number(circle.getAttribute("cy")) + n) < 0.005
      );

      /*
       * ?? null, nicht einfach zurueckgeben: fehlt das Attribut, liefert
       * dataset.vertexKey UNDEFINED, und eine Pruefung auf null greift dann
       * nicht. Der Selektor trueege dann data-vertex-key="undefined" und
       * liefe in einen Timeout - gemessen im vierten Durchgang.
       */
      return treffer.length === 1 ? treffer[0].dataset.vertexKey ?? null : null;
    }, [east, north, layer]);

  /**
   * Auswahl aufheben und neu setzen.
   *
   * Zweimal Escape: das erste schliesst das Verbinden-Fenster, das zweite hebt
   * die Auswahl auf. Ein Klick auf einen BEREITS markierten Punkt hebt die
   * Gruppe naemlich nicht auf - sie bleibt bestehen, damit man sie ziehen kann.
   * Wer das uebersieht, waehlt beim zweiten Paar drei Punkte aus und bekommt
   * einen Ablehnungsgrund, der wie ein Fehler des Knopfes aussieht.
   *
   * Das Fenster muss dabei ohnehin zu sein: es steht unten links ueber der
   * Karte, und ein Marker darunter ist nicht anklickbar.
   */
  const waehlePunkte = async (koordinaten, layer = "perimeter") => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const vorher = (await page.locator("#multiSelectionInfo").innerText()).trim();

    check(`Vorbedingung: die Auswahl ist leer (${koordinaten.length} ${layer})`,
      vorher.startsWith("0"),
      `#multiSelectionInfo meldet "${vorher}" statt "0 ausgewaehlt" - zwei ` +
      `Escape haben die vorige Auswahl nicht aufgehoben`);

    let ersterKlick = true;

    for (const koordinate of koordinaten) {
      const schluessel = await markerSchluessel(koordinate, layer);

      check(`Marker ${layer} bei E ${koordinate[0]} / N ${koordinate[1]} ist eindeutig`,
        schluessel !== null,
        "kein oder mehr als ein Marker an dieser Stelle");

      /* Ohne Schluessel kein Klick: der Selektor traefe nichts, und aus der
         Zusicherung oben wuerde ein Timeout. */
      if (!schluessel) return;

      await page.locator(`circle.vertex[data-vertex-key="${schluessel}"]`).click(
        ersterKlick ? {} : { modifiers: ["Control"] }
      );
      ersterKlick = false;
    }

    await page.waitForTimeout(250);
  };

  const A_UNGESETZT =
    "Karte A Auftrennstelle aus der Datei. " +
    "Startpunkt E 0,00 / N 0,00 m Endpunkt E 0,00 / N 40,00 m";

  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));

  check("Vorlage: Karte A steht auf der Dateireihenfolge",
    (await perimeterFolge()) === folge(RING_A), await perimeterFolge());
  check("und der Infoblock nennt die Reihenfolge aus der Datei",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT,
    await mergeText("#mergeAInfo"));

  /* --- 1. Setzen, und das Ergebnis zaehlen ------------------------- */

  await waehlePunkte([[0, 0], [40, 0]]);
  await openMergeWindow();

  await klickeFreienKnopf("#setMergeCutBtn",
    "Auftrennstelle: der Knopf ist bei zwei benachbarten Punkten frei",
    "#mergeCutReason");
  await page.waitForTimeout(400);
  await openMergeWindow();

  const A_GESETZT =
    "Karte A Auftrennstelle gewählt. " +
    "Startpunkt E 40,00 / N 0,00 m Endpunkt E 0,00 / N 0,00 m";

  check("der Ring steht danach auf [40,0] und traegt dieselben vier Punkte",
    (await perimeterFolge()) === folge([[40, 0], [40, 40], [0, 40], [0, 0]]),
    await perimeterFolge());
  check("der Infoblock nennt die gewaehlte Stelle mit beiden Punkten",
    (await mergeText("#mergeAInfo")) === A_GESETZT,
    await mergeText("#mergeAInfo"));

  const infoGetroffen = await elementGetroffen(page, "#mergeAInfo");
  check("und der Infoblock ist wirklich getroffen, nicht nur gerechnet da",
    infoGetroffen.ok, JSON.stringify(infoGetroffen));

  /* --- Schritt 3: der Punkt unter der Maehervorschau bleibt greifbar --- */

  /*
   * Nach dem Auftrennen sind Start- und Endpunkt ausgewaehlt, und der Maeher
   * steht auf dem Hauptpunkt. Bis Schritt 3 ERSETZTE die Vorschau dessen
   * Marker: er fehlte im SVG, `elementFromPoint()` lieferte an seiner Stelle
   * den Richtungspfeil des Maehers, und ein Klick dorthin aenderte die
   * Auswahl nicht - der Punkt war nicht mehr zu greifen.
   *
   * Seitdem bleibt der Marker stehen und traegt nur keinen Auswahlring mehr.
   * Zugesichert wird die WIRKUNG: so viele Marker wie Ringpunkte, der Marker
   * ist wirklich getroffen, und ein Zug an ihm verschiebt den Punkt.
   */
  /*
   * EIN Escape: es schliesst das Verbinden-Fenster und laesst die Auswahl
   * stehen. Das Fenster liegt unten links ueber der Karte und verdeckt genau
   * den Marker bei E 0 / N 0 - nachgemessen, elementFromPoint() lieferte dort
   * "mergeMapsBtn". Das ist eine Eigenheit des Testaufbaus, kein Befund ueber
   * den Marker.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  const maeherAn = await page.evaluate(() =>
    document.getElementById("showMowerPreview").checked);
  check("Vorbedingung: die Maehervorschau ist an",
    maeherAn, "showMowerPreview ist nicht angekreuzt");

  check("nach dem Auftrennen stehen so viele Marker wie Ringpunkte",
    (await page.locator('#vertexGroup circle[data-layer="perimeter"]').count()) === 4,
    String(await page.locator('#vertexGroup circle[data-layer="perimeter"]').count()));

  const endSchluessel = await markerSchluessel([0, 0]);
  check("der Endpunkt hat wieder einen eigenen Marker",
    endSchluessel !== null, "kein oder mehr als ein Marker bei E 0 / N 0");

  const endGetroffen = await elementGetroffen(
    page, `circle.vertex[data-vertex-key="${endSchluessel}"]`, { dy: 5 });
  check("und er ist wirklich getroffen, nicht vom Maeher verdeckt",
    endGetroffen.ok, JSON.stringify(endGetroffen));

  /*
   * Die Farbregel bleibt: gelber Auswahlring und gelber Maeher stehen nie am
   * selben Punkt. Der Marker unter dem Maeher traegt deshalb keine Klasse
   * "selected" - gemessen wird die Zahl der gelben Ringe, nicht die Klasse
   * eines einzelnen Markers.
   */
  check("mit Maeher steht null gelber Auswahlring",
    (await page.locator("#vertexGroup circle.selected").count()) === 0,
    String(await page.locator("#vertexGroup circle.selected").count()));

  await page.evaluate(() => {
    const box = document.getElementById("showMowerPreview");
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  check("ohne Maeher genau einer",
    (await page.locator("#vertexGroup circle.selected").count()) === 1,
    String(await page.locator("#vertexGroup circle.selected").count()));
  check("und die Markerzahl bleibt dieselbe",
    (await page.locator('#vertexGroup circle[data-layer="perimeter"]').count()) === 4,
    String(await page.locator('#vertexGroup circle[data-layer="perimeter"]').count()));

  await page.evaluate(() => {
    const box = document.getElementById("showMowerPreview");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  /*
   * Ziehen: die Auswahl haelt beide Endpunkte, ein Zug an einem Marker
   * verschiebt die ganze Gruppe. Geprueft wird die Koordinate DANACH - ohne
   * greifbaren Marker faende Playwright das Element nicht einmal.
   *
   * Der Abschnitt laeuft nur, wenn es den Schluessel WIRKLICH gibt. Fehlte er,
   * entstuende der Selektor circle.vertex[data-vertex-key="null"], und
   * boundingBox() wartete dreissig Sekunden auf ein Element, das es nicht gibt
   * - aus der klaren Aussage der Zusicherung oben wuerde ein stummer Abbruch.
   * Das ist derselbe Fall wie "die Zusicherung allein genuegt nicht - der Klick
   * muss unterbleiben", nur mit boundingBox() statt einem Klick.
   */
  if (endSchluessel) {
    const ringVorher = await perimeterFolge();
    const endBox = await page.locator(
      `circle.vertex[data-vertex-key="${endSchluessel}"]`).boundingBox();

    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(endBox.x + endBox.width / 2 + 40,
      endBox.y + endBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    check("ein Zug am Endpunkt-Marker verschiebt ihn wirklich",
      (await perimeterFolge()) !== ringVorher,
      `${ringVorher} -> ${await perimeterFolge()}`);
  }

  /* Dieselbe Kante, umgekehrt angeklickt. */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));
  await waehlePunkte([[40, 0], [0, 0]]);
  await openMergeWindow();
  await klickeFreienKnopf("#setMergeCutBtn",
    "umgekehrte Klickreihenfolge: der Knopf ist frei", "#mergeCutReason");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("die umgekehrte Klickreihenfolge liefert denselben Ring",
    (await perimeterFolge()) === folge([[40, 0], [40, 40], [0, 40], [0, 0]]),
    await perimeterFolge());
  check("und denselben Infotext",
    (await mergeText("#mergeAInfo")) === A_GESETZT,
    await mergeText("#mergeAInfo"));

  /* --- 2. Die Schlusskante ----------------------------------------- */

  /*
   * Die Kante vom letzten zum ersten Punkt ist der Fall, in dem sich die
   * Reihenfolge NICHT aendert - eine frisch geladene Datei ist dort ohnehin
   * schon aufgetrennt. Genau deshalb traegt hier allein der Infotext die
   * Zusicherung: ein Ringvergleich wuerde auch bestehen, wenn der Knopf gar
   * nichts getan haette.
   */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));
  await waehlePunkte([[0, 40], [0, 0]]);
  await openMergeWindow();

  await klickeFreienKnopf("#setMergeCutBtn",
    "Schlusskante: der Knopf ist frei", "#mergeCutReason");
  await page.waitForTimeout(400);
  await openMergeWindow();

  const A_SCHLUSSKANTE =
    "Karte A Auftrennstelle gewählt. " +
    "Startpunkt E 0,00 / N 0,00 m Endpunkt E 0,00 / N 40,00 m";

  check("Schlusskante: der Ring bleibt unveraendert",
    (await perimeterFolge()) === folge(RING_A), await perimeterFolge());
  check("und trotzdem wechselt der Infotext von der Datei auf die Wahl",
    (await mergeText("#mergeAInfo")) === A_SCHLUSSKANTE,
    await mergeText("#mergeAInfo"));

  /* --- 6. Undo ----------------------------------------------------- */

  /*
   * Der Schlusskanten-Fall isoliert die Marke: die Geometrie ist vor und nach
   * dem Undo dieselbe, es kann also nur der Infotext zurueckspringen. Gelingt
   * das, reist die Marke im Snapshot mit - ohne diese Zusicherung stuende die
   * Behauptung "cloneMapSlot() klont tief" ungeprueft da.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("Undo im Schlusskanten-Fall: der Ring ist unveraendert",
    (await perimeterFolge()) === folge(RING_A), await perimeterFolge());
  check("und allein der Infotext springt auf die Dateireihenfolge zurueck",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT,
    await mergeText("#mergeAInfo"));

  /* Und im Drehfall zurueck: Ring UND Infotext. */
  await waehlePunkte([[0, 0], [40, 0]]);
  await openMergeWindow();
  await klickeFreienKnopf("#setMergeCutBtn",
    "Drehfall: der Knopf ist frei", "#mergeCutReason");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("Undo im Drehfall: der Ring steht wieder auf der Dateireihenfolge",
    (await perimeterFolge()) === folge(RING_A), await perimeterFolge());
  check("und der Infotext ebenfalls",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT,
    await mergeText("#mergeAInfo"));

  /* --- 3. Die Ueberschreibung durch die beiden alten Knoepfe -------- */

  /*
   * "Ende E setzen" ist identisch mit "Start E+1 setzen" - beide Knoepfe
   * loesen dieselbe Drehung aus. Wer sie nacheinander benutzt, loescht die
   * erste Wahl, und NICHTS meldet das: beide geben dieselbe Erfolgsmeldung
   * aus. Der Zwischenstand wird deshalb mitgeprueft, sonst bewiese der
   * Endstand nicht, dass ueberhaupt zweimal gedreht wurde.
   */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));

  await waehlePunkte([[40, 0]]);
  await openAllFolds(page);
  await klickeFreienKnopf("#setStartPointBtn",
    "Startpunkt setzen ist bei genau einem Punkt frei");
  await page.waitForTimeout(400);

  check("Startpunkt setzen dreht den Ring auf [40,0]",
    (await perimeterFolge()) === folge([[40, 0], [40, 40], [0, 40], [0, 0]]),
    await perimeterFolge());

  /*
   * Die ERSTE Geste ersetzt nichts und meldet deshalb den gewoehnlichen
   * Erfolgstext - woertlich, damit die Zusicherung auch dann reisst, wenn die
   * Ersetzungsmeldung faelschlich immer erschiene.
   */
  check("die erste Geste meldet den gewoehnlichen Erfolgstext",
    (await page.locator("#editStatus").innerText()).replace(/\s+/g, " ").trim() ===
      "Neuer Startpunkt gesetzt. Punkte neu nummeriert: Start = 1, Ende = 4. Polygon geschlossen.",
    await page.locator("#editStatus").innerText());

  /*
   * Auch die beiden alten Knoepfe setzen die Auftrennstelle - sie heissen nur
   * anders. Ohne diese Zusicherung bliebe unbemerkt, wenn einer von beiden die
   * Marke nicht mehr setzte: der Ring drehte sich weiter richtig, und der
   * Infoblock behauptete weiter die Dateireihenfolge.
   */
  await openMergeWindow();

  check("Startpunkt setzen nennt die Stelle danach als gewaehlt",
    (await mergeText("#mergeAInfo")) === A_GESETZT,
    await mergeText("#mergeAInfo"));

  await waehlePunkte([[40, 40]]);
  await openAllFolds(page);
  await klickeFreienKnopf("#setEndPointBtn",
    "Endpunkt setzen ist als zweite Geste frei");
  await page.waitForTimeout(400);

  check("Endpunkt setzen ueberschreibt die erste Geste vollstaendig",
    (await perimeterFolge()) === folge([[0, 40], [0, 0], [40, 0], [40, 40]]),
    await perimeterFolge());

  /*
   * Und JETZT sagt die Statuszeile es auch. Bis Etappe 7d-4c gaben beide
   * Knoepfe hier denselben Erfolgstext aus - die stille Ueberschreibung war
   * der Befund, aus dem die ganze Etappe 7d entstanden ist.
   */
  check("die zweite Geste meldet die Ersetzung",
    (await page.locator("#editStatus").innerText()).replace(/\s+/g, " ").trim() ===
      "Die vorher gewählte Auftrennstelle wurde ersetzt.",
    await page.locator("#editStatus").innerText());

  /*
   * Und die Meldung hat eine englische Fassung. Geprueft wird unmittelbar
   * nach dem Umschalten: die Zeile ist eine Einmalmeldung und laeuft ueber
   * setLocalizedText(), das deutsche Original haengt also als data-i18n-de
   * am Element.
   */
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  check("englisch: die Ersetzungsmeldung ist uebersetzt",
    (await page.locator("#editStatus").innerText()).replace(/\s+/g, " ").trim() ===
      "The previously chosen cut edge has been replaced.",
    await page.locator("#editStatus").innerText());

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  /*
   * Der Infoblock nennt nach der zweiten Geste die NEUEN Endpunkte - die
   * Koordinaten der ersten Wahl kommen darin nicht mehr vor. Das ist die
   * Ueberschreibung, von der sichtbaren Seite her gesehen.
   */
  await openMergeWindow();

  check("und der Infoblock nennt danach die Punkte der ZWEITEN Geste",
    (await mergeText("#mergeAInfo")) ===
      "Karte A Auftrennstelle gewählt. " +
      "Startpunkt E 0,00 / N 40,00 m Endpunkt E 40,00 / N 40,00 m",
    await mergeText("#mergeAInfo"));

  /*
   * Der Ende-Knopf als ERSTE Geste - keine Zugabe, sondern die Deckung einer
   * gemessenen Luecke.
   *
   * In der Folge darueber hat der Start-Knopf die Marke bereits gesetzt. Wird
   * die Schreibzeile im Ende-Knopf GELOESCHT, bleibt sie von dort auf true
   * stehen, die Drehung laeuft unveraendert, und die Zusicherung oben besteht
   * weiter - gemessen, die Mutation blieb gruen. Nur ein true -> false reisst
   * sie. Der Ende-Knopf braucht deshalb einen Fall, in dem er als einziger
   * schreibt: frische Datei, Marke ungesetzt.
   */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));
  await openMergeWindow();

  check("Vorbedingung: die Auftrennstelle ist nach dem Laden ungewaehlt",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT,
    await mergeText("#mergeAInfo"));

  await waehlePunkte([[40, 40]]);
  await openAllFolds(page);
  await klickeFreienKnopf("#setEndPointBtn",
    "Endpunkt setzen ist als erste Geste frei");
  await page.waitForTimeout(400);

  check("Endpunkt setzen als erste Geste dreht den Ring hinter den Endpunkt",
    (await perimeterFolge()) === folge([[0, 40], [0, 0], [40, 0], [40, 40]]),
    await perimeterFolge());

  await openMergeWindow();

  check("und der Infoblock wechselt dabei von der Datei auf die Wahl",
    (await mergeText("#mergeAInfo")) ===
      "Karte A Auftrennstelle gewählt. " +
      "Startpunkt E 0,00 / N 40,00 m Endpunkt E 40,00 / N 40,00 m",
    await mergeText("#mergeAInfo"));

  /*
   * Dieselbe Kante noch einmal zu waehlen ist KEINE Ersetzung, sondern eine
   * Bestaetigung - die Statuszeile meldet den gewoehnlichen Erfolgstext.
   * Ohne diesen Fall bestuende die Zusicherung oben auch dann, wenn die
   * Meldung bei jedem Setzen erschiene.
   */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));
  await waehlePunkte([[0, 0], [40, 0]]);
  await openMergeWindow();
  await klickeFreienKnopf("#setMergeCutBtn",
    "dieselbe Kante: der Knopf ist beim ersten Mal frei", "#mergeCutReason");
  await page.waitForTimeout(400);

  const ERFOLG_AUFTRENNEN =
    "Auftrennstelle gesetzt: Der Perimeter wird an der Kante zwischen den " +
    "beiden gewählten Punkten aufgetrennt.";

  check("das erste Setzen meldet den gewoehnlichen Erfolgstext",
    (await page.locator("#editStatus").innerText()).replace(/\s+/g, " ").trim() ===
      ERFOLG_AUFTRENNEN,
    await page.locator("#editStatus").innerText());

  await waehlePunkte([[40, 0], [0, 0]]);
  await openMergeWindow();
  await klickeFreienKnopf("#setMergeCutBtn",
    "dieselbe Kante: der Knopf ist auch beim zweiten Mal frei", "#mergeCutReason");
  await page.waitForTimeout(400);

  check("dieselbe Kante erneut meldet KEINE Ersetzung",
    (await page.locator("#editStatus").innerText()).replace(/\s+/g, " ").trim() ===
      ERFOLG_AUFTRENNEN,
    await page.locator("#editStatus").innerText());

  /* --- 4b. Der Zustand der Auftrennstelle ist ABGELEITET ------------ */

  /*
   * Bis 7d-3 stand im Slot ein Boolean ueber eine vergangene Geste. Es blieb
   * auf true stehen, waehrend eine gewoehnliche Punktbearbeitung die Kante
   * laengst verschoben hatte - der Infoblock behauptete dann "gewaehlt" und
   * nannte Koordinaten, die der Nutzer nie gewaehlt hat. Seit 7d-4a steht
   * dort das Paar, und der Zustand wird bei jedem Aufruf neu verglichen.
   *
   * Geprueft wird ausschliesslich der sichtbare Text, nie slot.cutEdge.
   */
  const A_VERAENDERT = (start, ende) =>
    `Karte A Auftrennstelle seit der Wahl verändert. ` +
    `Startpunkt ${start} Endpunkt ${ende}`;

  /** Auftrennstelle auf der frisch geladenen Karte A setzen. */
  const stelleSetzen = async () => {
    await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));
    await waehlePunkte([[0, 0], [40, 0]]);
    await openMergeWindow();
    await klickeFreienKnopf("#setMergeCutBtn",
      "Vorbedingung: die Auftrennstelle laesst sich setzen", "#mergeCutReason");
    await page.waitForTimeout(400);
    await openMergeWindow();
  };

  /* --- Punkt 0 verschieben --- */
  await stelleSetzen();
  check("Vorbedingung: nach dem Setzen steht 'gewaehlt'",
    (await mergeText("#mergeAInfo")) === A_GESETZT, await mergeText("#mergeAInfo"));

  await waehlePunkte([[40, 0]]);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("Punkt 0 verschieben macht aus 'gewaehlt' ein 'veraendert'",
    (await mergeText("#mergeAInfo")) ===
      A_VERAENDERT("E 40,10 / N 0,00 m", "E 0,00 / N 0,00 m"),
    await mergeText("#mergeAInfo"));

  /*
   * Und das Undo holt die Stelle zurueck - Ring UND Paar. Das ist die
   * Zusicherung, die belegt, dass cutEdge im Snapshot mitreist: vorher gab es
   * dafuer keine, weil die vorhandene Undo-Pruefung die andere Richtung
   * pruefte (ungesetzt -> setzen -> Undo -> ungesetzt), und dort liefert eine
   * verlorene Marke dasselbe Ergebnis wie eine erhaltene.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  await openMergeWindow();

  check("und das Undo holt die Auftrennstelle zurueck",
    (await mergeText("#mergeAInfo")) === A_GESETZT, await mergeText("#mergeAInfo"));

  /* --- Rundlauf: rechts und wieder links --- */
  await waehlePunkte([[40, 0]]);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("ein Rundlauf zurueck auf die Stelle gilt wieder als gewaehlt",
    (await mergeText("#mergeAInfo")) === A_GESETZT, await mergeText("#mergeAInfo"));

  /* --- Punkt 0 loeschen --- */
  await stelleSetzen();
  await waehlePunkte([[40, 0]]);
  await openAllFolds(page);
  await klickeFreienKnopf("#deletePointBtn", "Punkt loeschen ist frei");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("Punkt 0 loeschen macht aus 'gewaehlt' ein 'veraendert'",
    (await mergeText("#mergeAInfo")) ===
      A_VERAENDERT("E 40,00 / N 40,00 m", "E 0,00 / N 0,00 m"),
    await mergeText("#mergeAInfo"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  await openMergeWindow();

  check("und auch danach holt das Undo sie zurueck",
    (await mergeText("#mergeAInfo")) === A_GESETZT, await mergeText("#mergeAInfo"));

  /* --- Punkt hinter dem letzten einfuegen --- */
  await stelleSetzen();
  await waehlePunkte([[0, 0]]);
  await openAllFolds(page);
  await klickeFreienKnopf("#insertPointAfterBtn", "Danach einfuegen ist frei");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("ein Punkt hinter dem letzten macht aus 'gewaehlt' ein 'veraendert'",
    (await mergeText("#mergeAInfo")).startsWith(
      "Karte A Auftrennstelle seit der Wahl verändert."),
    await mergeText("#mergeAInfo"));

  /* --- Laden und Zuruecksetzen: aus der Datei --- */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));
  await openMergeWindow();

  check("eine frisch geladene Karte steht auf 'aus der Datei'",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT, await mergeText("#mergeAInfo"));

  await stelleSetzen();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await menueBefehl("Datei", "Aktive zurücksetzen");
  await page.waitForTimeout(600);
  await openMergeWindow();

  check("Zuruecksetzen vergisst die Auftrennstelle",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT, await mergeText("#mergeAInfo"));

  /* --- Englisch: der mittlere Zustand unmittelbar nach dem Wechsel --- */
  await stelleSetzen();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await waehlePunkte([[40, 0]]);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);

  /*
   * Das Fenster wird VOR dem Sprachwechsel geoeffnet, und zwar aus zwei
   * Gruenden. Erstens heisst das Menue danach "Map" - menueBefehl("Karte",
   * ...) faende es nicht mehr. Zweitens ist es die schaerfere
   * Zusicherung: gemessen wird der Text unmittelbar nach dem Umschalten, ohne
   * jede weitere Handlung, also wirklich auf dem abgeleiteten Weg.
   */
  await openMergeWindow();
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  check("englisch: der mittlere Zustand ist uebersetzt",
    (await mergeText("#mergeAInfo")) ===
      "Map A Cut edge changed since it was chosen. " +
      "Start point E 40.10 / N 0.00 m End point E 0.00 / N 0.00 m",
    await mergeText("#mergeAInfo"));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  /* --- 7. Ablehnung mit Grund -------------------------------------- */

  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A, EXCLUSION_A));

  await waehlePunkte([[0, 0], [40, 40]]);
  await openMergeWindow();

  check("zwei nicht benachbarte Punkte: der Knopf ist gesperrt",
    await page.locator("#setMergeCutBtn").isDisabled());
  check("und der Grund steht sichtbar unter dem Knopf",
    (await page.locator("#mergeCutReason").textContent()).trim() ===
      "Auftrennen: die beiden Punkte müssen benachbart sein – zwischen ihnen liegen weitere.",
    await page.locator("#mergeCutReason").textContent());

  await waehlePunkte([[10, 10], [20, 10]], "exclusion");
  await openMergeWindow();

  check("zwei benachbarte Punkte einer Exclusion: der Knopf ist gesperrt",
    await page.locator("#setMergeCutBtn").isDisabled());
  check("und der Grund nennt den Perimeter",
    (await page.locator("#mergeCutReason").textContent()).trim() ===
      "Auftrennen: aufgetrennt wird der Perimeter, nicht dieses Feature.",
    await page.locator("#mergeCutReason").textContent());

  /* --- 8. Sprache: A geladen, B nicht ------------------------------ */

  /*
   * Gemessen wird OHNE weitere Aktion nach dem Wechsel: die Texte des
   * Fensters entstehen abgeleitet, und updateMergePanel() haengt erst seit
   * Etappe 7d-1 in refreshDerivedUi(). Vorher passierte beim Sprachwechsel an
   * dieser Stelle schlicht nichts - eine Uebersetzungsluecke war deshalb in
   * BEIDEN Sprachen unsichtbar.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await openMergeWindow();

  const T_CUT_DE = "Trennt den Perimeter der aktiven Karte an der Kante zwischen den beiden ausgewählten Punkten auf. Die Geometrie ändert sich dabei nicht, nur die Reihenfolge: der eine Punkt wird Startpunkt, der andere Endpunkt.";
  const T_START_DE = "Dreht den Ring so, dass der ausgewählte Punkt Punkt 1 wird. Startpunkt und Endpunkt sind dieselbe Drehung: „Endpunkt setzen“ auf dem Punkt davor bewirkt genau dasselbe, und die zweite der beiden Gesten überschreibt die erste.";
  const T_END_DE = "Dreht den Ring so, dass der ausgewählte Punkt letzter Punkt wird. Startpunkt und Endpunkt sind dieselbe Drehung: „Startpunkt setzen“ auf dem Punkt danach bewirkt genau dasselbe, und die zweite der beiden Gesten überschreibt die erste.";
  const T_CUT_EN = "Cuts the perimeter of the active map open at the edge between the two selected points. The geometry does not change, only the order: one point becomes the start point, the other the end point.";
  const T_START_EN = "Rotates the ring so that the selected point becomes point 1. Start point and end point are the same rotation: “Set end point” on the preceding point does exactly the same, and the second of the two gestures overwrites the first.";
  const T_END_EN = "Rotates the ring so that the selected point becomes the last point. Start point and end point are the same rotation: “Set start point” on the following point does exactly the same, and the second of the two gestures overwrites the first.";

  const titel = (id) => page.locator(`#${id}`).getAttribute("title");

  check("deutsch: der Auftrennknopf traegt seinen vollen Erklaertext",
    (await titel("setMergeCutBtn")) === T_CUT_DE, await titel("setMergeCutBtn"));
  check("deutsch: Startpunkt setzen nennt die Ueberschreibung",
    (await titel("setStartPointBtn")) === T_START_DE, await titel("setStartPointBtn"));
  check("deutsch: Endpunkt setzen ebenso",
    (await titel("setEndPointBtn")) === T_END_DE, await titel("setEndPointBtn"));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);
  await openMergeWindow();

  check("englisch: Karte B ohne Datei",
    (await mergeText("#mergeBInfo")) === "Map B Not loaded.",
    await mergeText("#mergeBInfo"));
  check("englisch: der Infoblock von Karte A ist vollstaendig uebersetzt",
    (await mergeText("#mergeAInfo")) ===
      "Map A Cut edge from the file. Start point E 0.00 / N 0.00 m End point E 0.00 / N 40.00 m",
    await mergeText("#mergeAInfo"));
  check("englisch: die Statuszeile des Fensters nennt die Vorgabe",
    (await mergeText("#mergeStatus")) ===
      "Load a second map, then choose the cut edge for each map.",
    await mergeText("#mergeStatus"));
  check("englisch: der Auftrennknopf traegt seinen vollen Erklaertext",
    (await titel("setMergeCutBtn")) === T_CUT_EN, await titel("setMergeCutBtn"));
  check("englisch: Set start point nennt die Ueberschreibung",
    (await titel("setStartPointBtn")) === T_START_EN, await titel("setStartPointBtn"));
  check("englisch: Set end point ebenso",
    (await titel("setEndPointBtn")) === T_END_EN, await titel("setEndPointBtn"));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);
  await openMergeWindow();

  check("zurueck auf deutsch: die drei Erklaertexte stehen wieder wortgleich da",
    (await titel("setMergeCutBtn")) === T_CUT_DE &&
    (await titel("setStartPointBtn")) === T_START_DE &&
    (await titel("setEndPointBtn")) === T_END_DE,
    `${await titel("setMergeCutBtn")} | ${await titel("setStartPointBtn")}`);
  check("und der Infoblock ebenfalls",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT,
    await mergeText("#mergeAInfo"));

  /* --- 5. Ungesetzt, und die einseitigen Faelle -------------------- */

  await upload("#secondFileInput", "cut-b.geojson", cutMap(RING_B));
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await openMergeWindow();

  const OHNE_WAHL =
    "Auftrennstelle nicht gewählt – für beide Karten gilt die Reihenfolge aus der Datei. " +
    "Neue Kanten: A Ende → B Start 20,00 m · B Ende → A Start 20,00 m";

  check("beide Karten ungesetzt: der Infoblock von A nennt die Datei",
    (await mergeText("#mergeAInfo")) === A_UNGESETZT,
    await mergeText("#mergeAInfo"));
  check("der Infoblock von B ebenso",
    (await mergeText("#mergeBInfo")) ===
      "Karte B Auftrennstelle aus der Datei. " +
      "Startpunkt E -20,00 / N 40,00 m Endpunkt E -20,00 / N 0,00 m",
    await mergeText("#mergeBInfo"));
  check("und die Statuszeile nennt beide Karten",
    (await mergeText("#mergeStatus")) === OHNE_WAHL,
    await mergeText("#mergeStatus"));

  /* Nur A gewaehlt. */
  await waehlePunkte([[0, 0], [40, 0]]);
  await openMergeWindow();
  const nurAGesetzt = await klickeFreienKnopf("#setMergeCutBtn",
    "nur A: der Knopf ist frei", "#mergeCutReason");
  await page.waitForTimeout(400);
  await openMergeWindow();

  check("nur Karte A gewaehlt: die Statuszeile nennt genau die andere Seite",
    (await mergeText("#mergeStatus")).startsWith(
      "Auftrennstelle nur für Karte A gewählt – für Karte B gilt die Reihenfolge aus der Datei."),
    await mergeText("#mergeStatus"));

  /*
   * Nur B gewaehlt: A zuruecknehmen, dann auf Karte B setzen.
   *
   * Das Control+z nimmt GENAU die eine Geste darueber zurueck. Bleibt sie aus,
   * weil der Knopf gesperrt war, trifft es stattdessen die Geste davor - das
   * Laden von Karte B -, und der Menueeintrag "Karte B" ist danach gesperrt.
   * Gemessen an der Mutation "data-vertex-key gar nicht gesetzt": genau so
   * endete der Lauf hier, und zwar als einziger Abbruch des ganzen
   * Testbestandes.
   *
   * Der Abschnitt haengt deshalb am Rueckgabewert von klickeFreienKnopf():
   * eine Vorbedingung, die nicht eingetreten ist, darf keinen Folgeschritt
   * tragen. Sie ist bereits benannt zugesichert ("nur A: der Knopf ist frei") -
   * was fehlte, war der Abbruch. Dieselbe Regel wie bei den Locatoren aus
   * ungeprueften Werten, nur mit einem Zustand statt einem Wert.
   */
  if (nurAGesetzt) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);

    await menueBefehl("Karte", "Karte B");
    await page.waitForTimeout(300);
    await openAllFolds(page);

    await waehlePunkte([[-20, 40], [-60, 40]]);
    await openMergeWindow();
    await klickeFreienKnopf("#setMergeCutBtn",
      "nur B: der Knopf ist frei", "#mergeCutReason");
    await page.waitForTimeout(400);
    await openMergeWindow();

    check("nur Karte B gewaehlt: die Statuszeile nennt genau die andere Seite",
      (await mergeText("#mergeStatus")).startsWith(
        "Auftrennstelle nur für Karte B gewählt – für Karte A gilt die Reihenfolge aus der Datei."),
      await mergeText("#mergeStatus"));
  }

  /* --- 4. Gekreuzte Bruecken: Warnung, keine Sperre ---------------- */

  /*
   * Karte B liegt hier gedreht in der Datei: ihr Startpunkt ist der untere,
   * ihr Endpunkt der obere. Damit laufen die beiden neuen Kanten
   * A-Ende -> B-Start und B-Ende -> A-Start ueber Kreuz.
   */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A));
  await upload("#secondFileInput", "cut-b-gedreht.geojson", cutMap(RING_B_GEDREHT));
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await openMergeWindow();

  const MIT_KREUZUNG =
    "Auftrennstelle nicht gewählt – für beide Karten gilt die Reihenfolge aus der Datei. " +
    "Neue Kanten: A Ende → B Start 44,72 m · B Ende → A Start 44,72 m " +
    "Die beiden neuen Kanten kreuzen sich. Eine andere Auftrennstelle vermeidet das.";

  check("gekreuzte Bruecken: die Statuszeile nennt die Kreuzung",
    (await mergeText("#mergeStatus")) === MIT_KREUZUNG,
    await mergeText("#mergeStatus"));
  check("und traegt die Warnklasse",
    (await page.locator("#mergeStatus").getAttribute("class")) ===
      "merge-status warning",
    await page.locator("#mergeStatus").getAttribute("class"));

  const warnungGetroffen = await elementGetroffen(page, "#mergeStatus");
  check("die Warnung ist wirklich getroffen, nicht nur gerechnet da",
    warnungGetroffen.ok, JSON.stringify(warnungGetroffen));

  /* Die Freigabe wird unmittelbar vor dem Klick zugesichert, siehe unten. */

  /*
   * Trotz Warnung verbinden. Der neue Ring ist die offene Kette von Karte A,
   * gefolgt von der offenen Kette von Karte B - von Hand hergeleitet:
   *
   *   A: (0,0) (40,0) (40,40) (0,40)
   *   B: (-20,0) (-60,0) (-60,40) (-20,40)
   *   Ergebnis: acht Punkte in genau dieser Reihenfolge, danach der
   *   Ringschluss zurueck auf (0,0).
   *
   * Die Kreuzung bleibt darin sichtbar - das Verbinden repariert sie nicht,
   * es hat nur nicht widersprochen.
   */
  await klickeFreienKnopf("#mergeMapsBtn",
    "Warnung, keine Sperre: Verbinden bleibt frei", "#mergeStatus");
  await page.waitForTimeout(600);
  await openAllFolds(page);

  const ERGEBNIS = [
    [0, 0], [40, 0], [40, 40], [0, 40],
    [-20, 0], [-60, 0], [-60, 40], [-20, 40],
  ];

  check("das Ergebnis traegt genau acht Punkte in der hergeleiteten Reihenfolge",
    (await perimeterFolge()) === folge(ERGEBNIS), await perimeterFolge());

  /*
   * Das Ergebnis ist ein NEUER Ring - die Auftrennstelle der Ausgangskarte
   * beschreibt ihn nicht mehr. mergeMapSlots() baut Karte A als frisches
   * Literal ohne das Feld; "nie gewaehlt" ist Abwesenheit, nicht false.
   */
  await openMergeWindow();
  check("und das Verbinden-Ergebnis steht auf 'aus der Datei'",
    (await mergeText("#mergeAInfo")).includes("Auftrennstelle aus der Datei."),
    await mergeText("#mergeAInfo"));

  /* Gegenprobe: ungedrehtes B, exakter Statustext statt "kein Kreuzungssatz". */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A));
  await upload("#secondFileInput", "cut-b.geojson", cutMap(RING_B));
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await openMergeWindow();

  check("Gegenprobe ungedreht: die Statuszeile lautet exakt ohne Kreuzungssatz",
    (await mergeText("#mergeStatus")) === OHNE_WAHL,
    await mergeText("#mergeStatus"));
  check("und traegt die unauffaellige Klasse",
    (await page.locator("#mergeStatus").getAttribute("class")) ===
      "merge-status ok",
    await page.locator("#mergeStatus").getAttribute("class"));

  /* --- 6. Die Warnung "veraendert" steht NEBEN dem Vorgabehinweis --- */

  /*
   * 7d-4b: sperrende Meldungen stehen weiter zuerst und allein. Darunter
   * gelten Hinweis und Warnung nebeneinander - sie beantworten zwei
   * verschiedene Fragen. Der Hinweis sagt, ob der Nutzer HIER entschieden
   * hat; die Warnung, ob seine Entscheidung den heutigen Ring noch trifft.
   * Eine Karte mit gesetztem Paar zaehlt fuer den Hinweis deshalb als
   * gewaehlt, auch wenn sie sich seither veraendert hat.
   *
   * Geprueft wird ausschliesslich der sichtbare Text und die Trefferbarkeit,
   * nie slot.cutEdge.
   */
  const VERAENDERT_WARNUNG =
    "Auftrennstelle seit der Wahl verändert – verbunden wird dort, " +
    "wo der Ring heute aufgetrennt ist.";

  /** Auftrennstelle auf der AKTIVEN Karte setzen und danach verschieben. */
  const setzenUndVerschieben = async (punkte, name) => {
    await waehlePunkte(punkte);
    await openMergeWindow();
    await klickeFreienKnopf("#setMergeCutBtn",
      `Vorbedingung ${name}: die Auftrennstelle laesst sich setzen`,
      "#mergeCutReason");
    await page.waitForTimeout(400);

    await waehlePunkte([punkte[1]]);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    await openMergeWindow();
  };

  /* --- 6a. A veraendert, B aus der Datei: BEIDES steht da --- */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A));
  await upload("#secondFileInput", "cut-b.geojson", cutMap(RING_B));
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);

  await setzenUndVerschieben([[0, 0], [40, 0]], "A");

  const EINSEITIG =
    "Auftrennstelle nur für Karte A gewählt – " +
    "für Karte B gilt die Reihenfolge aus der Datei.";

  check("A veraendert: der Vorgabehinweis nennt A weiterhin als gewaehlt",
    (await mergeText("#mergeStatus")).includes(EINSEITIG),
    await mergeText("#mergeStatus"));
  check("und die Warnung steht daneben, mit dem Kartennamen",
    (await mergeText("#mergeStatus")).includes(`Karte A ${VERAENDERT_WARNUNG}`),
    await mergeText("#mergeStatus"));
  check("und ohne den Kartennamen der anderen Seite",
    !(await mergeText("#mergeStatus")).includes("Karte A und B") &&
    !(await mergeText("#mergeStatus")).includes(`Karte B ${VERAENDERT_WARNUNG}`),
    await mergeText("#mergeStatus"));
  check("die Zeile traegt dabei die Warnklasse",
    (await page.locator("#mergeStatus").getAttribute("class")) ===
      "merge-status warning",
    await page.locator("#mergeStatus").getAttribute("class"));

  const veraendertGetroffen = await elementGetroffen(page, "#mergeStatus");
  check("und ist wirklich getroffen, nicht nur gerechnet da",
    veraendertGetroffen.ok, JSON.stringify(veraendertGetroffen));

  /* Englisch: die neue Warnung und der Kartenname sind beide uebersetzt. */
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);
  await openMergeWindow();

  check("englisch: die Warnung und der Kartenname sind uebersetzt",
    (await mergeText("#mergeStatus")).includes(
      "Map A Cut edge changed since it was chosen – " +
      "merging uses the place where the ring is cut open today."),
    await mergeText("#mergeStatus"));
  check("englisch: kein deutscher Rest in der Zeile",
    !(await mergeText("#mergeStatus")).includes("verändert") &&
    !(await mergeText("#mergeStatus")).includes("Karte"),
    await mergeText("#mergeStatus"));

  /*
   * Schritt D: die beiden Brueckenlaengen rechneten bis dahin mit toFixed()
   * und zeigten damit in BEIDEN Sprachen einen Punkt. Deutsch steht das Komma
   * in OHNE_WAHL und MIT_KREUZUNG; hier die englische Haelfte desselben Ortes.
   */
  check("englisch: die Brueckenlaengen tragen den Punkt",
    (await mergeText("#mergeStatus")).includes(
      "New edges: A end → B start 44.72 m · B end → A start 60.10 m"),
    await mergeText("#mergeStatus"));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);
  await openMergeWindow();

  /* --- 6b. Trotz "veraendert" verbinden, und das Ergebnis zaehlen --- */

  /*
   * Von Hand hergeleitet: das Verbinden haengt die offene Kette von B an die
   * offene Kette von A. Karte A steht nach dem Auftrennen auf [40,0] und
   * traegt nach der Pfeiltaste (40.10, 0) als ersten Punkt; Karte B steht
   * unveraendert auf ihrer Dateireihenfolge.
   */
  const ERGEBNIS_VERAENDERT = [
    [40.1, 0], [40, 40], [0, 40], [0, 0],
    [-20, 40], [-60, 40], [-60, 0], [-20, 0],
  ];

  await klickeFreienKnopf("#mergeMapsBtn",
    "trotz 'veraendert' bleibt Verbinden frei", "#mergeStatus");
  await page.waitForTimeout(600);
  await openAllFolds(page);

  check("und das Ergebnis traegt die acht hergeleiteten Punkte",
    (await perimeterFolge()) === folge(ERGEBNIS_VERAENDERT),
    await perimeterFolge());

  /* --- 6c. Beide Karten veraendert: EIN Kartenname fuer beide --- */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A));
  await upload("#secondFileInput", "cut-b.geojson", cutMap(RING_B));
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await setzenUndVerschieben([[0, 0], [40, 0]], "A");

  await menueBefehl("Karte", "Karte B");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await setzenUndVerschieben([[-20, 40], [-60, 40]], "B");

  check("beide veraendert: die Warnung nennt beide Karten in EINEM Element",
    (await mergeText("#mergeStatus")).includes(
      `Karte A und B ${VERAENDERT_WARNUNG}`),
    await mergeText("#mergeStatus"));
  check("und der Vorgabehinweis entfaellt, weil beide Seiten gewaehlt sind",
    !(await mergeText("#mergeStatus")).includes("Reihenfolge aus der Datei"),
    await mergeText("#mergeStatus"));
  check("'Bereit.' steht nicht neben einer Warnung",
    !(await mergeText("#mergeStatus")).includes("Bereit."),
    await mergeText("#mergeStatus"));

  /* --- 6d. Veraendert UND Kreuzung: beide Warnungen stehen da --- */
  await upload("#fileInput", "cut-a.geojson", cutMap(RING_A));
  await upload("#secondFileInput", "cut-b-gedreht.geojson", cutMap(RING_B_GEDREHT));
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(300);
  await openAllFolds(page);
  await setzenUndVerschieben([[0, 0], [40, 0]], "A");

  check("veraendert und Kreuzung: die Warnung zur Stelle steht da",
    (await mergeText("#mergeStatus")).includes(`Karte A ${VERAENDERT_WARNUNG}`),
    await mergeText("#mergeStatus"));
  check("und der Kreuzungssatz ebenfalls",
    (await mergeText("#mergeStatus")).includes("kreuzt") &&
    (await mergeText("#mergeStatus")).includes(
      "Eine andere Auftrennstelle vermeidet das."),
    await mergeText("#mergeStatus"));
  check("die Zeile traegt weiterhin genau eine Warnklasse",
    (await page.locator("#mergeStatus").getAttribute("class")) ===
      "merge-status warning",
    await page.locator("#mergeStatus").getAttribute("class"));

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
    await menueBefehl("Karte", "Karten verbinden…");
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
