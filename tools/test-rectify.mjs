#!/usr/bin/env node
// Browsertest für "Ecken rechtwinklig".
//
// tools/test-geometry.mjs prüft das Verfahren selbst. Hier geht es um die
// Einbindung: Auswahl, Statuszeile, Vorschau, Anwenden, Undo, der feste
// Winkel und der Fall, in dem es gar keine Vorzugsrichtung gibt.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-rectify.mjs

import { createChecker, indexUrl, launchBrowser } from "./browser-harness.mjs";

const TOOL = "test-rectify";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(0);

/** Karte in rohen Metern mit einer Exclusion aus den gegebenen Punkten. */
function mapWith(ring) {
  return JSON.stringify({
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
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      },
    ],
  });
}

/** Leicht verzogenes Rechteck - der eigentliche Anwendungsfall. */
const wonky = [[10, 10], [25, 10.3], [24.7, 20], [9.8, 19.8]];

/** Regelmäßiges Vieleck: es gibt keine Vorzugsrichtung. */
const polygon = [];
for (let index = 0; index < 24; index++) {
  const angle = (index / 24) * Math.PI * 2;
  polygon.push([20 + Math.cos(angle) * 6, 20 + Math.sin(angle) * 6]);
}

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
      document.querySelectorAll("#sidebar details")
        .forEach((section) => section.setAttribute("open", ""));
    });

  const load = async (body) => {
    await page.goto(indexUrl(), { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expandSidebar();
    await page.uncheck("#showMowerPreview");

    await page.locator("#fileInput").setInputFiles({
      name: "rectify.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await expandSidebar();
  };

  const marks = page.locator('#vertexGroup circle[data-layer="exclusion"]');
  const status = () => page.locator("#rectifyStatus").textContent();
  const applyButton = page.locator("#rectifyApplyBtn");

  /** Ost/Nord eines Exclusion-Punktes aus dem Export lesen. */
  const exportRing = async () => {
    const pending = page
      .waitForEvent("download", { timeout: 5000 })
      .catch(() => null);

    await page.locator("#exportBtn").click();

    const event = await pending;
    if (!event) return null;

    const stream = await event.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const saved = JSON.parse(Buffer.concat(chunks).toString());

    return saved.features.find((f) => f.properties?.name === "exclusion")
      ?.geometry?.coordinates?.[0] ?? null;
  };

  /* ---------------------------------------------------------------- */
  console.log("Ohne Auswahl ist nichts freigegeben");

  await load(mapWith(wonky));

  check("Button ist gesperrt", await applyButton.isDisabled());
  check("Statuszeile erklärt die Auswahl",
    (await status()).includes("Punkt des Features auswählen"), await status());

  /* ---------------------------------------------------------------- */
  console.log("Verzogenes Rechteck");

  await marks.nth(0).click();
  await page.waitForTimeout(300);

  const before = await status();

  check("Vorzugsrichtung wird genannt",
    before.includes("Vorzugsrichtung"), before);
  check("Übereinstimmung wird genannt",
    /Übereinstimmung \d+ %/.test(before), before);
  check("die Übereinstimmung ist hoch",
    Number(before.match(/Übereinstimmung (\d+) %/)?.[1] ?? 0) >= 95, before);
  check("alle vier Kanten werden angepasst",
    before.includes("4 von 4 Kanten"), before);
  check("die größte Verschiebung steht dabei",
    /größte Verschiebung [\d.,]+ m/.test(before), before);
  check("Button ist freigegeben", await applyButton.isEnabled());

  check("Vorschaulinie ist gezeichnet",
    (await page.locator("#selectionGhostGroup .rectify-preview-line").count()) >= 1);
  check("bewegte Punkte sind markiert",
    (await page.locator("#selectionGhostGroup .rectify-preview-node").count()) >= 1,
    String(await page.locator("#selectionGhostGroup .rectify-preview-node").count()));

  const pointsBefore = await marks.count();

  await applyButton.click();
  await page.waitForTimeout(400);

  check("Erfolgsmeldung nennt Kanten und Verschiebung",
    /\d+ Kanten rechtwinklig ausgerichtet, größte Verschiebung/.test(
      await page.locator("#editStatus").textContent()),
    await page.locator("#editStatus").textContent());

  check("die Punktzahl bleibt gleich",
    (await marks.count()) === pointsBefore,
    `${await marks.count()} statt ${pointsBefore}`);

  check("danach ist nichts mehr zu tun", await applyButton.isDisabled(),
    await status());

  const ring = await exportRing();
  check("Export gelingt", !!ring);

  if (ring) {
    check("der Ring ist geschlossen",
      JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1]),
      JSON.stringify([ring[0], ring[ring.length - 1]]));

    /*
     * Gefordert sind RECHTE WINKEL, nicht Achsparallelität: ausgerichtet wird
     * auf die Vorzugsrichtung der Form selbst. Ein leicht schief gezeichnetes
     * Rechteck bleibt danach leicht schief - aber rechtwinklig.
     */
    const unique = ring.slice(0, -1);

    const worst = unique.reduce((largest, point, index) => {
      const next = unique[(index + 1) % unique.length];
      const after = unique[(index + 2) % unique.length];

      const a = [next[0] - point[0], next[1] - point[1]];
      const b = [after[0] - next[0], after[1] - next[1]];

      const cosine =
        (a[0] * b[0] + a[1] * b[1]) /
        (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]));

      return Math.max(largest, Math.abs(cosine));
    }, 0);

    check("alle Ecken sind rechtwinklig", worst < 1e-9,
      `${worst} bei ${JSON.stringify(unique)}`);

    /* Und die Form ist nicht achsparallel geworden - sie war es nie. */
    check("die Form behält ihre eigene Ausrichtung",
      Math.abs(unique[0][1] - unique[1][1]) > 0.1,
      JSON.stringify([unique[0], unique[1]]));
  }

  /* ---------------------------------------------------------------- */
  console.log("Ein Undo nimmt alles zurück");

  await load(mapWith(wonky));
  await marks.nth(0).click();
  await page.waitForTimeout(250);
  await applyButton.click();
  await page.waitForTimeout(400);

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(400);
  await expandSidebar();

  const restored = await exportRing();

  check("die ursprünglichen Punkte sind wieder da",
    restored &&
    Math.abs(restored[1][1] - 10.3) < 1e-9,
    restored ? JSON.stringify(restored[1]) : "kein Export");

  /* ---------------------------------------------------------------- */
  console.log("Fester Winkel");

  await load(mapWith(wonky));
  await marks.nth(0).click();
  await page.waitForTimeout(250);

  await page.fill("#rectifyAngleInput", "45");
  await page.locator("#applyRectifyAngleBtn").click();
  await page.waitForTimeout(300);

  check("die Eingabe schaltet selbst auf den festen Winkel um",
    (await page.locator("#rectifyAngleMode").inputValue()) === "fixed");
  check("der feste Winkel wird verwendet",
    (await status()).includes("Vorzugsrichtung 45,0°"), await status());
  check("bei 45 Grad passt keine Kante mehr",
    (await status()).includes("0 von 4 Kanten"), await status());
  check("und der Button ist gesperrt", await applyButton.isDisabled());

  /* ---------------------------------------------------------------- */
  console.log("Toleranz");

  await load(mapWith(wonky));
  await marks.nth(0).click();
  await page.waitForTimeout(250);

  await page.fill("#rectifyToleranceInput", "0");
  await page.locator("#applyRectifyToleranceBtn").click();
  await page.waitForTimeout(300);

  check("Toleranz 0 gibt nichts frei", await applyButton.isDisabled(),
    await status());

  await page.fill("#rectifyToleranceInput", "90");
  await page.locator("#applyRectifyToleranceBtn").click();
  await page.waitForTimeout(300);

  check("eine unzulässige Toleranz wird abgelehnt",
    (await status()).includes("0 bis 45 Grad"), await status());

  /* ---------------------------------------------------------------- */
  console.log("Form ohne Vorzugsrichtung");

  await load(mapWith(polygon));
  await marks.nth(0).click();
  await page.waitForTimeout(300);

  const polygonStatus = await status();

  check("die Übereinstimmung ist niedrig",
    Number(polygonStatus.match(/Übereinstimmung (\d+) %/)?.[1] ?? 100) < 10,
    polygonStatus);
  check("und wird als Warnung gefärbt",
    (await page.locator("#rectifyStatus").getAttribute("class")).includes("error"),
    await page.locator("#rectifyStatus").getAttribute("class"));

  /* ---------------------------------------------------------------- */
  console.log("Übersetzung");

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(300);
  await expandSidebar();

  check("der Abschnitt ist übersetzt",
    (await page.locator("#rectifyApplyBtn").textContent())
      .includes("right-angled"),
    await page.locator("#rectifyApplyBtn").textContent());
  check("die Statuszeile ist übersetzt",
    (await status()).includes("select a point of the feature"), await status());

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Ecken rechtwinklig arbeitet auf ganzen Features und nennt seine Zahlen.");
