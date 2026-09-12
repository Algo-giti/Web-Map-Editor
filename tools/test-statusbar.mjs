#!/usr/bin/env node
// Browsertest für die beiden Streifen am unteren Rand: Legende und
// Statuszeile.
//
// Sie fasst sieben bisher verstreute Ausgaben zusammen, zehn davon lagen in
// einklappbaren Bereichen. Geprüft wird die Gliederung nach Beständigkeit:
// vier dauerhafte Angaben an festen Plätzen, EIN Platz für drei flüchtige
// Quellen, rechts die beiden Anzeigen, die sich ständig ändern.
//
// Der wichtigste Fall ist der letzte Abschnitt: der Zeichenstatus ist
// abgeleitet und wird bei jeder Geometrieänderung neu geschrieben. Ohne die
// Sonderregel überschriebe sein Leerlauftext jede Erfolgsmeldung genau in dem
// Moment, in dem sie erscheint.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-statusbar.mjs

import {
  createChecker,
  createKlicker,
  createMenueBefehl,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-statusbar";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/** Karte in rohen Metern mit einem Befund, damit die Prüfung etwas meldet. */
const MAP = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [40, 0], [40, 40], [0, 40], [0, 0],
      ]] },
    },
    {
      type: "Feature",
      idx: 0,
      properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [[
        [50, 50], [60, 50], [60, 60], [50, 60], [50, 50],
      ]] },
    },
  ],
});

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();
  const menueBefehl = createMenueBefehl(page, check);
  const klickeFreienKnopf = createKlicker(page, check);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  /*
   * Die Faltgeste kommt aus dem browser-harness, nicht aus einer eigenen Kopie.
   * openAllFolds() steht dort seit Etappe 6 b2 - er wurde nur nie benutzt, und
   * deshalb erreichte die Reparatur in 3c (die Feature-Karten der Navigation)
   * zunaechst keinen einzigen Test. Eine Geste an sieben Stellen wird an sechs
   * davon vergessen.
   */

  const text = (id) => page.locator(`#${id}`).textContent();

  /** Welche der drei flüchtigen Quellen ist gerade sichtbar? */
  const visibleTransient = () =>
    page.evaluate(() =>
      ["editStatus", "drawFeatureStatus", "multiSelectionStatus"]
        .filter((id) => !document.getElementById(id).hidden));

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  /* ---------------------------------------------------------------- */
  console.log("Zustand 1: nichts geladen");

  check("die Zeile ist sichtbar", await page.locator("#statusBar").isVisible());
  check("sie liegt in keinem aufklappbaren Bereich",
    await page.evaluate(() => !document.getElementById("statusBar").closest("details")));

  check("Dateiname", (await text("filename")).trim() === "Keine Karte geladen",
    await text("filename"));
  check("Maßstab ist leer", (await text("scaleStatus")).trim() === "–",
    await text("scaleStatus"));
  check("Bezugspunkt", (await text("originShort")).trim() === "nicht gesetzt",
    await text("originShort"));
  check("Prüfung", (await text("validationShort")).trim() === "nicht geprüft",
    await text("validationShort"));
  check("Auswahlzähler", (await text("multiSelectionInfo")).includes("0"),
    await text("multiSelectionInfo"));

  check("genau eine flüchtige Meldung sichtbar",
    (await visibleTransient()).length === 1,
    JSON.stringify(await visibleTransient()));

  /* ---------------------------------------------------------------- */
  console.log("Zustand 2: Karte geladen, keine Auswahl");

  await page.locator("#fileInput").setInputFiles({
    name: "bar.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(MAP),
  });
  await page.waitForTimeout(400);
  await openAllFolds(page);

  check("Dateiname nennt Slot und Datei",
    (await text("filename")).includes("Karte A") &&
    (await text("filename")).includes("bar.geojson"),
    await text("filename"));
  check("Maßstab wird als angenommen benannt",
    (await text("scaleStatus")).includes("angenommen"), await text("scaleStatus"));

  /*
   * Sechstes Feld: die Rasterweite. Seit Etappe 6 b3 steht sie sonst nur im
   * Rasterfenster - ohne dieses Feld waere sie nirgends nachschlagbar, ohne
   * das Fenster aufzumachen.
   */
  check("das Rasterfeld nennt die Weite",
    (await text("gridShort")).trim() === "0,10 m", await text("gridShort"));
  check("und sein title nennt beide Bedeutungen",
    await page.evaluate(() => {
      const t = document.getElementById("gridShort").closest(".status-field")
        .getAttribute("title") || "";
      return t.includes("Rasterweite") && t.includes("Pfeiltasten");
    }));

  /* Kurzformen bleiben kurz - das ist die Bedingung, unter der sie taugen. */
  for (const id of ["scaleStatus", "originShort", "gridShort", "validationShort"]) {
    check(`#${id} bleibt unter 30 Zeichen`,
      (await text(id)).trim().length <= 30, `${id}: ${await text(id)}`);
  }

  /* ---------------------------------------------------------------- */
  console.log("Prüfergebnis als Kurzform");

  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(400);

  const short = (await text("validationShort")).trim();

  check("die Kurzform nennt Zahlen", /\d/.test(short), short);
  check("sie nennt Warnungen", short.includes("Warnung"), short);
  check("sie bleibt kurz", short.length <= 30, `${short.length}: ${short}`);
  /*
   * Der Bericht steht seit Etappe 5 im Inspektor, nicht mehr in der
   * Seitenleiste - die es seit 7e ueberhaupt nicht mehr gibt. Gemessen hat
   * diese Zusicherung immer #validationReport, also die richtige Stelle; nur
   * ihre Beschriftung nannte die falsche.
   */
  check("der ausführliche Bericht bleibt im Inspektor",
    (await text("validationReport")).length > short.length,
    String((await text("validationReport")).length));

  /* ---------------------------------------------------------------- */
  console.log("Zustand 3: Punkt ausgewählt und gezogen");

  const marks = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  await marks.nth(0).click();
  await page.waitForTimeout(250);

  check("der Zähler zählt mit",
    (await text("multiSelectionInfo")).includes("1"), await text("multiSelectionInfo"));
  check("die Meldung kommt aus editStatus",
    (await visibleTransient())[0] === "editStatus",
    JSON.stringify(await visibleTransient()));
  check("weiterhin nur eine sichtbar",
    (await visibleTransient()).length === 1,
    JSON.stringify(await visibleTransient()));

  /* ---------------------------------------------------------------- */
  console.log("Zustand 4: Zeichenwerkzeug aktiv");

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  /*
   * Direkt nach dem Werkzeugklick gewinnt die Anweisung aus editStatus - sie
   * ist die jüngste Meldung und sagt genau das Richtige. Der Zeichenstatus
   * übernimmt, sobald er etwas Eigenes zu melden hat, also ab dem ersten
   * gesetzten Punkt.
   */
  check("zuerst steht die Anweisung",
    (await visibleTransient())[0] === "editStatus" &&
    (await text("editStatus")).includes("Exclusion"),
    `${JSON.stringify(await visibleTransient())} ${await text("editStatus")}`);

  const svg = await page.locator("#svg").boundingBox();
  await page.mouse.click(svg.x + svg.width * 0.4, svg.y + svg.height * 0.4);
  await page.waitForTimeout(300);

  check("nach dem ersten Punkt übernimmt der Zeichenstatus",
    (await visibleTransient())[0] === "drawFeatureStatus",
    JSON.stringify(await visibleTransient()));
  check("und nennt Werkzeug und Fortschritt",
    (await text("drawFeatureStatus")).includes("Exclusion") &&
    /\d/.test(await text("drawFeatureStatus")),
    await text("drawFeatureStatus"));

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------------- */
  console.log("Der abgeleitete Zeichenstatus verdrängt keine Erfolgsmeldung");

  /*
   * Genau hier lag die Gefahr der Zusammenlegung: setEditStatus() schreibt die
   * Erfolgsmeldung, unmittelbar danach läuft afterGeometryEdit() und mit ihm
   * updateFeatureDrawUi(). Dürfte der Zeichenstatus jederzeit übernehmen, wäre
   * die Meldung weg, bevor sie jemand lesen kann.
   */
  await marks.nth(0).click();
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);

  check("nach einer Geometrieänderung steht die Meldung noch",
    (await visibleTransient())[0] === "editStatus",
    JSON.stringify(await visibleTransient()));
  check("und sie hat Inhalt",
    (await text("editStatus")).trim().length > 0, await text("editStatus"));

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  check("auch nach Undo bleibt es bei einer Meldung",
    (await visibleTransient()).length === 1,
    JSON.stringify(await visibleTransient()));

  /* ---------------------------------------------------------------- */
  console.log("Das Prüfergebnis flackert nicht");

  /*
   * Nach einer Bearbeitung ist die Karte ungeprüft, und das soll sie bleiben,
   * bis jemand erneut prüft. Ein Hin und Her zwischen "2 Warnungen" und
   * "nicht geprüft" waere in einer dauerhaft sichtbaren Zeile unruhig.
   */
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(350);

  check("nach dem Prüfen steht ein Ergebnis",
    (await text("validationShort")).trim() !== "nicht geprüft",
    await text("validationShort"));

  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(200);

  const box = await page.locator("#svg").boundingBox();
  const seen = [];

  for (const [dx, dy] of [[0.3, 0.3], [0.45, 0.3], [0.45, 0.45], [0.3, 0.45]]) {
    await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy);
    await page.waitForTimeout(120);
    seen.push((await text("validationShort")).trim());
  }

  await page.locator("#finishDrawBtn").click();
  await page.waitForTimeout(400);
  seen.push((await text("validationShort")).trim());

  check("das Ergebnis wechselt höchstens einmal",
    new Set(seen).size <= 2, JSON.stringify(seen));
  check("und endet bei ungeprüft",
    seen[seen.length - 1] === "nicht geprüft", JSON.stringify(seen));

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------------- */
  console.log("Sprachwechsel");

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("die Kurzform des Maßstabs ist übersetzt",
    (await text("scaleStatus")).includes("assumed"), await text("scaleStatus"));
  check("die Beschriftungen sind übersetzt",
    (await page.locator("#statusBar").textContent()).includes("Scale"),
    (await page.locator("#statusBar").textContent()).slice(0, 120));

  /*
   * Das Dezimalzeichen wechselt mit der Sprache, und zwar OHNE weitere
   * Aktion: das Rasterfeld ist abgeleitet und wird beim Wechsel neu
   * geschrieben. Gemessen wird unmittelbar nach dem Umschalten - stuende
   * hier erst ein Klick oder ein Laden dazwischen, bewiese die Zusicherung
   * nur, dass irgendwann neu formatiert wird.
   */
  check("englisch: das Rasterfeld zeigt den Punkt als Dezimalzeichen",
    (await text("gridShort")).trim() === "0.10 m", await text("gridShort"));

  /*
   * Die Cursor-Koordinaten entstehen nur im pointermove-Handler - sie sind
   * die einzige der vier Stellen, die sich beim Sprachwechsel NICHT von
   * selbst erneuert. Deshalb wird hier bewusst zuerst die Maus bewegt.
   */
  const karte = await page.locator("#svg").boundingBox();
  await page.mouse.move(karte.x + karte.width / 2, karte.y + karte.height / 2);
  await page.waitForTimeout(250);

  check("englisch: die Cursor-Koordinaten zeigen den Punkt",
    /^E: -?\d+\.\d\d m\s+N: -?\d+\.\d\d m$/.test((await text("hud")).trim()),
    await text("hud"));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und kommen zurück",
    (await text("scaleStatus")).includes("angenommen"), await text("scaleStatus"));

  check("deutsch: das Rasterfeld zeigt wieder das Komma",
    (await text("gridShort")).trim() === "0,10 m", await text("gridShort"));

  await page.mouse.move(karte.x + karte.width / 2 + 20, karte.y + karte.height / 2 + 20);
  await page.waitForTimeout(250);

  check("deutsch: die Cursor-Koordinaten zeigen wieder das Komma",
    /^E: -?\d+,\d\d m\s+N: -?\d+,\d\d m$/.test((await text("hud")).trim()),
    await text("hud"));

  /* ---------------------------------------------------------------- */
  console.log("Zwei Zeilen");

  const geometry = () =>
    page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const bar = r("#statusBar");
      const zeile2 = r(".status-transient");
      const zaehler = r("#multiSelectionInfo");
      const feld = r(".status-field");
      const stil = getComputedStyle(document.getElementById("editStatus"));
      return {
        barBreite: Math.round(bar.width),
        barHoehe: Math.round(bar.height),
        barLinks: Math.round(bar.left),
        zeile2Breite: Math.round(zeile2.width),
        zeile2Oben: Math.round(zeile2.top),
        zaehlerOben: Math.round(zaehler.top),
        zaehlerRechts: Math.round(zaehler.right),
        feldOben: Math.round(feld.top),
        minHeight: stil.minHeight,
        maxWidth: stil.maxWidth,
        unten: Math.round(document.getElementById("editStatus").getBoundingClientRect().bottom),
        barUnten: Math.round(bar.bottom),
      };
    });

  const g = await geometry();

  check("die Meldung steht in einer eigenen Zeile",
    g.zeile2Oben > g.feldOben, JSON.stringify(g));
  check("die dauerhaften Felder und der Zähler teilen sich Zeile 1",
    g.zaehlerOben === g.feldOben, JSON.stringify(g));
  check("Zeile 2 nimmt die volle Breite",
    g.zeile2Breite >= g.barBreite - 32, JSON.stringify(g));
  check("der Zähler steht rechts, nicht neben den Feldern",
    g.zaehlerRechts > g.barLinks + g.barBreite * 0.6, JSON.stringify(g));

  /*
   * Wächter gegen einen Fehler aus Etappe 1: die drei Elemente kommen aus der
   * Seitenleiste und waren dort eigenständige Panels. min-height:34px und
   * max-width:260px blieben beim Umzug stehen - der Text klebte am oberen Rand
   * einer zu hohen Box, ragte einen Pixel unter die Leiste und die
   * Auswahlmeldung wurde bei 260 px abgeschnitten, unabhängig vom Platz.
   */
  check("die Panel-Mindesthöhe ist zurückgenommen",
    g.minHeight === "0px", g.minHeight);
  check("die Panel-Maximalbreite ist zurückgenommen",
    g.maxWidth === "none", g.maxWidth);
  check("nichts ragt unter die Leiste",
    g.unten <= g.barUnten, JSON.stringify(g));

  /* Eine lange Meldung darf nicht mehr abgeschnitten werden. */
  await page.evaluate(() =>
    setEditStatus("Karte A und B wurden verbunden. Der neue Perimeter ist geschlossen; " +
      "Karte B wurde aus dem Arbeitsbereich entfernt."));
  await page.waitForTimeout(200);

  const lang = await page.evaluate(() => {
    const el = document.getElementById("editStatus");
    return { sichtbar: Math.round(el.clientWidth), noetig: Math.round(el.scrollWidth) };
  });

  check("eine 114 Zeichen lange Meldung passt vollständig",
    lang.noetig <= lang.sichtbar, JSON.stringify(lang));

  /* Die Zeile bleibt auch ohne Meldung bestehen - sonst springt die Karte. */
  await page.evaluate(() => setEditStatus(""));
  await page.waitForTimeout(200);

  const leer = await geometry();

  check("ohne Meldung bleibt die Zeile stehen",
    leer.barHoehe === g.barHoehe, `${leer.barHoehe} statt ${g.barHoehe}`);

  /* ---------------------------------------------------------------- */
  console.log("Legende");

  const legend = page.locator("#mapLegend");

  check("die Legende ist sichtbar", await legend.isVisible());
  check("sie steckt in keinem aufklappbaren Bereich",
    await page.evaluate(() => !document.getElementById("mapLegend").closest("details")));
  check("alle sieben Einträge sind da",
    (await page.locator("#mapLegend .legend").count()) === 7,
    String(await page.locator("#mapLegend .legend").count()));
  check("jeder Eintrag hat ein Farbfeld",
    (await page.locator("#mapLegend .legend .swatch").count()) === 7);

  /* Waagerecht heißt: alle Einträge auf derselben Höhe. */
  const rows = await page.evaluate(() =>
    new Set([...document.querySelectorAll("#mapLegend .legend")]
      .map((el) => Math.round(el.getBoundingClientRect().top))).size);

  check("sie steht in einer Reihe", rows === 1, `${rows} Zeilen`);

  /* Und sie liegt über der Statuszeile, nicht darunter. */
  const order = await page.evaluate(() => {
    const l = document.getElementById("mapLegend").getBoundingClientRect();
    const s = document.getElementById("statusBar").getBoundingClientRect();
    return {legende:Math.round(l.top), status:Math.round(s.top)};
  });

  check("die Legende liegt über der Statuszeile",
    order.legende < order.status, JSON.stringify(order));

  check("sie ist übersetzt",
    (await legend.textContent()).includes("Legend"),
    (await legend.textContent()).slice(0, 80));

  /* ---------------------------------------------------------------- */
  console.log("Legende und Darstellung haben EINE Farbquelle");

  /*
   * Vorher standen dieselben Farben zweimal: als Variable in der Darstellung
   * und als fester Hex-Wert im style-Attribut der Legende. Zwei Quellen fuer
   * dieselbe Farbe laufen auseinander, sobald jemand nur eine davon anfasst -
   * und eine falsche Legende ist schlimmer als gar keine.
   *
   * Verglichen wird der BERECHNETE Wert des Farbtupfers mit dem berechneten
   * Wert der Regel, die dasselbe auf der Karte zeichnet. Ein Vergleich der
   * Quelltexte ("beide sagen var(--map-perimeter)") bewiese nichts: er ginge
   * auch dann auf, wenn die Variable gar nicht existiert.
   */
  const abgleich = await page.evaluate(() => {
    const buehne = document.createElement("div");
    buehne.style.cssText = "position:absolute;left:-9999px;top:0;";
    document.body.appendChild(buehne);

    const ergebnis = [...document.querySelectorAll("#mapLegend [data-legend]")]
      .map((eintrag) => {
        const name = eintrag.textContent.trim();
        const tupfer = getComputedStyle(eintrag.querySelector(".swatch"));

        /*
         * Die zugehoerige Kartenregel auf ein Probe-Element anwenden. Fuer die
         * Formen zaehlt stroke, fuer die Punktrollen fill - beide werden
         * geprueft und der Wert genommen, der eine Farbe liefert.
         */
        const klassen = eintrag.dataset.legend.split(".").filter(Boolean);
        const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
        probe.setAttribute("class", klassen.join(" "));
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.appendChild(probe);
        buehne.appendChild(svg);

        /*
         * Welche Eigenschaft die Bedeutung traegt, steht am Eintrag: bei den
         * Formen der Strich, bei den Punktrollen die Fuellung. Sie zu raten
         * ginge schief - der dunkle Rand eines Startpunktes ist auch eine
         * Farbe, nur nicht die gemeinte.
         */
        const cs = getComputedStyle(probe);
        const karte = cs[eintrag.dataset.legendProp];

        svg.remove();

        return { name, legende: tupfer.borderTopColor, karte };
      });

    buehne.remove();
    return ergebnis;
  });

  check("die Legende hat Eintraege", abgleich.length >= 7, String(abgleich.length));

  const abweichung = abgleich.filter((e) => e.legende !== e.karte);

  check("jeder Legendeneintrag hat dieselbe Farbe wie seine Kartenregel",
    abweichung.length === 0,
    abweichung.map((e) => `${e.name}: Legende ${e.legende} / Karte ${e.karte}`).join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Ausblendreihenfolge: das Nachschlagbare weicht zuerst");

  /*
   * Geprueft ueber den BERECHNETEN Stil, nicht ueber die Medienregel im
   * Quelltext: nur so steht fest, was der Browser daraus macht.
   */
  const sichtbareFelder = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#statusBar .status-field")]
        .filter((f) => getComputedStyle(f).display !== "none")
        .map((f) => f.querySelector(".status-label").textContent.trim()));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);

  check("bei 1280 px stehen alle fünf Felder",
    (await sichtbareFelder()).join(",") === "Karte,Maßstab,Raster,Bezugspunkt,Prüfung",
    (await sichtbareFelder()).join(","));

  /*
   * Etappe 8c: die Kante der Schwelle wird weiter unten im eigenen Abschnitt
   * geprueft, mit dem unguenstigsten Inhalt und in beiden Sprachen. Hier
   * stehen nur die beiden Faelle, die von ihm unabhaengig sind.
   */
  await page.setViewportSize({ width: 760, height: 800 });
  await page.waitForTimeout(300);

  check("unter der Schwelle weichen Raster, Bezugspunkt und Prüfung",
    (await sichtbareFelder()).join(",") === "Karte,Maßstab",
    (await sichtbareFelder()).join(","));

  /*
   * Und zwar, WEIL sie data-optional tragen - nicht, weil sie an dritter,
   * vierter und fuenfter Stelle stehen. Die Zusicherung vergleicht die
   * Markierung mit dem berechneten Stil; eine Rueckkehr zu :nth-of-type()
   * faellt damit auf, sobald jemand ein Feld dazwischenschiebt.
   */
  const markierungGegenWirkung = await page.evaluate(() =>
    [...document.querySelectorAll("#statusBar .status-field")].map((f) => ({
      feld: f.querySelector(".status-label").textContent.trim(),
      markiert: f.hasAttribute("data-optional"),
      weg: getComputedStyle(f).display === "none",
    })));

  check("genau die markierten Felder sind weg, und nur sie",
    markierungGegenWirkung.every((f) => f.markiert === f.weg),
    JSON.stringify(markierungGegenWirkung));

  check("Zähler und Koordinaten bleiben",
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("multiSelectionInfo")).display !== "none"));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);

  check("und kommen bei mehr Platz zurück",
    (await sichtbareFelder()).length === 5,
    (await sichtbareFelder()).join(","));

  /* ---------------------------------------------------------------- */
  console.log("Etappe 8c: die Schwelle traegt den unguenstigsten Inhalt");

  /*
   * Die Schwelle der data-optional-Felder soll halten, was ihr Name sagt:
   * oberhalb stehen alle sieben Felder VOLLSTAENDIG da, unterhalb weichen
   * drei. Geprueft wird deshalb das Abschneiden je Textbehaelter ueber
   * scrollWidth > clientWidth - NICHT ueber die Summe der gerenderten
   * Breiten. Die kann nicht falsch werden: eine gerenderte Breite ist nie
   * groesser als der Platz, den das Layout zugeteilt hat. Genau daran lag
   * es, dass die frueheren vier Zusicherungen "passen ohne Stauchung" auch
   * bei 800 px bestanden, wo vier Felder sichtbar gekuerzt waren.
   *
   * Geprueft werden ALLE sieben Felder. Auswahlzaehler und
   * Cursor-Koordinaten tragen keinen .status-value, sondern ihren Text
   * unmittelbar - wer nach der Klasse sucht, uebersieht sie.
   *
   * Die Schwelle wird aus der CSS-Regel GELESEN, nicht als Zahl verdrahtet.
   * Ein Test, der seine eigene Schwelle nicht kennt, prueft eine Erinnerung
   * an sie.
   */
  const schwelleAusCss = await page.evaluate(() => {
    for (const blatt of document.styleSheets) {
      let regeln;
      try { regeln = blatt.cssRules; } catch { continue; }
      for (const regel of regeln || []) {
        if (regel.type !== CSSRule.MEDIA_RULE) continue;
        const trifft = [...regel.cssRules].some((r) =>
          r.selectorText && r.selectorText.includes("[data-optional]"));
        if (!trifft) continue;
        const treffer = regel.conditionText.match(/max-width:\s*(\d+)px/);
        if (treffer) return Number(treffer[1]) + 1;
      }
    }
    return null;
  });

  check("die Schwelle steht als Medienregel im CSS und ist lesbar",
    Number.isFinite(schwelleAusCss), String(schwelleAusCss));

  if (Number.isFinite(schwelleAusCss)) {
    /*
     * Der unguenstigste Inhalt entsteht ueber Bedienung und Testdatei -
     * nichts davon ist per textContent gesetzt, sonst pruefte der Test
     * seine eigene Eingabe statt der Oberflaeche.
     *
     *   Massstab      Karte mit Ausdehnung > 1 ohne coordinateScale
     *   Raster        Rasterfenster, 100 eingetippt
     *   Bezugspunkt   zwei Karten mit verschiedener RTK-Basis
     *   Pruefung      123 namenlose Features, 31 ueberlappende Exclusions
     *   Zaehler       "Ganzes Feature auswaehlen" auf 128 Punkten
     *   Cursor        echte Zeigerbewegung in die linke untere Ecke
     *
     * Der Dateiname bleibt kurz: Spalte 1 ist minmax(0,auto) und schrumpft
     * als einzige - ein langer Name wird in JEDER Breite gekuerzt, und eine
     * Schwelle, unter der "nichts abgeschnitten" fuer jeden Namen gilt, gibt
     * es deshalb nicht.
     */
    const ring = [];
    for (let i = 0; i < 128; i++) {
      const winkel = (i / 128) * Math.PI * 2;
      ring.push([
        Math.round(Math.cos(winkel) * 11111 * 100) / 100,
        Math.round(Math.sin(winkel) * 11111 * 100) / 100,
      ]);
    }
    ring.push([...ring[0]]);

    const breiteFeatures = [
      { type: "Feature", properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [ring] } },
    ];
    for (let i = 0; i < 123; i++) {
      breiteFeatures.push({
        type: "Feature", properties: { name: `unbekannter typ ${i}` },
        geometry: { type: "LineString",
          coordinates: [[100 + i, 100], [110 + i, 110]] },
      });
    }
    for (let i = 0; i < 31; i++) {
      breiteFeatures.push({
        type: "Feature", idx: i, properties: { name: "exclusion" },
        geometry: { type: "Polygon", coordinates: [[
          [i, 0], [i + 20, 0], [i + 20, 20], [i, 20], [i, 0],
        ]] },
      });
    }

    const ladeKarte = async (selektor, name, inhalt) => {
      await page.locator(selektor).setInputFiles({
        name, mimeType: "application/geo+json",
        buffer: Buffer.from(JSON.stringify(inhalt)),
      });
      await page.waitForTimeout(500);
    };

    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.waitForTimeout(250);

    await ladeKarte("#fileInput", "k.geojson", {
      type: "FeatureCollection", referenceOrigin: { lat: 48.1, lon: 11.5 },
      features: [{ type: "Feature", properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [0, 0], [50, 0], [50, 50], [0, 50], [0, 0],
        ]] } }],
    });
    await ladeKarte("#secondFileInput", "a.geojson", {
      type: "FeatureCollection", referenceOrigin: { lat: 48.2, lon: 11.6 },
      features: breiteFeatures,
    });

    await openAllFolds(page);
    await klickeFreienKnopf("#validateMapBtn", "die Kartenprüfung ist frei");
    await page.waitForTimeout(1400);

    await menueBefehl("Ansicht", "Raster…");
    await page.waitForTimeout(250);
    await page.locator("#gridStepInput").fill("100");
    await page.locator("#gridStepInput").press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await openAllFolds(page);
    await klickeFreienKnopf(
      '[data-action="select-whole-feature"] >> nth=0',
      "„Ganzes Feature auswählen“ ist frei");
    await page.waitForTimeout(400);

    /*
     * Die Kartenansicht wird vor jeder Sprachrunde neu eingepasst, damit die
     * Cursor-Koordinaten aus derselben Lage entstehen und in beiden Sprachen
     * gleich lang sind. Ohne das misst die zweite Runde einen kuerzeren Text
     * und sieht dadurch guenstiger aus, als sie ist.
     */
    const zeigerInDieEcke = async () => {
      await page.locator("#fitBtn").click();
      await page.waitForTimeout(250);
      const kasten = await page.locator("#svg").boundingBox();
      await page.mouse.move(kasten.x + 12, kasten.y + kasten.height - 12);
      await page.waitForTimeout(200);
    };

    /** Welche Textbehaelter sind abgeschnitten? Alle sieben Felder. */
    const abgeschnitten = () =>
      page.evaluate(() => {
        const bar = document.getElementById("statusBar");
        const sichtbar = [...bar.children].filter((el) =>
          !el.classList.contains("status-transient") &&
          getComputedStyle(el).display !== "none");
        const treffer = [];
        for (const feld of sichtbar) {
          const eigene = feld.querySelectorAll(".status-value, .filename");
          const behaelter = eigene.length ? [...eigene] : [feld];
          for (const t of behaelter) {
            if (t.scrollWidth > t.clientWidth + 0.5) {
              treffer.push(`${t.id || feld.id}: ${t.clientWidth}<${t.scrollWidth}`);
            }
          }
        }
        return { felder: sichtbar.length, treffer };
      });

    for (const sprache of ["de", "en"]) {
      await page.evaluate((s) => setLanguage(s), sprache);
      await page.waitForTimeout(350);
      await zeigerInDieEcke();

      /* Gegenprobe auf die hergestellte Bedingung: die Sprache ist wirklich
         umgeschaltet. Ohne sie misst die zweite Runde dasselbe wie die erste
         und besteht trotzdem. */
      check(`${sprache}: die Oberfläche steht wirklich auf dieser Sprache`,
        await page.evaluate((s) => currentLanguage === s, sprache),
        await page.evaluate(() => currentLanguage));

      await page.setViewportSize({ width: schwelleAusCss, height: 800 });
      await page.waitForTimeout(300);
      const ander = await abgeschnitten();

      check(`${sprache}: an der Schwelle (${schwelleAusCss} px) stehen alle sieben Felder`,
        ander.felder === 7, JSON.stringify(ander));
      check(`${sprache}: und an der Schwelle ist kein Feld abgeschnitten`,
        ander.treffer.length === 0, ander.treffer.join(", "));

      await page.setViewportSize({ width: schwelleAusCss - 1, height: 800 });
      await page.waitForTimeout(300);
      const darunter = await abgeschnitten();

      check(`${sprache}: bei Schwelle−1 (${schwelleAusCss - 1} px) greift die schmale Fassung`,
        darunter.felder === 4, JSON.stringify(darunter));
      check(`${sprache}: und auch dort ist kein Feld abgeschnitten`,
        darunter.treffer.length === 0, darunter.treffer.join(", "));

      /*
       * Die fuenf Tabletbreiten. Sie sind keine Messwerte, sondern die
       * CSS-Breiten der Zielgeraete (Etappe 8): iPad mini, aeltere iPads,
       * iPad 10,9", iPad Air/Pro 11" und ein schmales Desktopfenster.
       */
      for (const breite of [744, 768, 820, 834, 860]) {
        await page.setViewportSize({ width: breite, height: 800 });
        await page.waitForTimeout(250);
        const mass = await abgeschnitten();

        check(`${sprache}: bei ${breite} px gilt die schmale Fassung`,
          mass.felder === 4, JSON.stringify(mass));
      }
    }

    await page.evaluate(() => setLanguage("de"));
    await page.waitForTimeout(300);
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Die Statuszeile gliedert nach Beständigkeit und verliert keine Meldung.");
