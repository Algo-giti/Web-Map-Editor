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

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-statusbar";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

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
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const expandSidebar = () =>
    page.evaluate(() => {
      /*
       * Seit Etappe 5 D sind "Umformen" und "Kartenpruefung" im Inspektor
       * einklappbar und beim ersten Start ZU. Wer ihre Knoepfe bedienen will,
       * klappt sie auf - der Test tut dasselbe.
       */
      /*
       * Seit Etappe 6 stehen die Werkzeugeinstellungen als eingeklapptes
       * <details> unter ihrem Knopf im Inspektor (.tool-settings).
       */
      document.querySelectorAll(
        "#sidebar details, .inspector-fold, .tool-settings"
      ).forEach((section) => section.setAttribute("open", ""));
    });

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
  await expandSidebar();

  check("Dateiname nennt Slot und Datei",
    (await text("filename")).includes("Karte A") &&
    (await text("filename")).includes("bar.geojson"),
    await text("filename"));
  check("Maßstab wird als angenommen benannt",
    (await text("scaleStatus")).includes("angenommen"), await text("scaleStatus"));

  /* Kurzformen bleiben kurz - das ist die Bedingung, unter der sie taugen. */
  for (const id of ["scaleStatus", "originShort", "validationShort"]) {
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
  check("der ausführliche Bericht bleibt in der Seitenleiste",
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

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und kommen zurück",
    (await text("scaleStatus")).includes("angenommen"), await text("scaleStatus"));

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

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Die Statuszeile gliedert nach Beständigkeit und verliert keine Meldung.");
