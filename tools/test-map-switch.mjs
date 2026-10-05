#!/usr/bin/env node
// Browsertest für den Wechsel zwischen Karte A und Karte B.
//
// Geprüft wird, dass die Mehrfachauswahl den Wechsel übersteht. Sie wurde
// vorher weggeworfen: activateMap() stellte nur den zuletzt einzeln gewählten
// Punkt wieder her, eine Gruppe von zwölf Punkten kam als ein Punkt zurück.
//
// Es genügt nicht, den Zähler zu prüfen - die wiederhergestellten Punkte
// müssen auch WEITER BENUTZBAR sein. Deshalb wird nach dem Wechsel begradigt.
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-map-switch.mjs

import {
  createChecker,
  createMarkerKlicker,
  createMenueBefehl,
  elementGetroffen,
  indexUrl,
  launchBrowser,
  openAllFolds,
} from "./browser-harness.mjs";

const TOOL = "test-map-switch";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/**
 * Karte in rohen Metern. Der Perimeter hat acht Punkte, damit sich eine
 * Gruppe bilden lässt, die deutlich mehr als einen Punkt umfasst.
 */
function mapWith(offsetEast) {
  const o = offsetEast;

  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: { type: "Polygon", coordinates: [[
          [o, 0], [o + 10, 0], [o + 20, 0], [o + 30, 0],
          [o + 30, 30], [o + 20, 30], [o + 10, 30], [o, 30],
          [o, 0],
        ]] },
      },
    ],
  });
}

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

try {
  const page = await browser.newPage();

  /*
   * Marker werden ueber den gemeinsamen Helfer geklickt: die Angaben zur
   * Auswahl stehen unten rechts ueber der Karte und verdecken dort Marker,
   * sobald etwas ausgewaehlt ist. Der Helfer klappt sie ueber ihren Griff zu
   * und danach wieder auf - siehe tools/browser-harness.mjs.
   */
  const markerKlicken = createMarkerKlicker(page, check);
  const menueBefehl = createMenueBefehl(page, check);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

  /*
   * Die Faltgeste kommt aus dem browser-harness, nicht aus einer eigenen Kopie.
   * openAllFolds() steht dort seit Etappe 6 b2 - er wurde nur nie benutzt, und
   * deshalb erreichte die Reparatur in 3c (die Feature-Karten der Navigation)
   * zunaechst keinen einzigen Test. Eine Geste an sieben Stellen wird an sechs
   * davon vergessen.
   */

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await openAllFolds(page);
  await menueBefehl("Ansicht", "Mäher am ausgewählten Punkt anzeigen");

  const upload = async (selector, name, body) => {
    await page.locator(selector).setInputFiles({
      name,
      mimeType: "application/geo+json",
      buffer: Buffer.from(body),
    });
    await page.waitForTimeout(400);
    await openAllFolds(page);
  };

  await upload("#fileInput", "a.geojson", mapWith(0));
  await upload("#secondFileInput", "b.geojson", mapWith(100));

  const marks = page.locator('#vertexGroup circle[data-layer="perimeter"]');
  const counter = () => page.locator("#multiSelectionInfo").textContent();

  /*
   * Der Slot-Wechsel laeuft ueber das Menue "Karte", nicht ueber einen direkten
   * Klick auf #mapAButton. Seit Etappe 6 b2 sind die beiden Knoepfe
   * Menueeintraege (role="menuitemradio"), und ein Eintrag ist nur im
   * geoeffneten Menue sichtbar - Playwright verlangt Sichtbarkeit fuer click().
   *
   * Die ids sind dabei unveraendert geblieben; kaputt war allein der Weg
   * dorthin. Genau das tut auch ein Nutzer: Menue oeffnen, Karte waehlen.
   */
  const switchTo = async (which) => {
    await menueBefehl("Karte", `Karte ${which}`);
    await page.waitForTimeout(350);
    await openAllFolds(page);
  };

  /**
   * Wählt mehrere Punkte über Strg+Klick aus.
   *
   * Vorher wird die Auswahl aufgehoben: ein einfacher Klick auf einen bereits
   * markierten Punkt LÄSST die Gruppe bestehen, damit man sie ziehen kann.
   * Das ist gewolltes Verhalten und würde hier sonst Punkte aufsummieren.
   */
  const selectPoints = async (indices) => {
    if (await page.locator("#clearMultiSelectionBtn").isEnabled()) {
      await page.locator("#clearMultiSelectionBtn").click();
      await page.waitForTimeout(150);
    }

    await markerKlicken(marks.nth(indices[0]));
    await page.waitForTimeout(150);

    for (const index of indices.slice(1)) {
      await markerKlicken(marks.nth(index), { modifiers: ["Control"] });
      await page.waitForTimeout(150);
    }
  };

  /* ---------------------------------------------------------------- */
  console.log("Gruppe auf Karte A übersteht den Wechsel");

  await switchTo("A");

  check("Karte A hat acht Punkte", (await marks.count()) === 8,
    String(await marks.count()));

  await selectPoints([0, 2, 4, 6]);

  check("vier Punkte ausgewählt", (await counter()).includes("4"), await counter());

  await switchTo("B");

  check("auf Karte B ist die Auswahl leer",
    (await counter()).includes("0"), await counter());

  await switchTo("A");

  check("die Gruppe ist vollständig zurück",
    (await counter()).includes("4"), await counter());
  check("Löschen ist danach freigegeben",
    await page.locator("#deletePointBtn").isEnabled());

  /* ---------------------------------------------------------------- */
  console.log("Die zurückgeholten Punkte sind auch benutzbar");

  /*
   * Der Zähler allein beweist nichts: er könnte auf Punktbeschreibungen
   * zeigen, die nicht mehr auflösbar sind. Begradigen braucht genau zwei
   * gültige Punkte desselben Linienzugs und ist damit die schärfere Probe.
   */
  await selectPoints([0, 3]);
  await switchTo("B");
  await switchTo("A");

  check("zwei Punkte sind zurück", (await counter()).includes("2"), await counter());
  check("Begradigen ist freigegeben",
    await page.locator("#straightenSelectionBtn").isEnabled(),
    await page.locator("#straightenSelectionBtn").getAttribute("title"));

  await page.locator("#straightenSelectionBtn").click();
  await page.waitForTimeout(400);

  check("Begradigen wurde ausgeführt",
    (await page.locator("#editStatus").textContent()).includes("begradigt"),
    await page.locator("#editStatus").textContent());

  await page.locator("#undoBtn").click();
  await page.waitForTimeout(350);

  /* ---------------------------------------------------------------- */
  console.log("Beide Karten halten ihre eigene Auswahl");

  await switchTo("B");
  await selectPoints([1, 3, 5]);

  check("drei Punkte auf Karte B", (await counter()).includes("3"), await counter());

  await switchTo("A");
  await switchTo("B");

  check("Karte B hat weiterhin drei", (await counter()).includes("3"), await counter());

  await switchTo("A");

  check("Karte A hat weiterhin zwei", (await counter()).includes("2"), await counter());

  /* ---------------------------------------------------------------- */
  console.log("Ein einzeln gewählter Punkt bleibt ein Punkt");

  await selectPoints([5]);

  check("ein Punkt ausgewählt", (await counter()).includes("1"), await counter());

  await switchTo("B");
  await switchTo("A");

  check("es bleibt bei einem", (await counter()).includes("1"), await counter());

  /* ---------------------------------------------------------------- */
  console.log("Sichtbarkeit je Kartenslot");

  /*
   * Gemessen wird die WIRKUNG - wie viele Pfade der passiven Karte wirklich
   * gezeichnet sind -, nicht das aria-checked des Schalters. Die Gruppe
   * #otherMapGroup bleibt dabei immer stehen; leer ist sie, nicht weg, damit
   * die Z-Ordnung der uebrigen Gruppen nicht davon abhaengt.
   */
  const fremdePfade = () => page.evaluate(() =>
    document.querySelectorAll("#otherMapGroup path.other-map-feature").length);

  const schalter = (id) => page.evaluate((sel) => {
    const knopf = document.getElementById(sel);
    return { gesperrt: knopf.disabled, angekreuzt: knopf.getAttribute("aria-checked") };
  }, id);

  await switchTo("A");

  const vorher = await fremdePfade();

  check("die passive Karte B wird gezeichnet", vorher > 0, String(vorher));

  const aktiv = await schalter("showMapAButton");

  check("der Schalter der AKTIVEN Karte ist angekreuzt und gesperrt",
    aktiv.gesperrt === true && aktiv.angekreuzt === "true", JSON.stringify(aktiv));

  await menueBefehl("Karte", "Karte B anzeigen");
  await page.waitForTimeout(300);

  check("ausgeblendet wird von Karte B nichts mehr gezeichnet",
    (await fremdePfade()) === 0, String(await fremdePfade()));
  check("und der Schalter sagt es",
    (await schalter("showMapBButton")).angekreuzt === "false",
    JSON.stringify(await schalter("showMapBButton")));

  /*
   * Der Wunsch gilt dem SLOT, nicht der Rolle: wird B aktiv, ist es sichtbar -
   * es wird ohnehin nicht ueber das Overlay gezeichnet -, und zurueck auf A
   * ist es wieder ausgeblendet.
   */
  await switchTo("B");

  const nachWechsel = await schalter("showMapBButton");

  check("als aktive Karte ist B angekreuzt und gesperrt",
    nachWechsel.gesperrt === true && nachWechsel.angekreuzt === "true",
    JSON.stringify(nachWechsel));
  check("und die jetzt passive Karte A wird gezeichnet",
    (await fremdePfade()) > 0, String(await fremdePfade()));

  await switchTo("A");

  /*
   * Aktivwerden LOESCHT den Ausblendwunsch, es merkt ihn nicht daneben. Das
   * ist entschieden und nicht uebersehen: ein zweiter Zustandshalter neben
   * der Sichtbarkeit waere genau das, was beim Zuklappgriff der Auswahlleiste
   * aus demselben Grund abgelehnt wurde. Wer eine Karte bearbeitet, hat sie
   * sehen wollen.
   */
  check("zurueck auf A ist B wieder sichtbar - aktiv sein hebt das Ausblenden auf",
    (await fremdePfade()) === vorher, `${vorher} -> ${await fremdePfade()}`);

  /*
   * Und die Ansichtsentscheidung ueberlebt ein Undo: sie steht ausserhalb von
   * mapSlots und reist deshalb nicht im Snapshot mit. Ein Rueckgaengig soll
   * eine Geometrie zurueckholen, nicht eine Anzeigeentscheidung umwerfen.
   */
  await menueBefehl("Karte", "Karte B anzeigen");
  await page.waitForTimeout(300);

  check("vor dem Undo ist B ausgeblendet",
    (await fremdePfade()) === 0, String(await fremdePfade()));

  await selectPoints([0]);
  await page.locator("#deletePointBtn").click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);

  check("ein Undo wirft die Ansichtsentscheidung nicht um",
    (await fremdePfade()) === 0, String(await fremdePfade()));

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Karte schliessen");

  /*
   * Jeder Kartenplatz traegt im Menue „Karte“ ein Zeichen zum Schliessen,
   * rechts im Eintrag und nur bei geladener Karte. Mit ungespeicherten
   * Aenderungen wird gefragt - Speichern, Verwerfen, Abbrechen -, ohne nicht.
   *
   * Gemessen nach der Wirkung: ob das Zeichen getroffen wird, was das Menue
   * und der Leerzustand sichtbar sagen, ob die Frage gezeichnet wird, und beim
   * Speichern, was in der heruntergeladenen Datei steht. Je Sprache auf einer
   * eigenen Seite, und an jeder Stelle mit Text unmittelbar nach
   * setLanguage() auch in der anderen gelesen.
   */
  const TEXTE = {
    de: {
      menue: "Karte", datei: "Datei",
      a: "Karte A", b: "Karte B", aktivA: "Karte A · aktiv", aktivB: "Karte B · aktiv",
      nichtA: "Karte A · nicht geladen", nichtB: "Karte B · nicht geladen",
      zeichenA: "Karte A schließen", zeichenB: "Karte B schließen",
      frage: "Die Karte hat ungespeicherte Änderungen.",
      knoepfe: ["Speichern", "Verwerfen", "Abbrechen"],
      geschlossenA: "Karte A wurde aus dem Arbeitsbereich geschlossen.",
      leer: "Keine Karte geladen", pruefung: "Zuerst eine Karte laden.",
    },
    en: {
      menue: "Map", datei: "File",
      a: "Map A", b: "Map B", aktivA: "Map A · active", aktivB: "Map B · active",
      nichtA: "Map A · not loaded", nichtB: "Map B · not loaded",
      zeichenA: "Close map A", zeichenB: "Close map B",
      frage: "The map has unsaved changes.",
      knoepfe: ["Save", "Discard", "Cancel"],
      geschlossenA: "Map A was closed and removed from the workspace.",
      leer: "No map loaded", pruefung: "Load a map first.",
    },
  };

  const schliessenPruefen = async (sprache, grob) => {
    const andere = sprache === "de" ? "en" : "de";
    const t = TEXTE[sprache];
    const wie = `${sprache}${grob ? ", grob" : ""}`;
    const kontext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ...(grob ? { hasTouch: true } : {}),
    });
    const seite = await kontext.newPage();
    const fehler = [];
    seite.on("pageerror", (error) => fehler.push(String(error)));
    const befehl = createMenueBefehl(seite, check);
    const klicke = createMarkerKlicker(seite, check);

    await seite.goto(indexUrl(), { waitUntil: "load" });
    await seite.evaluate(() => localStorage.clear());
    await seite.reload({ waitUntil: "load" });
    await seite.evaluate((l) => setLanguage(l), sprache);

    const laden = async (selektor, name, body) => {
      await seite.locator(selektor).setInputFiles({
        name, mimeType: "application/geo+json", buffer: Buffer.from(body),
      });
      await seite.waitForTimeout(400);
    };

    const menueAuf = async () => {
      if (await seite.locator("#menuMap").isVisible()) return;
      await seite.locator("#menuMapBtn").click();
      await seite.locator("#menuMap").waitFor({ state: "visible" });
    };
    const menueZu = async () => {
      if (!(await seite.locator("#menuMap").isVisible())) return;
      await seite.keyboard.press("Escape");
      await seite.locator("#menuMap").waitFor({ state: "hidden" });
    };

    /* Was das offene Menue zeigt: die beiden Zeilen und ob ein Zeichen getroffen wird. */
    const menueStand = async () => {
      await menueAuf();
      const zeichenA = await elementGetroffen(seite, "#closeMapAButton", { dy: 10 });
      const zeichenB = await elementGetroffen(seite, "#closeMapBButton", { dy: 10 });
      /* Je Platz: Titel und Dateiname, wie sie im offenen Menue stehen. */
      const zeilen = await seite.evaluate(() =>
        [...document.querySelectorAll("#menuMap .menu-map-slot")].map((e) => [
          e.querySelector(".map-slot-title").innerText.trim(),
          e.querySelector(".map-slot-file").innerText.trim(),
        ]));
      return { A: zeichenA.ok, B: zeichenB.ok, zeilen };
    };

    const frageOffen = () => seite.evaluate(() => document.getElementById("closeMapDialog").open);
    const frageTexte = () => seite.evaluate(() => ({
      /* textContent: die Ueberschrift steht in Versalien, gemeint ist das Wort. */
      titel: document.getElementById("closeMapDialogTitle").textContent.trim(),
      text: document.querySelector(".close-map-dialog-text").innerText.trim(),
      knoepfe: [...document.querySelectorAll(".close-map-dialog-actions button")].map((k) => k.innerText.trim()),
      fokus: document.activeElement?.id || "",
    }));

    /* Aendern: einen Punkt der aktiven Karte waehlen und mit der Pfeiltaste schieben. */
    const aendern = async () => {
      await klicke(seite.locator('#vertexGroup circle[data-layer="perimeter"]').first());
      await seite.waitForTimeout(200);
      await seite.keyboard.press("ArrowRight");
      await seite.waitForTimeout(400);
    };

    /*
     * Ein Zeichen klicken - nur, wenn es im offenen Menue getroffen wird.
     * Sonst steht eine benannte Zusicherung da, und der Abschnitt bricht ab,
     * statt dreissig Sekunden auf ein Zeichen zu warten, das es nicht gibt.
     */
    const zeichenKlicken = async (id, name) => {
      await menueAuf();
      const treffer = await elementGetroffen(seite, `#${id}`, { dy: 10 });
      check(`${wie}: ${name}: das Zeichen ist da und getroffen`, treffer.ok, treffer.grund);
      if (!treffer.ok) return false;
      await seite.locator(`#${id}`).click();
      await seite.waitForTimeout(400);
      return true;
    };

    /*
     * Der Ablauf bricht nach einer benannten Zusicherung ab, wenn ein Zustand
     * fehlt, auf dem der naechste Schritt aufbaut - etwa eine Frage, die
     * offen stehen muesste, oder eine, die die Karte darunter sperrt.
     */
    const ablauf = async () => {
      /* --- ohne Karte -------------------------------------------------- */
      let m = await menueStand();
      check(`${wie}: ohne Karte steht kein Zeichen zum Schliessen da`, !m.A && !m.B, JSON.stringify(m));
      await menueZu();

      /* --- Karte A ------------------------------------------------------ */
      await laden("#fileInput", "a.geojson", mapWith(0));
      m = await menueStand();
      check(`${wie}: mit Karte A steht ihr Zeichen da und wird getroffen`, m.A, JSON.stringify(m));
      check(`${wie}: und das von B nicht, B ist nicht geladen`, !m.B, JSON.stringify(m));

      const lage = await seite.evaluate(() => {
        const e = document.getElementById("mapAButton").getBoundingClientRect();
        const z = document.getElementById("closeMapAButton").getBoundingClientRect();
        return { rechts: z.left >= e.right - 0.5, zeile: z.top >= e.top - 0.5 && z.bottom <= e.bottom + 0.5 };
      });
      check(`${wie}: das Zeichen steht rechts im Eintrag, in seiner Zeile`,
        lage.rechts && lage.zeile, JSON.stringify(lage));

      for (const l of [sprache, andere]) {
        if (l !== sprache) await seite.evaluate((x) => setLanguage(x), l);
        const erklaerung = await seite.evaluate(() => {
          const k = document.getElementById("closeMapAButton");
          return [k.title, k.getAttribute("aria-label")];
        });
        check(`${wie}${l !== sprache ? `, dann ${l}` : ""}: das Zeichen erklaert sich beim Ueberfahren`,
          erklaerung[0] === TEXTE[l].zeichenA && erklaerung[1] === TEXTE[l].zeichenA,
          JSON.stringify(erklaerung));
      }
      await seite.evaluate((x) => setLanguage(x), sprache);
      await menueZu();

      /* --- Karte B dazu; ohne Aenderungen schliesst sie ohne Frage ---- */
      await laden("#secondFileInput", "b.geojson", mapWith(100));
      m = await menueStand();
      check(`${wie}: mit beiden Karten stehen beide Zeichen da`, m.A && m.B, JSON.stringify(m));
      check(`${wie}: B ist nach dem Laden aktiv`, m.zeilen[1]?.[0] === t.aktivB, JSON.stringify(m.zeilen));

      if (!(await zeichenKlicken("closeMapBButton", "B ohne Aenderungen"))) return;

      check(`${wie}: ohne Aenderungen schliesst B ohne Frage`, !(await frageOffen()));
      /* Steht die Frage doch da, sperrt sie die Seite - hier endet der Ablauf. */
      if (await frageOffen()) return;
      m = await menueStand();
      check(`${wie}: B ist danach nicht mehr geladen, und ihr Zeichen ist weg`,
        m.zeilen[1]?.[0] === t.nichtB && !m.B, JSON.stringify(m));
      check(`${wie}: B war aktiv - jetzt ist A aktiv`, m.zeilen[0]?.[0] === t.aktivA, JSON.stringify(m.zeilen));
      await menueZu();

      /* --- mit Aenderungen wird gefragt ------------------------------- */
      await laden("#secondFileInput", "b.geojson", mapWith(100));
      await aendern();
      m = await menueStand();
      check(`${wie}: nach der Aenderung traegt B die Marke`,
        (m.zeilen[1] || []).some((z) => z.endsWith(" *")), JSON.stringify(m.zeilen));

      const zaehler = await seite.locator("#multiSelectionInfo").innerText();

      if (!(await zeichenKlicken("closeMapBButton", "B mit Aenderungen"))) return;

      const frage = await elementGetroffen(seite, "#closeMapDialog", { dy: 20 });
      check(`${wie}: mit Aenderungen wird gefragt - die Frage steht da und wird getroffen`,
        (await frageOffen()) && frage.ok, frage.grund);
      if (!(await frageOffen())) return;

      for (const l of [sprache, andere]) {
        if (l !== sprache) await seite.evaluate((x) => setLanguage(x), l);
        const f = await frageTexte();
        const T = TEXTE[l];
        const wo = `${wie}${l !== sprache ? `, dann ${l}` : ""}`;
        check(`${wo}: die Frage nennt die Karte`, f.titel === T.zeichenB, f.titel);
        check(`${wo}: und sagt, warum sie fragt`, f.text === T.frage, f.text);
        check(`${wo}: drei Antworten - Speichern, Verwerfen, Abbrechen`,
          JSON.stringify(f.knoepfe) === JSON.stringify(T.knoepfe), JSON.stringify(f.knoepfe));
        if (l === sprache) {
          check(`${wo}: der Fokus steht auf Abbrechen`, f.fokus === "closeMapCancelBtn", f.fokus);
        }
      }
      await seite.evaluate((x) => setLanguage(x), sprache);

      /*
       * Waehrend die Frage offen ist, gehoert ihr die Tastatur: Strg+Z nimmt
       * darunter nichts zurueck, und Escape bricht sie ab, ohne die Auswahl
       * aufzuheben.
       */
      await seite.keyboard.press("Control+z");
      await seite.waitForTimeout(250);
      check(`${wie}: Strg+Z bei offener Frage laesst sie offen`, await frageOffen());
      await seite.keyboard.press("Escape");
      await seite.waitForTimeout(300);
      check(`${wie}: Escape bricht die Frage ab`, !(await frageOffen()));
      check(`${wie}: und hebt die Auswahl darunter nicht auf`,
        (await seite.locator("#multiSelectionInfo").innerText()) === zaehler,
        `${zaehler} -> ${await seite.locator("#multiSelectionInfo").innerText()}`);
      m = await menueStand();
      check(`${wie}: B ist weiter geladen, aktiv und traegt die Marke - Strg+Z hat nichts zurueckgenommen`,
        m.zeilen[1]?.[0] === t.aktivB && (m.zeilen[1] || []).some((z) => z.endsWith(" *")),
        JSON.stringify(m.zeilen));

      /* Abbrechen laesst die Karte geladen. */
      if (!(await zeichenKlicken("closeMapBButton", "Abbrechen"))) return;
      const offenFuerAbbrechen = await frageOffen();
      check(`${wie}: die Frage steht wieder da`, offenFuerAbbrechen);
      if (offenFuerAbbrechen) {
        await seite.locator("#closeMapCancelBtn").click();
        await seite.waitForTimeout(300);
      }
      check(`${wie}: Abbrechen schliesst die Frage`, !(await frageOffen()));
      m = await menueStand();
      check(`${wie}: und laesst die Karte geladen`,
        m.zeilen[1]?.[0] === t.aktivB && m.B, JSON.stringify(m));
      await menueZu();
      if (m.zeilen[1]?.[0] !== t.aktivB) return;

      /* „Karte B schliessen“ im Menue „Datei“ nimmt denselben Weg. */
      await befehl(t.datei, t.zeichenB);
      await seite.waitForTimeout(300);
      const ausDatei = await frageOffen();
      check(`${wie}: „${t.zeichenB}“ im Menue „${t.datei}“ fragt ebenfalls`, ausDatei);
      if (ausDatei) {
        await seite.locator("#closeMapCancelBtn").click();
        await seite.waitForTimeout(300);
      }

      /* Verwerfen schliesst sie. */
      if (await frageOffen()) return;
      if (!(await zeichenKlicken("closeMapBButton", "Verwerfen"))) return;
      const offenFuerVerwerfen = await frageOffen();
      if (offenFuerVerwerfen) {
        await seite.locator("#closeMapDiscardBtn").click();
        await seite.waitForTimeout(400);
      }
      m = await menueStand();
      check(`${wie}: Verwerfen schliesst die Karte`,
        offenFuerVerwerfen && m.zeilen[1]?.[0] === t.nichtB && !m.B, JSON.stringify(m));
      check(`${wie}: und A ist wieder aktiv`, m.zeilen[0]?.[0] === t.aktivA, JSON.stringify(m.zeilen));
      await menueZu();

      /* Speichern laedt die geaenderte Karte herunter und schliesst sie dann. */
      await laden("#secondFileInput", "b.geojson", mapWith(100));
      await aendern();
      const verschoben = await seite.evaluate(() => {
        const k = document.querySelector('#vertexGroup circle.vertex[data-layer="perimeter"]');
        return [Number(k.getAttribute("cx")), -Number(k.getAttribute("cy"))];
      });
      if (!(await zeichenKlicken("closeMapBButton", "Speichern"))) return;
      const offenFuerSpeichern = await frageOffen();
      check(`${wie}: vor dem Speichern wird gefragt`, offenFuerSpeichern);
      let datei = null;
      if (offenFuerSpeichern) {
        const download = seite.waitForEvent("download", { timeout: 4000 }).catch(() => null);
        await seite.locator("#closeMapSaveBtn").click();
        const geladen = await download;
        if (geladen) {
          const pfad = await geladen.path();
          datei = JSON.parse(await (await import("node:fs/promises")).readFile(pfad, "utf8"));
        }
        await seite.waitForTimeout(400);
      }
      const ring = datei?.features?.find((f) => f.properties?.name === "perimeter")?.geometry?.coordinates?.[0] || [];
      check(`${wie}: Speichern laedt die Karte mit der Aenderung herunter`,
        ring.some(([e, n]) => Math.abs(e - verschoben[0]) < 1e-9 && Math.abs(n - verschoben[1]) < 1e-9),
        `erwartet ${JSON.stringify(verschoben)}, Ring ${JSON.stringify(ring.slice(0, 3))}`);
      m = await menueStand();
      check(`${wie}: und schliesst sie danach`, m.zeilen[1]?.[0] === t.nichtB && !m.B, JSON.stringify(m));
      await menueZu();

      /* War A aktiv und B geladen, wird B aktiv. */
      if (await frageOffen()) return;
      await laden("#secondFileInput", "b.geojson", mapWith(100));
      const aFrei = await seite.locator("#mapAButton").isEnabled();
      check(`${wie}: A ist geladen und waehlbar`, aFrei);
      if (!aFrei) return;
      await befehl(t.menue, t.a);
      await seite.waitForTimeout(300);
      m = await menueStand();
      check(`${wie}: A ist wieder aktiv, B geladen`,
        m.zeilen[0]?.[0] === t.aktivA && m.zeilen[1]?.[0] === t.b, JSON.stringify(m.zeilen));
      if (!(await zeichenKlicken("closeMapAButton", "A aktiv"))) return;
      m = await menueStand();
      check(`${wie}: A geschlossen - B ist jetzt aktiv`,
        m.zeilen[0]?.[0] === t.nichtA && m.zeilen[1]?.[0] === t.aktivB && !m.A,
        JSON.stringify(m));
      await menueZu();

      for (const l of [sprache, andere]) {
        if (l !== sprache) await seite.evaluate((x) => setLanguage(x), l);
        const status = (await seite.locator("#editStatus").innerText()).trim();
        check(`${wie}${l !== sprache ? `, dann ${l}` : ""}: die Statuszeile sagt, dass A geschlossen wurde`,
          status === TEXTE[l].geschlossenA, status);
      }
      await seite.evaluate((x) => setLanguage(x), sprache);

      /*
       * Die letzte Karte, ueber die Tastatur: die Pfeiltaste erreicht das
       * Zeichen nach seinem Eintrag und ueberspringt, was nicht geladen ist;
       * Enter schliesst.
       */
      await seite.locator("#menuMapBtn").focus();
      await seite.keyboard.press("ArrowDown");
      await seite.waitForTimeout(150);
      const erster = await seite.evaluate(() => document.activeElement?.id);
      check(`${wie}: die Pfeiltaste ueberspringt den nicht geladenen Platz A samt Zeichen`,
        erster === "mapBButton", erster);
      await seite.keyboard.press("ArrowDown");
      await seite.waitForTimeout(150);
      const zweiter = await seite.evaluate(() => document.activeElement?.id);
      check(`${wie}: und erreicht danach das Zeichen von B`, zweiter === "closeMapBButton", zweiter);
      if (zweiter === "closeMapBButton") {
        await seite.keyboard.press("Enter");
        await seite.waitForTimeout(400);
      }

      for (const l of [sprache, andere]) {
        if (l !== sprache) await seite.evaluate((x) => setLanguage(x), l);
        const T = TEXTE[l];
        const wo = `${wie}${l !== sprache ? `, dann ${l}` : ""}`;
        const leer = await seite.evaluate(() => {
          const e = document.getElementById("emptyMapState");
          return e.getClientRects().length ? e.innerText : "";
        });
        check(`${wo}: war es die letzte, steht der Editor im Leerzustand`,
          leer.includes(T.leer), JSON.stringify(leer));
        check(`${wo}: der Inspektor sagt es ebenso`,
          (await seite.locator("#inspectorSubtitle").innerText()).trim() === T.leer,
          await seite.locator("#inspectorSubtitle").innerText());
        check(`${wo}: und die Kartenpruefung verlangt wieder eine Karte`,
          (await seite.locator("#validationSummary").textContent()).trim() === T.pruefung,
          await seite.locator("#validationSummary").textContent());
        m = await menueStand();
        check(`${wo}: im Menue sind beide Plaetze leer, kein Zeichen steht da`,
          m.zeilen[0]?.[0] === T.nichtA && m.zeilen[1]?.[0] === T.nichtB && !m.A && !m.B,
          JSON.stringify(m));
        await menueZu();
      }
      await seite.evaluate((x) => setLanguage(x), sprache);
    };

    await ablauf();

    check(`${wie}: keine Seitenfehler`, fehler.length === 0, fehler.join(" | "));
    await kontext.close();
  };

  await schliessenPruefen("de", false);
  await schliessenPruefen("en", false);

  /*
   * Bei grobem Zeiger tragen das Zeichen und die drei Antworten die
   * Zielgroesse - gelesen aus --touch-target, nicht als Zahl.
   */
  {
    const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const seite = await kontext.newPage();
    const klicke = createMarkerKlicker(seite, check);
    await seite.goto(indexUrl(), { waitUntil: "load" });
    await seite.evaluate(() => localStorage.clear());
    await seite.reload({ waitUntil: "load" });
    check("grob: die Bedienart ist wirklich emuliert",
      await seite.evaluate(() => matchMedia("(pointer: coarse)").matches));
    await seite.locator("#fileInput").setInputFiles({
      name: "a.geojson", mimeType: "application/geo+json", buffer: Buffer.from(mapWith(0)),
    });
    await seite.waitForTimeout(400);
    const ziel = await seite.evaluate(() => parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--touch-target")));
    await seite.locator("#menuMapBtn").click();
    const zeichen = await seite.evaluate(() => {
      const r = document.getElementById("closeMapAButton").getBoundingClientRect();
      return { b: r.width, h: r.height };
    });
    check("grob: das Zeichen traegt die Zielgroesse in beiden Richtungen",
      zeichen.b >= ziel && zeichen.h >= ziel, `${JSON.stringify(zeichen)} gegen ${ziel}`);
    await seite.keyboard.press("Escape");
    await klicke(seite.locator('#vertexGroup circle[data-layer="perimeter"]').first());
    await seite.keyboard.press("ArrowRight");
    await seite.waitForTimeout(300);
    await seite.locator("#menuMapBtn").click();
    const zeichenGrob = await elementGetroffen(seite, "#closeMapAButton", { dy: 10 });
    check("grob: das Zeichen ist getroffen", zeichenGrob.ok, zeichenGrob.grund);
    if (zeichenGrob.ok) {
      await seite.locator("#closeMapAButton").click();
      await seite.waitForTimeout(300);
    }
    const antworten = await seite.evaluate(() =>
      [...document.querySelectorAll(".close-map-dialog-actions button")]
        .map((k) => k.getBoundingClientRect().height));
    check("grob: die drei Antworten tragen die Zielgroesse",
      antworten.length === 3 && antworten.every((h) => h >= ziel), `${JSON.stringify(antworten)} gegen ${ziel}`);
    await kontext.close();
  }
} finally {
  await browser.close();
}

finish("Die Mehrfachauswahl übersteht den Wechsel zwischen Karte A und B.");
