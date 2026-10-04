#!/usr/bin/env node
// Browsertest für die Angaben zur Auswahl über der Karte.
//
// Gegenstand ist der Umzug des Auswahlbereichs aus dem Inspektor auf die
// Karte: Kopf („Punkt 1 von 4", „Perimeter · Polygon"), Koordinaten mit den
// beiden Eingabefeldern, Ausgangs- und Versatzblock, Richtungsblock und die
// Notiz zu geschlossenen Polygonen. Sie stehen unten rechts über der Karte,
// einklappbar über einen Griff, und teilen sich den unteren Rand mit den drei
// Kartenfenstern.
//
// Zugesichert wird nach der WIRKUNG: über sichtbaren Text (innerText eines
// gezeichneten Elements - ein nicht gezeichnetes liefert darin nichts) und
// über elementGetroffen(), also über das, was der Browser an einer Stelle
// wirklich zeichnet. Kein getComputedStyle, kein hidden- oder open-Attribut.
// Die Lage kommt aus gemessenen Rechtecken und wird als BEZIEHUNG geprüft -
// rechts heißt „näher am rechten als am linken Kartenrand", nicht „12 px".
//
// Einrichtung und Browsersuche siehe tools/browser-harness.mjs. Wie die
// übrigen Browsertests bewusst NICHT Teil von check-all.mjs.
//
// Alle Karten werden synthetisch erzeugt.
//
// Aufruf aus dem Repository-Wurzelverzeichnis:
//   PLAYWRIGHT_CORE_PATH=/pfad/zur/installation node tools/test-auswahlangaben.mjs

import {
  createChecker,
  createMenueBefehl,
  elementGetroffen,
  indexUrl,
  launchBrowser,
} from "./browser-harness.mjs";

const TOOL = "test-auswahlangaben";

const browser = await launchBrowser(TOOL);
if (!browser) process.exit(2);

/*
 * Perimeter mit einer Exclusion. Die Exclusion hat zwei Ringe: ihr Loch gibt
 * einen langen Untertitel („Exclusion #0 · Ring 2 von 2"), an dem sich zeigt,
 * ob der Kopf dem Griff ausweicht.
 */
const KARTE = JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "perimeter" },
      geometry: { type: "Polygon", coordinates: [[
        [0, 0], [40, 0], [40, 40], [0, 40], [0, 0]]] } },
    { type: "Feature", idx: 0, properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [
        [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]],
        [[13, 13], [17, 13], [17, 17], [13, 17], [13, 13]],
      ] } },
  ],
});

/** Die Fenster der Karte - Menü und Eintrag, wie ein Nutzer sie öffnet. */
const FENSTER = [
  { id: "gridWindow", menue: "Ansicht", eintrag: "Raster…" },
  { id: "mowerWindow", menue: "Ansicht", eintrag: "Mähroboter-Vorschau…" },
  { id: "mergeWindow", menue: "Karte", eintrag: "Karten verbinden…" },
];

const { check, finish } = createChecker(TOOL);
const consoleErrors = [];

/*
 * Die Breite der Angaben, gemessen bei 1280 px, wo nichts sie einengt. Sie
 * ist der Vergleichswert für die schmalen Fenster - kein Literal: es zählt,
 * dass die Angaben dort NICHT schmaler werden, solange sie hineinpassen.
 */
let ebenenbreite = null;

/** Überdecken zwei Rechtecke einander? Berührung an der Kante zählt nicht. */
const ueberdecken = (a, b) =>
  !!a && !!b &&
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Liegt a ganz in b? */
const innerhalb = (a, b) =>
  !!a && !!b &&
  a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;

try {
  /*
   * Ein Kontext je Bedienart. Bei grobem Zeiger wachsen die Kartenknöpfe auf
   * die Zielgröße, und der untere Stapel beginnt dann tiefer - das muss er
   * von selbst tun, sonst überdecken Angaben und Zoom-Leiste einander genau
   * dort.
   */
  const neueSeite = async (breite, grob = false) => {
    const kontext = await browser.newContext({
      viewport: { width: breite, height: 900 },
      hasTouch: grob,
    });
    const seite = await kontext.newPage();

    seite.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    seite.on("pageerror", (error) => consoleErrors.push(String(error)));

    return { kontext, seite };
  };

  const laden = async (seite) => {
    await seite.goto(indexUrl(), { waitUntil: "load" });
    await seite.evaluate(() => localStorage.clear());
    await seite.reload({ waitUntil: "load" });
    await seite.locator("#fileInput").setInputFiles({
      name: "auswahlangaben.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(KARTE),
    });
    await seite.waitForTimeout(400);
  };

  /*
   * Der Marker an einer WELTKOORDINATE - nie über seinen Index. Die Kreise
   * tragen ihre Lage als cx/cy im Kartenrahmen (cy ist North mit umgekehrtem
   * Vorzeichen); bei einer metrischen Karte ist das die Koordinate selbst.
   */
  const markerBei = (seite, east, north) => seite.evaluate(([e, n]) => {
    const treffer = [...document.querySelectorAll("circle.vertex")].filter((m) =>
      Math.abs(Number(m.getAttribute("cx")) - e) < 1e-6 &&
      Math.abs(Number(m.getAttribute("cy")) + n) < 1e-6);

    return treffer.length === 1 ? treffer[0].dataset.vertexKey : null;
  }, [east, north]);

  const punktWaehlen = async (seite, east, north, name) => {
    const schluessel = await markerBei(seite, east, north);

    check(`${name}: der Marker bei E ${east} / N ${north} ist eindeutig`,
      schluessel !== null, "kein oder mehr als ein Marker an dieser Stelle");

    if (!schluessel) return false;

    await seite.locator(`circle.vertex[data-vertex-key="${schluessel}"]`).click();
    await seite.waitForTimeout(250);
    return true;
  };

  /** Ein gemessenes Rechteck - oder null, wenn nichts gezeichnet wird. */
  const kasten = (seite, selektor) => seite.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
             width: r.width, height: r.height };
  }, selektor);

  /** Sichtbarer Text: innerText eines gezeichneten Elements, sonst "". */
  const sichtbarerText = (seite, selektor) => seite.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el && el.getClientRects().length > 0 ? el.innerText : "";
  }, selektor);

  /*
   * Der Griff wird nur geklickt, wenn er getroffen ist: ein wirkungsloser
   * Griff gäbe sonst einen stummen Timeout statt einer benannten Zusicherung.
   * Die Zusicherung steht IMMER da, nicht nur im Fehlerfall.
   */
  const griffKlicken = async (seite, name) => {
    const treffer = await elementGetroffen(seite, "#selectionOverlayHandle", { dy: 12 });

    check(name, treffer.ok, JSON.stringify(treffer));

    if (!treffer.ok) return false;

    await seite.locator("#selectionOverlayHandle").click();
    await seite.waitForTimeout(250);
    return true;
  };

  /* ---------------------------------------------------------------- */
  console.log("Die Punktangabe steht über der Karte, nicht mehr im Inspektor");

  {
    const { kontext, seite } = await neueSeite(1280);
    await laden(seite);

    /* Ohne Auswahl ist nichts da - und die Gegenprobe dazu folgt sofort. */
    const ohne = await elementGetroffen(seite, "#selectionOverlay", { dy: 5 });

    check("ohne Auswahl sind die Angaben nicht sichtbar",
      !ohne.ok, JSON.stringify(ohne));
    check("und ihr Kopf steht nirgends auf der Karte",
      !(await sichtbarerText(seite, "#viewer")).includes("Punkt 1 von"),
      await sichtbarerText(seite, "#viewer"));

    if (await punktWaehlen(seite, 0, 0, "Startpunkt")) {
      const angaben = await sichtbarerText(seite, "#selectionOverlay");
      const inspektor = await sichtbarerText(seite, "#inspector");
      const kopf = await elementGetroffen(seite, "#selectionTitle", { dy: 5 });

      check("nach der Auswahl steht die Punktangabe in den Angaben",
        angaben.includes("Punkt 1 von 4") && angaben.includes("Perimeter · Polygon"),
        angaben);
      check("und sie wird dort wirklich getroffen", kopf.ok, JSON.stringify(kopf));
      check("im Inspektor steht sie nicht mehr",
        !inspektor.includes("Punkt 1 von 4") && !inspektor.includes("Perimeter · Polygon"),
        inspektor);

      /* Die Gegenprobe zum Ausbleiben: der Inspektor steht wirklich da. */
      check("Gegenprobe: der Inspektor ist gezeichnet und trägt seine Werkzeuge",
        /umformen/i.test(inspektor), inspektor);

      /* Ohne Zutun ausgeklappt: die Felder stehen da und werden getroffen. */
      const feld = await elementGetroffen(seite, "#pointEastInput", { dy: 10 });

      check("die Angaben stehen ohne Zutun ausgeklappt da",
        feld.ok && /koordinaten/i.test(angaben), JSON.stringify(feld));

      /*
       * Unten rechts - als Beziehung: näher am rechten als am linken und
       * näher am unteren als am oberen Kartenrand.
       */
      const ov = await kasten(seite, "#selectionOverlay");
      const karte = await kasten(seite, "#viewer");

      check("sie stehen unten rechts in der Karte",
        !!ov && !!karte &&
        karte.right - ov.right < ov.left - karte.left &&
        karte.bottom - ov.bottom < ov.top - karte.top,
        JSON.stringify({ ov, karte }));

      /*
       * Der Griff sitzt neben dem Kopf, nicht in einer eigenen Zeile darüber,
       * und der Kopf weicht ihm aus: Titel und Griff teilen eine Zeile, ohne
       * einander zu überdecken. Gemessen am langen Untertitel weiter unten.
       */
      const griff = await kasten(seite, "#selectionOverlayHandle");
      const titel = await kasten(seite, "#selectionTitle");

      check("der Griff steht in der Zeile des Kopfes",
        !!griff && !!titel && griff.top < titel.bottom && griff.bottom > titel.top,
        JSON.stringify({ griff, titel }));
      check("und Kopf und Griff überdecken einander nicht",
        !ueberdecken(griff, titel), JSON.stringify({ griff, titel }));

      /* East und North nebeneinander, wie bisher im Inspektor. */
      const east = await kasten(seite, "#pointEastInput");
      const north = await kasten(seite, "#pointNorthInput");

      check("East und North stehen nebeneinander",
        !!east && !!north && Math.abs(east.top - north.top) < 1 && north.left >= east.right,
        JSON.stringify({ east, north }));

      ebenenbreite = ov ? ov.width : null;

      /*
       * Durchscheinend: die Karte ist unter den Angaben zu sehen. Gemessen am
       * Bild, nicht an einer Farbangabe - dieselbe Stelle einmal mit und
       * einmal ohne die gezeichnete Karte darunter. Sind die Angaben
       * deckend, sind beide Bilder gleich.
       *
       * Die Gegenprobe gehört dazu: zweimal dieselbe Aufnahme ohne Änderung
       * muss gleich sein, sonst unterschiede sich jedes Bildpaar, und die
       * Zusicherung bestünde immer.
       */
      /*
       * Gemessen im INNERN, nicht am ganzen Kasten: die Ecken sind
       * abgerundet, und durch sie scheint die Karte immer - auch bei
       * deckendem Grund. Die erste Fassung nahm den Kasten bis auf einen
       * Pixel Rand und blieb unter genau dieser Mutation gruen.
       */
      const innen = await kasten(seite, "#selectionOverlay .selection-overlay-body");
      const ausschnitt = innen
        ? { x: innen.left, y: innen.top, width: innen.width, height: innen.height }
        : null;

      if (ausschnitt) {
        const mitKarte = await seite.screenshot({ clip: ausschnitt });
        const nochmal = await seite.screenshot({ clip: ausschnitt });

        await seite.evaluate(() => {
          document.getElementById("svg").style.visibility = "hidden";
        });
        const ohneKarte = await seite.screenshot({ clip: ausschnitt });
        await seite.evaluate(() => {
          document.getElementById("svg").style.visibility = "";
        });

        check("Gegenprobe: zwei Aufnahmen ohne Änderung sind gleich",
          mitKarte.equals(nochmal));
        check("die Karte scheint durch die Angaben hindurch",
          !mitKarte.equals(ohneKarte));
      }
    }

    /* Ein langer Untertitel: das Loch der Exclusion. */
    if (await punktWaehlen(seite, 13, 13, "Loch")) {
      const unter = await kasten(seite, "#selectionSubtitle");
      const griff = await kasten(seite, "#selectionOverlayHandle");
      const text = await sichtbarerText(seite, "#selectionSubtitle");

      check("Vorbedingung: der Untertitel nennt den Ring",
        text.includes("Ring 2 von 2"), text);
      check("auch der lange Untertitel weicht dem Griff aus",
        !ueberdecken(griff, unter), JSON.stringify({ griff, unter }));
    }

    /* ---------------------------------------------------------------- */
    console.log("Die Koordinatenfelder sind dort eingebbar");

    /*
     * Der Punkt wird über seine Koordinaten gefunden, vorher und nachher. Nach
     * der Eingabe steht an der neuen Stelle genau ein Marker und an der alten
     * keiner mehr - das ist die Wirkung, nicht der Feldinhalt.
     */
    if (await punktWaehlen(seite, 40, 40, "Eingabe")) {
      const feld = await elementGetroffen(seite, "#pointEastInput", { dy: 10 });

      check("das East-Feld wird in den Angaben getroffen", feld.ok, JSON.stringify(feld));

      if (feld.ok) {
        await seite.locator("#pointEastInput").click();
        await seite.locator("#pointEastInput").fill("33,5");
        await seite.locator("#pointEastInput").press("Enter");
        await seite.waitForTimeout(350);

        check("der eingetippte Wert verschiebt den Punkt dorthin",
          (await markerBei(seite, 33.5, 40)) !== null,
          String(await markerBei(seite, 33.5, 40)));
        check("und an der alten Stelle steht keiner mehr",
          (await markerBei(seite, 40, 40)) === null,
          String(await markerBei(seite, 40, 40)));
      }
    }

    /* ---------------------------------------------------------------- */
    console.log("Der Griff klappt zu und wieder auf");

    if (await punktWaehlen(seite, 0, 0, "Griff") &&
        await griffKlicken(seite, "aufgeklappt: der Griff ist getroffen")) {
      const feld = await elementGetroffen(seite, "#pointEastInput", { dy: 10 });
      const text = await sichtbarerText(seite, "#selectionOverlay");
      const ov = await seite.evaluate(() =>
        document.getElementById("selectionOverlay").clientWidth);
      const griff = await kasten(seite, "#selectionOverlayHandle");

      check("zugeklappt: die Felder werden nicht mehr getroffen",
        !feld.ok, JSON.stringify(feld));
      check("zugeklappt: und keine Angabe steht mehr da",
        !/koordinaten/i.test(text) && !text.includes("Punkt 1 von 4"), text);

      /*
       * Zugeklappt ist der Kasten genau sein Griff: die Innenbreite (ohne
       * Rahmen) gleich der Griffbreite. Sonst bliebe ein leerer Streifen in
       * Ebenenbreite auf der Karte stehen.
       */
      check("zugeklappt ist von den Angaben allein der Griff übrig",
        !!griff && Math.abs(ov - griff.width) < 0.5,
        `${ov} gegen ${griff ? griff.width : "kein Griff"}`);

      /* Zustand nur in der Sitzung: eine andere Auswahl lässt ihn zu. */
      if (await punktWaehlen(seite, 10, 10, "zugeklappt, andere Auswahl")) {
        const weiter = await elementGetroffen(seite, "#pointEastInput", { dy: 10 });

        check("eine andere Auswahl lässt die Angaben zugeklappt",
          !weiter.ok, JSON.stringify(weiter));
      }

      if (await griffKlicken(seite, "zugeklappt: der Griff ist getroffen")) {
        const wieder = await elementGetroffen(seite, "#pointEastInput", { dy: 10 });

        check("der Griff klappt sie wieder auf",
          wieder.ok && /koordinaten/i.test(await sichtbarerText(seite, "#selectionOverlay")),
          JSON.stringify(wieder));
      }

      /* Und über die Sitzung hinaus nicht: kein localStorage. */
      if (await griffKlicken(seite, "noch einmal zuklappen")) {
        await laden(seite);

        if (await punktWaehlen(seite, 0, 0, "neue Sitzung")) {
          const neu = await elementGetroffen(seite, "#pointEastInput", { dy: 10 });

          check("nach dem Neuladen stehen sie wieder aufgeklappt da",
            neu.ok, JSON.stringify(neu));
        }
      }
    }

    /* Ohne Auswahl wieder weg - nach einer Auswahl, nicht nur am Anfang. */
    await seite.keyboard.press("Escape");
    await seite.waitForTimeout(150);
    await seite.keyboard.press("Escape");
    await seite.waitForTimeout(250);

    const weg = await elementGetroffen(seite, "#selectionOverlay", { dy: 5 });

    check("nach dem Aufheben der Auswahl sind die Angaben weg",
      !weg.ok, JSON.stringify(weg));

    await kontext.close();
  }

  /* ---------------------------------------------------------------- */
  console.log("Die Angaben und ihre Nachbarn überdecken einander nicht");

  /*
   * Drei Breiten: bei 1280 px stehen Angaben und Fenster nebeneinander, bei
   * 960 und 744 px passen sie nicht nebeneinander, und die Angaben weichen
   * nach oben. 744 px zusätzlich mit grobem Zeiger: dort ist die Zoom-Leiste
   * höher, und der Stapel muss tiefer beginnen.
   */
  for (const { breite, grob } of [
    { breite: 1280, grob: false },
    { breite: 960, grob: false },
    { breite: 744, grob: false },
    { breite: 744, grob: true },
  ]) {
    const name = `${breite} px${grob ? ", grob" : ""}`;
    const { kontext, seite } = await neueSeite(breite, grob);
    const menueBefehl = createMenueBefehl(seite, check);

    /* Die Bedingung, unter der gemessen wird, selbst zusichern. */
    check(`${name}: die Bedienart ist wirklich emuliert`,
      (await seite.evaluate(() => matchMedia("(pointer: coarse)").matches)) === grob);

    await laden(seite);

    if (!(await punktWaehlen(seite, 0, 0, name))) {
      await kontext.close();
      continue;
    }

    const ov = await kasten(seite, "#selectionOverlay");
    const karte = await kasten(seite, "#viewer");
    const zoom = await kasten(seite, ".map-view-toolbar");

    check(`${name}: die Angaben sind so breit wie bei 1280 px`,
      !!ov && ebenenbreite !== null && Math.abs(ov.width - ebenenbreite) < 0.5,
      `${ov ? ov.width : "–"} gegen ${ebenenbreite}`);
    const legende = await kasten(seite, "#mapLegend");
    const status = await kasten(seite, "#statusBar");

    check(`${name}: die Angaben stehen in der Karte, ohne über ihren Rand zu ragen`,
      innerhalb(ov, karte), JSON.stringify({ ov, karte }));
    check(`${name}: Angaben und Zoom-Leiste überdecken einander nicht`,
      !!ov && !!zoom && !ueberdecken(ov, zoom), JSON.stringify({ ov, zoom }));
    check(`${name}: Angaben, Legendenzeile und Statuszeile überdecken einander nicht`,
      !!ov && !!legende && !!status &&
      !ueberdecken(ov, legende) && !ueberdecken(ov, status) && !ueberdecken(legende, status),
      JSON.stringify({ ov, legende, status }));

    for (const fenster of FENSTER) {
      await menueBefehl(fenster.menue, fenster.eintrag);
      await seite.waitForTimeout(250);

      const f = await kasten(seite, `#${fenster.id}`);
      const a = await kasten(seite, "#selectionOverlay");
      const z = await kasten(seite, ".map-view-toolbar");
      const k = await kasten(seite, "#viewer");
      const fensterGetroffen = await elementGetroffen(seite, `#${fenster.id}`, { dy: 12 });
      const kopfGetroffen = await elementGetroffen(seite, "#selectionTitle", { dy: 5 });

      check(`${name}, ${fenster.id}: Angaben und Fenster überdecken einander nicht`,
        !!f && !!a && !ueberdecken(a, f), JSON.stringify({ a, f }));
      check(`${name}, ${fenster.id}: beide werden getroffen`,
        fensterGetroffen.ok && kopfGetroffen.ok,
        JSON.stringify({ fensterGetroffen, kopfGetroffen }));
      check(`${name}, ${fenster.id}: die Angaben bleiben in der Karte und unter der Zoom-Leiste frei`,
        innerhalb(a, k) && !ueberdecken(a, z), JSON.stringify({ a, k, z }));
      check(`${name}, ${fenster.id}: das Fenster bleibt in der Karte`,
        innerhalb(f, k), JSON.stringify({ f, k }));
      check(`${name}, ${fenster.id}: die Angaben stehen weiter rechts`,
        !!a && !!k && k.right - a.right < a.left - k.left, JSON.stringify({ a, k }));
      check(`${name}, ${fenster.id}: das Fenster steht weiter links`,
        !!f && !!k && f.left - k.left < k.right - f.right, JSON.stringify({ f, k }));
      check(`${name}, ${fenster.id}: Fenster und Angaben sind gleich breit`,
        !!f && !!a && Math.abs(f.width - a.width) < 0.5, JSON.stringify({ f, a }));

      /*
       * Reicht die Höhe nicht für beide, gibt das Fenster nach und nicht die
       * Angaben: sie behalten die Höhe, die sie ohne Fenster haben.
       */
      check(`${name}, ${fenster.id}: die Angaben behalten ihre Höhe`,
        !!a && !!ov && Math.abs(a.height - ov.height) < 0.5,
        `${a ? a.height : "–"} gegen ${ov ? ov.height : "–"}`);

      await seite.keyboard.press("Escape");
      await seite.waitForTimeout(200);
    }

    await kontext.close();
  }

  /* ---------------------------------------------------------------- */
  console.log("Beide Sprachrichtungen");

  /*
   * Regel (e): in der einen Sprache erzeugen, über setLanguage() umschalten
   * und unmittelbar danach messen - keine Handlung dazwischen, die den Text
   * ohnehin neu schriebe.
   */
  {
    const { kontext, seite } = await neueSeite(1280);
    const angaben = () => sichtbarerText(seite, "#selectionOverlay");
    const griffText = () => seite.evaluate(() => {
      const g = document.getElementById("selectionOverlayHandle");
      return `${g.getAttribute("title")} | ${g.getAttribute("aria-label")}`;
    });

    await laden(seite);

    if (await punktWaehlen(seite, 0, 0, "deutsch erzeugt")) {
      check("deutsch: die Angaben stehen deutsch da",
        (await angaben()).includes("Punkt 1 von 4") && /koordinaten/i.test(await angaben()),
        await angaben());
      check("deutsch: der Griff ist deutsch benannt",
        (await griffText()) ===
          "Auswahlangaben ein- und ausklappen | Auswahlangaben ein- und ausklappen",
        await griffText());

      await seite.evaluate(() => setLanguage("en"));
      await seite.waitForTimeout(250);

      const en = await angaben();

      check("auf deutsch erzeugt, dann englisch: der Kopf ist übersetzt",
        en.includes("Point 1 of 4") && !en.includes("Punkt 1 von 4"), en);
      check("auf deutsch erzeugt, dann englisch: die Felder sind übersetzt",
        /coordinates/i.test(en) && !/koordinaten/i.test(en), en);
      check("auf deutsch erzeugt, dann englisch: der Griff ist übersetzt",
        (await griffText()) ===
          "Collapse or expand the selection details | Collapse or expand the selection details",
        await griffText());
      check("auf deutsch erzeugt, dann englisch: im Inspektor steht die Punktangabe nicht",
        !(await sichtbarerText(seite, "#inspector")).includes("Point 1 of 4"),
        await sichtbarerText(seite, "#inspector"));
    }

    await laden(seite);
    await seite.evaluate(() => setLanguage("en"));
    await seite.waitForTimeout(250);

    if (await punktWaehlen(seite, 0, 0, "englisch erzeugt")) {
      check("auf englisch erzeugt: die Angaben stehen englisch da",
        (await angaben()).includes("Point 1 of 4"), await angaben());

      await seite.evaluate(() => setLanguage("de"));
      await seite.waitForTimeout(250);

      const de = await angaben();

      check("auf englisch erzeugt, dann deutsch: der Kopf ist deutsch",
        de.includes("Punkt 1 von 4") && !de.includes("Point 1 of 4"), de);
      check("auf englisch erzeugt, dann deutsch: die Felder sind deutsch",
        /koordinaten/i.test(de) && !/coordinates/i.test(de), de);
      check("auf englisch erzeugt, dann deutsch: der Griff ist deutsch",
        (await griffText()) ===
          "Auswahlangaben ein- und ausklappen | Auswahlangaben ein- und ausklappen",
        await griffText());
    }

    await kontext.close();
  }

  /* ---------------------------------------------------------------- */
  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));

  await browser.close();
} catch (error) {
  console.error(`${TOOL}: ABBRUCH`, error);
  await browser.close();
  process.exit(1);
}

finish("Die Angaben zur Auswahl stehen über der Karte und überdecken nichts.");
