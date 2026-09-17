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

import { createChecker, elementGetroffen, freieKartenstelle, indexUrl, launchBrowser, openAllFolds } from "./browser-harness.mjs";

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

  const load = async (extra = [], perimeter = PERIMETER) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.locator("#fileInput").setInputFiles({
      name: "inspector.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify({
        type: "FeatureCollection", features: [perimeter, ...extra],
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

  /*
   * Die Schwelle, ab der die Auswahlleiste ueber der Karte liegt, wird aus dem
   * BESTAND gelesen und nicht als Zahl gefuehrt: sie steht in JS als
   * SELECTION_BAR_WIDE_QUERY, so wie die Schwelle der Statuszeile in einer
   * Medienregel steht. Wer die Zahl in index.html aendert, zieht damit auch
   * diesen Test mit.
   *
   * Sie ist NICHT die Schwelle aus Etappe 8c, auch wenn beide heute dieselbe
   * Zahl nennen - siehe CLAUDE.md, Abschnitt 7.
   */
  const schwelle = async () => page.evaluate(() => {
    const treffer = /(\d+)/.exec(SELECTION_BAR_WIDE_QUERY);
    return treffer ? Number(treffer[1]) : null;
  });

  /** Wo haengt die Leiste gerade - und wo wird sie gezeichnet? */
  const leiste = () => page.evaluate(() => {
    const bar = document.getElementById("selectionActions");
    const viewer = document.getElementById("viewer");
    const aside = document.querySelector("aside");
    const br = bar.getBoundingClientRect();
    const vr = viewer.getBoundingClientRect();
    const ar = aside.getBoundingClientRect();
    const sichtbar = getComputedStyle(bar).display !== "none";

    return {
      sichtbar,
      imViewer: viewer.contains(bar),
      imInspektor: aside.contains(bar),
      /* Die WIRKUNG, nicht die Herkunft: wo wird sie wirklich gezeichnet? */
      ueberDerKarte: sichtbar &&
        br.left >= vr.left && br.right <= vr.right &&
        br.top >= vr.top && br.bottom <= vr.bottom,
      inDerSpalte: sichtbar &&
        br.left >= ar.left && br.right <= ar.right,
      /*
       * Gerendert, nicht nur display: ein Knopf in einer ausgeblendeten
       * Gruppe meldet sein eigenes display weiterhin als "flex".
       */
      knoepfe: [...bar.querySelectorAll("button")]
        .filter((b) => b.getClientRects().length > 0)
        .map((b) => b.id),
      grob: window.matchMedia(SELECTION_BAR_WIDE_QUERY).matches,
    };
  });

  /*
   * Welche Knoepfe der Leiste werden WIRKLICH getroffen?
   *
   * getClientRects() taugt dafuer nicht: ein Knopf in einem geschlossenen
   * <details> meldet weiterhin ein Rechteck - gemessen 36 x 122 px an einer
   * Stelle, an der nichts gezeichnet wird. Dieselbe Klasse wie "display ist
   * nicht das letzte Wort": gefragt ist, was der Browser an der Stelle
   * zeichnet, und das beantwortet allein elementFromPoint.
   */
  const getroffeneKnoepfe = () => page.evaluate(() => {
    const bar = document.getElementById("selectionActions");

    return [...bar.querySelectorAll("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!treffer && b.contains(treffer);
    }).map((b) => b.id);
  });

  /*
   * Der Marker, der unter der aufgeklappten Leiste liegt - gesucht, nicht
   * gesetzt, und nach der Wirkung bestimmt: elementFromPoint auf seine Mitte
   * liefert etwas anderes als ihn selbst. Ein Rechteckvergleich sagte nur,
   * was gemeint ist.
   */
  const verdeckterMarker = () => page.evaluate(() => {
    for (const m of document.querySelectorAll("circle.vertex")) {
      const r = m.getBoundingClientRect();
      const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (treffer !== m) {
        return { key: m.dataset.vertexKey, deckel: treffer ? (treffer.id || treffer.tagName) : "nichts" };
      }
    }
    return null;
  });

  /*
   * Alle verdeckten Marker, nicht nur der erste. Die Umgehung in
   * tools/test-merge.mjs - den der Ecke naechsten Marker zuerst klicken -
   * traegt genau EINEN; bei zweien haelt sie nicht mehr. Dass der Griff auch
   * dann noch hilft, ist der Grund, aus dem die Leiste bleiben darf, wo sie
   * ist.
   */
  const alleVerdeckten = () => page.evaluate(() =>
    [...document.querySelectorAll("circle.vertex")]
      .map((m) => {
        const r = m.getBoundingClientRect();
        const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return treffer === m
          ? null
          : { key: m.dataset.vertexKey, deckel: treffer ? (treffer.id || treffer.tagName) : "nichts" };
      })
      .filter(Boolean));

  /** Trifft man diesen Marker? Dieselbe Messung, nur fuer einen bekannten. */
  const markerGetroffen = (key) => page.evaluate((k) => {
    const m = document.querySelector(`circle.vertex[data-vertex-key="${k}"]`);
    if (!m) return { ok: false, grund: "Marker fehlt" };
    const r = m.getBoundingClientRect();
    const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: treffer === m, grund: treffer ? (treffer.id || treffer.tagName) : "nichts" };
  }, key);

  /*
   * Ein Klick auf einen Knopf der Auswahlleiste setzt voraus, dass sie da ist.
   * Ohne Waechter wird aus einer verschwundenen Leiste ein stummer Timeout
   * statt einer benannten Zusicherung - dieselbe Regel und derselbe Grund wie
   * bei klickeFreienKnopf() in tools/test-merge.mjs. Die Zusicherung steht
   * IMMER da, nicht nur im Fehlerfall: eine, die man nur sieht, wenn sie
   * reisst, belegt im Gutfall nichts.
   */
  const klickeLeistenknopf = async (id, name) => {
    const da = await page.locator(`#${id}`).isVisible();

    check(`${name}: der Knopf steht in der Auswahlleiste`, da, `#${id} ist nicht sichtbar`);

    if (!da) return false;

    await page.locator(`#${id}`).click();
    return true;
  };

  /*
   * Derselbe Waechter fuer den Griff der Leiste: geklickt wird nur, wenn er
   * wirklich getroffen ist. Ohne ihn wird aus einem wirkungslosen Griff ein
   * stummer Timeout statt einer benannten Zusicherung - gemessen an genau
   * dieser Mutation. Die Zusicherung steht immer da, nicht nur im Fehlerfall.
   */
  const klickeGriff = async (name) => {
    const treffer = await elementGetroffen(page, "#selectionActionsHandle", { dy: 12 });

    check(name, treffer.ok, JSON.stringify(treffer));

    if (!treffer.ok) return false;

    await page.locator("#selectionActionsHandle").click();
    await page.waitForTimeout(250);
    return true;
  };

  /*
   * "Auf die leere Karte klicken, um abzuwaehlen" - die Stelle wird GESUCHT,
   * nicht gesetzt. Bis zum elften Durchgang standen hier feste 2/2; das lag
   * gemessen 10 px neben der Auswahlleiste, und niemand hatte diese Zahl
   * gewaehlt, weil dort Platz bleiben sollte. freieKartenstelle() liefert den
   * ersten Punkt, an dem wirklich das svg liegt.
   */
  const klickeLeereKarte = async (name) => {
    const stelle = await freieKartenstelle(page);

    check(`${name}: es gibt eine freie Stelle auf der Karte`,
      stelle !== null, "die Karte ist vollstaendig verdeckt");

    if (!stelle) return false;

    await page.locator("#svg").click({ position: stelle });
    return true;
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

  /*
   * Die verwaiste Klasse aus Etappe 5 hat weiterhin KEIN Markup. Der Name der
   * Zusicherung sagt seit dem elften Durchgang genau das - "auf der Karte
   * liegt keine Auswahlleiste mehr" waere jetzt falsch: es liegt wieder eine
   * dort, nur traegt sie eine andere Klasse und ein anderes Verhalten.
   */
  check("die verwaiste Klasse .map-selection-toolbar hat weiterhin kein Markup",
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
  await klickeLeistenknopf("clearMultiSelectionBtn", "Auswahl aufheben");
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

  await klickeLeistenknopf("clearMultiSelectionBtn", "Auswahl aufheben");
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
  await klickeLeistenknopf("clearMultiSelectionBtn", "Auswahl aufheben");
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

  /*
   * Schritt 1, dritter Durchgang: die Messung nennt Distanz, Versatz und
   * WINKEL. Der Winkel lief bis dahin ueber toFixed() und zeigte in beiden
   * Sprachen einen Punkt; die beiden Beschriftungen hatten ueberhaupt keine
   * englische Fassung. Geprueft wird der sichtbare Text in beiden Sprachen -
   * der Messblock ist abgeleitet und wird beim Sprachwechsel neu gebaut.
   */
  const messtext = async () =>
    (await text("measureStatus")).replace(/\s+/g, " ");

  const deMess = await messtext();
  check("deutsch: die Messung beschriftet Distanz und Winkel",
    deMess.includes("Distanz:") && deMess.includes("Winkel:"), deMess);
  check("deutsch: und ihr Gradwert traegt ein Komma",
    /Winkel: \d+,\d°/.test(deMess), deMess);

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  const enMess = await messtext();
  check("englisch: die Messung beschriftet Distance und Angle",
    enMess.includes("Distance:") && enMess.includes("Angle:"), enMess);
  check("englisch: und ihr Gradwert traegt einen Punkt",
    /Angle: \d+\.\d°/.test(enMess), enMess);

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

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
  console.log("Die Auswahlleiste wechselt den Ort, statt zweimal dazustehen");

  /*
   * EIN Markup, zwei Orte. Zugesichert wird beides: WO die Leiste gezeichnet
   * wird (geometrisch, nicht ueber die Herkunft des Knotens - beides kann
   * auseinanderfallen) und DASS sie dort getroffen wird.
   *
   * Die Breiten kommen aus SELECTION_BAR_WIDE_QUERY im Bestand. Kein Literal.
   */
  const engerAlsSchwelle = (await schwelle()) - 1;
  const ueberSchwelle = (await schwelle()) + 320;

  await page.setViewportSize({ width: ueberSchwelle, height: 900 });
  await page.waitForTimeout(300);
  await load();

  {
    const lage = await leiste();
    check(`ueber der Schwelle (${ueberSchwelle} px) greift die Abfrage wirklich`,
      lage.grob, JSON.stringify(lage));
    check("ohne Auswahl ist die Leiste nicht sichtbar",
      !lage.sichtbar, JSON.stringify(lage));
  }

  await marks.nth(0).click();
  await page.waitForTimeout(300);

  {
    const lage = await leiste();
    check("ein Punkt: die Leiste liegt ueber der Karte",
      lage.sichtbar && lage.imViewer && lage.ueberDerKarte,
      JSON.stringify(lage));
    check("ein Punkt: sie traegt die fuenf Punktknoepfe und die zwei Auswahlaktionen",
      lage.knoepfe.join(",") === "insertPointBeforeBtn,insertPointAfterBtn," +
        "setStartPointBtn,setEndPointBtn,deletePointBtn," +
        "deleteMultiSelectionBtn,clearMultiSelectionBtn",
      lage.knoepfe.join(","));
  }

  const leisteGetroffen =
    await elementGetroffen(page, "#selectionActions", { dy: 12 });

  check("und sie wird auf der Karte wirklich getroffen",
    leisteGetroffen.ok, JSON.stringify(leisteGetroffen));

  /*
   * Mehrere Punkte: der zweite Klick geht auf einen Marker AUSSERHALB des
   * Leistenrechtecks - die Leiste steht seit dem ersten Klick da und faengt
   * Zeigerereignisse ab, genau wie die Zoom-Leiste oben rechts.
   */
  const freierMarker = await page.evaluate(() => {
    const bar = document.getElementById("selectionActions").getBoundingClientRect();
    const marker = [...document.querySelectorAll("circle.vertex")];
    const frei = marker.find((m) => {
      if (m.classList.contains("selected")) return false;
      const r = m.getBoundingClientRect();
      return r.left > bar.right + 8 || r.top > bar.bottom + 8;
    });
    return frei ? frei.dataset.vertexKey : null;
  });

  check("es gibt einen Marker ausserhalb des Leistenrechtecks",
    freierMarker !== null, String(freierMarker));

  if (freierMarker) {
    await page.locator(`circle.vertex[data-vertex-key="${freierMarker}"]`)
      .click({ modifiers: ["Control"] });
    await page.waitForTimeout(300);

    const lage = await leiste();
    check("mehrere Punkte: nur noch die beiden Auswahlaktionen",
      lage.sichtbar && lage.ueberDerKarte &&
      lage.knoepfe.join(",") === "deleteMultiSelectionBtn,clearMultiSelectionBtn",
      JSON.stringify(lage));
  }

  /* Ganzes Feature: dazu kommt "Exclusion duplizieren" - aber nur bei einer. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await openAllFolds(page);
  await page.locator('[data-action="select-whole-feature"][data-feature-index="0"]')
    .click();
  await page.waitForTimeout(350);

  {
    const lage = await leiste();
    check("ganzes Feature: der Perimeter bekommt KEIN Duplizieren",
      lage.sichtbar && lage.ueberDerKarte &&
      !lage.knoepfe.includes("duplicateFeatureBtn"),
      JSON.stringify(lage));
  }

  /*
   * Derselbe Zustand unter der Schwelle: dieselben Knoepfe, anderer Ort. Der
   * Vergleich ist der eigentliche Beleg fuer "ein Markup" - waeren es zwei
   * Fassungen, koennten sie hier verschieden sein.
   */
  const obenKnoepfe = (await leiste()).knoepfe.join(",");

  await page.setViewportSize({ width: engerAlsSchwelle, height: 900 });
  await page.waitForTimeout(350);

  {
    const lage = await leiste();
    check(`unter der Schwelle (${engerAlsSchwelle} px) greift die Abfrage nicht mehr`,
      !lage.grob, JSON.stringify(lage));
    check("unter der Schwelle steht dieselbe Leiste im Inspektor",
      lage.sichtbar && lage.imInspektor && !lage.imViewer && lage.inDerSpalte,
      JSON.stringify(lage));
    check("und sie traegt dieselben Knoepfe wie darueber",
      lage.knoepfe.join(",") === obenKnoepfe,
      `${lage.knoepfe.join(",")} gegen ${obenKnoepfe}`);
  }

  /* Der Ankerknoten: sie kommt an ihre Stelle zurueck, nicht ans Spaltenende. */
  const nachbar = await page.evaluate(() =>
    document.getElementById("selectionActions").nextElementSibling?.id || "keiner");

  check("sie steht wieder vor der Feature-Navigation, nicht am Spaltenende",
    nachbar === "featureNavigationSection", nachbar);

  check("es gibt sie genau einmal",
    (await page.locator("#selectionActions").count()) === 1 &&
    (await page.locator("#deletePointBtn").count()) === 1,
    `${await page.locator("#selectionActions").count()} Leisten, ` +
    `${await page.locator("#deletePointBtn").count()} Loeschknoepfe`);

  /* Und zurueck: der Weg ist in beide Richtungen derselbe. */
  await page.setViewportSize({ width: ueberSchwelle, height: 900 });
  await page.waitForTimeout(350);

  {
    const lage = await leiste();
    check("zurueck ueber der Schwelle liegt sie wieder ueber der Karte",
      lage.sichtbar && lage.imViewer && lage.ueberDerKarte,
      JSON.stringify(lage));
  }

  /* ---------------------------------------------------------------- */
  console.log("Die Knoepfe der Auswahlleiste tragen je ein Symbol");

  /*
   * Gemessen wird die WIRKUNG, nicht die Absicht: wieviele <svg> im Knopf
   * stehen, ob das Symbol an seiner Stelle wirklich getroffen wird, ob der
   * Text daneben eine EIGENE getroffene Flaeche hat - und ob die Strichfarbe
   * die Textfarbe IST. Kein getComputedStyle auf display, keine Klasse.
   *
   * Die Farbpruefung braucht ihre eigene Gegenprobe: "jeder Strich ist
   * entweder none oder die Textfarbe" waere auch dann erfuellt, wenn gar kein
   * Strich gezeichnet wuerde. Deshalb wird zusaetzlich gezaehlt, dass
   * mindestens einer wirklich faerbt.
   */
  const symbolLage = async (ids) =>
    page.evaluate((liste) => liste.map((id) => {
      const knopf = document.getElementById(id);
      if (!knopf) return { id, fehlt: true };

      const svgs = knopf.querySelectorAll("svg");
      const svg = svgs[0];
      if (!svg) return { id, svgs: 0 };

      const textKnoten = [...knopf.childNodes]
        .find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());

      const bereich = document.createRange();
      if (textKnoten) bereich.selectNodeContents(textKnoten);
      const textKasten = textKnoten ? bereich.getBoundingClientRect() : null;
      const symbolKasten = svg.getBoundingClientRect();

      const treffer = (kasten) => kasten && kasten.width > 0
        ? document.elementFromPoint(
            kasten.left + kasten.width / 2,
            kasten.top + kasten.height / 2
          )
        : null;

      const amSymbol = treffer(symbolKasten);
      const amText = treffer(textKasten);
      const farbe = getComputedStyle(knopf).color;
      const striche = [...svg.querySelectorAll("*")]
        .map((el) => getComputedStyle(el).stroke);

      return {
        id,
        svgs: svgs.length,
        text: textKnoten ? textKnoten.textContent.trim() : null,
        symbolGetroffen: amSymbol === svg || svg.contains(amSymbol),
        textGetroffen: amText === knopf,
        nebeneinander: !!textKasten && textKasten.left >= symbolKasten.right - 0.5,
        farbeFolgt: striche.every((strich) => strich === "none" || strich === farbe),
        faerbendeStriche: striche.filter((strich) => strich !== "none").length,
        eigeneFarbe: /(stroke|fill)="(#|rgb|hsl)/i.test(svg.outerHTML),
        farbe,
      };
    }), ids);

  const PUNKT_UND_AUSWAHL = [
    "insertPointBeforeBtn", "insertPointAfterBtn", "setStartPointBtn",
    "setEndPointBtn", "deletePointBtn",
    "deleteMultiSelectionBtn", "clearMultiSelectionBtn",
  ];

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.locator("circle.vertex").first().click();
  await page.waitForTimeout(300);

  for (const lage of await symbolLage(PUNKT_UND_AUSWAHL)) {
    check(`${lage.id}: genau ein Symbol, und es wird getroffen`,
      lage.svgs === 1 && lage.symbolGetroffen, JSON.stringify(lage));
    check(`${lage.id}: die Beschriftung steht daneben und wird getroffen`,
      !!lage.text && lage.nebeneinander && lage.textGetroffen, JSON.stringify(lage));
    check(`${lage.id}: die Strichfarbe IST die Textfarbe`,
      lage.farbeFolgt && lage.faerbendeStriche > 0 && !lage.eigeneFarbe,
      JSON.stringify(lage));
  }

  /*
   * Der achte Knopf haengt am Zustand "ganzes Feature" einer EXCLUSION - am
   * Perimeter gibt es ihn nicht. Deshalb eine eigene Karte und ein eigener
   * Abschnitt statt einer Zusicherung ueber ein verstecktes Element.
   */
  await load([MIT_LOCH]);
  await openAllFolds(page);
  await page.locator('[data-action="select-whole-feature"][data-feature-index="1"]')
    .click();
  await page.waitForTimeout(350);

  for (const lage of await symbolLage(["duplicateFeatureBtn"])) {
    check("duplicateFeatureBtn: genau ein Symbol, und es wird getroffen",
      lage.svgs === 1 && lage.symbolGetroffen, JSON.stringify(lage));
    check("duplicateFeatureBtn: die Beschriftung steht daneben und wird getroffen",
      !!lage.text && lage.nebeneinander && lage.textGetroffen, JSON.stringify(lage));
    check("duplicateFeatureBtn: die Strichfarbe IST die Textfarbe",
      lage.farbeFolgt && lage.faerbendeStriche > 0 && !lage.eigeneFarbe,
      JSON.stringify(lage));
  }

  /*
   * Und die Entscheidung, dass die Symbole NUR ueber der Karte stehen: im
   * Inspektor braeuchten dieselben Knoepfe in ihrer 139-px-Spalte 142 bis
   * 163 px, die Beschriftungen liefen still ueber den Rand. Ohne diese
   * Zusicherung waere das eine Verabredung.
   */
  await page.setViewportSize({ width: engerAlsSchwelle, height: 900 });
  await page.waitForTimeout(350);

  {
    const imInspektor = await page.evaluate(() => {
      const leiste = document.getElementById("selectionActions");
      const sichtbare = [...leiste.querySelectorAll("svg")]
        .filter((svg) => svg.getBoundingClientRect().width > 0);
      return { symbole: leiste.querySelectorAll("svg").length, sichtbare: sichtbare.length };
    });

    check("unter der Schwelle steht kein Symbol, die Symbole bleiben aber im Markup",
      imInspektor.symbole > 0 && imInspektor.sichtbare === 0,
      JSON.stringify(imInspektor));
  }

  await page.setViewportSize({ width: ueberSchwelle, height: 900 });
  await page.waitForTimeout(350);

  /* ---------------------------------------------------------------- */
  console.log("Die Auswahlleiste laesst sich zuklappen und gibt die Karte frei");

  /*
   * Gemessen wird die WIRKUNG, nicht der Faltzustand: ob der verdeckte Marker
   * per elementFromPoint erreichbar ist, ob der Griff getroffen wird und
   * welche Knoepfe wirklich dastehen. Kein getComputedStyle, kein
   * open-Attribut.
   *
   * Beide Breiten, weil der Befund sie unterschiedlich misst: bei der oberen
   * liegt der verdeckte Marker dicht unter der Leistenecke, bei der Schwelle
   * selbst weit darunter. Ein Griff, der nur bei einer der beiden freigibt,
   * faellt hier auf. Die Zahlen kommen aus SELECTION_BAR_WIDE_QUERY.
   */
  for (const breite of [ueberSchwelle, await schwelle()]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.waitForTimeout(250);
    await load();
    await marks.nth(0).click();
    await page.waitForTimeout(300);

    /* Ausgangszustand bei neuer Auswahl: AUFGEKLAPPT, ohne Zutun. */
    const offen = await getroffeneKnoepfe();

    check(`${breite} px: bei neuer Auswahl steht die Leiste aufgeklappt da`,
      offen.length > 0, offen.join(","));

    /* Die Vorbedingung selbst zusichern - ohne verdeckten Marker beweist der
       Rest nichts. */
    const verdeckt = await verdeckterMarker();

    check(`${breite} px: aufgeklappt liegt wirklich ein Marker unter der Leiste`,
      verdeckt !== null && verdeckt.deckel !== "nichts", JSON.stringify(verdeckt));

    if (!verdeckt) continue;
    if (!(await klickeGriff(`${breite} px: der Griff ist aufgeklappt getroffen`))) continue;

    const frei = await markerGetroffen(verdeckt.key);

    check(`${breite} px: zugeklappt ist der verdeckte Marker wieder erreichbar`,
      frei.ok, `${verdeckt.key}: ${JSON.stringify(frei)}`);

    const zu = await getroffeneKnoepfe();

    check(`${breite} px: zugeklappt steht kein Knopf mehr auf der Karte`,
      zu.length === 0, zu.join(","));

    const griffZu = await elementGetroffen(page, "#selectionActionsHandle", { dy: 12 });

    check(`${breite} px: und der Griff ist auch zugeklappt getroffen`,
      griffZu.ok, JSON.stringify(griffZu));

    /*
     * Der Zustand ueberlebt den Wechsel der Auswahl - erst einen anderen
     * Punkt, dann gar keinen und wieder einen. Genau das ist die Festlegung
     * "wer zuklappt, bekommt bei der naechsten Auswahl die zugeklappte
     * Leiste".
     */
    await marks.nth(1).click();
    await page.waitForTimeout(300);

    check(`${breite} px: ein anderer Punkt laesst sie zugeklappt`,
      (await getroffeneKnoepfe()).length === 0,
      (await getroffeneKnoepfe()).join(","));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await marks.nth(1).click();
    await page.waitForTimeout(300);

    check(`${breite} px: und die naechste Auswahl bekommt sie ebenfalls zugeklappt`,
      (await getroffeneKnoepfe()).length === 0,
      (await getroffeneKnoepfe()).join(","));
  }

  /*
   * Unter der Schwelle gibt es keinen Griff - dort steht die Leiste im
   * Inspektor, und ein zugeklappter Zustand haette keinen Weg zurueck. Sie
   * wird deshalb aufgeklappt, obwohl eben zugeklappt wurde.
   */
  await page.setViewportSize({ width: engerAlsSchwelle, height: 900 });
  await page.waitForTimeout(350);

  {
    const unten = await getroffeneKnoepfe();

    check("unter der Schwelle steht sie wieder aufgeklappt da",
      unten.length > 0, unten.join(","));

    const griffUnten = await page.evaluate(() =>
      document.getElementById("selectionActionsHandle").getClientRects().length);

    check("und der Griff ist dort nicht gezeichnet",
      griffUnten === 0, String(griffUnten));
  }

  /* ---------------------------------------------------------------- */
  console.log("Der Griff traegt auch MEHRERE verdeckte Marker");

  /*
   * Die Umgehung in tools/test-merge.mjs - den der linken oberen Ecke
   * naechsten Marker zuerst klicken, solange die Leiste noch nicht dasteht -
   * traegt genau EINEN verdeckten Marker: ab dem zweiten Klick steht sie.
   * Gemessen an einer Kante mit mehreren Punkten liegen zwei darunter, und
   * genau das ist der Fall, fuer den der Griff die Antwort ist.
   *
   * Hier entscheidet sich, ob die Leiste bleiben darf, wo sie ist: die beiden
   * Alternativen - den Kartenausschnitt an den Zustand der Leiste koppeln
   * oder sie an den unteren Rand ruecken - sind gemessen schlechter (siehe
   * CLAUDE.md, Abschnitt 7).
   */
  {
    const VIELE_PUNKTE = {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [40, 0], [40, 40], [30, 40], [20, 40],
        [10, 40], [5, 40], [0, 40], [0, 0],
      ]] },
    };

    await page.setViewportSize({ width: await schwelle(), height: 900 });
    await page.waitForTimeout(250);
    await load([], VIELE_PUNKTE);
    await marks.nth(0).click();
    await page.waitForTimeout(300);

    const offenVerdeckt = await alleVerdeckten();

    check("die Vorbedingung: mehr als ein Marker liegt unter der Leiste",
      offenVerdeckt.length >= 2, JSON.stringify(offenVerdeckt));

    if (offenVerdeckt.length >= 2 &&
        await klickeGriff("zwei Verdeckte: der Griff ist aufgeklappt getroffen")) {
      const zuVerdeckt = await alleVerdeckten();

      check("zugeklappt liegt KEIN Marker mehr unter der Leiste",
        zuVerdeckt.length === 0, JSON.stringify(zuVerdeckt));

      /*
       * Und die Wirkung, nicht nur die Trefferpruefung: einer der vorher
       * verdeckten laesst sich wirklich anklicken und wird dadurch
       * ausgewaehlt.
       */
      const ziel = offenVerdeckt[1].key;
      const frei = await markerGetroffen(ziel);

      /*
       * Waechter vor dem Klick: ein noch verdeckter Marker liefert sonst
       * einen stummen Timeout statt einer benannten Zusicherung - dieselbe
       * Regel wie bei klickeGriff() und klickeFreienKnopf().
       */
      check("der zweite vorher verdeckte Marker ist jetzt getroffen",
        frei.ok, `${ziel}: ${JSON.stringify(frei)}`);

      if (frei.ok) {
        await page.locator(`circle.vertex[data-vertex-key="${ziel}"]`).click();
        await page.waitForTimeout(300);

        const gewaehlt = await page.evaluate(() =>
          getEffectiveSelectedVertices().length);

        check("und er laesst sich wirklich anklicken",
          gewaehlt === 1, `${ziel}: ${gewaehlt} ausgewaehlt`);
      }
    }

    await page.setViewportSize({ width: ueberSchwelle, height: 900 });
    await page.waitForTimeout(250);
    await load();
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------------- */
  console.log("Leiste und Maszstabshinweis ueberdecken einander nicht");

  /*
   * Beide wollen an denselben Platz: links oben ueber der Karte. Seit dem
   * elften Durchgang stehen sie deshalb untereinander in EINEM Stapel.
   *
   * Gemessen wird die WIRKUNG, nicht der berechnete Stil: zwei Rechtecke, die
   * sich nicht schneiden, und beide an ihrer eigenen Stelle wirklich
   * getroffen. getComputedStyle sagte nur, was gemeint war - die beiden
   * koennten sich trotzdem ueberlagern.
   *
   * Der Hinweis erscheint bei unklarem Maszstab; eine Karte mit 0,5 x 0,5
   * Ausdehnung ist genau dieser Fall.
   */
  await page.setViewportSize({ width: ueberSchwelle, height: 900 });
  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.locator("#fileInput").setInputFiles({
    name: "mehrdeutig.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0],
        ]] },
      }],
    })),
  });
  await page.waitForTimeout(600);

  const obenLinks = () => page.evaluate(() => {
    const kasten = (id) => {
      const el = document.getElementById(id);
      const b = el.getBoundingClientRect();
      return {
        sichtbar: getComputedStyle(el).display !== "none",
        l: Math.round(b.left), o: Math.round(b.top),
        r: Math.round(b.right), u: Math.round(b.bottom),
      };
    };

    const bar = kasten("selectionActions");
    const hinweis = kasten("scaleNotice");

    /* Der Treffer an der eigenen linken oberen Ecke, ein paar Pixel hinein. */
    const trifft = (k, id) => {
      if (!k.sichtbar) return null;
      const el = document.elementFromPoint(k.l + 5, k.o + 5);
      return !!(el && el.closest(`#${id}`));
    };

    return {
      bar, hinweis,
      ueberdeckt: bar.sichtbar && hinweis.sichtbar &&
        bar.l < hinweis.r && hinweis.l < bar.r &&
        bar.o < hinweis.u && hinweis.o < bar.u,
      barGetroffen: trifft(bar, "selectionActions"),
      hinweisGetroffen: trifft(hinweis, "scaleNotice"),
    };
  });

  {
    const lage = await obenLinks();
    check("Vorbedingung: der Maszstabshinweis steht wirklich da",
      lage.hinweis.sichtbar, JSON.stringify(lage.hinweis));
    check("ohne Auswahl steht der Hinweis oben und wird getroffen",
      !lage.bar.sichtbar && lage.hinweisGetroffen === true,
      JSON.stringify(lage));
  }

  const oben = (await obenLinks()).hinweis.o;

  await page.locator("circle.vertex").first().click();
  await page.waitForTimeout(350);

  {
    const lage = await obenLinks();
    check("mit Auswahl stehen beide da",
      lage.bar.sichtbar && lage.hinweis.sichtbar, JSON.stringify(lage));
    check("und ihre Rechtecke schneiden einander nicht",
      !lage.ueberdeckt, JSON.stringify(lage));
    check("der Hinweis ist dabei tiefer gerueckt, nicht verschwunden",
      lage.hinweis.o > oben, `${lage.hinweis.o} gegen vorher ${oben}`);
    check("beide werden an ihrer eigenen Stelle getroffen",
      lage.barGetroffen === true && lage.hinweisGetroffen === true,
      JSON.stringify(lage));
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);

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
   * Und dieselbe Rolle kommt wieder, wenn sie ein zweites Mal drankommt. Bis
   * zur Behebung tat sie das nicht: setPointRoleText() leerte den Textknoten,
   * liess aber data-i18n-de stehen, und setLocalizedText() kehrt bei
   * gleichlautender Marke frueh zurueck - die Zeile stand dann SICHTBAR und
   * LEER da.
   *
   * Die Bedingung ist genau: DIESELBE Rolle, mit einem Punkt OHNE Rolle
   * dazwischen. Eine andere Rolle dazwischen heilt den Fall, weil sie die
   * Marke ueberschreibt - eine Folge Start/Ende/Zwischen/Start saehe deshalb
   * nichts.
   */
  for (const [nr, rolle] of [[0, "Startpunkt"], [3, "Endpunkt"]]) {
    await marks.nth(nr).click();
    await page.waitForTimeout(300);
    await marks.nth(1).click();
    await page.waitForTimeout(300);

    check(`${rolle}: der Punkt ohne Rolle dazwischen zeigt keine Zeile`,
      !(await visible("pointMeta")), await text("pointMeta"));

    await marks.nth(nr).click();
    await page.waitForTimeout(300);

    check(`${rolle}: danach steht dieselbe Rolle wieder da`,
      (await visible("pointMeta")) && (await text("pointMeta")) === rolle,
      `"${await text("pointMeta")}"`);
  }

  /* Zurueck auf den Zwischenpunkt - die naechste Zusicherung misst dort. */
  await marks.nth(1).click();
  await page.waitForTimeout(300);

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
  /*
   * Die Kurzform besteht seit Schritt 1 (dritter Durchgang) aus einzelnen
   * <span>-Marken; das Trennzeichen setzt CSS ueber ::before und steht damit
   * NICHT in textContent. Gelesen werden deshalb die Marken selbst - und
   * daneben, dass das Trennzeichen wirklich gezeichnet wird.
   */
  const stockMarken = (id) =>
    page.evaluate((x) =>
      [...document.getElementById(x).querySelectorAll("span")]
        .map((el) => el.textContent.trim()), id);

  check("die Kopfzeile fasst ihn zusammen",
    (await stockMarken("stockSummary")).join("|") === "keine Search Wire|kein Dockpfad",
    (await stockMarken("stockSummary")).join("|"));

  check("und CSS setzt das Trennzeichen zwischen die Marken",
    (await page.evaluate(() =>
      getComputedStyle(
        document.getElementById("stockSummary").querySelectorAll("span")[1],
        "::before"
      ).content)).includes("·"),
    await page.evaluate(() =>
      getComputedStyle(
        document.getElementById("stockSummary").querySelectorAll("span")[1],
        "::before"
      ).content));

  /* Mit einer echten Search Wire aendert sich beides. */
  await load([{
    type: "Feature", properties: { name: "search wire" },
    geometry: { type: "LineString", coordinates: [[2, 2], [8, 2], [14, 2]] },
  }]);

  check("mit Search Wire nennt der Bestand ihre Punktzahl",
    (await text("searchWireStock")) === "Vorhanden, 3 Punkte.",
    await text("searchWireStock"));
  check("die Kopfzeile ebenfalls",
    (await stockMarken("stockSummary")).join("|") === "Search Wire|kein Dockpfad",
    (await stockMarken("stockSummary")).join("|"));
  check("und verlaengern ist freigegeben",
    !(await page.locator("#extendSearchWireBtn").isDisabled()));

  /* ---------------------------------------------------------------- */
  console.log("Die Punktknöpfe stehen als Paare");

  /*
   * ZWEISPALTIG IST DIE ANORDNUNG IM INSPEKTOR, und die gibt es seit dem
   * elften Durchgang nur noch unterhalb der Schwelle: darueber liegen dieselben
   * Knoepfe senkrecht in der Leiste ueber der Karte. Gemessen wird deshalb bei
   * Schwelle-1, und die Breite kommt aus dem Bestand, nicht aus einer Zahl.
   */
  /*
   * 1100 px hoch, nicht 900: rollt die Spalte, wird sie in Chrome selbst zum
   * Tabstopp - ein Halt ohne id mitten in der Kette, der nichts mit der
   * DOM-Reihenfolge zu tun hat. Gemessen, nicht vermutet.
   */
  await page.setViewportSize({ width: engerAlsSchwelle, height: 1100 });
  await page.waitForTimeout(300);

  await load();
  await marks.nth(0).click();
  await page.waitForTimeout(300);

  /*
   * Die Bedingung, unter der gemessen wird, ist selbst zugesichert - sonst
   * belegte der ganze Abschnitt nur, dass irgendwo zweispaltig etwas steht.
   */
  {
    const lage = await leiste();
    check(`unter der Schwelle (${engerAlsSchwelle} px) steht die Leiste im Inspektor`,
      lage.imInspektor && !lage.imViewer && lage.inDerSpalte,
      JSON.stringify(lage));
  }

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
  await page.locator("#insertPointBeforeBtn").focus();
  const reihenfolge = ["insertPointBeforeBtn"];
  for (let i = 0; i < 4; i += 1) {
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

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);

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

  await klickeLeistenknopf("clearMultiSelectionBtn", "Auswahl aufheben");
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
  await page.setViewportSize({ width: engerAlsSchwelle, height: 900 });
  await page.waitForTimeout(300);

  {
    const lage = await leiste();
    check("die Zeilenmessung laeuft unter der Schwelle, im Inspektor",
      lage.imInspektor && !lage.imViewer, JSON.stringify(lage));
  }

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

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);

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

  /*
   * "Der erste Knopf des Blocks" gilt, solange die Knoepfe im Block stehen -
   * also unterhalb der Schwelle. Darueber liegen sie ueber der Karte, und die
   * Karte kommt in der DOM- und damit in der Tab-Reihenfolge VOR dem
   * Inspektor; das ist die dokumentierte Reihenfolge Kopfzeile - Leiste -
   * Karte - Inspektor und kein Bruch.
   */
  await page.setViewportSize({ width: engerAlsSchwelle, height: 900 });
  await page.waitForTimeout(300);

  /*
   * Seit dem elften Durchgang steht zwischen dem North-Feld und dem ersten
   * Knopf ein Halt mehr: die Knoepfe liegen nicht mehr IM Punktblock, sondern
   * in der Auswahlleiste dahinter, und die Faltzeile des Punktblocks ist ein
   * Tabstopp. Zugesichert wird deshalb, welcher KNOPF als erster kommt - dass
   * es ueberhaupt einer aus der Leiste ist, und der richtige.
   */
  const ersterKnopfNachNorth = await (async () => {
    await page.locator("#pointNorthInput").focus();
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("Tab");
      const treffer = await page.evaluate(() => document.activeElement?.tagName === "BUTTON"
        ? document.activeElement.id : null);
      if (treffer) return treffer;
    }
    return "keiner";
  })();

  check("von North fuehrt Tab zum ersten Knopf der Auswahlleiste",
    ersterKnopfNachNorth === "insertPointBeforeBtn", ersterKnopfNachNorth);

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);

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
  console.log("Kein Tausendertrenner in den E/N-Feldern");

  /*
   * Der Trenner war ein Defekt, kein Schoenheitsfehler: formatMeters() schrieb
   * ab 1000 einen Punkt ("1.234,50"), den parseLocaleNumber() nicht mehr lesen
   * konnte - replace(",", ".") ersetzt nur das ERSTE Komma, daraus wurde
   * "1.234.50" und dann NaN. Ein Punkt ab 1000 Einheiten Abstand vom Nullpunkt
   * war damit ueber die E/N-Felder ueberhaupt nicht mehr zu bearbeiten, und der
   * Editor lehnte dabei seine eigene Anzeige als "ungueltige Zahl" ab.
   *
   * Geprueft wird die Wirkung, nicht die Abwesenheit eines Zeichens: der Wert
   * muss sich aendern LASSEN. Eine Zusicherung "kein Punkt im Feld" bestuende
   * auch dann, wenn das Feld leer waere.
   */
  const enFeldRundlauf = async (sprache, eingabe, erwartet, weltDanach) => {
    await page.fill("#pointEastInput", eingabe);
    await page.locator("#pointEastInput").press("Enter");
    await page.waitForTimeout(350);

    check(`${sprache}: das Feld zeigt ${erwartet} ohne Tausendertrenner`,
      (await page.locator("#pointEastInput").inputValue()) === erwartet,
      await page.locator("#pointEastInput").inputValue());

    /*
     * Nur die letzte Ziffer aendern - und zwar an dem Text, den das Feld
     * ANZEIGT. Ein fill() mit einem selbst gebauten Literal pruefte den Defekt
     * nicht: es umginge die Anzeige und schriebe ohnehin eine Zahl ohne
     * Trenner. Der Defekt bestand darin, dass der Editor seine eigene Anzeige
     * nicht zurueckliest.
     */
    const angezeigt = await page.locator("#pointEastInput").inputValue();

    await page.fill("#pointEastInput", `${angezeigt.slice(0, -1)}6`);
    await page.locator("#pointEastInput").press("Enter");
    await page.waitForTimeout(350);

    check(`${sprache}: die geaenderte letzte Ziffer wird uebernommen`,
      (await page.evaluate(() => {
        const c = getVertexCoordinate(selectedVertex);
        return c ? toWorld(c)[0].toFixed(2) : "keine Auswahl";
      })) === weltDanach,
      await page.evaluate(() => {
        const c = getVertexCoordinate(selectedVertex);
        return c ? toWorld(c)[0].toFixed(2) : "keine Auswahl";
      }));
  };

  await load();
  await marks.nth(1).click();
  await page.waitForTimeout(300);

  await enFeldRundlauf("deutsch", "1234,5", "1234,50", "1234.56");
  await enFeldRundlauf("deutsch", "-1234,5", "-1234,50", "-1234.56");

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  /*
   * Englisch: Punkt als Dezimalzeichen. Eingetippt wird trotzdem mit Komma -
   * parseLocaleNumber() nimmt beide Zeichen an, und das soll so bleiben.
   */
  await enFeldRundlauf("englisch", "1234,5", "1234.50", "1234.56");
  await enFeldRundlauf("englisch", "-1234,5", "-1234.50", "-1234.56");

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  /*
   * Der Sprachwechsel allein muss reichen - kein Klick, kein Neuladen. Die
   * E/N-Felder haengen dafuer seit Schritt 2 am abgeleiteten Weg
   * (refreshDerivedUi -> updateSelectionPanel).
   */
  await page.fill("#pointEastInput", "12,5");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);
  await klickeLeereKarte("Abwaehlen vor dem Sprachwechsel");
  await page.waitForTimeout(200);
  await marks.nth(1).click();
  await page.waitForTimeout(300);

  check("deutsch steht das Komma im Feld",
    (await page.locator("#pointEastInput").inputValue()) === "12,50",
    await page.locator("#pointEastInput").inputValue());

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("unmittelbar nach dem Sprachwechsel steht dort der Punkt",
    (await page.locator("#pointEastInput").inputValue()) === "12.50",
    await page.locator("#pointEastInput").inputValue());

  /*
   * Ein Feld, in dem gerade getippt wird, ueberlebt den Wechsel.
   *
   * Gemessen wird das ueber setLanguage() statt ueber den Schalter, und der
   * Grund ist ein Befund: ein KLICK auf #languageToggle nimmt dem Feld
   * vorher den Fokus, der Schutz kann dabei also gar nicht greifen. Ueber
   * den Schalter wird das Feld deshalb immer neu geschrieben - richtig so,
   * dort tippt niemand mehr. Der Schutz gilt jedem kuenftigen Aufrufer von
   * refreshDerivedUi(), und heute gibt es genau einen.
   */
  await page.locator("#pointEastInput").fill("77,7");
  await page.evaluate(() => {
    document.getElementById("pointEastInput").focus();
    setLanguage("de");
  });
  await page.waitForTimeout(400);

  check("ein fokussiertes Feld wird beim Wechsel nicht ueberschrieben",
    (await page.locator("#pointEastInput").inputValue()) === "77,7",
    await page.locator("#pointEastInput").inputValue());

  /* Und ohne Fokus schreibt derselbe Weg es sehr wohl neu. */
  await page.evaluate(() => {
    document.getElementById("pointEastInput").blur();
    setLanguage("en");
  });
  await page.waitForTimeout(400);

  check("ohne Fokus schreibt derselbe Weg das Feld neu",
    (await page.locator("#pointEastInput").inputValue()) === "12.50",
    await page.locator("#pointEastInput").inputValue());

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  /* Zuruecksetzen fuer die folgenden Abschnitte. */
  await klickeLeereKarte("Zuruecksetzen nach dem Sprachwechsel");
  await page.waitForTimeout(200);

  /* ---------------------------------------------------------------- */
  console.log("Die uebrigen Meterwerte folgen ebenfalls der Sprache");

  /*
   * Schritt D: Vergleichsblock, Abmessungen und die Punktliste der
   * Feature-Navigation rechneten bis dahin mit toFixed() und zeigten damit in
   * BEIDEN Sprachen einen Punkt. Sie laufen jetzt durch dieselbe eine
   * Formatierfunktion wie die E/N-Felder.
   *
   * Geprueft wird der sichtbare Text der drei Orte, nicht formatMeters().
   */
  const meterOrte = async (sprache, komma) => {
    const zeichen = komma ? "," : ".";
    const falsch = komma ? "." : ",";
    const wort = (de, en) => (komma ? de : en);

    const delta = (await page.locator("#selectionDeltaInfo").textContent())
      .replace(/\s+/g, " ");

    check(`${sprache}: der Vergleichsblock beschriftet Ausgang und Versatz`,
      delta.includes(wort("Ausgang seit letztem Speichern:", "Baseline since last save:")) &&
      delta.includes(wort("Versatz:", "Offset:")),
      delta);

    check(`${sprache}: der Vergleichsblock nennt Ausgang und Versatz mit "${zeichen}"`,
      delta.includes(`E 40${zeichen}00 / N 0${zeichen}00 m`) &&
      delta.includes(`ΔE +0${zeichen}10 m`) &&
      delta.includes(`ΔN +0${zeichen}00 m`),
      delta);
    check(`${sprache}: und kein Wert darin traegt "${falsch}"`,
      !delta.includes(`0${falsch}10`) && !delta.includes(`0${falsch}00`),
      delta);

    check(`${sprache}: die Punktliste der Feature-Navigation ebenfalls`,
      (await page.locator(".feature-point-coord").nth(1).textContent()).trim() ===
        `40${zeichen}10 / 0${zeichen}00`,
      await page.locator(".feature-point-coord").nth(1).textContent());

    /*
     * Die Abmessungen werden seit Schritt 1 (dritter Durchgang) in BEIDEN
     * Sprachen geprueft: updateStats() steht jetzt in refreshDerivedUi().
     * Vorher behielt der Block nach einem Sprachwechsel das Zahlenformat der
     * vorigen Sprache, und die Zusicherung lief nur in der Sprache, in der er
     * entstanden war - sie haette den Defekt sonst zum Vertrag gemacht.
     */
    check(`${sprache}: die Abmessungen tragen "${zeichen}"`,
      (await page.locator("#widthStat").textContent()).trim() ===
        `40${zeichen}10 m` &&
      (await page.locator("#heightStat").textContent()).trim() ===
        `40${zeichen}00 m`,
      `${await page.locator("#widthStat").textContent()} / ` +
      `${await page.locator("#heightStat").textContent()}`);

    check(`${sprache}: die Flaechenangabe ebenfalls`,
      (await page.locator("#areaStat").textContent()).includes(`${zeichen}0 m²`),
      await page.locator("#areaStat").textContent());

    /*
     * Gradwerte: die Fahrtrichtung des ausgewaehlten Punktes. Sie lief bis
     * Schritt 1 ueber toFixed() und zeigte damit in beiden Sprachen einen
     * Punkt; seitdem geht sie durch formatNumber(), dieselbe eine Stelle wie
     * formatMeters(). Geprueft wird der sichtbare Text.
     */
    const richtung = (await page.locator("#mowerOrientationInfo").textContent())
      .replace(/\s+/g, " ");

    check(`${sprache}: die Fahrtrichtung ist beschriftet`,
      richtung.includes(wort("Richtung:", "Heading:")) &&
      richtung.includes(wort("Quelle:", "Source:")),
      richtung);

    /*
     * Der Punkt liegt nach dem Pfeiltastenschritt auf (40,10 / 0), der
     * naechste auf (40 / 40) - die Fahrtrichtung ist damit 90,1 Grad.
     */
    check(`${sprache}: und ihr Gradwert traegt "${zeichen}"`,
      richtung.includes(`90${zeichen}1°`) && !richtung.includes(`90${falsch}1°`),
      richtung);

    /*
     * Dieselbe Gradangabe ein zweites Mal, an einem anderen Ort: der Titel
     * der Maehervorschau. Er ist die einzige Beschreibung, die ein Nutzer
     * ueber der Vorschau zu sehen bekommt, und er stand bis Schritt 1 auch in
     * der englischen Oberflaeche vollstaendig auf deutsch.
     */
    const maeher = (await page.locator("#mowerGroup title").first().textContent())
      .replace(/\s+/g, " ");

    check(`${sprache}: der Titel der Maehervorschau traegt "${zeichen}"`,
      maeher.includes(`90${zeichen}1°`) && !maeher.includes(`90${falsch}1°`),
      maeher);

    check(`${sprache}: und benennt Punkt und Maeher in der Sprache`,
      maeher.includes(wort("· Punkt 2/4 ·", "· point 2/4 ·")) &&
      maeher.includes(wort("Mäher", "mower")),
      maeher);

    check(`${sprache}: die Quelle der Fahrtrichtung ist uebersetzt`,
      richtung.includes(wort(
        "Polygon-Punktfolge: aktueller → nächster Punkt",
        "Polygon point sequence: current → next point")),
      richtung);
  };

  /*
   * Der Vergleichsblock entsteht erst, wenn ein Punkt seit dem letzten
   * Speichern bewegt wurde - deshalb der Pfeiltastenschritt. Er bewegt Punkt 1
   * des Perimeters, (40,0), um 0,10 m nach Osten.
   */
  await load();

  /*
   * Die Maehervorschau wird fuer diesen Abschnitt wieder eingeschaltet -
   * load() nimmt sie heraus, damit die Markerzaehlungen weiter oben stimmen.
   * Hier wird nichts gezaehlt, dafuer traegt ihr Titel eine der fuenf
   * Gradangaben.
   */
  await page.evaluate(() => {
    const box = document.getElementById("showMowerPreview");
    if (box.checked) return;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(200);

  await marks.nth(1).click();
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);

  /*
   * Kein openAllFolds() noetig: gelesen wird ausschliesslich, und
   * textContent() traegt durch ein geschlossenes <details> hindurch -
   * nachgemessen in Etappe 7c. Geklickt wird hier nichts, und die Faltstaende
   * sind weiter oben in diesem Test eigens zugesichert.
   */
  await meterOrte("deutsch", true);

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  await meterOrte("englisch", false);

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  /* ---------------------------------------------------------------- */
  console.log("Ein einzeln gewaehlter Punkt bleibt unter dem Maeher greifbar");

  /*
   * Schritt 3, dritter Durchgang - derselbe Fall wie beim Auftrennen, nur
   * ohne Verbinden: die Maehervorschau ERSETZTE bis dahin den Marker des
   * ausgewaehlten Punktes. Er fehlte damit im SVG, und genau der Punkt, den
   * man gerade bearbeitet, war nicht mehr zu greifen.
   *
   * load() nimmt die Vorschau heraus, damit die Markerzaehlungen weiter oben
   * stimmen - hier wird sie eigens wieder eingeschaltet.
   */
  await load();

  const maeherSchalten = async (an) => {
    await page.evaluate((wert) => {
      const box = document.getElementById("showMowerPreview");
      if (box.checked === wert) return;
      box.checked = wert;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }, an);
    await page.waitForTimeout(250);
  };

  await maeherSchalten(true);

  const perimeterMarker = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  const vorAuswahl = await perimeterMarker.count();

  await marks.nth(2).click();
  await page.waitForTimeout(300);

  check("mit Maeher bleibt die Markerzahl unveraendert",
    (await perimeterMarker.count()) === vorAuswahl,
    `${await perimeterMarker.count()} statt ${vorAuswahl}`);

  check("und kein Marker traegt einen gelben Auswahlring",
    (await page.locator("#vertexGroup circle.selected").count()) === 0,
    String(await page.locator("#vertexGroup circle.selected").count()));

  const gewaehlterSchluessel = await page.evaluate(() =>
    document.querySelector('#vertexGroup circle[data-layer="perimeter"]:nth-of-type(3)')
      ?.dataset.vertexKey || null);

  /*
   * Der Schluessel kann null sein - das Element muss es nicht geben. Ohne
   * diese Zusicherung entstuende der Selektor
   * circle[data-vertex-key="null"], und boundingBox() wartete dreissig
   * Sekunden auf ein Element, das es nicht gibt: aus einem klaren Befund
   * wuerde ein stummer Abbruch. Gemessen wurde derselbe Fall in
   * test-merge.mjs.
   */
  check("der Perimeterpunkt hat einen eigenen Marker",
    Boolean(gewaehlterSchluessel),
    "kein Marker mit data-vertex-key an dritter Stelle");

  if (gewaehlterSchluessel) {
    const punktGetroffen = await elementGetroffen(
      page, `#vertexGroup circle[data-vertex-key="${gewaehlterSchluessel}"]`, { dy: 5 });
    check("der ausgewaehlte Punkt ist wirklich getroffen, nicht vom Maeher verdeckt",
      punktGetroffen.ok, JSON.stringify(punktGetroffen));

    /* Ziehen: die Koordinate danach ist die Wirkung, nicht der Zustand davor. */
    const vorherE = (await page.locator("#pointEastInput").inputValue());
    const markerKasten = await page.locator(
      `#vertexGroup circle[data-vertex-key="${gewaehlterSchluessel}"]`).boundingBox();

    await page.mouse.move(
      markerKasten.x + markerKasten.width / 2,
      markerKasten.y + markerKasten.height / 2);
    await page.mouse.down();
    await page.mouse.move(markerKasten.x + markerKasten.width / 2 + 45,
      markerKasten.y + markerKasten.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    check("und ein Zug an ihm verschiebt ihn wirklich",
      (await page.locator("#pointEastInput").inputValue()) !== vorherE,
      `${vorherE} -> ${await page.locator("#pointEastInput").inputValue()}`);

    await maeherSchalten(false);

    check("ohne Maeher traegt genau ein Marker den Auswahlring",
      (await page.locator("#vertexGroup circle.selected").count()) === 1,
      String(await page.locator("#vertexGroup circle.selected").count()));
    check("und die Markerzahl ist dieselbe wie mit Maeher",
      (await perimeterMarker.count()) === vorAuswahl,
      `${await perimeterMarker.count()} statt ${vorAuswahl}`);
  }

  /* ---------------------------------------------------------------- */
  console.log("Eine Einmalmeldung wird beim Sprachwechsel verworfen");

  /*
   * Schritt 2, dritter Durchgang. Eine Einmalmeldung kann niemand
   * nachrechnen; setLocalizedText() legt deshalb das deutsche Original am
   * Element ab - mitsamt der ZAHL in dem Format, das beim Erzeugen galt. Eine
   * auf deutsch erzeugte Meldung zeigte im Englischen weiter "E=12,50 m", und
   * dieselbe Meldung hatte ueberdies gar keine englische Fassung.
   *
   * Beides ist mit derselben Entscheidung erledigt: sie ist fluechtig und
   * wird beim Sprachwechsel VERWORFEN - zurueck auf den Ruhetext aus dem
   * Markup, nicht geleert, sonst faellt Zeile 2 der Statuszeile auf Hoehe 0
   * zusammen und die Karte springt.
   */
  await load();
  await marks.nth(1).click();
  await page.waitForTimeout(250);
  await page.fill("#pointEastInput", "12,50");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(400);

  const meldung = () => page.locator("#editStatus").textContent();
  const zeilenhoehe = () => page.evaluate(() => Math.round(
    document.querySelector(".status-transient").getBoundingClientRect().height));

  check("die Einmalmeldung nennt den gesetzten Wert mit Komma",
    (await meldung()).includes("E=12,50 m"), await meldung());

  const hoeheVorher = await zeilenhoehe();

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(600);

  check("nach dem Sprachwechsel steht die veraltete Meldung nicht mehr da",
    !(await meldung()).includes("12,50"), await meldung());
  check("stattdessen der englische Ruhetext",
    (await meldung()).trim() === "Points can be clicked and then dragged.",
    await meldung());
  check("und die Zeile behaelt ihre Hoehe",
    (await zeilenhoehe()) === hoeheVorher,
    `${await zeilenhoehe()} statt ${hoeheVorher}`);

  /*
   * Die andere Haelfte derselben Frage: der Rasterstatus ist DAUERHAFT und
   * ableitbar, er wird deshalb neu gebaut statt verworfen.
   */
  check("englisch: der Rasterstatus ist neu gebaut",
    (await page.locator("#gridStatus").textContent()).replace(/\s+/g, " ").trim() ===
      "Grid spacing: 0.10 m",
    await page.locator("#gridStatus").textContent());

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(600);

  check("zurueck auf deutsch steht der deutsche Ruhetext",
    (await meldung()).trim() === "Punkte lassen sich anklicken und anschließend ziehen.",
    await meldung());
  check("deutsch: der Rasterstatus traegt wieder das Komma",
    (await page.locator("#gridStatus").textContent()).includes("0,10 m"),
    await page.locator("#gridStatus").textContent());

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

  /* ---------------------------------------------------------------- */
  console.log("Der Loeschknopf beugt Einzahl und Mehrzahl, in beiden Sprachen");

  /*
   * Drei Befunde in einem Abschnitt, alle drei im zwanzigsten Durchgang
   * gemessen und behoben (CLAUDE.md, Abschnitt 7):
   *
   *   - der title im MARKUP war tot: updateMultiSelectionUi() setzt ihn schon
   *     vor der ersten geladenen Karte, der Markup-Text stand zu keinem
   *     Zeitpunkt da;
   *   - deutsch wurde das Nomen gebeugt, das Adjektiv nicht ("1 ausgewaehlte
   *     Punkt entfernen");
   *   - englisch trug das Muster die Klammerform "point(s)", also eine
   *     Umgehung statt einer Uebersetzung.
   *
   * Gemessen wird in BEIDEN Richtungen (Regel (e) in Abschnitt 4.2): in der
   * einen Sprache erzeugt, umgeschaltet, dann gelesen - und umgekehrt. Der
   * Wechsel laeuft ueber setLanguage(), damit zwischen Wechsel und Messung
   * keine Handlung liegt, die den Titel ohnehin neu schriebe.
   */
  await load();

  const loeschTitel = () => page.getAttribute("#deleteMultiSelectionBtn", "title");
  const sprache = (wert) => page.evaluate((w) => setLanguage(w), wert);

  /*
   * Dass der tote title im MARKUP weg ist, sichert dieser Test NICHT zu, und
   * das ist Absicht: document.documentElement.innerHTML liefert das laufende
   * DOM, in dem updateMultiSelectionUi() den Titel laengst gesetzt hat - eine
   * Zusicherung hier maesse die Laufzeit und nicht das Markup. Abgedeckt ist
   * es in der statischen Stufe ueber die Bestandszahlen title-markup und
   * title-fundstellen: ein wieder eingebauter Markup-title hebt beide, und
   * check-bestandszahlen.mjs meldet es.
   */
  await marks.nth(0).click();
  await page.waitForTimeout(250);
  const einDe = await loeschTitel();
  check("deutsch, ein Punkt: das Adjektiv ist mitgebeugt",
    einDe === "Löschen: 1 ausgewählten Punkt entfernen. Mit Undo rückgängig.",
    einDe);

  await sprache("en");
  await page.waitForTimeout(250);
  const einEnNachWechsel = await loeschTitel();
  check("auf deutsch erzeugt, dann englisch: Einzahl ohne Klammerform",
    einEnNachWechsel === "Delete: remove 1 selected point. Undo is available.",
    einEnNachWechsel);

  await marks.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(250);
  const zweiEn = await loeschTitel();
  check("auf englisch erzeugt: die Mehrzahl steht englisch da",
    zweiEn === "Delete: remove 2 selected points. Undo is available.", zweiEn);

  await sprache("de");
  await page.waitForTimeout(250);
  const zweiDeNachWechsel = await loeschTitel();
  check("auf englisch erzeugt, dann deutsch: die Mehrzahl ist deutsch",
    zweiDeNachWechsel === "Löschen: 2 ausgewählte Punkte entfernen. Mit Undo rückgängig.",
    zweiDeNachWechsel);

  check("keine Klammerform in irgendeiner der vier Fassungen",
    ![einDe, einEnNachWechsel, zweiEn, zweiDeNachWechsel]
      .some((t) => t.includes("(s)")),
    [einDe, einEnNachWechsel, zweiEn, zweiDeNachWechsel].join(" | "));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Der Inspektor zeigt genau einen Zustand und bleibt tastaturbedienbar.");
