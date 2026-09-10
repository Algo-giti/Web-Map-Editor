#!/usr/bin/env node
// Browsertest für die Maßstabserkennung.
//
// tools/test-cassandra.mjs prüft die Klassifikation als Funktion. Hier geht es
// um das, was der Nutzer davon sieht: welche Größe angezeigt wird, was bei
// unbekanntem Maßstab gesperrt ist, und dass der Maßstab in der Datei den
// Rundlauf übersteht.
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
  indexUrl,
  launchBrowser,
  menueBefehl,
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
  check("200-m-Karte zeigt 200 m", (await width()).trim() === "200.00 m", await width());
  check("kein Maßstabshinweis", await notice.isHidden());

  await load(square(8, 1));
  check("8-m-Karte zeigt 8 m", (await width()).trim() === "8.00 m", await width());

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
    (await width()).trim() === "200.00 m", await width());

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
  await menueBefehl(page, "Datei", "GeoJSON speichern");
  await page.waitForTimeout(400);
  page.off("download", note);

  check("kein absoluter Export", !downloaded);
  check("Ablehnung wird gemeldet",
    (await page.locator("#editStatus").textContent()).includes("Maßstab"),
    await page.locator("#editStatus").textContent());

  /* Die Kartenprüfung darf keine Fläche behaupten. */
  await page.locator("#validateMapBtn").click();
  await page.waitForTimeout(300);
  const report = await page.locator("#validationReport").textContent();

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
  console.log("Rundlauf: der Maßstab übersteht das Speichern");

  await load(square(200, 1));

  const pending = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await menueBefehl(page, "Datei", "GeoJSON speichern");
  const event = await pending;

  check("Export läuft", !!event);

  if (event) {
    const stream = await event.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const saved = JSON.parse(Buffer.concat(chunks).toString());

    check("Maßstab steht in der Datei",
      saved.coordinateScale?.metersPerUnit === 1,
      JSON.stringify(saved.coordinateScale));

    /* Und beim Wiedereinlesen greift er. */
    await load(JSON.stringify(saved));
    check("wieder eingelesen weiterhin 200 m",
      (await width()).trim() === "200.00 m", await width());
  }

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Maßstabserkennung, Sperren und Rundlauf verhalten sich wie beschrieben.");
