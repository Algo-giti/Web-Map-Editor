#!/usr/bin/env node
// Browsertest für die Maßstabserkennung.
//
// tools/test-cassandra.mjs prüft die Klassifikation als Funktion. Hier geht es
// um das, was der Nutzer davon sieht: welche Größe angezeigt wird, was bei
// unbekanntem Maßstab gesperrt ist, dass der Maßstab in der Datei den
// Rundlauf übersteht, und was ein von Hand gesetzter Maßstab bewirkt.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-scale.mjs

import {
  createChecker,
  createMarkerKlicker,
  createMenueBefehl,
  elementGetroffen,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-scale";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

const DEG = 111111;

/** Quadratische Karte gegebener Größe, geteilt durch den Divisor. */
function square(sizeMetres, divisor, offset = 0, extra = {}) {
  const s = sizeMetres / divisor;

  return JSON.stringify({
    type: "FeatureCollection",
    ...extra,
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [offset, offset], [offset + s, offset],
          [offset + s, offset + s], [offset, offset + s],
          [offset, offset],
        ]] },
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

  const load = async (body) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.locator("#fileInput").setInputFiles({
      name: "scale.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(450);

    /*
     * Faltgeste aus dem Harness statt einer eigenen, engeren Fassung: die hier
     * oeffnete nur "#sidebar details" und traf damit seit dem Umzug der
     * Abschnitte in den Inspektor fast nichts mehr.
     */
    await openAllFolds(page);
  };

  const width = () => page.locator("#widthStat").textContent();
  const notice = page.locator("#scaleNotice");

  /* ---------------------------------------------------------------- */
  console.log("Meterkarte wird nicht mehr als Gradkarte gelesen");

  await load(square(200, 1));
  check("200-m-Karte zeigt 200 m", (await width()).trim() === "200,00 m", await width());
  check("kein Maßstabshinweis", await notice.isHidden());

  await load(square(8, 1));
  check("8-m-Karte zeigt 8 m", (await width()).trim() === "8,00 m", await width());

  /* ---------------------------------------------------------------- */
  console.log("Relativformat kippt nicht mehr durch Bearbeiten");

  await load(JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [200 / DEG, 0],
        [200.001234 / DEG, 200.007891 / DEG],
        [0, 200 / DEG], [0, 0],
      ]] },
    }],
  }));

  check("frei gesetzte Punkte bleiben in Metern",
    (await width()).trim() === "200,00 m", await width());

  /* ---------------------------------------------------------------- */
  console.log("Zweifelsfall: nichts wird behauptet");

  await load(square(0.5, 1));

  check("keine Meterangabe", !(await width()).includes("m"), await width());
  check("Hinweis ist sichtbar", await notice.isVisible());

  const text = await notice.textContent();
  check("Hinweis nennt beide Lesarten",
    text.includes("Relativformat") && text.includes("Meterkarte"), text.slice(0, 160));
  check("Hinweis nennt konkrete Größen", /\d/.test(text));

  check("Rasterfang ist gesperrt",
    await page.locator("#snapPointToGrid").isDisabled());
  check("Sperre nennt den Grund",
    (await page.locator("#snapPointToGrid").getAttribute("title")).includes("Maßstab"));

  /*
   * Absolutes Speichern muss abgelehnt werden, ohne eine Datei zu schreiben.
   *
   * Der Faltblock wird vorher geoeffnet: #exportFrameSelect ist unveraendert,
   * steht aber seit Etappe 7c im Inspektor unter "Koordinatenbezug" statt in
   * der Seitenleiste, und dieser Faltblock ist beim Start ZU. Nur der Weg
   * dorthin ist ein anderer - ueber den Helfer, nicht ueber eine eigene Kopie
   * der Faltgeste.
   */
  await openAllFolds(page);
  await page.selectOption("#exportFrameSelect", "absolute");

  let downloaded = false;
  const note = () => { downloaded = true; };
  page.on("download", note);
  await menueBefehl("Datei", "GeoJSON speichern");
  await page.waitForTimeout(400);
  page.off("download", note);

  check("kein absoluter Export", !downloaded);
  check("Ablehnung wird gemeldet",
    (await page.locator("#editStatus").textContent()).includes("Maßstab"),
    await page.locator("#editStatus").textContent());

  /* Die Kartenprüfung darf keine Fläche behaupten. */
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  await openAllFolds(page);
  const report = await page.locator("#validationReport").textContent();

  /*
   * Die andere Haelfte: textContent() traegt durch ein geschlossenes
   * <details> hindurch. Ohne diese Zusicherung belegten die drei darunter
   * nur, dass der Text im DOM steht - nicht, dass ihn jemand liest.
   */
  await page.locator("#validationReport").scrollIntoViewIfNeeded();

  const berichtGetroffen = await elementGetroffen(page, "#validationReport", { dy: 5 });

  check("der Pruefbericht steht wirklich sichtbar da, nicht nur im DOM",
    berichtGetroffen.ok === true, berichtGetroffen.grund);

  check("keine erfundene Flächenangabe",
    !/Perimeterfläche: [\d.]+ m²/.test(report), report.slice(0, 200));
  check("stattdessen die Einschränkung",
    report.includes("konnte nicht berechnet werden"), report.slice(0, 200));
  check("Segmentprüfung nennt ihre Grenze",
    report.includes("Segmentprüfung"), report.slice(0, 300));

  /* ---------------------------------------------------------------- */
  console.log("Maßstab in der Datei schlägt die Heuristik");

  /* Dieselbe Karte, die eben ein Zweifelsfall war - jetzt mit Angabe. */
  await load(square(0.5, 1, 0, { coordinateScale: { metersPerUnit: 1 } }));

  check("mit Angabe kein Zweifelsfall mehr", await notice.isHidden());
  check("Größe wird in Metern gezeigt",
    (await width()).includes("m"), await width());

  /* ---------------------------------------------------------------- */
  console.log("Massstab von Hand setzen");

  /*
   * Die erwarteten Laengen rechnet der Test aus der Geometrie der Karte und
   * dem eingegebenen Faktor. Der Faktor ist Eingabe, keine Messung; eine
   * abgelesene Zahl steht nirgends als Literal da.
   */
  const ausdehnung = (body) => {
    const xs = [];
    const ys = [];

    for (const feature of JSON.parse(body).features) {
      for (const [x, y] of feature.geometry.coordinates.flat()) {
        xs.push(x);
        ys.push(y);
      }
    }

    return {
      breite: Math.max(...xs) - Math.min(...xs),
      hoehe: Math.max(...ys) - Math.min(...ys),
    };
  };

  /* Eine Zahl so, wie der Editor sie in der jeweiligen Sprache schreibt. */
  const mitZeichen = (wert, stellen, sprache) => {
    const text = wert.toFixed(stellen);
    return sprache === "de" ? text.replace(".", ",") : text;
  };

  const sprache = () => page.evaluate(() => currentLanguage);
  const textVon = async (selektor) =>
    (await page.locator(selektor).textContent()).trim();

  const feld = page.locator("#scaleInput");
  const height = () => textVon("#heightStat");
  const area = () => textVon("#areaStat");

  /*
   * Setzt den Massstab ueber Feld und Knopf - der Weg des Nutzers -, mit
   * `{taste:true}` ueber Enter im Feld. Ein gesperrtes Feld wird nicht
   * befuellt: fill() wartete sonst dreissig Sekunden auf eine Freigabe, die
   * nicht kommt.
   */
  const massstabSetzen = async (eingabe, { taste = false } = {}) => {
    await openAllFolds(page);

    const frei = await feld.isEnabled() &&
      await page.locator("#applyScaleBtn").isEnabled();

    check(`das Feld nimmt "${eingabe}" an`, frei);
    if (!frei) return false;

    await feld.fill(eingabe);

    if (taste) {
      await feld.press("Enter");
    } else {
      await page.locator("#applyScaleBtn").click();
    }

    await page.waitForTimeout(350);
    return true;
  };

  /* Abmessungen und Flaeche gegen Ausdehnung mal Faktor. */
  const abmessungenStimmen = async (name, karte, faktor, sprachcode) => {
    const { breite, hoehe } = ausdehnung(karte);

    check(`${name}: die Breite ist die Ausdehnung mal dem Massstab, in Metern`,
      (await width()).trim() === `${mitZeichen(breite * faktor, 2, sprachcode)} m`,
      `${(await width()).trim()} gegen ${mitZeichen(breite * faktor, 2, sprachcode)} m`);
    check(`${name}: ebenso die Hoehe`,
      (await height()) === `${mitZeichen(hoehe * faktor, 2, sprachcode)} m`,
      `${await height()} gegen ${mitZeichen(hoehe * faktor, 2, sprachcode)} m`);
    check(`${name}: und die Flaeche in Quadratmetern`,
      (await area()) === `${mitZeichen(breite * hoehe * faktor * faktor, 1, sprachcode)} m²`,
      `${await area()} gegen ${mitZeichen(breite * hoehe * faktor * faktor, 1, sprachcode)} m²`);
  };

  /*
   * Liegen alle Punktmarker im Kartenfeld, und fuellen sie es? Belegt das
   * Einpassen UND das Neuzeichnen: ohne Einpassen lagen die Marker ausserhalb,
   * ohne Neuzeichnen stuenden sie im alten Rahmen auf wenigen Pixeln beisammen.
   */
  const markerImBild = () => page.evaluate(() => {
    const feldRahmen = document.getElementById("viewer").getBoundingClientRect();
    const marker = [...document.querySelectorAll("circle.vertex")].map((m) => {
      const r = m.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    const drin = marker.filter(({ x, y }) =>
      x >= feldRahmen.left && x <= feldRahmen.right &&
      y >= feldRahmen.top && y <= feldRahmen.bottom);

    const xs = marker.map((m) => m.x);
    const ys = marker.map((m) => m.y);

    return {
      alle: marker.length,
      drin: drin.length,
      spanne: Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
      kurzeSeite: Math.min(feldRahmen.width, feldRahmen.height),
    };
  });

  /* Ohne Karte gibt es keinen Massstab: das Feld steht da, leer und gesperrt. */
  await page.goto(indexUrl(), { waitUntil: "load" });
  await openAllFolds(page);

  check("ohne Karte: das Feld ist leer und gesperrt",
    (await feld.inputValue()) === "" && await feld.isDisabled(), await feld.inputValue());
  check("ohne Karte: und es steht kein Satz darunter",
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("scaleInputStatus")).display === "none"));

  /*
   * Klickt einen Punktmarker nur, wenn er an seiner Stelle wirklich getroffen
   * wird. Sonst liefe der Klick dreissig Sekunden in einen Timeout und naehme
   * alles dahinter mit; so sagt eine benannte Zusicherung, was dort liegt.
   *
   * Der Helfer stand hier als lokale Fassung und liegt seit dem Umzug der
   * Angaben zur Auswahl im Harness: dort klappt er die Angaben zusaetzlich
   * zu, wenn sie den Marker verdecken. Eine zweite Kopie daneben waere die
   * Fehlerklasse, gegen die openAllFolds() gebuendelt wurde.
   */
  const markerKlicken = createMarkerKlicker(page, check);

  const KARTE_A = square(0.5, 1);

  await load(KARTE_A);

  check("Vorbedingung: die Oberflaeche steht auf deutsch", (await sprache()) === "de");
  check("Vorbedingung: der Massstab ist unklar, der Hinweis steht da",
    await notice.isVisible());

  await feld.scrollIntoViewIfNeeded();
  const feldGetroffen = await elementGetroffen(page, "#scaleInput", { dy: 5 });

  check("unklar: das Feld steht im Koordinatenbezug und ist wirklich getroffen",
    feldGetroffen.ok === true, feldGetroffen.grund);
  check("unklar: das Feld ist leer",
    (await feld.inputValue()) === "", await feld.inputValue());
  check("unklar: und es nimmt eine Eingabe an", await feld.isEnabled());
  check("unklar: der Satz darunter sagt, was einzutragen ist",
    (await textVon("#scaleInputStatus")).includes("Meter je Einheit eintragen"),
    await textVon("#scaleInputStatus"));
  check("unklar: die Abmessungen nennen keine Meter",
    !(await width()).includes("m") && (await area()) === "–",
    `${await width()} / ${await area()}`);
  check("unklar: das leere Feld sagt, warum es leer ist",
    (await feld.getAttribute("placeholder")) === "unklar",
    await feld.getAttribute("placeholder"));

  await page.evaluate(() => setLanguage("en"));

  check("Vorbedingung: unklar, die Oberflaeche steht auf englisch",
    (await sprache()) === "en");
  check("unklar, deutsch erzeugt, dann englisch: der Platzhalter ist englisch",
    (await feld.getAttribute("placeholder")) === "unclear",
    await feld.getAttribute("placeholder"));
  check("unklar, deutsch erzeugt, dann englisch: der Satz darunter ist englisch",
    (await textVon("#scaleInputStatus")).startsWith("Scale unclear: enter metres per unit"),
    await textVon("#scaleInputStatus"));

  await page.evaluate(() => setLanguage("de"));

  check("Vorbedingung: unklar, die Oberflaeche steht wieder auf deutsch",
    (await sprache()) === "de");
  check("unklar, zurueck auf deutsch: der Satz darunter ist deutsch",
    (await textVon("#scaleInputStatus")).startsWith("Maßstab unklar: Meter je Einheit"),
    await textVon("#scaleInputStatus"));

  /* --- erster Wert ------------------------------------------------- */

  const EINGABE_1 = "250";
  const FAKTOR_1 = Number(EINGABE_1);

  await massstabSetzen(EINGABE_1);
  await abmessungenStimmen("erster Wert", KARTE_A, FAKTOR_1, "de");

  await page.locator("#widthStat").scrollIntoViewIfNeeded();
  const breiteGetroffen = await elementGetroffen(page, "#widthStat", { dy: 5 });

  check("erster Wert: und die Breite steht sichtbar da",
    breiteGetroffen.ok === true, breiteGetroffen.grund);
  check("erster Wert: der Hinweis auf der Karte ist weg", await notice.isHidden());
  check("erster Wert: die Statuszeile nennt den Massstab als von Hand gesetzt",
    (await textVon("#scaleStatus")) === "von Hand gesetzt", await textVon("#scaleStatus"));
  check("erster Wert: das Feld zeigt den gesetzten Wert",
    (await feld.inputValue()) === EINGABE_1, await feld.inputValue());
  check("erster Wert: der Satz darunter nennt die Herkunft",
    (await textVon("#scaleInputStatus")).startsWith("Von Hand gesetzt"),
    await textVon("#scaleInputStatus"));
  check("erster Wert: und sagt, dass er nicht in die Datei kommt",
    (await textVon("#scaleInputStatus")).includes("in die Datei wird er nicht geschrieben"),
    await textVon("#scaleInputStatus"));

  {
    const bild = await markerImBild();

    check("erster Wert: die Ansicht ist neu eingepasst, jeder Marker liegt im Kartenfeld",
      bild.alle > 0 && bild.drin === bild.alle, JSON.stringify(bild));
    check("erster Wert: und die Karte fuellt es, statt im alten Rahmen zu stehen",
      bild.spanne >= bild.kurzeSeite / 2, JSON.stringify(bild));
  }

  /* --- zweiter Wert ------------------------------------------------ */

  const EINGABE_2 = "12,5";
  const FAKTOR_2 = Number(EINGABE_2.replace(",", "."));

  const breiteErster = await width();

  await massstabSetzen(EINGABE_2);
  await abmessungenStimmen("zweiter Wert", KARTE_A, FAKTOR_2, "de");

  check("zweiter Wert: die Breite ist eine andere als beim ersten",
    (await width()) !== breiteErster, `${breiteErster} -> ${await width()}`);

  /* --- Sprachwechsel in beiden Richtungen -------------------------- */

  await page.evaluate(() => setLanguage("en"));

  check("Vorbedingung: die Oberflaeche steht jetzt auf englisch",
    (await sprache()) === "en");
  await abmessungenStimmen("deutsch gesetzt, dann englisch", KARTE_A, FAKTOR_2, "en");
  check("deutsch gesetzt, dann englisch: das Feld traegt den Punkt",
    (await feld.inputValue()) === mitZeichen(FAKTOR_2, 1, "en"), await feld.inputValue());
  check("deutsch gesetzt, dann englisch: die Beschriftung ist englisch",
    (await textVon('label[for="scaleInput"]')).startsWith("Scale (metres per unit)"),
    await textVon('label[for="scaleInput"]'));
  check("deutsch gesetzt, dann englisch: der Satz darunter ist englisch",
    (await textVon("#scaleInputStatus")).startsWith("Set by hand") &&
      (await textVon("#scaleInputStatus")).includes("not written to the file"),
    await textVon("#scaleInputStatus"));
  check("deutsch gesetzt, dann englisch: die Statuszeile ist englisch",
    (await textVon("#scaleStatus")) === "set by hand", await textVon("#scaleStatus"));

  const EINGABE_3 = "7.5";
  const FAKTOR_3 = Number(EINGABE_3);

  await massstabSetzen(EINGABE_3);
  await abmessungenStimmen("englisch gesetzt", KARTE_A, FAKTOR_3, "en");
  check("englisch gesetzt: die Meldung ist englisch",
    (await textVon("#editStatus")) === "Scale set.", await textVon("#editStatus"));
  check("englisch gesetzt: Zurueck nennt den Schritt englisch",
    (await page.locator("#undoBtn").getAttribute("title")) === "Undo: Set scale",
    await page.locator("#undoBtn").getAttribute("title"));

  /* Derselbe Wert noch einmal: keine Aenderung, kein neuer Schritt. */
  const undoVorher = await page.locator("#undoBtn").getAttribute("title");

  await massstabSetzen(EINGABE_3);

  check("englisch, derselbe Wert: die Meldung sagt, dass sich nichts aendert",
    (await textVon("#editStatus")) === "The scale was not changed.",
    await textVon("#editStatus"));

  await massstabSetzen("abc");

  check("englisch, ungueltig: die Ablehnung ist englisch",
    (await textVon("#editStatus")) === "Invalid scale: please enter a number greater than 0.",
    await textVon("#editStatus"));

  await page.evaluate(() => setLanguage("de"));

  check("Vorbedingung: die Oberflaeche steht wieder auf deutsch",
    (await sprache()) === "de");
  await abmessungenStimmen("englisch gesetzt, dann deutsch", KARTE_A, FAKTOR_3, "de");
  check("englisch gesetzt, dann deutsch: das Feld traegt das Komma",
    (await feld.inputValue()) === mitZeichen(FAKTOR_3, 1, "de"), await feld.inputValue());
  check("englisch gesetzt, dann deutsch: die Beschriftung ist deutsch",
    (await textVon('label[for="scaleInput"]')).startsWith("Maßstab (Meter je Einheit)"),
    await textVon('label[for="scaleInput"]'));
  check("englisch gesetzt, dann deutsch: der Satz darunter ist deutsch",
    (await textVon("#scaleInputStatus")).startsWith("Von Hand gesetzt"),
    await textVon("#scaleInputStatus"));
  check("englisch gesetzt, dann deutsch: Zurueck nennt den Schritt deutsch",
    (await page.locator("#undoBtn").getAttribute("title")) === "Rückgängig: Maßstab setzen",
    await page.locator("#undoBtn").getAttribute("title"));
  check("englisch abgelehnt, dann deutsch: die Ablehnung ist deutsch",
    (await textVon("#editStatus")).startsWith("Ungültiger Maßstab"),
    await textVon("#editStatus"));
  check("derselbe Wert hat keinen eigenen Schritt angelegt",
    undoVorher === "Undo: Set scale" &&
      (await page.locator("#undoBtn").getAttribute("title")) === "Rückgängig: Maßstab setzen");

  /* --- Undo, Zuruecknehmen, ungueltige Eingabe --------------------- */

  /*
   * Jedes Setzen ist ein eigener Schritt: das Undo holt den vorigen Wert
   * zurueck, nicht den Stand vor dem ersten.
   */
  const undoFrei = await page.locator("#undoBtn").isEnabled();
  check("Zurueck ist nach dem Setzen frei", undoFrei);

  if (undoFrei) {
    await page.locator("#undoBtn").click();
    await page.waitForTimeout(350);
    await abmessungenStimmen("nach dem Undo", KARTE_A, FAKTOR_2, "de");

    const bild = await markerImBild();

    check("nach dem Undo: die Ansicht ist fuer den alten Rahmen neu eingepasst",
      bild.alle > 0 && bild.drin === bild.alle && bild.spanne >= bild.kurzeSeite / 2,
      JSON.stringify(bild));
  }

  await massstabSetzen("abc");

  check("ungueltig: die Ablehnung wird gemeldet",
    (await textVon("#editStatus")).startsWith("Ungültiger Maßstab"),
    await textVon("#editStatus"));
  await abmessungenStimmen("ungueltig: der vorige Wert gilt weiter", KARTE_A, FAKTOR_2, "de");

  /* Zuruecknehmen ueber Enter: die zweite Geste des Feldes. */
  await massstabSetzen("", { taste: true });

  check("leer uebernommen: der Hinweis auf der Karte ist wieder da",
    await notice.isVisible());
  check("leer uebernommen: die Abmessungen nennen wieder keine Meter",
    !(await width()).includes("m"), await width());
  check("leer uebernommen: das Feld ist leer und nimmt weiter an",
    (await feld.inputValue()) === "" && await feld.isEnabled(), await feld.inputValue());
  check("leer uebernommen: die Meldung sagt es",
    (await textVon("#editStatus")) === "Maßstab zurückgenommen; er ist wieder unklar.",
    await textVon("#editStatus"));

  await page.evaluate(() => setLanguage("en"));

  check("Vorbedingung: zurueckgenommen, die Oberflaeche steht auf englisch",
    (await sprache()) === "en");
  check("deutsch zurueckgenommen, dann englisch: die Meldung ist englisch",
    (await textVon("#editStatus")) === "Scale withdrawn; it is unclear again.",
    await textVon("#editStatus"));

  await page.evaluate(() => setLanguage("de"));

  /* --- ein neuer Rahmen raeumt auf ------------------------------------ */

  /*
   * Der Massstab aendert die Weltkoordinaten, nicht die Rohwerte. Alles, was
   * Weltkoordinaten haelt, muss mit: die E/N-Felder des gewaehlten Punktes,
   * die Punktliste der Feature-Navigation, die Vergleichs-Ghosts und eine
   * laufende Messung.
   */
  await load(KARTE_A);
  await massstabSetzen(EINGABE_1);

  if (await markerKlicken("0:0:1")) {
    const ost = page.locator("#pointEastInput");
    const { breite } = ausdehnung(KARTE_A);

    await page.waitForTimeout(250);
    await openAllFolds(page);

    check("Vorbedingung: das E-Feld zeigt die Ecke im ersten Rahmen",
      (await ost.inputValue()) === mitZeichen(breite * FAKTOR_1, 2, "de"),
      await ost.inputValue());

    /* Um eine Einheit verschieben: danach steht ein Ghost an der alten Stelle. */
    const verschobenWelt = breite * FAKTOR_1 + 1;

    await ost.fill(mitZeichen(verschobenWelt, 2, "de"));
    await ost.press("Enter");
    await page.waitForTimeout(250);

    const geisterVorher = await page.locator(
      "#selectionGhostGroup circle.selection-ghost-point").count();

    check("Vorbedingung: nach dem Verschieben steht ein Ghost", geisterVorher > 0,
      String(geisterVorher));

    await massstabSetzen(EINGABE_2);

    const verschobenNeu = verschobenWelt / FAKTOR_1 * FAKTOR_2;

    check("neuer Rahmen: das E-Feld rechnet mit dem neuen Massstab",
      (await ost.inputValue()) === mitZeichen(verschobenNeu, 2, "de"),
      `${await ost.inputValue()} gegen ${mitZeichen(verschobenNeu, 2, "de")}`);
    check("neuer Rahmen: die Feature-Navigation ebenso",
      (await textVon("#featureNavigator")).includes(
        `${mitZeichen(verschobenNeu, 2, "de")} / ${mitZeichen(0, 2, "de")}`),
      (await textVon("#featureNavigator")).slice(0, 300));
    check("neuer Rahmen: kein Ghost steht mehr im alten Rahmen",
      (await page.locator("#selectionGhostGroup circle.selection-ghost-point").count()) === 0,
      String(await page.locator("#selectionGhostGroup circle.selection-ghost-point").count()));

    /*
     * Und zurueck ueber das Undo: ein Ghost, der im neuen Rahmen entstand,
     * gilt im alten nicht. Zwei Schritte - erst die Verschiebung, dann der
     * Massstab.
     */
    const geister = () => page.locator(
      "#selectionGhostGroup circle.selection-ghost-point").count();

    await ost.fill(mitZeichen(verschobenNeu + 1, 2, "de"));
    await ost.press("Enter");
    await page.waitForTimeout(250);

    check("Vorbedingung: im neuen Rahmen steht wieder ein Ghost",
      (await geister()) > 0, String(await geister()));

    for (const schritt of ["die Verschiebung", "den Massstab"]) {
      const frei = await page.locator("#undoBtn").isEnabled();

      check(`Zurueck nimmt ${schritt} zurueck: der Knopf ist frei`, frei);
      if (!frei) break;

      await page.locator("#undoBtn").click();
      await page.waitForTimeout(300);
    }

    check("zurueck im ersten Rahmen: das E-Feld zeigt den Punkt wieder dort",
      (await ost.inputValue()) === mitZeichen(verschobenWelt, 2, "de"),
      `${await ost.inputValue()} gegen ${mitZeichen(verschobenWelt, 2, "de")}`);
    check("zurueck im ersten Rahmen: kein Ghost aus dem anderen Rahmen",
      (await geister()) === 0, String(await geister()));
  }

  await load(KARTE_A);

  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);

  const messblockSichtbar = () => page.evaluate(() =>
    getComputedStyle(document.getElementById("inspectorMeasure")).display !== "none");

  check("Vorbedingung: die Messung laeuft, ihr Block steht im Inspektor",
    await messblockSichtbar());

  await massstabSetzen(EINGABE_2);

  check("laufende Messung: der Massstab beendet sie",
    !(await messblockSichtbar()), "der Messblock steht weiter da");
  await abmessungenStimmen("laufende Messung", KARTE_A, FAKTOR_2, "de");

  /* --- je Karte, nicht fuer beide Slots ---------------------------- */

  const KARTE_B = square(0.4, 1);
  const { breite: breiteA } = ausdehnung(KARTE_A);
  const { breite: breiteB } = ausdehnung(KARTE_B);

  await massstabSetzen(EINGABE_2);

  await page.locator("#secondFileInput").setInputFiles({
    name: "zweite.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(KARTE_B),
  });
  await page.waitForTimeout(450);
  await openAllFolds(page);

  /*
   * Das Zurueckholen eines Ladevorgangs ist kein Rahmenwechsel: Undo und Redo
   * des Ladens behalten die Ansicht, wie sie war. Eingepasst wird nur, wenn
   * eine Karte vorher UND nachher geladen ist und ihr Faktor wechselt.
   */
  await page.locator("#zoomInBtn").click();
  await page.waitForTimeout(200);

  const ansicht = () => page.locator("#svg").getAttribute("viewBox");
  const ansichtVorher = await ansicht();

  for (const knopf of ["#undoBtn", "#redoBtn"]) {
    const frei = await page.locator(knopf).isEnabled();

    check(`Laden zurueckholen: ${knopf} ist frei`, frei);
    if (!frei) break;

    await page.locator(knopf).click();
    await page.waitForTimeout(300);
  }

  check("Undo und Redo des Ladens behalten die Ansicht",
    (await ansicht()) === ansichtVorher, `${ansichtVorher} -> ${await ansicht()}`);

  check("Vorbedingung: Karte B ist geladen und aktiv",
    await page.evaluate(() => activeMapId === "B"));
  check("Karte B: ihr Hinweis steht da - der Wert von A gilt hier nicht",
    await notice.isVisible());
  check("Karte B: ihr Feld ist leer",
    (await feld.inputValue()) === "", await feld.inputValue());
  check("Karte B: ihre Abmessungen nennen keine Meter",
    !(await width()).includes("m"), await width());

  /*
   * Die passive Karte A wird gedaempft gezeichnet, und zwar mit IHREM
   * Massstab. Verglichen wird die gezeichnete Breite ihres Perimeters mit der
   * des aktiven von B; das Verhaeltnis folgt aus Geometrie und Faktor.
   */
  const breiten = await page.evaluate(() => {
    const overlay = document.querySelector(
      '.other-map-overlay path.other-map-feature[data-layer="perimeter"]');
    const aktiv = document.querySelector("path.feature.perimeter");

    return {
      overlay: overlay ? overlay.getBoundingClientRect().width : null,
      aktiv: aktiv ? aktiv.getBoundingClientRect().width : null,
    };
  });

  {
    const soll = (breiteA * FAKTOR_2) / breiteB;
    const ist = breiten.overlay / breiten.aktiv;

    check("die passive Karte A wird mit ihrem eigenen Massstab gezeichnet",
      breiten.overlay > 0 && breiten.aktiv > 0 && Math.abs(ist / soll - 1) < 0.05,
      `Verhaeltnis ${ist} gegen ${soll}`);
  }

  await menueBefehl("Karte", "Karten verbinden…");
  await page.waitForTimeout(300);

  check("verschiedene Massstaebe: das Verbinden nennt den Grund",
    (await textVon("#mergeStatus")).includes("unterschiedliche erkannte Koordinatenskalierungen"),
    await textVon("#mergeStatus"));
  check("verschiedene Massstaebe: und es ist gesperrt",
    await page.locator("#mergeMapsBtn").isDisabled());

  await massstabSetzen(EINGABE_2);

  check("gleicher Massstab auf B: die Sperre ist weg",
    !(await textVon("#mergeStatus")).includes("Koordinatenskalierungen"),
    await textVon("#mergeStatus"));
  check("gleicher Massstab auf B: und Verbinden ist frei",
    await page.locator("#mergeMapsBtn").isEnabled());

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await menueBefehl("Karte", "Karte A");
  await page.waitForTimeout(350);
  await openAllFolds(page);

  check("zurueck auf Karte A: ihr Wert steht noch im Feld",
    (await feld.inputValue()) === EINGABE_2, await feld.inputValue());
  check("zurueck auf Karte A: ihr Hinweis bleibt weg", await notice.isHidden());
  await abmessungenStimmen("zurueck auf Karte A", KARTE_A, FAKTOR_2, "de");

  /* --- die Auftrennstelle vergleicht in Metern ---------------------- */

  /*
   * Mit einem Massstab gibt es Meter, und die gewaehlte Auftrennstelle wird
   * wie bei jedem bekannten Massstab mit Millimetertoleranz gegen den Ring
   * gehalten. Ein Rundlauf ueber das E-Feld trifft den Rohwert hier nicht
   * bitgleich: 0,33 mal 10 steht als 3,30 im Feld, und 3,30 durch 10 ist
   * 0,32999999999999996.
   */
  const KARTE_C = square(0.33, 1);
  const EINGABE_C = "10";
  const FAKTOR_C = Number(EINGABE_C);
  const { breite: seiteC } = ausdehnung(KARTE_C);

  await load(KARTE_C);
  await massstabSetzen(EINGABE_C);

  /* Die rechte Kante: beide Punkte tragen E = Seitenlaenge. */
  const kanteGewaehlt = await markerKlicken("0:0:1") &&
    await markerKlicken("0:0:2", { modifiers: ["Control"] });
  await page.waitForTimeout(250);

  await menueBefehl("Karte", "Karten verbinden…");
  await page.waitForTimeout(300);

  const schnittFrei = kanteGewaehlt &&
    await page.locator("#setMergeCutBtn").isEnabled();
  check("Auftrennstelle: der Knopf ist bei zwei benachbarten Punkten frei", schnittFrei,
    await textVon("#mergeCutReason"));

  if (schnittFrei) {
    await page.locator("#setMergeCutBtn").click();
    await page.waitForTimeout(350);

    check("Auftrennstelle: gewaehlt",
      (await textVon("#mergeAInfo")).includes("Auftrennstelle gewählt."),
      await textVon("#mergeAInfo"));

    /* Fenster zu, Auswahl auf, dann den neuen Startpunkt allein waehlen. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  if (schnittFrei && await markerKlicken("0:0:0")) {
    await page.waitForTimeout(250);
    await openAllFolds(page);

    const ost = page.locator("#pointEastInput");
    const angezeigt = await ost.inputValue();

    check("Vorbedingung: das E-Feld zeigt Seitenlaenge mal Massstab",
      angezeigt === mitZeichen(seiteC * FAKTOR_C, 2, "de"), angezeigt);

    await ost.fill(mitZeichen(seiteC * FAKTOR_C + 1, 2, "de"));
    await ost.press("Enter");
    await page.waitForTimeout(250);

    check("Vorbedingung: verschoben gilt die Stelle als veraendert",
      (await textVon("#mergeAInfo")).includes("seit der Wahl verändert"),
      await textVon("#mergeAInfo"));

    await ost.fill(angezeigt);
    await ost.press("Enter");
    await page.waitForTimeout(250);

    check("Vorbedingung: der Rundlauf trifft den Rohwert nicht bitgleich",
      await page.evaluate((seite) =>
        data.features[0].geometry.coordinates[0][0][0] !== seite, seiteC));
    check("zurueckgesetzt gilt sie wieder als gewaehlt - verglichen in Metern",
      (await textVon("#mergeAInfo")).includes("Auftrennstelle gewählt."),
      await textVon("#mergeAInfo"));
  }

  /*
   * --- nicht in die Datei: wieder eingelesen ist er wieder unklar -----
   *
   * Der Massstab ist ein Sitzungswert (entschieden vom Projektinhaber): ein
   * Feld auf oberster Ebene bricht CaSSAndRAs Datei-Import. Wer die Karte
   * speichert und neu laedt, setzt ihn erneut.
   */

  await load(KARTE_A);
  await massstabSetzen(EINGABE_2);

  {
    const wartend = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await menueBefehl("Datei", "GeoJSON speichern");
    const ereignis = await wartend;

    check("von Hand gesetzt: der Export laeuft", !!ereignis);

    if (ereignis) {
      const stream = await ereignis.createReadStream();
      const teile = [];
      for await (const teil of stream) teile.push(teil);
      const gespeichert = JSON.parse(Buffer.concat(teile).toString());

      check("von Hand gesetzt: die Datei traegt alle Features der Karte",
        gespeichert.type === "FeatureCollection" &&
          gespeichert.features?.length === JSON.parse(KARTE_A).features.length,
        JSON.stringify(gespeichert).slice(0, 120));
      check("von Hand gesetzt: oben steht nur type und features",
        Object.keys(gespeichert).every((schluessel) => schluessel === "type" || schluessel === "features"),
        Object.keys(gespeichert).join(", "));

      await load(JSON.stringify(gespeichert));

      check("wieder eingelesen: der Hinweis steht wieder da", await notice.isVisible());
      check("wieder eingelesen: die Abmessungen nennen keine Meter",
        !(await width()).includes("m"), await width());
      check("wieder eingelesen: das Feld ist leer und frei - der Massstab ist neu zu setzen",
        (await feld.inputValue()) === "" && await feld.isEnabled(), await feld.inputValue());
      check("wieder eingelesen: der Satz darunter nennt ihn unklar",
        (await textVon("#scaleInputStatus")).startsWith("Maßstab unklar"),
        await textVon("#scaleInputStatus"));
    }
  }

  /* --- Gegenprobe: eine metrische Karte bleibt, wie sie ist --------- */

  const METERKARTE = square(200, 1);

  await load(METERKARTE);

  check("metrisch: kein Hinweis", await notice.isHidden());
  await abmessungenStimmen("metrisch", METERKARTE, 1, "de");
  check("metrisch: die Statuszeile bleibt bei der Annahme",
    (await textVon("#scaleStatus")) === "metrisch (angenommen)", await textVon("#scaleStatus"));
  check("metrisch: das Feld ist gesperrt", await feld.isDisabled());
  check("metrisch: und Uebernehmen ebenso",
    await page.locator("#applyScaleBtn").isDisabled());
  check("metrisch: der Satz darunter sagt, warum",
    (await textVon("#scaleInputStatus")).startsWith("Der Maßstab dieser Karte ist bekannt"),
    await textVon("#scaleInputStatus"));

  await page.evaluate(() => setLanguage("en"));

  check("Vorbedingung: metrisch, die Oberflaeche steht auf englisch",
    (await sprache()) === "en");
  check("metrisch, dann englisch: der Satz darunter ist englisch",
    (await textVon("#scaleInputStatus")).startsWith("The scale of this map is known"),
    await textVon("#scaleInputStatus"));
  await abmessungenStimmen("metrisch, dann englisch", METERKARTE, 1, "en");

  await page.evaluate(() => setLanguage("de"));

  /* ---------------------------------------------------------------- */
  console.log("Ein Massstab aus der Datei gilt nicht fuer absolute Koordinaten");

  /*
   * Aeltere absolute Exporte dieses Editors trugen coordinateScale 111111 zu
   * Gradzahlen. Der Wert wird verworfen, und es gilt, was ohne ihn gaelte -
   * mit einer Meldung, nicht still.
   *
   * Die erwarteten Masse rechnet der Test aus der Geometrie: East ist
   * Laengengrad mal 111111 mal cos(Breite des Bezugspunkts), North
   * Breitengrad mal 111111. Die Gradzahlen sind Eingabe, keine Messung.
   */
  const LAT0 = 52.5;
  const LON0 = 13.4;
  const DLON = 0.0006;
  const DLAT = 0.0004;

  const absolutKarte = (extra) => JSON.stringify({
    type: "FeatureCollection",
    ...extra,
    features: [{
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [LON0, LAT0], [LON0 + DLON, LAT0], [LON0 + DLON, LAT0 + DLAT],
        [LON0, LAT0 + DLAT], [LON0, LAT0],
      ]] },
    }],
  });

  const BEZUG = { lat: LAT0, lon: LON0 };
  const MIT_MASSSTAB = absolutKarte({
    referenceOrigin: BEZUG,
    coordinateScale: { metersPerUnit: DEG },
  });
  const OHNE_MASSSTAB = absolutKarte({ referenceOrigin: BEZUG });

  const ERWARTET_BREITE = DLON * DEG * Math.cos(LAT0 * Math.PI / 180);
  const ERWARTET_HOEHE = DLAT * DEG;

  const VERWORFEN_DE =
    "Die Datei bringt einen Maßstab mit, der zu absoluten Koordinaten nicht passt; er wird ignoriert.";
  const VERWORFEN_EN =
    "The file carries a scale that does not fit absolute coordinates; it is ignored.";

  const meldung = () => textVon("#editStatus");

  /* Laedt in einer bestimmten Sprache, ohne dass der Neuaufbau sie zuruecksetzt. */
  const ladenIn = async (body, sprachcode, name = "scale.geojson") => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    if (sprachcode === "en") await page.evaluate(() => setLanguage("en"));
    await page.locator("#fileInput").setInputFiles({
      name,
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(450);
    await openAllFolds(page);
  };

  const herunterladen = async () => {
    const wartend = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await menueBefehl("Datei", "GeoJSON speichern");
    const ereignis = await wartend;
    if (!ereignis) return null;

    const stream = await ereignis.createReadStream();
    const teile = [];
    for await (const teil of stream) teile.push(teil);
    return JSON.parse(Buffer.concat(teile).toString());
  };

  /* --- Gegenprobe zuerst: dieselbe Datei ohne das Feld ------------- */

  await load(OHNE_MASSSTAB);

  const breiteOhne = (await width()).trim();
  const hoeheOhne = await height();

  check("ohne Massstab: die Breite folgt aus Laengengrad und cos(Breite)",
    breiteOhne === `${mitZeichen(ERWARTET_BREITE, 2, "de")} m`,
    `${breiteOhne} gegen ${mitZeichen(ERWARTET_BREITE, 2, "de")} m`);
  check("ohne Massstab: die Hoehe aus dem Breitengrad",
    hoeheOhne === `${mitZeichen(ERWARTET_HOEHE, 2, "de")} m`,
    `${hoeheOhne} gegen ${mitZeichen(ERWARTET_HOEHE, 2, "de")} m`);
  check("ohne Massstab: die Lademeldung steht da, ohne Satz zum Massstab",
    (await meldung()).includes("als Karte A geladen.") &&
      !(await meldung()).includes(VERWORFEN_DE),
    await meldung());

  /* --- mit dem Feld: dieselbe Ausdehnung, und es wird gesagt ------- */

  await load(MIT_MASSSTAB);

  check("mit Massstab: dieselbe Breite wie ohne",
    (await width()).trim() === breiteOhne, `${(await width()).trim()} gegen ${breiteOhne}`);
  check("mit Massstab: dieselbe Hoehe wie ohne",
    (await height()) === hoeheOhne, `${await height()} gegen ${hoeheOhne}`);
  check("mit Massstab: die Lademeldung steht da",
    (await meldung()).includes("scale.geojson als Karte A geladen."), await meldung());
  check("mit Massstab: und sagt, dass der Massstab ignoriert wird",
    (await meldung()).includes(VERWORFEN_DE), await meldung());
  check("mit Massstab: kein Massstabshinweis - der Maßstab ist bekannt",
    await notice.isHidden());

  /* Auf deutsch erzeugt, dann englisch - ohne weitere Handlung gemessen. */
  await page.evaluate(() => setLanguage("en"));

  check("Vorbedingung: die Oberflaeche steht auf englisch", (await sprache()) === "en");
  check("deutsch erzeugt, dann englisch: der Satz ist uebersetzt",
    (await meldung()).includes(VERWORFEN_EN) && !(await meldung()).includes(VERWORFEN_DE),
    await meldung());
  check("deutsch erzeugt, dann englisch: die Lademeldung ebenso",
    (await meldung()).includes("scale.geojson loaded as map A."), await meldung());
  check("deutsch erzeugt, dann englisch: die Breite im englischen Format",
    (await width()).trim() === `${mitZeichen(ERWARTET_BREITE, 2, "en")} m`,
    (await width()).trim());

  /* Auf englisch erzeugt, dann deutsch. */
  await ladenIn(MIT_MASSSTAB, "en");

  check("Vorbedingung: englisch geladen", (await sprache()) === "en");
  check("englisch erzeugt: der Satz steht englisch da",
    (await meldung()).includes(VERWORFEN_EN), await meldung());

  await page.evaluate(() => setLanguage("de"));

  check("Vorbedingung: die Oberflaeche steht auf deutsch", (await sprache()) === "de");
  check("englisch erzeugt, dann deutsch: der Satz ist deutsch",
    (await meldung()).includes(VERWORFEN_DE) && !(await meldung()).includes(VERWORFEN_EN),
    await meldung());
  check("englisch erzeugt, dann deutsch: die Lademeldung ebenso",
    (await meldung()).includes("scale.geojson als Karte A geladen."), await meldung());

  /* --- "absolut WGS84" rechnet nicht ein zweites Mal um ------------ */

  await load(MIT_MASSSTAB);
  await openAllFolds(page);
  await page.selectOption("#exportFrameSelect", "absolute");

  {
    const gespeichert = await herunterladen();
    check("absolut WGS84: der Export laeuft", !!gespeichert);

    if (gespeichert) {
      const punkte = gespeichert.features.flatMap((f) => f.geometry.coordinates.flat());
      const original = JSON.parse(MIT_MASSSTAB).features
        .flatMap((f) => f.geometry.coordinates.flat());

      check("absolut WGS84: die Datei traegt alle Punkte",
        punkte.length === original.length && punkte.length > 0, String(punkte.length));
      check("absolut WGS84: jede Koordinate liegt im gueltigen Bereich",
        punkte.every(([lon, lat]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90),
        JSON.stringify(punkte[2]));
      check("absolut WGS84: und trifft die Ausgangskoordinaten",
        punkte.every(([lon, lat], i) =>
          Math.abs(lon - original[i][0]) < 1e-9 && Math.abs(lat - original[i][1]) < 1e-9),
        `${JSON.stringify(punkte[2])} gegen ${JSON.stringify(original[2])}`);
    }
  }

  /* --- relativ gespeichert: der Massstab gilt dort weiter ---------- */

  /*
   * Zwei Faelle, je an einer Seite der Absolut-Erkennung: ein Zweifelsfall
   * und einer, den die Heuristik als Relativformat lesen wuerde - gleiche
   * kleine Ausdehnung wie eine Gradkarte, nur ohne den Versatz. Beide Male
   * ergibt der Massstab aus der Datei eine andere Groesse als die Heuristik.
   */
  for (const fall of [
    { name: "Zweifelsfall", karte: square(0.5, 1, 0, { coordinateScale: { metersPerUnit: 12.5 } }), faktor: 12.5 },
    { name: "Relativformat", karte: square(0.04, 1, 0, { coordinateScale: { metersPerUnit: 1000 } }), faktor: 1000 },
  ]) {
    await load(fall.karte);
    const { breite } = ausdehnung(fall.karte);

    check(`relativ, ${fall.name}: der Massstab aus der Datei gilt`,
      (await width()).trim() === `${mitZeichen(breite * fall.faktor, 2, "de")} m`,
      `${(await width()).trim()} gegen ${mitZeichen(breite * fall.faktor, 2, "de")} m`);
    check(`relativ, ${fall.name}: die Lademeldung steht da, ohne Satz zum Massstab`,
      (await meldung()).includes("als Karte A geladen.") &&
        !(await meldung()).includes(VERWORFEN_DE),
      await meldung());
  }

  /* --- mit Bezugspunktkonflikt: der Satz steht auch dort ----------- */

  /*
   * Karte A legt den Bezugspunkt fest, Karte B nennt einen anderen und
   * bringt den falschen Massstab mit. Die Konfliktmeldung traegt einen
   * Abstand mit Dezimalzeichen und kann beim Sprachwechsel veralten - als
   * Meldung aus Stuecken wird sie dann ebenso ganz verworfen wie allein.
   */
  await load(OHNE_MASSSTAB);

  await page.locator("#secondFileInput").setInputFiles({
    name: "konflikt.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(absolutKarte({
      referenceOrigin: { lat: LAT0 + 0.001, lon: LON0 },
      coordinateScale: { metersPerUnit: DEG },
    })),
  });
  await page.waitForTimeout(450);

  check("Konflikt: die Konfliktmeldung steht da",
    (await meldung()).includes("Achtung: Die Datei nennt einen abweichenden"), await meldung());
  check("Konflikt: und der Satz zum Massstab dahinter",
    (await meldung()).includes(VERWORFEN_DE), await meldung());

  await page.evaluate(() => setLanguage("en"));

  const ruhetextEn = await page.evaluate(() =>
    translateGermanText(transientIdleText.get("editStatus")));

  check("Konflikt, dann englisch: die Meldung ist verworfen, zurueck auf den Ruhetext",
    (await meldung()) === ruhetextEn.trim(), `${await meldung()} gegen ${ruhetextEn}`);
  check("Konflikt, dann englisch: kein deutsches Dezimalkomma bleibt stehen",
    !/\d,\d/.test(await meldung()), await meldung());

  await page.evaluate(() => setLanguage("de"));

  /* ---------------------------------------------------------------- */
  console.log("Rundlauf: eine metrische Karte bleibt beim Speichern metrisch");

  await load(square(200, 1));

  const pending = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await menueBefehl("Datei", "GeoJSON speichern");
  const event = await pending;

  check("Export läuft", !!event);

  if (event) {
    const stream = await event.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const saved = JSON.parse(Buffer.concat(chunks).toString());

    check("die Datei traegt die Karte",
      saved.type === "FeatureCollection" && saved.features?.length === 1,
      JSON.stringify(saved).slice(0, 120));
    check("oben steht nur type und features",
      Object.keys(saved).every((schluessel) => schluessel === "type" || schluessel === "features"),
      Object.keys(saved).join(", "));

    /* Wieder eingelesen erkennt die Heuristik ihn erneut - ohne Feld in der Datei. */
    await load(JSON.stringify(saved));
    check("wieder eingelesen weiterhin 200 m",
      (await width()).trim() === "200,00 m", await width());
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Maßstabserkennung, Sperren und Rundlauf verhalten sich wie beschrieben.");
