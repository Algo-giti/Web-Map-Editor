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

import { createChecker, createKlicker, createMarkerKlicker, createMenueBefehl, createUmformwerkzeug, elementGetroffen, freieKartenstelle, indexUrl, launchBrowser, openAllFolds } from "./browser-harness.mjs";

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
   *
   * Und zwar unter der LEISTE: seit die Angaben zur Auswahl unten rechts ueber
   * der Karte stehen, gibt es eine zweite Ebene, die Marker verdeckt, und
   * ihren Griff misst ein eigener Test. Ohne die Einschraenkung fand diese
   * Suche zuerst den Marker unter den Angaben - und "zugeklappt ist er wieder
   * erreichbar" riss, weil die falsche Ebene zugeklappt wurde.
   */
  const verdeckterMarker = () => page.evaluate(() => {
    for (const m of document.querySelectorAll("circle.vertex")) {
      const r = m.getBoundingClientRect();
      const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (treffer !== m && treffer?.closest("#selectionActions")) {
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
        /* Unter der Leiste, nicht unter den Angaben - siehe verdeckterMarker(). */
        return treffer === m || !treffer?.closest("#selectionActions")
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
   * Der Waechter des Hauses fuer einen sperrbaren Knopf: er sichert zu UND
   * klickt nicht, wenn der Knopf gesperrt ist. Ohne ihn wuerde aus einer
   * klaren Ablehnung ein stummer Timeout.
   */
  const klickeFreienKnopf = createKlicker(page, check);
  const menueBefehl = createMenueBefehl(page, check);
  const umformwerkzeug = createUmformwerkzeug(page, check);

  /*
   * Marker werden ueber den gemeinsamen Helfer geklickt: die Angaben zur
   * Auswahl stehen unten rechts ueber der Karte und verdecken dort Marker,
   * sobald etwas ausgewaehlt ist. Der Helfer klappt sie ueber ihren Griff zu
   * und danach wieder auf - siehe tools/browser-harness.mjs. Die Auswahlleiste
   * links oben fasst er NICHT an; fuer sie gelten die eigenen Abschnitte
   * weiter unten.
   */
  const markerKlicken = createMarkerKlicker(page, check);

  /*
   * Die E/N-Felder stehen seit dem Umzug ueber der Karte, in den Angaben zur
   * Auswahl. Ein fill() auf ein Feld, das dort nicht gezeichnet wird - die
   * Angaben zugeklappt oder gar nicht da -, wartete dreissig Sekunden und
   * naehme alles dahinter mit. Der Waechter macht daraus eine benannte
   * Zusicherung und fuellt dann nicht; dieselbe Regel wie bei
   * klickeFreienKnopf(). Die Zusicherung steht IMMER da.
   */
  const feldFuellen = async (id, wert) => {
    const treffer = await elementGetroffen(page, `#${id}`, { dy: 10 });

    check(`#${id} ist zum Tippen erreichbar`, treffer.ok, JSON.stringify(treffer));

    if (!treffer.ok) return false;

    await page.fill(`#${id}`, wert);
    return true;
  };

  /*
   * Ein Klick auf einen Knopf der Auswahlleiste setzt voraus, dass sie da ist.
   * Ohne Waechter wird aus einer verschwundenen Leiste ein stummer Timeout
   * statt einer benannten Zusicherung - dieselbe Regel und derselbe Grund wie
   * bei klickeFreienKnopf(). Die Zusicherung steht IMMER da, nicht nur im
   * Fehlerfall: eine, die man nur sieht, wenn sie reisst, belegt im Gutfall
   * nichts.
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

  /*
   * Der Kopfblock des Inspektors. Er traegt seinen Text seit dem Umzug der
   * Angaben zur Auswahl nur noch ohne Auswahl - im leeren Zustand, beim
   * Zeichnen und beim Messen. Gelesen wird deshalb nur, was GEZEICHNET wird:
   * ein Text, der nicht dasteht, liefert "" statt seines alten Inhalts.
   *
   * Seit dem 06.10.2026 ist dieser Text ein Faltblock und beim ersten Start
   * zu. Wer ihn lesen will, klappt ihn auf - am Griff, wie ein Nutzer. Steht
   * der Block gar nicht da (bei einer Auswahl), gibt es keinen Griff, und es
   * wird nichts geklickt.
   *
   * "Gezeichnet" heisst checkVisibility() und NICHT getClientRects(): ein Kind
   * eines geschlossenen <details> meldet weiterhin ein Rechteck - der vierte
   * Fall der Regel in CLAUDE.md, Abschnitt 4.2. Mit getClientRects() las
   * diese Funktion den Titel auch bei zugeklapptem Block.
   */
  /*
   * Ohne Griff wird nicht geklickt: ein click() auf ein <summary>, das es
   * nicht gibt, wartete dreissig Sekunden - gemessen an der Mutation, die den
   * Block wieder zu einem festen <div> macht. Daraus wird eine benannte
   * Zusicherung, dieselbe Regel wie bei klickeFreienKnopf().
   */
  const kopfAufklappen = async () => {
    const lage = await page.evaluate(() => {
      const block = document.getElementById("inspectorHeadText");
      if (!block.checkVisibility() || block.open === true) return "nichts zu tun";
      return block.querySelector(":scope > summary") ? "zu" : "kein Griff";
    });

    if (lage === "nichts zu tun") return;

    check("der zugeklappte Auswahlblock im Kopf hat einen Griff", lage === "zu", lage);

    if (lage !== "zu") return;

    await page.locator("#inspectorHeadText > summary").click();
    await page.waitForTimeout(150);
  };

  const head = async () => {
    await kopfAufklappen();

    return page.evaluate(() => {
      const gezeichnet = (el) => el.checkVisibility();
      const zeile = (id) => {
        const el = document.getElementById(id);
        return gezeichnet(el) ? el.textContent.trim() : "";
      };
      const kopf = document.querySelector(".inspector-head").getBoundingClientRect();
      const umschalter = document.getElementById("inspectorToggle").getBoundingClientRect();

      /*
       * Was zuunterst im Kopfblock gezeichnet wird: der Untertitel, und ohne
       * Text der Umschalter. Der Abstand von dort zur Unterkante sagt, ob der
       * Kopf ohne Text wirklich schrumpft - siehe die Zusicherung dazu.
       */
      const untertitel = document.getElementById("inspectorSubtitle");
      const zuunterst = gezeichnet(untertitel)
        ? untertitel.getBoundingClientRect()
        : umschalter;

      return {
        titel: zeile("inspectorTitle"),
        unter: zeile("inspectorSubtitle"),
        hoehe: Math.round(kopf.height),
        oben: Math.round(kopf.top),
        umschalter: [umschalter.left, umschalter.top, umschalter.width, umschalter.height]
          .map(Math.round).join("/"),
        darunter: Math.round(kopf.bottom - zuunterst.bottom),
      };
    });
  };

  /*
   * Der Kopf der AUSWAHL - "Punkt 3 von 4", "Perimeter · Polygon". Er steht
   * seit dem Umzug in den Angaben ueber der Karte. Wie oben zaehlt nur, was
   * gezeichnet wird.
   */
  const auswahlKopf = () =>
    page.evaluate(() => {
      const zeile = (id) => {
        const el = document.getElementById(id);
        return el.getClientRects().length > 0 ? el.textContent.trim() : "";
      };

      return { titel: zeile("selectionTitle"), unter: zeile("selectionSubtitle") };
    });

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
  await markerKlicken(marks.nth(2));
  await page.waitForTimeout(300);

  check("nach dem Klick steht der Punktzustand", await visible("inspectorPoint"));
  check("und der leere nicht mehr", !(await visible("inspectorEmpty")));

  const punkt = await auswahlKopf();
  check("der Kopf nennt Nummer und Anzahl",
    /^Punkt \d+ von \d+$/.test(punkt.titel), punkt.titel);

  /*
   * Der Anker darf nicht wandern - das ist der Zweck des Kopfblocks.
   *
   * Bis zum Umzug der Angaben stand hier zusaetzlich "und ist gleich hoch".
   * Das ist nicht mehr wahr und soll es nicht sein: bei einer Auswahl steht
   * der Kopf der Auswahl in den Angaben ueber der Karte, und der Kopfblock
   * laesst seinen Text WEG - er traegt dann nur den Umschalter. Was der Anker
   * weiter leisten muss, ist der Ort: der Kopfblock oben, und der Umschalter
   * an genau derselben Stelle, damit man ihn nach einem Klick auf die Karte
   * nicht suchen muss. Beides ist zugesichert; die Hoehe ist es nicht mehr.
   */
  const punktInspektor = await head();

  check("der Kopfblock steht an derselben Stelle",
    punktInspektor.oben === geladen.oben, `${punktInspektor.oben} statt ${geladen.oben}`);
  check("und sein Umschalter ebenfalls",
    punktInspektor.umschalter === geladen.umschalter,
    `${punktInspektor.umschalter} statt ${geladen.umschalter}`);
  check("der Kopfblock nennt den Punkt nicht noch einmal",
    punktInspektor.titel === "" && punktInspektor.unter === "",
    `${punktInspektor.titel} | ${punktInspektor.unter}`);

  /*
   * Und ohne Text haelt er auch keinen leeren Platz: unter dem Umschalter
   * steht genau der Abstand, der ohne Auswahl unter dem Untertitel steht.
   * Ein Kopf, der seine Mindesthoehe behielte, stuende als leerer Streifen
   * ueber dem Inspektor.
   */
  check("ohne Text ist der Kopfblock nur so hoch wie sein Umschalter",
    punktInspektor.darunter === geladen.darunter && punktInspektor.hoehe < geladen.hoehe,
    `darunter ${punktInspektor.darunter} gegen ${geladen.darunter}, ` +
    `Hoehe ${punktInspektor.hoehe} gegen ${geladen.hoehe}`);

  /* ---------------------------------------------------------------- */
  console.log("Der Auswahlblock im Kopf klappt ein wie die uebrigen Bloecke");

  /*
   * Entschieden vom Projektinhaber am 06.10.2026: „AUSWAHL / Nichts
   * ausgewaehlt / Punkt auf der Karte anklicken“ ist einklappbar wie die
   * anderen Bloecke und beim ersten Start ZU. Gemessen wird, was gezeichnet
   * wird - elementFromPoint und checkVisibility(), nie getClientRects(): ein
   * Kind eines geschlossenen <details> meldet weiterhin ein Rechteck.
   *
   * Der Griff traegt seinen Text in Grossbuchstaben (text-transform), innerText
   * gibt ihn so zurueck. Verglichen wird deshalb textContent - die Sichtbarkeit
   * belegt der Treffer daneben.
   */
  const auswahlblock = () => page.evaluate(() => {
    const block = document.getElementById("inspectorHeadText");
    const griff = block.querySelector(":scope > summary");
    const titel = document.getElementById("inspectorTitle");
    const unter = document.getElementById("inspectorSubtitle");
    const kopf = document.querySelector(".inspector-head");
    const umschalter = document.getElementById("inspectorToggle");
    const getroffen = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const t = document.elementFromPoint(r.left + Math.min(r.width / 2, 30), r.top + r.height / 2);
      return !!t && el.contains(t);
    };
    const k = kopf.getBoundingClientRect();
    const u = umschalter.getBoundingClientRect();
    /* Ohne Griff (der Block waere dann nicht einklappbar) liefert er null. */
    const g = griff ? griff.getBoundingClientRect() : u;
    const unterkante = Math.max(u.bottom, block.open !== false ? unter.getBoundingClientRect().bottom : g.bottom);

    return {
      offen: block.open,
      griff: griff ? griff.textContent.trim() : null,
      griffGetroffen: griff ? getroffen(griff) : false,
      titel: titel.checkVisibility() ? titel.textContent.trim() : "",
      unter: unter.checkVisibility() ? unter.textContent.trim() : "",
      titelGetroffen: getroffen(titel),
      spalte: document.getElementById("inspector").innerText,
      /* Wie weit liegt die Unterkante des Kopfes unter dem, was er zeigt? */
      leer: Math.round(k.bottom - unterkante),
      polster: Math.round(parseFloat(getComputedStyle(kopf).paddingBottom) +
        parseFloat(getComputedStyle(kopf).borderBottomWidth)),
      umschalterRechtsOben:
        Math.abs(u.right - (k.right - parseFloat(getComputedStyle(kopf).paddingRight))) <= 1 &&
        Math.abs(u.top - (k.top + parseFloat(getComputedStyle(kopf).paddingTop))) <= 1,
    };
  });

  await page.goto(indexUrl(), { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  {
    const a = await auswahlblock();

    check("beim ersten Start ist der Auswahlblock zu", a.offen === false);
    check("sein Griff steht da und wird getroffen",
      a.griffGetroffen && a.griff === "Auswahl", JSON.stringify(a.griff));
    check("sein Inhalt wird nicht gezeichnet",
      !a.titelGetroffen && a.titel === "" && !a.spalte.includes("Nichts ausgewählt"),
      `${a.titel} | getroffen ${a.titelGetroffen}`);
    check("zugeklappt haelt der Kopf keinen leeren Streifen",
      Math.abs(a.leer - a.polster) <= 1, `${a.leer} gegen ${a.polster}`);
    check("der Umschalter steht oben rechts im Kopf", a.umschalterRechtsOben);
  }

  /* Uebersetzt wird der Griff wie jede Beschriftung - in beiden Richtungen. */
  await page.evaluate(() => setLanguage("en"));
  check("deutsch erzeugt, dann englisch: der Griff heisst „Selection“",
    (await auswahlblock()).griff === "Selection" && (await auswahlblock()).griffGetroffen,
    (await auswahlblock()).griff);

  /*
   * Mit der Tastatur erreichbar wie jeder Faltblock: Enter klappt auf.
   * Ohne Griff wird nicht fokussiert - sonst ein stummer Timeout statt der
   * Zusicherung darunter.
   */
  if ((await auswahlblock()).griff !== null) {
    await page.locator("#inspectorHeadText > summary").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  }

  {
    const a = await auswahlblock();

    check("Enter am Griff klappt ihn auf", a.offen === true);
    check("aufgeklappt, englisch: der Titel steht da und wird getroffen",
      a.titelGetroffen && a.titel === "Nothing selected", a.titel);
    check("und der Untertitel ebenso", a.unter === "No map loaded", a.unter);
    check("aufgeklappt haelt der Kopf ebenfalls keinen leeren Streifen",
      Math.abs(a.leer - a.polster) <= 1, `${a.leer} gegen ${a.polster}`);
  }

  /*
   * Der Untertitel ist ABGELEITET: er entsteht neu, sobald eine Karte da ist.
   * Hier entsteht er auf Englisch - die Karte wird in der englischen
   * Oberflaeche geladen -, dann wird umgeschaltet.
   */
  const karteLaden = async () => {
    await page.locator("#fileInput").setInputFiles({
      name: "inspector.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify({ type: "FeatureCollection", features: [PERIMETER] })),
    });
    await page.waitForTimeout(450);
  };

  await karteLaden();
  check("englisch erzeugt: „Click a point on the map“",
    (await auswahlblock()).unter === "Click a point on the map", (await auswahlblock()).unter);

  await page.evaluate(() => setLanguage("de"));
  check("englisch erzeugt, dann deutsch: „Punkt auf der Karte anklicken“",
    (await auswahlblock()).unter === "Punkt auf der Karte anklicken", (await auswahlblock()).unter);
  check("englisch erzeugt, dann deutsch: „Nichts ausgewählt“",
    (await auswahlblock()).titel === "Nichts ausgewählt", (await auswahlblock()).titel);
  check("und der Griff heisst wieder „Auswahl“",
    (await auswahlblock()).griff === "Auswahl", (await auswahlblock()).griff);

  /* Der Wunsch ueberlebt den Neuaufbau - wie bei Bestand und Kartenpruefung. */
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  check("nach dem Neuladen ist er noch offen",
    (await auswahlblock()).offen === true && (await auswahlblock()).titelGetroffen);

  if ((await auswahlblock()).griff !== null) {
    await page.locator("#inspectorHeadText > summary").click();
    await page.waitForTimeout(200);
  }
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  check("und zugeklappt bleibt er auch nach dem Neuladen zu",
    (await auswahlblock()).offen === false && !(await auswahlblock()).titelGetroffen);

  /* Die Gegenrichtung: deutsch erzeugt, dann englisch. */
  await kopfAufklappen();
  await karteLaden();
  check("deutsch erzeugt: „Punkt auf der Karte anklicken“",
    (await auswahlblock()).unter === "Punkt auf der Karte anklicken",
    (await auswahlblock()).unter);

  await page.evaluate(() => setLanguage("en"));
  check("deutsch erzeugt, dann englisch: „Click a point on the map“",
    (await auswahlblock()).unter === "Click a point on the map", (await auswahlblock()).unter);
  await page.evaluate(() => setLanguage("de"));

  /* ---------------------------------------------------------------- */
  console.log("Behälter werden nur benannt, wenn es mehrere gibt");

  check("ein einfaches Polygon heißt schlicht Polygon",
    punkt.unter.endsWith("· Polygon"), punkt.unter);

  await load([MIT_LOCH]);
  const ringe = page.locator('#vertexGroup circle[data-layer="exclusion"]');

  check("beide Ringe sind editierbar", (await ringe.count()) === 8,
    String(await ringe.count()));

  await markerKlicken(ringe.nth(0));
  await page.waitForTimeout(250);
  const ring1 = await auswahlKopf();

  await markerKlicken(ringe.nth(5));
  await page.waitForTimeout(250);
  const ring2 = await auswahlKopf();

  check("der äußere Ring wird benannt",
    ring1.unter.includes("Ring 1 von 2"), ring1.unter);
  check("das Loch wird als zweiter Ring benannt",
    ring2.unter.includes("Ring 2 von 2"), ring2.unter);
  check("zwei Punkte mit gleicher Nummer sind unterscheidbar",
    ring1.unter !== ring2.unter, `${ring1.unter} / ${ring2.unter}`);

  await load([ZWEI_LINIEN]);
  const linien = page.locator('#vertexGroup circle[data-layer="searchwire"]');
  await markerKlicken(linien.nth(4));
  await page.waitForTimeout(250);

  check("bei mehreren Linien wird die Linie benannt",
    (await auswahlKopf()).unter.includes("Linie 2 von 2"), (await auswahlKopf()).unter);

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
  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(250);

  check("ein Punkt: Punktzustand plus Auswahlaktionen",
    (await sichtbareBloecke()).join(",") === "inspectorPoint,inspectorSelection",
    (await sichtbareBloecke()).join(","));
  check("die Auswahlaktionen sind bedienbar",
    !(await page.locator("#deletePointBtn").isDisabled()) &&
    !(await page.locator("#clearMultiSelectionBtn").isDisabled()));

  /* --- zwei Punkte desselben Features ---------------------------- */
  await markerKlicken(marks.nth(1), { modifiers: ["Control"] });
  await page.waitForTimeout(250);

  const zwei = await auswahlKopf();

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
  await markerKlicken(marks.nth(2), { modifiers: ["Control"] });
  await markerKlicken(marks.nth(3), { modifiers: ["Control"] });
  await page.waitForTimeout(250);

  const ganz = await auswahlKopf();

  /*
   * Im Zustand "ganzes Feature" steht der Gruppenblock NICHT mehr daneben.
   * Er sagte dort Wort fuer Wort, was der Kopfblock ohnehin sagt, und sein
   * Ziehhinweis stand als zweiter neben dem des Feature-Blocks: "Exclusion
   * #0" dreimal, "4 Punkte" dreimal. Das ist Etappe 9a.
   */
  check("alle Punkte: der Feature-Block steht da, der Gruppenblock nicht",
    (await sichtbareBloecke()).join(",") ===
      "inspectorFeature,inspectorSelection",
    (await sichtbareBloecke()).join(","));
  check("der Kopf sagt, dass es vollständig ist",
    ganz.unter === "Perimeter · vollständig", ganz.unter);

  /*
   * Und die WIRKUNG der Entdoppelung: von den beiden Hinweissaetzen zum
   * Verschieben steht nur noch einer da. Beide erklaerten dasselbe, kosteten
   * je 35 px und standen im Zustand "ganzes Feature" untereinander.
   */
  const hinweise = await page.evaluate(() => {
    const sichtbar = [...document.querySelectorAll(".inspector-block")]
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => el.textContent)
      .join(" ");

    return {
      gruppe: sichtbar.includes("verschiebt die ganze Gruppe"),
      feature: sichtbar.includes("Verschieben durch Ziehen an der Geometrie"),
    };
  });

  check("nur noch ein Hinweis zum Verschieben, und zwar der des Features",
    hinweise.feature === true && hinweise.gruppe === false,
    JSON.stringify(hinweise));
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
  await markerKlicken(ringe.nth(0));
  for (let i = 1; i < 8; i += 1) {
    await markerKlicken(ringe.nth(i), { modifiers: ["Control"] });
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
  await markerKlicken(marks.nth(0));
  for (let i = 1; i < 4; i += 1) {
    await markerKlicken(marks.nth(i), { modifiers: ["Control"] });
  }
  await page.waitForTimeout(250);

  /* --- gemischte Auswahl ------------------------------------------ */
  await markerKlicken(ringe.nth(0), { modifiers: ["Control"] });
  await page.waitForTimeout(250);

  check("Punkte aus zwei Features: gemischter Zustand",
    (await sichtbareBloecke()).join(",") === "inspectorMixed,inspectorSelection",
    (await sichtbareBloecke()).join(","));
  check("die Zusammenfassung zählt Punkte und Features",
    (await text("mixedSummary")) === "5 Punkte aus 2 Features.",
    await text("mixedSummary"));
  check("der Kopf nennt die Zahl der Features",
    (await auswahlKopf()).unter === "aus 2 Features", (await auswahlKopf()).unter);

  /* --- Umformen ist immer da, mit Grund ---------------------------- */

  /*
   * Seit dem 06.10.2026 stehen die Umformwerkzeuge als eigene Eintraege in der
   * Werkzeugleiste, und der Grund steht im Block des gewaehlten Werkzeugs.
   * Bis dahin stand hier „der Umformblock steht auch bei gemischter Auswahl“
   * - der Faltblock ist entfallen. Was die Regel meinte, gilt weiter: man
   * erfaehrt, was man fuer ein Werkzeug tun muesste, auch wenn es gerade
   * nicht geht. Gelesen wird je Werkzeug der GEZEICHNETE Grund.
   */
  const UMFORM_GRUENDE = [
    ["straighten", "straightenReason", "straightenSelectionBtn"],
    ["reduce", "reduceReason", "reduceApplyBtn"],
    ["rectify", "rectifyReason", "rectifyApplyBtn"],
  ];

  const gruende = async () => {
    const ergebnis = {};
    for (const [name, grund, knopf] of UMFORM_GRUENDE) {
      await umformwerkzeug(name);
      ergebnis[name] = await page.evaluate(([g, k]) => {
        const el = document.getElementById(g);
        return {
          text: el.checkVisibility() ? el.innerText.trim() : "",
          gesperrt: document.getElementById(k).disabled,
        };
      }, [grund, knopf]);
    }
    return ergebnis;
  };

  {
    const leiste = await page.evaluate(() =>
      [...document.querySelectorAll("#toolRail [data-transform-tool]")].map((b) => {
        const r = b.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { name: b.dataset.transformTool, getroffen: !!t && b.contains(t) };
      }));
    check("die Umformwerkzeuge stehen auch bei gemischter Auswahl in der Leiste",
      leiste.length > 0 && leiste.every((w) => w.getroffen), JSON.stringify(leiste));
  }

  const gemischt = await gruende();

  check("und jedes Werkzeug nennt gewaehlt seinen Grund",
    Object.values(gemischt).every((g) => g.text.length > 0), JSON.stringify(gemischt));
  check("die Werkzeuge sind dabei gesperrt",
    Object.values(gemischt).every((g) => g.gesperrt), JSON.stringify(gemischt));

  /*
   * Zwei Punkte EINES Features geben den Abschnitt frei. Vorher aufheben:
   * ein einfacher Klick auf einen bereits markierten Punkt hebt die Gruppe
   * bewusst NICHT auf - sie soll ziehbar bleiben.
   */
  await klickeLeistenknopf("clearMultiSelectionBtn", "Auswahl aufheben");
  await page.waitForTimeout(200);
  await markerKlicken(marks.nth(0));
  await markerKlicken(marks.nth(2), { modifiers: ["Control"] });
  await page.waitForTimeout(250);

  const frei = await gruende();

  check("bei einem gültigen Abschnitt ändert sich der Grund",
    frei.straighten.text !== gemischt.straighten.text,
    `${frei.straighten.text} / ${gemischt.straighten.text}`);
  check("und der Knopf wird frei", !frei.straighten.gesperrt, frei.straighten.text);

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
   * Hier stand bis zum 06.10.2026 „mit geladener Karte fordert die Pruefung
   * nicht mehr zum Laden auf“ - der Prueftext vom Seitenaufbau („Zuerst eine
   * Karte laden.“) blieb stehen, bis jemand pruefte. Seitdem steht der Block
   * vor der ersten Pruefung gar nicht da, und den Platzhalter gibt es nicht
   * mehr; was davon uebrig ist, misst der Abschnitt „Die Kartenpruefung
   * erscheint erst nach einer Pruefung“. Hier die Vorbedingung des Folgenden.
   */
  check("mit geladener Karte steht vor der Prüfung kein Prüfblock da",
    !(await visible("inspectorValidation")));

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(400);

  /*
   * Der Handgriff, der hier stand - ein Klick auf das summary -, ist entfallen
   * und durfte nicht bleiben: "Karte pruefen" klappt den Block seit dem
   * einundzwanzigsten Durchgang selbst auf, ein zweiter Klick schloesse ihn
   * also wieder. Gemessen: die Befunde waren danach nicht mehr anklickbar.
   * Zugesichert wird stattdessen, dass die Liste ohne Handgriff dasteht - das
   * ist schaerfer als vorher, nicht schwaecher.
   */
  check("die Liste steht ohne weiteren Handgriff offen",
    await page.evaluate(() =>
      document.getElementById("inspectorValidation").open));

  const befunde = await page.locator("#validationReport .validation-item").count();

  check("der Bericht steht im Inspektor", befunde > 0, String(befunde));

  const anspringbar =
    await page.locator("#validationReport button[data-validation-target]").count();

  check("mindestens ein Befund ist anspringbar", anspringbar > 0,
    String(anspringbar));

  /*
   * Die Zusicherung oben traegt die Behauptung "die Pruefung klappt selbst
   * auf"; dieser Griff ist nur Werkzeug. Ohne ihn wuerde eine Mutation am
   * Aufklappen zwar die Zusicherung reissen, unmittelbar danach aber in einen
   * dreissig Sekunden langen Timeout laufen und den ganzen Rest der Datei
   * ungemessen lassen - gemessen: eine benannte Zusicherung statt sechzehn.
   * Dieselbe Regel wie bei klickeFreienKnopf(): die Zusicherung allein
   * genuegt nicht, der Klick darf nicht ins Leere gehen. openAllFolds() ist
   * der vorhandene Helfer dafuer und bei offenem Block wirkungslos.
   */
  await openAllFolds(page);

  /*
   * Seit der Block erst nach einer Pruefung erscheint, kann er auch dann
   * fehlen, wenn die Pruefung gelaufen ist - gemessen an der Mutation, die
   * sein `hidden` nie zuruecknimmt: der Klick auf den Befund wartete dreissig
   * Sekunden auf einen Knopf, der nicht gezeichnet wird. Deshalb erst die
   * Trefferpruefung, und nur dann der Klick.
   */
  const berichtDa = await elementGetroffen(page, "#inspectorValidation > summary", { dy: 5 });

  check("nach „Karte prüfen“ steht der Prüfblock da", berichtDa.ok, berichtDa.grund);

  if (berichtDa.ok) {
    await page.locator("#validationReport button[data-validation-target]")
      .first().click();
    await page.waitForTimeout(300);

    check("der Klick wählt das genannte Feature vollständig aus",
      (await sichtbareBloecke()).includes("inspectorFeature"),
      (await sichtbareBloecke()).join(","));
  }

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

  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(300);

  {
    const lage = await leiste();
    check("ein Punkt: die Leiste liegt ueber der Karte",
      lage.sichtbar && lage.imViewer && lage.ueberDerKarte,
      JSON.stringify(lage));
    check("ein Punkt: sie traegt die vier Punktknoepfe und die zwei Auswahlaktionen",
      lage.knoepfe.join(",") === "insertPointBeforeBtn,insertPointAfterBtn," +
        "setStartPointBtn,setEndPointBtn," +
        "deletePointBtn,clearMultiSelectionBtn",
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
    await markerKlicken(freierMarker, { modifiers: ["Control"] });
    await page.waitForTimeout(300);

    const lage = await leiste();
    check("mehrere Punkte: nur noch die beiden Auswahlaktionen",
      lage.sichtbar && lage.ueberDerKarte &&
      lage.knoepfe.join(",") === "deletePointBtn,clearMultiSelectionBtn",
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
    "clearMultiSelectionBtn",
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
    await markerKlicken(marks.nth(0));
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
    await markerKlicken(marks.nth(1));
    await page.waitForTimeout(300);

    check(`${breite} px: ein anderer Punkt laesst sie zugeklappt`,
      (await getroffeneKnoepfe()).length === 0,
      (await getroffeneKnoepfe()).join(","));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await markerKlicken(marks.nth(1));
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
    await markerKlicken(marks.nth(0));
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
   * Beide wollten an denselben Platz: links oben ueber der Karte. Seit dem
   * elften Durchgang standen sie deshalb untereinander in EINEM Stapel; seit
   * dem Umzug des Hinweises steht er unten rechts bei den Angaben zur
   * Auswahl, im rechten Stapel. Die Zusicherung bleibt: die beiden duerfen
   * einander auch dort nicht ueberdecken.
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
    check("ohne Auswahl steht der Hinweis da und wird getroffen",
      !lage.bar.sichtbar && lage.hinweisGetroffen === true,
      JSON.stringify(lage));
  }

  const untenVorher = (await obenLinks()).hinweis.u;

  await page.locator("circle.vertex").first().click();
  await page.waitForTimeout(350);

  {
    const lage = await obenLinks();
    check("mit Auswahl stehen beide da",
      lage.bar.sichtbar && lage.hinweis.sichtbar, JSON.stringify(lage));
    check("und ihre Rechtecke schneiden einander nicht",
      !lage.ueberdeckt, JSON.stringify(lage));
    /*
     * Gerueckt ist er nach OBEN: mit der Auswahl erscheinen unter ihm die
     * Angaben, und er steht mit ihnen in einer Spalte. Bis zum Umzug stand
     * hier "tiefer gerueckt" - damals schob ihn die Leiste nach unten.
     */
    check("der Hinweis ist dabei den Angaben ausgewichen, nicht verschwunden",
      lage.hinweis.u < untenVorher, `${lage.hinweis.u} gegen vorher ${untenVorher}`);
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
  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(300);

  check("der Startpunkt wird benannt",
    (await visible("pointMeta")) && (await text("pointMeta")) === "Startpunkt",
    await text("pointMeta"));

  await markerKlicken(marks.nth(3));
  await page.waitForTimeout(300);

  check("der Endpunkt ebenfalls",
    (await visible("pointMeta")) && (await text("pointMeta")) === "Endpunkt",
    await text("pointMeta"));

  await markerKlicken(marks.nth(1));
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
    await markerKlicken(marks.nth(nr));
    await page.waitForTimeout(300);
    await markerKlicken(marks.nth(1));
    await page.waitForTimeout(300);

    check(`${rolle}: der Punkt ohne Rolle dazwischen zeigt keine Zeile`,
      !(await visible("pointMeta")), await text("pointMeta"));

    await markerKlicken(marks.nth(nr));
    await page.waitForTimeout(300);

    check(`${rolle}: danach steht dieselbe Rolle wieder da`,
      (await visible("pointMeta")) && (await text("pointMeta")) === rolle,
      `"${await text("pointMeta")}"`);
  }

  /* Zurueck auf den Zwischenpunkt - die naechste Zusicherung misst dort. */
  await markerKlicken(marks.nth(1));
  await page.waitForTimeout(300);

  /*
   * Und die Gegenprobe, dass nichts verlorengegangen ist: Punktnummer und
   * Feature stehen weiterhin da - im Kopfblock.
   */
  const nachKuerzung = await auswahlKopf();

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
   * <span>-Marken; das Trennzeichen setzt CSS und steht damit NICHT in
   * textContent. Gelesen werden deshalb die Marken selbst - und daneben, dass
   * das Trennzeichen wirklich gezeichnet wird. Es haengt seit dem Umbruch der
   * Kurzformen HINTER der ersten Marke (::after) statt vor der zweiten, damit
   * keine umgebrochene Zeile mit „·“ beginnt.
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
        document.getElementById("stockSummary").querySelectorAll("span")[0],
        "::after"
      ).content)).includes("·"),
    await page.evaluate(() =>
      getComputedStyle(
        document.getElementById("stockSummary").querySelectorAll("span")[0],
        "::after"
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
  await markerKlicken(marks.nth(0));
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
  const aufheben = await kasten("clearMultiSelectionBtn");

  check("davor und danach stehen nebeneinander",
    davor.oben === danach.oben && danach.links > davor.links,
    `${JSON.stringify(davor)} / ${JSON.stringify(danach)}`);
  check("Start und Ende ebenfalls",
    start.oben === ende.oben && ende.links > start.links,
    `${JSON.stringify(start)} / ${JSON.stringify(ende)}`);
  check("und die Paare untereinander", start.oben > davor.oben,
    `${start.oben} / ${davor.oben}`);

  /*
   * „Punkt löschen" ist der dritte Paarpartner: er steht seit diesem Durchgang
   * nicht mehr allein über die volle Breite im Punktblock, sondern neben
   * „Auswahl aufheben" im Auswahlblock. Der Grund ist nicht die Anordnung,
   * sondern die Zuständigkeit - er löscht die ganze Auswahl und gilt damit in
   * allen vier Auswahlzuständen, der Punktblock nur bei genau einem Punkt.
   */
  check("Löschen und Aufheben stehen nebeneinander, unter den Punktpaaren",
    loeschen.oben === aufheben.oben &&
    aufheben.links > loeschen.links &&
    loeschen.oben > start.oben,
    `${JSON.stringify(loeschen)} / ${JSON.stringify(aufheben)} / ${JSON.stringify(start)}`);
  check("und Löschen ist halb so breit wie der Block, nicht volle Breite",
    Math.abs(loeschen.breit - davor.breit) <= 1,
    `${loeschen.breit} gegen ${davor.breit}`);

  /*
   * Die Tab-Reihenfolge muss den Paaren folgen. Bei einem zweispaltigen
   * Raster ist das die DOM-Reihenfolge - aber genau das kann eine spätere
   * Umsortierung im Markup oder ein `order`/`grid-area` in CSS zerreißen,
   * ohne dass man es sieht.
   */
  await page.locator("#insertPointBeforeBtn").focus();
  const reihenfolge = ["insertPointBeforeBtn"];
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Tab");
    reihenfolge.push(await page.evaluate(() => document.activeElement?.id));
  }

  check("Tab folgt den Paaren: davor, danach, Start, Ende, löschen, aufheben",
    reihenfolge.join(",") ===
      "insertPointBeforeBtn,insertPointAfterBtn,setStartPointBtn,setEndPointBtn," +
      "deletePointBtn,clearMultiSelectionBtn",
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
    "setStartPointBtn", "setEndPointBtn", "deletePointBtn",
    "clearMultiSelectionBtn"];

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
  await markerKlicken(marks.nth(0));
  await markerKlicken(marks.nth(1), { modifiers: ["Control"] });
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

  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(250);

  check("mit einem Punkt steht wieder ein Wert statt einer Erklärung",
    (await page.locator("#pointEastInput").getAttribute("placeholder")) === "" &&
    (await page.locator("#pointEastInput").inputValue()).length > 0,
    await page.locator("#pointEastInput").inputValue());

  /* ---------------------------------------------------------------- */
  console.log("Bestand, Auswahlblock und Kartenprüfung sind eingeklappt, nicht weg");

  /*
   * Bis zum 06.10.2026 belegte dieser Abschnitt die Faltmechanik am Block
   * „Umformen“. Der ist entfallen - seine Werkzeuge stehen in der Leiste -,
   * und dieselben Eigenschaften werden jetzt an den Faltbloecken gemessen,
   * die es gibt: am Bestand (Gedaechtnis ueber INSPECTOR_FOLDS), am
   * Auswahlblock im Kopf (er aendert seinen Text bei jedem Zustand und darf
   * dabei nicht aufspringen) und an der Kartenpruefung (sie klappt auf
   * Verlangen auf, ohne es zu merken).
   */
  await load([MIT_LOCH]);

  const offen = (id) => page.evaluate((x) => document.getElementById(x).open, id);

  /* Sichtbar im Sinne von "der Block steht da" - auch zugeklappt. */
  check("der Bestandsblock steht", await visible("inspectorStock"));
  check("der Auswahlblock im Kopf steht", await visible("inspectorHeadText"));
  /*
   * Seit dem 06.10.2026 steht der Pruefblock erst nach einer Pruefung da -
   * siehe den Abschnitt „Die Kartenpruefung erscheint erst nach einer
   * Pruefung“. Zu ist er trotzdem, und zwar auch beim ersten Erscheinen,
   * solange niemand ihn ueber „Karte pruefen“ verlangt.
   */
  check("der Prüfblock steht vor der ersten Prüfung nicht da",
    !(await visible("inspectorValidation")));
  check("alle drei sind beim ersten Start zu",
    !(await offen("inspectorStock")) && !(await offen("inspectorHeadText")) &&
    !(await offen("inspectorValidation")));

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
  const kopfzeilenhoehe = (id) => page.evaluate((x) =>
    Math.round(document.querySelector(`#${x} > summary`).getBoundingClientRect().height), id);

  const zu = await blockhoehe("inspectorStock");

  check("zugeklappt kostet der Bestandsblock nur seine Kopfzeile",
    zu === await kopfzeilenhoehe("inspectorStock"),
    `${zu} gegen ${await kopfzeilenhoehe("inspectorStock")}`);

  /*
   * DAS ist der Punkt: ein Faltblock klappt NICHT von selbst auf, wenn sich
   * sein Inhalt aendert. Der Auswahlblock bekommt beim Zeichnen einen neuen
   * Titel - und bleibt zu. Selbsttaetiges Aufklappen waere genau die Unruhe,
   * gegen die der feste Kopfblock gebaut wurde. (Bis zum 06.10.2026 stand
   * hier derselbe Satz fuer „Umformen“, dessen Kurzform zwei ausfuehrbare
   * Werkzeuge nannte.)
   */
  const titelVorher = await page.evaluate(() =>
    document.getElementById("inspectorTitle").textContent.trim());
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);
  const titelBeimZeichnen = await page.evaluate(() =>
    document.getElementById("inspectorTitle").textContent.trim());

  check("Vorbedingung: der Titel des Auswahlblocks hat sich geaendert",
    titelBeimZeichnen !== titelVorher, `${titelVorher} -> ${titelBeimZeichnen}`);
  check("und der Block bleibt trotzdem zu",
    !(await offen("inspectorHeadText")));

  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(500);

  const kurz = () =>
    page.evaluate(() =>
      document.getElementById("validationFoldShort").textContent.trim());

  check("die Prüfung schreibt ihre Kurzform in die Kopfzeile",
    /Fehler|Warnung|keine Befunde/.test(await kurz()), await kurz());

  /*
   * UMGEKEHRT gegenueber dem Stand bis hierher, und zwar weil die Zusicherung
   * falsch war: sie las "klappt nie von selbst auf" als "klappt auch auf
   * Verlangen nicht auf". Die Regel richtet sich gegen ein Aufklappen aus
   * einer ABGELEITETEN Aenderung heraus - der Auswahlblock darueber belegt sie
   * unveraendert. Ein Klick auf "Karte pruefen" ist dagegen die
   * ausdrueckliche Bitte um die Ausgabe; sie in der Kurzform zu beantworten
   * hiesse, die Handlung ins Leere laufen zu lassen.
   */
  check("und klappt den Pruefblock auf, weil die Ausgabe verlangt wurde",
    await offen("inspectorValidation"));

  /* Aufklappen geht - und der Wunsch überlebt den Neuaufbau. */
  await page.locator("#inspectorStock > summary").click();
  await page.waitForTimeout(250);

  check("aufklappen zeigt den Bestand",
    (await offen("inspectorStock")) &&
    (await blockhoehe("inspectorStock")) > zu &&
    await page.evaluate(() => document.getElementById("searchWireStock").checkVisibility()),
    `${await blockhoehe("inspectorStock")} gegen ${zu}`);

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(400);

  check("nach dem Neuladen ist er noch offen",
    await offen("inspectorStock"), "Zustand ging verloren");

  /*
   * Unveraendert - und sie sagt jetzt mehr als vorher: der Pruefblock STAND
   * in diesem Abschnitt offen, aufgeklappt von "Karte pruefen". Dass er nach
   * dem Neuladen wieder zu ist, belegt, dass ein Aufklappen aus einer
   * Handlung NICHT gemerkt wird. Gemerkt wird allein, was der Nutzer am Griff
   * gewaehlt hat - sonst stuende der Block kuenftig in jeder Sitzung offen,
   * sobald er wieder erscheint.
   */
  check("und der Prüfblock weiterhin zu",
    !(await offen("inspectorValidation")));

  /* ---------------------------------------------------------------- */
  console.log("Die Kartenpruefung erscheint erst nach einer Pruefung");

  /*
   * Entschieden vom Projektinhaber am 06.10.2026: der Block KARTENPRUEFUNG
   * erscheint nur, wenn die Karte tatsaechlich geprueft wurde - vorher gar
   * nicht -, und „nicht geprueft“ steht allein in der Statuszeile. Gemessen
   * wird, ob der Griff des Blocks GETROFFEN wird; openAllFolds() vorher
   * belegt, dass ein Oeffnen ihn nicht hervorholt.
   */
  await load([MIT_LOCH]);
  await openAllFolds(page);

  const pruefblock = () => elementGetroffen(page, "#inspectorValidation > summary", { dy: 5 });
  const pruefstatus = async () => (await page.locator("#validationShort").innerText()).trim();

  {
    const b = await pruefblock();
    check("mit Karte, vor der Pruefung: der Block steht nicht da, auch mit allen Faltbloecken offen",
      !b.ok && !(await visible("inspectorValidation")), b.grund);
    check("die Statuszeile sagt „nicht geprüft“",
      (await pruefstatus()) === "nicht geprüft", await pruefstatus());
  }

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(400);

  {
    const b = await pruefblock();
    check("nach „Karte prüfen“ steht er da und wird getroffen", b.ok, b.grund);
    check("und die Statuszeile nennt das Ergebnis",
      (await pruefstatus()) !== "nicht geprüft", await pruefstatus());
  }

  /*
   * Eine Aenderung an der Karte verwirft das Ergebnis - und mit ihm den
   * Block. Die Pfeiltaste schiebt den gewaehlten Punkt um eine Rasterweite.
   */
  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);

  {
    const b = await pruefblock();
    check("nach einer Aenderung ist der Block wieder weg", !b.ok, b.grund);
    check("und die Statuszeile sagt wieder „nicht geprüft“",
      (await pruefstatus()) === "nicht geprüft", await pruefstatus());
  }

  /*
   * Auch das Speichern prueft die Karte - still, ohne Meldung, aber mit
   * Ergebnis: es steht danach in der Statuszeile, und mit ihm der Block. Das
   * ist „tatsaechlich geprueft“, und die Statuszeile und der Block sagen
   * dasselbe.
   */
  {
    page.once("dialog", (d) => d.accept());
    const wartend = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await menueBefehl("Datei", "GeoJSON speichern");
    await wartend;
    await page.waitForTimeout(300);

    const b = await pruefblock();
    /* Der Block steht nach dem Speichern an seinem Platz, nicht oben -
       er muss dafuer in den Blick gerollt werden. */
    /* Ueber das DOM gerollt, nicht ueber Playwright: dessen scrollIntoView
       wartet auf Sichtbarkeit, und genau die ist hier die Frage. */
    await page.evaluate(() =>
      document.getElementById("inspectorValidation").scrollIntoView({ block: "nearest" }));
    const c = await pruefblock();
    check("nach dem Speichern steht der Block da", c.ok, `${b.grund} / ${c.grund}`);
    check("und die Statuszeile nennt das Ergebnis des Speicherns",
      (await pruefstatus()) !== "nicht geprüft", await pruefstatus());
  }

  /* Beide Sprachrichtungen, gemessen an der Statuszeile nach einer Aenderung. */
  await markerKlicken(marks.nth(0));
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(350);
  await page.evaluate(() => setLanguage("en"));
  check("deutsch erzeugt, dann englisch: „not validated“, der Block bleibt weg",
    (await pruefstatus()) === "not validated" && !(await pruefblock()).ok, await pruefstatus());

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  await page.evaluate(() => setLanguage("de"));
  check("englisch erzeugt, dann deutsch: „nicht geprüft“, der Block bleibt weg",
    (await pruefstatus()) === "nicht geprüft" && !(await pruefblock()).ok, await pruefstatus());

  /* ---------------------------------------------------------------- */
  console.log("Eine Handlung, die den Inspektor uebernimmt, beendet den Modus");

  /*
   * Der Inspektor hat genau EINEN Platz, und getInspectorState() laesst ein
   * laufendes Werkzeug jede Auswahl schlagen. Eine Handlung, die diesen Platz
   * beansprucht, muss den Modus deshalb beenden - sonst laeuft er unsichtbar
   * weiter und verdeckt genau das, worum der Nutzer gerade gebeten hat.
   *
   * Gemessen am Ist-Zustand davor, und zwar in allen fuenf Faellen dieses
   * Abschnitts: der Knopf hiess nach "Karte pruefen" weiter "Messung laeuft…",
   * der Block MESSEN stand da, der Pruefblock blieb zu - und der Bericht war
   * nicht getroffen (elementFromPoint lieferte "inspector").
   *
   * Zugesichert wird ueber sichtbaren Text und elementGetroffen(), nicht ueber
   * measurementState oder featureDrawState: die sagen, was gemeint war.
   */

  await load([MIT_LOCH]);

  const messKnopf = () => page.evaluate(() => {
    const btn = document.getElementById("measureBtn");
    return {
      text: btn.querySelector(".tool-label").textContent.trim(),
      aktiv: btn.classList.contains("active"),
    };
  });

  const messenStarten = async () => {
    await page.locator("#measureBtn").click();
    await page.waitForTimeout(250);
  };

  await messenStarten();

  const messVorher = await messKnopf();
  check("Vorbedingung: der Messmodus laeuft wirklich",
    messVorher.text === "Messung läuft…" && messVorher.aktiv &&
    (await visible("inspectorMeasure")),
    `${messVorher.text} | aktiv ${messVorher.aktiv}`);

  /* Der Pruefblock ist an dieser Stelle zu - load() raeumt den Speicher. */
  check("Vorbedingung: der Pruefblock ist zu",
    !(await offen("inspectorValidation")));

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(500);

  const messNachher = await messKnopf();
  check("nach \"Karte pruefen\" traegt der Knopf die Ruhebeschriftung",
    messNachher.text === "Messen", messNachher.text);
  check("und er ist nicht mehr aktiv markiert",
    !messNachher.aktiv);

  check("der Inspektorkopf nennt keine Messung",
    !(await head()).titel.includes("Messung") &&
    !(await head()).unter.includes("Punkten"),
    `${(await head()).titel} | ${(await head()).unter}`);
  check("und der Block MESSEN ist weg",
    !(await visible("inspectorMeasure")));

  check("der Pruefblock ist aufgeklappt",
    await offen("inspectorValidation"));

  /*
   * Aufgeklappt zu SEIN und gezeichnet zu WERDEN sind zwei verschiedene
   * Dinge - ein geschlossenes <details> liefert weiterhin textContent und
   * sogar ein Rechteck. Gefragt ist, was der Browser an der Stelle zeichnet.
   */
  await page.evaluate(() =>
    document.getElementById("validationReport").scrollIntoViewIfNeeded());
  const bericht = await elementGetroffen(page, "#validationReport", { dy: 5 });
  check("und ein Stueck seiner Ausgabe ist wirklich getroffen",
    bericht.ok, bericht.grund);

  const berichtText = await text("validationReport");
  check("die Ausgabe ist der Bericht, nicht nur die Kurzform",
    berichtText.length > 40, `${berichtText.length} Zeichen`);

  /* ---- derselbe Mangel, anderer Modus: das Zeichnen ---- */

  await load([MIT_LOCH]);
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);

  check("Vorbedingung: das Zeichnen laeuft wirklich",
    (await visible("inspectorDraw")) &&
    (await page.evaluate(() =>
      document.getElementById("drawExclusionBtn").classList.contains("active"))));

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(500);

  check("\"Karte pruefen\" beendet auch das Zeichnen",
    !(await visible("inspectorDraw")) &&
    !(await page.evaluate(() =>
      document.getElementById("drawExclusionBtn").classList.contains("active"))));
  check("und klappt den Pruefblock auch dort auf",
    await offen("inspectorValidation"));

  /* ---- dieselbe Klasse: eine Handlung, die eine AUSWAHL herstellt ---- */

  await load([MIT_LOCH]);
  await openAllFolds(page);
  await messenStarten();
  await openAllFolds(page);

  const navKnopf = page.locator(
    '[data-action="select-whole-feature"][data-feature-index="1"]');
  check("Vorbedingung: die Feature-Navigation bietet das Feature an",
    (await navKnopf.count()) > 0);

  await navKnopf.first().click();
  await page.waitForTimeout(400);

  check("die Feature-Navigation beendet den Messmodus",
    (await messKnopf()).text === "Messen" && !(await visible("inspectorMeasure")));
  /*
   * Die Zahl kommt aus der Vorlage dieses Tests, nicht aus einer Messung:
   * MIT_LOCH hat zwei Ringe zu je vier eindeutigen Punkten.
   */
  const lochPunkte = MIT_LOCH.geometry.coordinates
    .reduce((summe, ring) => summe + ring.length - 1, 0);

  check("und die Auswahl, die sie erzeugt hat, steht wirklich da",
    (await auswahlKopf()).titel === `${lochPunkte} Punkte ausgewählt`,
    (await auswahlKopf()).titel);

  /* ---- und der Sprung aus einem Pruefbefund ---- */

  await load([MIT_LOCH]);
  await openAllFolds(page);
  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(400);
  await messenStarten();

  const befund = page.locator("#validationReport button.validation-item");
  /*
   * Gezaehlt UND gezeichnet: count() traegt durch einen ausgeblendeten Block
   * hindurch, und ein Klick auf einen Befund, der nicht dasteht, wartete
   * dreissig Sekunden - gemessen an der Mutation, die den Pruefblock nie
   * erscheinen laesst.
   */
  const befundDa = (await befund.count()) > 0 && (await befund.first().isVisible());
  check("Vorbedingung: es gibt einen anspringbaren Befund, und er steht da",
    befundDa, String(await befund.count()));

  if (befundDa) {
    await befund.first().click();
    await page.waitForTimeout(400);

    check("auch der Sprung aus einem Befund beendet den Messmodus",
      (await messKnopf()).text === "Messen" && !(await visible("inspectorMeasure")));
    check("und das angesprungene Feature ist sichtbar ausgewaehlt",
      /ausgewählt/.test((await auswahlKopf()).titel), (await auswahlKopf()).titel);
  }

  /* ---- beide Sprachrichtungen ---- */

  /*
   * Regel (e): in der einen Sprache erzeugen, umschalten, dann messen - und
   * umgekehrt. Der Wechsel laeuft ueber setLanguage(), damit zwischen Wechsel
   * und Messung keine Handlung liegt, die den Knopf ohnehin neu schriebe.
   */
  const spracheSetzen = (wert) => page.evaluate((w) => setLanguage(w), wert);

  await load([MIT_LOCH]);
  await messenStarten();
  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(450);

  check("auf deutsch erzeugt: der Knopf steht auf der Ruhebeschriftung",
    (await messKnopf()).text === "Messen", (await messKnopf()).text);

  await spracheSetzen("en");
  await page.waitForTimeout(300);

  check("auf deutsch erzeugt, dann englisch: er ist uebersetzt",
    (await messKnopf()).text === "Measure", (await messKnopf()).text);
  check("auf deutsch erzeugt, dann englisch: der Kopf nennt keine Messung",
    (await head()).titel === "Nothing selected", (await head()).titel);
  check("auf deutsch erzeugt, dann englisch: der Pruefblock bleibt offen",
    await offen("inspectorValidation"));

  await load([MIT_LOCH]);
  await spracheSetzen("en");
  await page.waitForTimeout(300);
  await messenStarten();

  check("Vorbedingung englisch: der Messmodus laeuft",
    (await messKnopf()).aktiv && (await visible("inspectorMeasure")),
    (await messKnopf()).text);

  await menueBefehl("Map", "Validate map");
  await page.waitForTimeout(450);

  check("auf englisch erzeugt: der Knopf steht englisch auf Ruhe",
    (await messKnopf()).text === "Measure", (await messKnopf()).text);
  check("auf englisch erzeugt: der Block MESSEN ist weg",
    !(await visible("inspectorMeasure")));

  await spracheSetzen("de");
  await page.waitForTimeout(300);

  check("auf englisch erzeugt, dann deutsch: er ist deutsch",
    (await messKnopf()).text === "Messen", (await messKnopf()).text);
  check("auf englisch erzeugt, dann deutsch: der Kopf nennt keine Messung",
    (await head()).titel === "Nichts ausgewählt", (await head()).titel);

  await spracheSetzen("de");

  /* ---------------------------------------------------------------- */
  console.log("Ein startendes Werkzeug nimmt auch der Feature-Navigation die Auswahl");

  /*
   * Messen und Zeichnen heben beim Start die Auswahl auf: der Zaehler sagt
   * danach 0, die Angaben ueber der Karte sind weg. Die Feature-Navigation
   * sagte trotzdem weiter „Feature vollständig ausgewählt“, bis die naechste
   * Auswahlaenderung oder ein Sprachwechsel sie neu baute - gemessen beim
   * Messen, beim Zeichnen einer Exclusion und eines Kreises.
   *
   * Gelesen wird, was die Navigation sichtbar sagt, und zwar unmittelbar nach
   * dem Start, ohne Faltgeste dazwischen. Die Zusicherung ueber das Ausbleiben
   * steht nicht allein: aufgeklappt bietet der Knopf das Feature wieder an,
   * und der Knopf wird dabei getroffen - das gibt es nur, wenn die Navigation
   * neu gebaut wurde.
   *
   * Beide Sprachrichtungen, ueber setLanguage(): einmal deutsch erzeugt und
   * englisch gelesen, einmal englisch erzeugt und deutsch gelesen.
   */
  const navSichtbar = () => page.evaluate(() =>
    document.getElementById("featureNavigator").innerText);
  const navKnopfText = async () => {
    const knopf = page.locator(
      '[data-action="select-whole-feature"][data-feature-index="1"]');
    await knopf.scrollIntoViewIfNeeded();
    const getroffen = await elementGetroffen(page,
      '[data-action="select-whole-feature"][data-feature-index="1"]', { dy: 6 });
    return getroffen.ok ? (await knopf.innerText()).trim() : `(nicht getroffen: ${getroffen.grund})`;
  };
  const TEXTE = {
    de: { voll: "Feature vollständig ausgewählt", anbieten: "Ganzes Feature auswählen" },
    en: { voll: "Feature fully selected", anbieten: "Select whole feature" },
  };

  for (const [werkzeug, knopfId] of [["Messen", "measureBtn"], ["Zeichnen", "drawExclusionBtn"]]) {
    for (const [erzeugt, gelesen] of [["de", "en"], ["en", "de"]]) {
      const wo = `${werkzeug}, ${erzeugt} erzeugt`;

      await load([MIT_LOCH]);
      await page.evaluate((s) => setLanguage(s), erzeugt);
      await page.waitForTimeout(250);
      await openAllFolds(page);

      await page.locator(
        '[data-action="select-whole-feature"][data-feature-index="1"]').click();
      await page.waitForTimeout(300);

      check(`${wo}: Vorbedingung: die Navigation nennt das Feature vollstaendig ausgewaehlt`,
        (await navKnopfText()) === TEXTE[erzeugt].voll, await navKnopfText());

      await page.locator(`#${knopfId}`).click();
      await page.waitForTimeout(300);

      check(`${wo}: Vorbedingung: das Werkzeug laeuft`,
        await page.evaluate((id) =>
          document.getElementById(id).classList.contains("active"), knopfId));

      check(`${wo}: nach dem Start nennt die Navigation kein vollstaendig ausgewaehltes Feature mehr`,
        !(await navSichtbar()).includes(TEXTE[erzeugt].voll), await navSichtbar());

      await openAllFolds(page);

      check(`${wo}: aufgeklappt bietet der Knopf das Feature wieder an`,
        (await navKnopfText()) === TEXTE[erzeugt].anbieten, await navKnopfText());

      await page.evaluate((s) => setLanguage(s), gelesen);
      await page.waitForTimeout(250);
      await openAllFolds(page);

      check(`${wo}, dann ${gelesen}: der Knopf bietet es in dieser Sprache an`,
        (await navKnopfText()) === TEXTE[gelesen].anbieten, await navKnopfText());
      check(`${wo}, dann ${gelesen}: und nennt nichts vollstaendig ausgewaehlt`,
        !(await navSichtbar()).includes(TEXTE[gelesen].voll), await navSichtbar());
    }
  }

  await page.keyboard.press("Escape");
  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(250);

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

  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(300);

  check("Zustand ein Punkt passt ohne Scrollen", await passt(), await hoehen());

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(500);

  /*
   * Seit dem einundzwanzigsten Durchgang klappt "Karte pruefen" den
   * Pruefblock auf, und ein aufgeklappter Bericht kostet gemessen rund 96 px
   * - bei 900 px Fensterhoehe also mehr, als die Spalte hat.
   *
   * Das ist KEIN gebrochenes Hoehenziel, sondern sein ausdruecklich
   * zugelassener Fall: das Ziel gilt dem ausgelieferten Zustand mit
   * zugeklappten Faltbloecken, und "wer einen oeffnet, will seinen Inhalt
   * sehen und scrollt dafuer" steht so in CLAUDE.md. Die beiden Zusicherungen
   * darunter sind wortgleich geblieben und pruefen weiter dasselbe: dass das
   * blosse VORHANDENSEIN eines Pruefergebnisses keine Hoehe kostet. Dafuer
   * wird der Block wieder geschlossen - genau wie ein Nutzer es taete.
   */
  /*
   * Aufgeklappt UND gezeichnet: seit der Block erst nach einer Pruefung
   * erscheint, koennte er offen und trotzdem ausgeblendet sein - und der Klick
   * auf seinen Griff wartete dann dreissig Sekunden. Geklickt wird nur, wenn
   * die Vorbedingung haelt.
   */
  const standOffen = await page.evaluate(() => {
    const block = document.getElementById("inspectorValidation");
    return block.open && block.checkVisibility();
  });

  check("Vorbedingung: die Pruefung hat den Block aufgeklappt", standOffen);

  if (standOffen) {
    await page.locator("#inspectorValidation > summary").click();
    await page.waitForTimeout(300);
  }

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
    Object.values(gruendeGesperrt).every((g) => g.text.length > 0),
    JSON.stringify(gruendeGesperrt));

  /*
   * Die Leistenknoepfe der Umformwerkzeuge (seit dem 06.10.2026) erklaeren
   * sich mit DEMSELBEN Satz wie der Knopf im Inspektor - eine Quelle,
   * TRANSFORM_TOOL_HELP. Zwei Saetze fuer dasselbe Werkzeug liefen
   * auseinander, sobald jemand nur einen anfasst.
   */
  const LEISTE = ["straightenToolBtn", "reduceToolBtn", "rectifyToolBtn"];
  const leistenTipps = () => page.evaluate((ids) => ids.map((id) =>
    document.getElementById(id).title), LEISTE);

  check("die Leistenknoepfe erklaeren sich mit denselben Saetzen",
    (await leistenTipps()).join("|") === gesperrt.join("|"), (await leistenTipps()).join(" | "));

  /*
   * Der Tooltip ändert sich nicht, wenn das Werkzeug verfügbar wird.
   * Ausgewählt wird an der Exclusion, nicht am Perimeter: dessen obere Ecken
   * liegen unter der Zoom-Leiste der Karte, die den Klick abfängt.
   */
  await markerKlicken(ringe.nth(0));
  await markerKlicken(ringe.nth(2), { modifiers: ["Control"] });
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
  check("und in der Leiste derselbe englische Satz",
    (await leistenTipps()).join("|") === englisch.join("|"), (await leistenTipps()).join(" | "));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(500);

  check("und kommt deutsch zurück",
    (await tipps()).join("|") === gesperrt.join("|"), (await tipps()).join(" | "));
  check("auch in der Leiste",
    (await leistenTipps()).join("|") === gesperrt.join("|"), (await leistenTipps()).join(" | "));

  /* ---------------------------------------------------------------- */
  console.log("Inspektor einklappen");

  await page.setViewportSize({ width: 1600, height: 900 });
  await load();
  await markerKlicken(marks.nth(0));
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
   *
   * Gemessen wurde hier bis zum Umzug der Angaben am Punktblock. Der steht
   * seitdem ueber der Karte und gehoert nicht mehr zum Inspektor; an seiner
   * Stelle steht der erste Faltblock, der bei dieser Auswahl im Inspektor
   * dasteht. Dass die Angaben beim Einklappen NICHT mitgehen, sichert die
   * Zusicherung darunter zu.
   */
  check("der Inhalt ist nicht mehr sichtbar",
    !(await visible("featureNavigationSection")) && !(await visible("inspectorStock")));

  const angabenBleiben = await elementGetroffen(page, "#selectionTitle", { dy: 5 });

  check("die Angaben zur Auswahl ueber der Karte bleiben dabei stehen",
    angabenBleiben.ok, JSON.stringify(angabenBleiben));
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
  await markerKlicken(marks.nth(1));
  await page.waitForTimeout(300);

  /* Enter übernimmt - der Handler hängt an der id, nicht am Ort. */
  await feldFuellen("pointEastInput", "12,50");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);

  check("Enter in East übernimmt den Wert",
    (await page.locator("#editStatus").textContent()).length > 0 &&
    (await page.locator("#pointEastInput").inputValue()).includes("12,50"),
    `${await page.locator("#editStatus").textContent()} | ${await page.locator("#pointEastInput").inputValue()}`);

  await feldFuellen("pointNorthInput", "7,25");
  await page.locator("#pointNorthInput").press("Enter");
  await page.waitForTimeout(350);

  check("Enter in North übernimmt ebenfalls",
    (await page.locator("#pointNorthInput").inputValue()).includes("7,25"),
    await page.locator("#pointNorthInput").inputValue());

  /*
   * Und die BEIDEN Zweige der Bewegungsschwelle MOVE_EPSILON_WORLD. Sie
   * beantwortet an drei Stellen dieselbe Frage - Baseline-Vergleich,
   * E/N-Felder, Ziehen-Handler - und stand bis zum einundzwanzigsten
   * Durchgang dreimal als Zahl da. Zugesichert ist hier, was der Nutzer davon
   * sieht: dieselbe Eingabe noch einmal bestaetigt erzeugt KEINEN
   * Undo-Schritt und sagt es; eine wirkliche Aenderung erzeugt einen.
   */
  const undoTiefe = () => page.evaluate(() => undoStack.length);

  const vorUnveraendert = await undoTiefe();

  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);

  check("dieselbe Eingabe noch einmal bestaetigt gilt als unveraendert",
    (await page.locator("#editStatus").textContent())
      .includes("Die Koordinate wurde nicht verändert."),
    await page.locator("#editStatus").textContent());
  check("und sie erzeugt keinen Undo-Schritt",
    (await undoTiefe()) === vorUnveraendert,
    `${vorUnveraendert} -> ${await undoTiefe()}`);

  await feldFuellen("pointEastInput", "12,51");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);

  check("eine wirkliche Aenderung gilt als Bewegung",
    (await page.locator("#editStatus").textContent()).includes("Punkt auf E="),
    await page.locator("#editStatus").textContent());
  check("und sie erzeugt einen Undo-Schritt",
    (await undoTiefe()) === vorUnveraendert + 1,
    `${vorUnveraendert} -> ${await undoTiefe()}`);

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
   * Tabstopp.
   *
   * Seit dem Umzug der Angaben zur Auswahl ist es noch einer mehr: die
   * Felder stehen ueber der Karte, die Leiste unter der Schwelle im
   * Inspektor, und dazwischen liegt der Umschalter seines Kopfblocks - die
   * dokumentierte Reihenfolge Karte vor Inspektor. Zugesichert wird deshalb
   * die GANZE Kette bis zum ersten Knopf der Leiste, nicht nur ihr Ende: ein
   * weiterer Halt, der sich spaeter dazwischenschiebt, faellt so auf.
   */
  const ketteNachNorth = await (async () => {
    const kette = [];
    await page.locator("#pointNorthInput").focus();
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      kette.push(await page.evaluate(() =>
        document.activeElement?.id || document.activeElement?.tagName));
    }
    return kette.join(",");
  })();

  check("von North fuehrt Tab ueber die Notiz und den Umschalter zum ersten Knopf der Auswahlleiste",
    ketteNachNorth === "SUMMARY,inspectorToggle,insertPointBeforeBtn", ketteNachNorth);

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
    await feldFuellen("pointEastInput", eingabe);
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

    await feldFuellen("pointEastInput", `${angezeigt.slice(0, -1)}6`);
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
  await markerKlicken(marks.nth(1));
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
  await feldFuellen("pointEastInput", "12,5");
  await page.locator("#pointEastInput").press("Enter");
  await page.waitForTimeout(350);
  await klickeLeereKarte("Abwaehlen vor dem Sprachwechsel");
  await page.waitForTimeout(200);
  await markerKlicken(marks.nth(1));
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
  await feldFuellen("pointEastInput", "77,7");
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

  await markerKlicken(marks.nth(1));
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

  await markerKlicken(marks.nth(2));
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
  await markerKlicken(marks.nth(1));
  await page.waitForTimeout(250);
  await feldFuellen("pointEastInput", "12,50");
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
  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(250);

  /* ---------------------------------------------------------------- */
  console.log("Übersetzung");

  await markerKlicken(marks.nth(0));
  await page.waitForTimeout(250);
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  const english = await auswahlKopf();
  check("der Kopf ist übersetzt",
    /^Point \d+ of \d+$/.test(english.titel), english.titel);
  check("auch der Behälter",
    english.unter.includes("polygon"), english.unter);

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und kommt zurück",
    /^Punkt \d+ von \d+$/.test((await auswahlKopf()).titel), (await auswahlKopf()).titel);

  /*
   * Die neuen Zustaende bringen neue Muster mit. Geprueft wird an der Gruppe,
   * weil dort Kopfblock, Zusammenfassung und Blockueberschrift zusammenkommen.
   */
  await markerKlicken(marks.nth(1), { modifiers: ["Control"] });
  await page.waitForTimeout(250);
  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("die Gruppe wird übersetzt",
    (await auswahlKopf()).titel === "2 points selected", (await auswahlKopf()).titel);
  check("und ihre Zusammenfassung",
    (await text("multiSummary")) === "2 points in Perimeter.",
    await text("multiSummary"));
  /*
   * Bis zum 06.10.2026: die Ueberschrift des Faltblocks „Umformen“. Seitdem
   * traegt die Gruppe der Werkzeugleiste diesen Namen.
   */
  check("auch die Überschrift der Umformgruppe in der Leiste",
    (await page.evaluate(() =>
      document.querySelector("#toolGroupTransform .tool-group-title")
        .textContent.trim())) === "Reshape",
    await page.evaluate(() =>
      document.querySelector("#toolGroupTransform .tool-group-title")
        .textContent.trim()));

  await page.locator("#languageToggle").click();
  await page.waitForTimeout(400);

  check("und alles kommt deutsch zurück",
    (await auswahlKopf()).titel === "2 Punkte ausgewählt" &&
    (await text("multiSummary")) === "2 Punkte in Perimeter.",
    `${(await auswahlKopf()).titel} | ${await text("multiSummary")}`);

  /* ---------------------------------------------------------------- */
  console.log("Ein Loeschknopf fuer die ganze Auswahl");

  /*
   * „Punkt loeschen" ruft deleteSelectedVertices() und nimmt damit die GANZE
   * Auswahl. Vorher setzte deleteSelectedPoint() die Auswahl erst auf
   * selectedVertex zurueck: bei drei gewaehlten Punkten verschwand gemessen
   * EINER statt dreier, waehrend der Nachbarknopf „Auswahl loeschen" alle
   * drei nahm. Genau deshalb faellt der Nachbar weg - und genau deshalb steht
   * die Zusicherung hier ueber der MEHRFACHAUSWAHL und nicht ueber einem
   * einzelnen Punkt, wo beide Fassungen dasselbe taeten.
   *
   * Die Punkte werden ueber ihre WELTKOORDINATE angesprochen, nie ueber einen
   * Index: ein Index verschiebt sich beim Loeschen, eine Koordinate nicht.
   */
  const ACHT_ECKEN = {
    type: "Feature",
    properties: { name: "perimeter" },
    geometry: { type: "Polygon", coordinates: [[
      [0, 0], [10, 0], [20, 0], [30, 0], [40, 0],
      [40, 40], [20, 40], [0, 40], [0, 0],
    ]] },
  };

  await load([], ACHT_ECKEN);

  const ringWelt = () => page.evaluate(() =>
    data.features[0].geometry.coordinates[0]
      .map((c) => toWorld(c).map((v) => Math.round(v)).join("/")));

  const schluesselBei = (ost, nord) => page.evaluate(([o, n]) => {
    const treffer = enumerateEditableVertices(data.features[0], 0).find((d) => {
      const c = toWorld(getVertexCoordinate(d));
      return Math.abs(c[0] - o) < 1e-6 && Math.abs(c[1] - n) < 1e-6;
    });
    return treffer ? vertexKey(treffer) : null;
  }, [ost, nord]);

  const ZIELE = [[10, 0], [20, 0], [30, 0]];
  const zielSchluessel = [];
  for (const [ost, nord] of ZIELE) {
    zielSchluessel.push(await schluesselBei(ost, nord));
  }

  const ringVorher = await ringWelt();

  check("Vorbedingung: die drei Zielpunkte haben je einen Marker",
    zielSchluessel.every((k) => !!k), zielSchluessel.join(","));
  check("Vorbedingung: alle drei stehen im Ring",
    ZIELE.every(([o, n]) => ringVorher.includes(`${o}/${n}`)),
    ringVorher.join(" "));

  /*
   * Ein Locator aus einem ungeprueften Wert wartet dreissig Sekunden und
   * endet in einem stummen Abbruch statt in einer benannten Zusicherung -
   * deshalb haengt der ganze Abschnitt an der Vorbedingung darueber.
   */
  if (zielSchluessel.every((k) => !!k)) {
    for (const [i, key] of zielSchluessel.entries()) {
      await markerKlicken(key, i === 0 ? {} : { modifiers: ["Control"] });
      await page.waitForTimeout(220);
    }

    const gewaehlt = await page.evaluate(() =>
      getEffectiveSelectedVertices().length);

    check("drei Punkte sind ausgewaehlt", gewaehlt === 3, String(gewaehlt));

    const frei = await page.locator("#deletePointBtn").isEnabled();
    check("und „Punkt loeschen“ ist bei einer Mehrfachauswahl frei", frei);

    if (frei) {
      await page.locator("#deletePointBtn").click();
      await page.waitForTimeout(350);

      const ringNachher = await ringWelt();

      check("„Punkt loeschen“ nimmt ALLE drei gewaehlten Punkte",
        ZIELE.every(([o, n]) => !ringNachher.includes(`${o}/${n}`)),
        ringNachher.join(" "));
      check("und genau drei, nicht mehr",
        ringVorher.length - ringNachher.length === 3,
        `${ringVorher.length} -> ${ringNachher.length}`);
      check("die uebrigen Punkte stehen unveraendert da",
        ringVorher
          .filter((k) => !ZIELE.some(([o, n]) => k === `${o}/${n}`))
          .every((k) => ringNachher.includes(k)),
        ringNachher.join(" "));
    }
  }

  /* ---------------------------------------------------------------- */
  console.log("Die Leiste traegt einen Loeschknopf, und jeder erklaert sich");

  /*
   * Gemessen wird am sichtbaren Text und am title der WIRKLICH gerenderten
   * Knoepfe. Ein Knopf in einer ausgeblendeten Gruppe meldet sein eigenes
   * display weiterhin als "flex" - dieselbe Falle wie ueberall sonst in
   * dieser Datei.
   */
  const leistenKnoepfe = () => page.evaluate(() =>
    [...document.querySelectorAll("#selectionActions button")]
      .filter((b) => b.getClientRects().length > 0)
      .map((b) => ({
        id: b.id,
        text: b.textContent.trim(),
        titel: (b.getAttribute("title") || "").trim(),
      })));

  await load([MIT_LOCH]);
  await page.locator("circle.vertex").first().click();
  await page.waitForTimeout(300);

  const beiPunktDe = await leistenKnoepfe();

  check("deutsch: die Leiste traegt keinen Knopf „Auswahl loeschen“ mehr",
    !beiPunktDe.some((k) => k.text === "Auswahl löschen"),
    beiPunktDe.map((k) => k.text).join(" | "));
  check("deutsch: sie traegt genau einen Loeschknopf, und der heisst „Punkt loeschen“",
    beiPunktDe.filter((k) => k.text.includes("löschen")).length === 1 &&
    beiPunktDe.some((k) => k.text === "Punkt löschen"),
    beiPunktDe.map((k) => k.text).join(" | "));
  check("deutsch: jeder Knopf der Leiste erklaert sich beim Ueberfahren",
    beiPunktDe.length === 6 && beiPunktDe.every((k) => k.titel.length > 0),
    JSON.stringify(beiPunktDe));

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const beiPunktEn = await leistenKnoepfe();

  check("englisch: kein Knopf heisst „Delete selection“",
    !beiPunktEn.some((k) => k.text === "Delete selection"),
    beiPunktEn.map((k) => k.text).join(" | "));
  check("englisch: jeder Knopf der Leiste erklaert sich ebenfalls",
    beiPunktEn.length === beiPunktDe.length &&
    beiPunktEn.every((k) => k.titel.length > 0),
    JSON.stringify(beiPunktEn));
  check("und keine Erklaerung ist deutsch geblieben",
    beiPunktEn.every((k, i) => k.titel !== beiPunktDe[i].titel),
    beiPunktEn.map((k) => k.titel).join(" | "));

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

  /*
   * „Exclusion duplizieren" steht nur im Zustand „ganzes Feature" einer
   * Exclusion - ohne eigenen Abschnitt bliebe der achte Knopf der Leiste
   * ohne Zusicherung ueber seine Erklaerung.
   */
  await openAllFolds(page);
  await page.locator('[data-action="select-whole-feature"][data-feature-index="1"]')
    .click();
  await page.waitForTimeout(350);

  const beiFeatureDe = await leistenKnoepfe();

  check("Vorbedingung: im Featurezustand steht „Exclusion duplizieren“ dabei",
    beiFeatureDe.some((k) => k.id === "duplicateFeatureBtn"),
    beiFeatureDe.map((k) => k.id).join(","));
  check("deutsch: auch dort erklaert sich jeder Knopf",
    beiFeatureDe.every((k) => k.titel.length > 0), JSON.stringify(beiFeatureDe));

  await page.evaluate(() => setLanguage("en"));
  await page.waitForTimeout(400);

  const beiFeatureEn = await leistenKnoepfe();

  check("englisch: auch dort erklaert sich jeder Knopf",
    beiFeatureEn.length === beiFeatureDe.length &&
    beiFeatureEn.every((k) => k.titel.length > 0), JSON.stringify(beiFeatureEn));
  check("und auch dort ist keine Erklaerung deutsch geblieben",
    beiFeatureEn.every((k, i) => k.titel !== beiFeatureDe[i].titel),
    beiFeatureEn.map((k) => k.titel).join(" | "));

  await page.evaluate(() => setLanguage("de"));
  await page.waitForTimeout(400);

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

  const loeschTitel = () => page.getAttribute("#deletePointBtn", "title");
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
  await markerKlicken(marks.nth(0));
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

  await markerKlicken(marks.nth(1), { modifiers: ["Control"] });
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


  /* ---------------------------------------------------------------- */
  console.log("Das Ergebnis der letzten Handlung steht oben im Inspektor");

  /*
   * Perimeter mit fast geraden Zwischenpunkten - daran wirkt das Reduzieren.
   * Die beiden Exclusions ueberlappen einander und erzeugen damit eine
   * Warnung; ohne Befund haette der Bericht keine Zeile, die man sehen kann.
   */
  const FAST_GERADE = {
    type: "Feature",
    properties: { name: "perimeter" },
    geometry: { type: "Polygon", coordinates: [[
      [0, 0], [10, 0.01], [20, 0], [30, 0.01], [40, 0],
      [40, 40], [0, 40], [0, 0],
    ]] },
  };

  const UEBERLAPPEND = [
    { type: "Feature", idx: 0, properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [
        [[5, 5], [20, 5], [20, 20], [5, 20], [5, 5]]] } },
    { type: "Feature", idx: 1, properties: { name: "exclusion" },
      geometry: { type: "Polygon", coordinates: [
        [[10, 10], [25, 10], [25, 25], [10, 25], [10, 10]]] } },
  ];

  /*
   * Welcher Block steht unmittelbar unter dem Kopfblock?
   *
   * Gemessen wird der erste SICHTBARE - die Zustandsblöcke stehen sämtlich im
   * Markup, nur einer davon ist gerade nicht ausgeblendet. Die Stelle im
   * Markup allein saegte nichts darueber, was der Nutzer oben sieht.
   */
  const obenImInspektor = () => page.evaluate(() => {
    const aside = document.getElementById("inspector");
    const sichtbar = [...aside.children].filter(
      (k) => k.nodeType === 1 && getComputedStyle(k).display !== "none"
    );

    /* [0] ist der Kopfblock, er steht in jedem Zustand da. */
    return sichtbar[1]?.id || null;
  });

  /** Liegt der Block im sichtbaren Teil der Spalte, ohne zu rollen? */
  const imBlick = (id) => page.evaluate((wunsch) => {
    const aside = document.getElementById("inspector");
    const block = document.getElementById(wunsch);
    const ar = aside.getBoundingClientRect();
    const br = block.getBoundingClientRect();

    return {
      rollstand: aside.scrollTop,
      oben: br.height > 0 && br.top >= ar.top - 0.5 && br.top <= ar.bottom,
      ganz: br.height > 0 && br.top >= ar.top - 0.5 && br.bottom <= ar.bottom + 0.5,
    };
  }, id);

  await load(UEBERLAPPEND, FAST_GERADE);

  const vorPruefung = await obenImInspektor();
  check("vor der Pruefung steht die Kartenpruefung nicht oben",
    vorPruefung !== "inspectorValidation", String(vorPruefung));

  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(400);

  const nachPruefung = await obenImInspektor();
  check("nach „Karte pruefen“ steht der Bericht oben im Inspektor",
    nachPruefung === "inspectorValidation", String(nachPruefung));

  const berichtOffen = await page.evaluate(
    () => document.getElementById("inspectorValidation").open
  );
  check("und er steht aufgeklappt da", berichtOffen, String(berichtOffen));

  const berichtLage = await imBlick("inspectorValidation");
  check("der ganze Block liegt ohne Rollen im Blick",
    berichtLage.ganz && berichtLage.rollstand === 0, JSON.stringify(berichtLage));

  const summeTreffer = await elementGetroffen(page, "#validationSummary", { dy: 10 });
  check("die Zusammenfassung des Berichts ist getroffen",
    summeTreffer.ok, summeTreffer.grund);

  const summeDe = (await page.locator("#validationSummary").innerText()).trim();
  check("und sie nennt das Ergebnis der Pruefung",
    /Warnung/.test(summeDe), summeDe);

  /*
   * "Ohne Scrollen und ohne weiteren Klick": der Rollstand steht auf 0, die
   * Zeile hat ein Rechteck im sichtbaren Teil der Spalte, und sie wird an
   * ihrer eigenen Stelle getroffen. Das Rechteck allein genuegt nicht - es
   * traegt durch ein geschlossenes <details> hindurch.
   */
  const warnzeile = await page.evaluate(() => {
    const aside = document.getElementById("inspector");
    const zeile = document.querySelector(
      "#validationReport .validation-item.warning"
    );

    if (!zeile) return { da: false };

    const ar = aside.getBoundingClientRect();
    const zr = zeile.getBoundingClientRect();

    return {
      da: true,
      rollstand: aside.scrollTop,
      imBlick: zr.height > 0 && zr.top >= ar.top - 0.5 && zr.bottom <= ar.bottom + 0.5,
      text: zeile.textContent.trim(),
    };
  });
  check("mindestens eine Warnungszeile steht ohne Rollen im Blick",
    warnzeile.da && warnzeile.imBlick && warnzeile.rollstand === 0,
    JSON.stringify(warnzeile));

  const warnTreffer = await elementGetroffen(
    page, "#validationReport .validation-item.warning", { dy: 10 }
  );
  check("und sie ist ohne weiteren Klick getroffen",
    warnTreffer.ok, warnTreffer.grund);

  /* Auf deutsch erzeugt, dann englisch gemessen - ohne weitere Handlung. */
  await spracheSetzen("en");
  await page.waitForTimeout(250);

  const obenEn = await obenImInspektor();
  const summeEn = (await page.locator("#validationSummary").innerText()).trim();
  check("auf deutsch geprueft, dann englisch: der Bericht steht weiter oben",
    obenEn === "inspectorValidation", String(obenEn));
  check("auf deutsch geprueft, dann englisch: die Zusammenfassung ist uebersetzt",
    /warning/i.test(summeEn) && !/Warnung/.test(summeEn), summeEn);

  /* Und die Gegenrichtung: auf englisch erzeugt, auf deutsch gemessen. */
  await menueBefehl("Map", "Validate map");
  await page.waitForTimeout(350);

  const obenEnErzeugt = await obenImInspektor();
  check("auf englisch geprueft: der Bericht steht oben",
    obenEnErzeugt === "inspectorValidation", String(obenEnErzeugt));

  await spracheSetzen("de");
  await page.waitForTimeout(250);

  const obenDeWieder = await obenImInspektor();
  const summeDeWieder = (await page.locator("#validationSummary").innerText()).trim();
  check("auf englisch geprueft, dann deutsch: er steht weiter oben",
    obenDeWieder === "inspectorValidation", String(obenDeWieder));
  check("auf englisch geprueft, dann deutsch: die Zusammenfassung ist deutsch",
    /Warnung/.test(summeDeWieder), summeDeWieder);

  /*
   * Eine Auswahl ist die naechste Handlung: sie holt den Platz unter dem
   * Kopfblock zurueck, und der Bericht rueckt an seine Stelle.
   */
  const marker = await page.evaluate(() => {
    const kreis = document.querySelector("circle.vertex");
    if (!kreis) return null;
    const r = kreis.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check("es gibt einen Punktmarker zum Anklicken", !!marker, String(marker));

  if (marker) {
    await page.mouse.click(marker.x, marker.y);
    await page.waitForTimeout(300);

    /*
     * Bis zum Umzug der Angaben zur Auswahl stand hier der Punktblock. Er
     * steht seitdem ueber der Karte; im Inspektor rueckt unter den Kopfblock
     * wieder der Block, der ohne eine Antwort dort steht - ueber der Schwelle
     * die Feature-Navigation, denn die Auswahlleiste liegt dann ebenfalls
     * ueber der Karte. Und die Auswahl selbst steht sichtbar in den Angaben:
     * erst beides zusammen sagt, dass der Platz an die naechste Handlung
     * gegangen ist.
     */
    const nachAuswahl = await obenImInspektor();
    check("nach der Punktauswahl steht oben wieder der erste eigene Block",
      nachAuswahl === "featureNavigationSection", String(nachAuswahl));

    const auswahlDa = await elementGetroffen(page, "#selectionTitle", { dy: 5 });
    check("und die Auswahl steht in den Angaben ueber der Karte",
      auswahlDa.ok, JSON.stringify(auswahlDa));

    const zurueck = await page.evaluate(() => {
      const aside = document.getElementById("inspector");
      const kinder = [...aside.children].filter((k) => k.nodeType === 1);
      const val = document.getElementById("inspectorValidation");
      return { stelle: kinder.indexOf(val), vorletzter: kinder.length - 2 };
    });
    check("und der Bericht steht wieder an seiner eigenen Stelle",
      zurueck.stelle === zurueck.vorletzter, JSON.stringify(zurueck));
  }

  /* ---------------------------------------------------------------- */
  console.log("Das gewaehlte Umformwerkzeug steht oben im Inspektor");

  /*
   * Seit dem 06.10.2026 - entschieden vom Projektinhaber - ist jedes
   * Umformwerkzeug ein eigener Eintrag der Werkzeugleiste. Waehlt man eines,
   * erscheinen seine Einstellungen im Inspektor, sonst nicht. Bis dahin stand
   * hier „Dieselbe Regel fuer das Umformen“: der Faltblock „Umformen“ rueckte
   * nach dem Anwenden nach oben. Den Faltblock gibt es nicht mehr; der Block
   * des gewaehlten Werkzeugs steht von vornherein oben.
   *
   * Gemessen wird nach der Wirkung: welcher Block der erste GEZEICHNETE unter
   * dem Kopf ist, ob er ohne Rollen im Blick liegt und getroffen wird, ob der
   * Leistenknopf getroffen wird und seinen Zustand nennt.
   */
  const UMFORM_BLOECKE = ["inspectorStraighten", "inspectorReduce", "inspectorRectify", "inspectorSmooth"];
  const umformBloecke = () => page.evaluate((ids) =>
    ids.filter((id) => document.getElementById(id).checkVisibility()), UMFORM_BLOECKE);
  const gedrueckt = (id) => page.evaluate((x) =>
    document.getElementById(x).getAttribute("aria-pressed"), id);

  await load([], FAST_GERADE);
  await openAllFolds(page);

  check("ohne Wahl steht kein Umformwerkzeug im Inspektor",
    (await umformBloecke()).length === 0, JSON.stringify(await umformBloecke()));

  {
    const knopf = await elementGetroffen(page, "#reduceToolBtn", { dy: 10 });
    check("„Reduzieren“ steht in der Leiste und wird getroffen", knopf.ok, knopf.grund);
  }

  /*
   * Die Spalte steht weiter unten - sonst bewiese „liegt ohne Rollen im
   * Blick“ nichts: ohne das Zurueckrollen bliebe der Block oberhalb des
   * sichtbaren Teils.
   */
  const rollstandVorher = await page.evaluate(() => {
    const aside = document.getElementById("inspector");
    aside.scrollTop = 9999;
    return aside.scrollTop;
  });
  check("Vorbedingung: die Spalte steht weiter unten", rollstandVorher > 0, String(rollstandVorher));

  await page.locator("#reduceToolBtn").click();
  await page.waitForTimeout(300);

  {
    const oben = await obenImInspektor();
    check("nach der Wahl steht „Reduzieren“ oben im Inspektor", oben === "inspectorReduce", String(oben));
    const blick = await imBlick("inspectorReduce");
    check("und liegt ohne Rollen im Blick", blick.oben && blick.rollstand === 0, JSON.stringify(blick));
    const feld = await elementGetroffen(page, "#reduceToleranceInput", { dy: 8 });
    check("seine Einstellungen stehen offen da: das Toleranzfeld wird getroffen", feld.ok, feld.grund);
    check("kein anderes Umformwerkzeug steht da",
      JSON.stringify(await umformBloecke()) === JSON.stringify(["inspectorReduce"]),
      JSON.stringify(await umformBloecke()));
    check("der Leistenknopf nennt sich gewaehlt", (await gedrueckt("reduceToolBtn")) === "true");
  }

  /* Eine Auswahl laesst das Werkzeug stehen - man waehlt Punkte, nachdem man das Werkzeug gewaehlt hat. */
  await openAllFolds(page);
  await page.locator('[data-action="select-whole-feature"]').first().click();
  await page.waitForTimeout(300);

  check("nach der Auswahl steht „Reduzieren“ weiter oben",
    (await obenImInspektor()) === "inspectorReduce", String(await obenImInspektor()));

  const reduziert = await klickeFreienKnopf(
    "#reduceApplyBtn", "Punkte reduzieren ist frei", "#reduceReason"
  );

  if (reduziert) {
    await page.waitForTimeout(400);

    check("nach dem Reduzieren steht das Werkzeug weiter oben im Inspektor",
      (await obenImInspektor()) === "inspectorReduce", String(await obenImInspektor()));
    const titel = await elementGetroffen(page, "#inspectorReduce .inspector-section-title", { dy: 5 });
    check("und seine Ueberschrift ist getroffen", titel.ok, titel.grund);
    check("die Antwort steht in der Statuszeile",
      /entfernt/.test(await page.locator("#editStatus").innerText()),
      await page.locator("#editStatus").innerText());
  }

  /* Ein anderes Werkzeug loest es ab; derselbe Knopf noch einmal nimmt die Wahl zurueck. */
  await page.locator("#rectifyToolBtn").click();
  await page.waitForTimeout(250);
  check("„Rechtwinklig“ loest „Reduzieren“ ab",
    JSON.stringify(await umformBloecke()) === JSON.stringify(["inspectorRectify"]) &&
    (await gedrueckt("reduceToolBtn")) === "false" && (await gedrueckt("rectifyToolBtn")) === "true",
    JSON.stringify(await umformBloecke()));

  await page.locator("#rectifyToolBtn").click();
  await page.waitForTimeout(250);
  check("ein zweiter Klick nimmt die Wahl zurueck",
    (await umformBloecke()).length === 0 && (await gedrueckt("rectifyToolBtn")) === "false",
    JSON.stringify(await umformBloecke()));

  /* Zeichnen nimmt dem Werkzeug den Platz - umgekehrt beendet die Wahl das Messen. */
  await page.locator("#straightenToolBtn").click();
  await page.waitForTimeout(250);
  await page.locator("#drawExclusionBtn").click();
  await page.waitForTimeout(250);
  check("das Zeichnen nimmt dem Umformwerkzeug den Platz",
    (await umformBloecke()).length === 0 && (await gedrueckt("straightenToolBtn")) === "false" &&
    (await visible("inspectorDraw")),
    JSON.stringify(await umformBloecke()));
  await page.locator("#cancelDrawBtn").click();
  await page.waitForTimeout(250);

  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);
  check("Vorbedingung: das Messen laeuft", await visible("inspectorMeasure"));
  await page.locator("#straightenToolBtn").click();
  await page.waitForTimeout(250);
  check("die Wahl eines Umformwerkzeugs beendet das Messen",
    !(await visible("inspectorMeasure")) &&
    JSON.stringify(await umformBloecke()) === JSON.stringify(["inspectorStraighten"]),
    JSON.stringify(await umformBloecke()));

  /* Und umgekehrt: das Messen nimmt dem Umformwerkzeug den Platz. */
  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);
  check("das Messen nimmt dem Umformwerkzeug den Platz",
    (await visible("inspectorMeasure")) && (await umformBloecke()).length === 0 &&
    (await gedrueckt("straightenToolBtn")) === "false",
    JSON.stringify(await umformBloecke()));
  await page.locator("#measureBtn").click();
  await page.waitForTimeout(250);

  /*
   * Steht der Pruefbericht oben, gibt die Wahl eines Werkzeugs den Platz frei:
   * sie ist die naechste Handlung, und der Block des Werkzeugs gehoert unter
   * den Kopf. Gezaehlt wird das Werkzeug deshalb in der Signatur mit, an der
   * releaseInspectorResult() eine neue Handlung erkennt.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await menueBefehl("Karte", "Karte prüfen");
  await page.waitForTimeout(400);
  check("Vorbedingung: nach „Karte prüfen“ steht der Bericht oben",
    (await obenImInspektor()) === "inspectorValidation", String(await obenImInspektor()));
  await page.locator("#rectifyToolBtn").click();
  await page.waitForTimeout(250);
  check("die Wahl eines Werkzeugs gibt den Platz oben frei",
    (await obenImInspektor()) === "inspectorRectify", String(await obenImInspektor()));

  /*
   * Eine wartende Glaettungsvorschau faellt weg, wenn das Glaetten abgewaehlt
   * wird: ihr Anwenden und Abbrechen stehen in dem Block, der verschwindet.
   */
  /*
   * Ein Fuenfeck mit stumpfen Ecken, wie in tools/test-glaettung.mjs: am
   * 40-m-Quadrat dieser Datei laesst das Glaetten jede Ecke aus („enger Bogen
   * ausgelassen“), und es gaebe keine Vorschau, die wegfallen koennte.
   */
  const FUENFECK = {
    type: "Feature", properties: { name: "perimeter" },
    geometry: { type: "Polygon", coordinates: [[
      [16.81, 11.41], [10.12, 15.47], [3.09, 10.19], [7.2, 1.51], [14.33, 1.85], [16.81, 11.41],
    ]] },
  };
  await load([], FUENFECK);
  await umformwerkzeug("smooth");
  const geglaettet = await klickeFreienKnopf("#smoothApplyBtn", "Glätten ist frei", "#smoothReason");

  if (geglaettet) {
    await page.waitForTimeout(400);
    const vorschau = () => page.evaluate(() =>
      document.querySelectorAll("#toolPreviewGroup .smooth-preview-line").length);
    check("Vorbedingung: die Glaettung steht als Vorschau auf der Karte", (await vorschau()) > 0,
      String(await vorschau()));

    await page.locator("#smoothToolBtn").click();
    await page.waitForTimeout(300);
    check("abgewaehlt ist die Vorschau weg", (await vorschau()) === 0, String(await vorschau()));
    check("und die Statuszeile sagt, dass nichts uebernommen wurde",
      /Glätten abgebrochen/.test(await page.locator("#editStatus").innerText()),
      await page.locator("#editStatus").innerText());
  }

  /*
   * Beide Sprachrichtungen: Ueberschrift des Blocks, Beschriftung des
   * Leistenknopfes und der Grund unter dem Knopf - der ist ABGELEITET und
   * entsteht je Richtung einmal neu, durch die Wahl in der jeweiligen
   * Sprache.
   */
  const reduzierenTexte = () => page.evaluate(() => ({
    titel: document.querySelector("#inspectorReduce .inspector-section-title").textContent.trim(),
    leiste: document.querySelector("#reduceToolBtn .tool-label").textContent.trim(),
    grund: document.getElementById("reduceReason").innerText.trim(),
  }));

  await load([], FAST_GERADE);
  await umformwerkzeug("reduce");
  const deErzeugt = await reduzierenTexte();
  check("deutsch erzeugt: „Reduzieren“, mit Grund",
    deErzeugt.titel === "Reduzieren" && deErzeugt.leiste === "Reduzieren" && deErzeugt.grund.length > 0,
    JSON.stringify(deErzeugt));
  await page.evaluate(() => setLanguage("en"));
  {
    const t = await reduzierenTexte();
    check("deutsch erzeugt, dann englisch: „Reduce“, der Grund ohne deutschen Rest",
      t.titel === "Reduce" && t.leiste === "Reduce" && t.grund.length > 0 && !/[äöüß]|Punkt/.test(t.grund),
      JSON.stringify(t));
  }

  await load([], FAST_GERADE);
  await page.evaluate(() => setLanguage("en"));
  await umformwerkzeug("reduce");
  const enErzeugt = await reduzierenTexte();
  await page.evaluate(() => setLanguage("de"));
  {
    const t = await reduzierenTexte();
    check("englisch erzeugt, dann deutsch: wieder „Reduzieren“ und derselbe deutsche Grund",
      enErzeugt.titel === "Reduce" && t.titel === "Reduzieren" && t.leiste === "Reduzieren" &&
      t.grund === deErzeugt.grund,
      `${JSON.stringify(enErzeugt)} -> ${JSON.stringify(t)}`);
  }

  /* ---------------------------------------------------------------- */
  console.log("Die Kurzformen der Kopfzeilen werden nicht gekuerzt");

  /*
   * Gekuerzt stand hier „Reduzieren · Rechtwinklig · Glätt…“, sobald ein
   * Punkt gewaehlt war: es fehlten 1,3 px. Bei vier Marken fehlten deutsch 60
   * und englisch 14 px. Seitdem bricht die Kurzform zwischen zwei Marken um,
   * statt gekuerzt zu werden.
   *
   * Die Kurzform „Umformen“ ist am 06.10.2026 mit ihrem Faltblock entfallen.
   * Gemessen wird seitdem die Kurzform, die bleibt - die des Bestands -, und
   * ihr Abstand zwischen zwei Marken nicht mehr gegen „Umformen“, sondern
   * gegen das, woraus er besteht: das Trennzeichen „ ·“ plus ein Leerzeichen,
   * gemessen in derselben Kurzform.
   *
   * Gemessen wird je Textbehaelter der Kopfzeile: scrollWidth > clientWidth am
   * Behaelter selbst, und ob sein Text ueber den Kasten hinausragt, der ihn
   * abschneidet. Das zweite in Bruchteilen eines Pixels - scrollWidth und
   * clientWidth sind ganze Zahlen, und die 1,3 px lagen nahe genug an der
   * Rundung, um bei etwas anderer Schrift durchzufallen. Bei einer Marke
   * zaehlt dabei auch ihr Trennzeichen: es steht in ihrem Kasten, nicht in
   * ihrem Text.
   */
  const kopfzeile = (id) => page.evaluate((x) => {
    const summary = document.querySelector(`#${x} > summary`);
    const kurz = summary.querySelector(".fold-summary");

    /* Innenkante eines Kastens, genau - ohne Rand und ohne Rollbalken. */
    const innen = (el) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      const bl = parseFloat(s.borderLeftWidth) || 0, br = parseFloat(s.borderRightWidth) || 0;
      const balken = Math.max(0, el.offsetWidth - bl - br - el.clientWidth);
      return { links: r.left + bl, rechts: r.right - br - balken, oben: r.top, unten: r.bottom };
    };
    const textKasten = (el) => {
      const rg = document.createRange();
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          l = Math.min(l, q.left); r = Math.max(r, q.right);
          t = Math.min(t, q.top); b = Math.max(b, q.bottom);
        }
      }
      return isFinite(l) ? { l, r, t, b } : null;
    };

    const abgeschnitten = [];
    for (const el of summary.querySelectorAll("*")) {
      const tk = textKasten(el);
      if (!tk || !el.getClientRects().length) continue;
      const name = el.id || el.className;
      const inline = getComputedStyle(el).display === "inline";
      if (!inline && el.scrollWidth > el.clientWidth) {
        abgeschnitten.push(`${name}: ${el.scrollWidth}/${el.clientWidth}`);
      }
      const kasten = el.getBoundingClientRect();
      const l = inline ? Math.min(tk.l, kasten.left) : tk.l;
      const r = inline ? Math.max(tk.r, kasten.right) : tk.r;
      for (let a = el; a; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === "visible") continue;
        const k = innen(a);
        if (r > k.rechts + 0.01 || l < k.links - 0.01) {
          abgeschnitten.push(`${name}: ${l.toFixed(2)}-${r.toFixed(2)} in ${a.id || a.className} ${k.links.toFixed(2)}-${k.rechts.toFixed(2)}`);
        }
        break;
      }
    }

    const marken = [...kurz.children].filter((m) => m.getClientRects().length).map((m) => {
      const b = m.getBoundingClientRect(), tk = textKasten(m);
      const treffer = document.elementFromPoint((tk.l + tk.r) / 2, (tk.t + tk.b) / 2);
      return {
        text: m.textContent.trim(),
        zeile: Math.round(tk.t),
        kastenLinks: b.left, kastenRechts: b.right, textLinks: tk.l, textRechts: tk.r,
        getroffen: !!treffer && m.contains(treffer),
        grund: treffer ? (treffer.id || treffer.className || treffer.tagName) : "nichts",
      };
    });

    /* Je Zeile: steht vorn ein Trennzeichen, endet sie am rechten Rand? */
    const zeilen = [...new Set(marken.map((m) => m.zeile))].map((z) => {
      const auf = marken.filter((m) => m.zeile === z);
      const erste = auf.reduce((a, m) => (m.kastenLinks < a.kastenLinks ? m : a));
      return {
        vorn: +(erste.textLinks - erste.kastenLinks).toFixed(2),
        rechtsFrei: +(innen(kurz).rechts - Math.max(...auf.map((m) => m.kastenRechts))).toFixed(2),
      };
    });

    /* Abstand vom Text einer Marke zum Text der naechsten in derselben Zeile. */
    const abstaende = marken.slice(1)
      .map((m, i) => (m.zeile === marken[i].zeile ? +(m.textLinks - marken[i].textRechts).toFixed(2) : null))
      .filter((d) => d !== null);

    /* Der Abstand, den Trennzeichen und Leerraum zusammen haben: „ · “ im selben Kasten. */
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;";
    probe.textContent = " · ";
    kurz.appendChild(probe);
    const sollAbstand = probe.getBoundingClientRect().width;
    probe.remove();

    return { abgeschnitten, marken, zeilen, abstaende, sollAbstand };
  }, id);

  const ERWARTET = {
    de: ["keine Search Wire", "kein Dockpfad"],
    en: ["no Search Wire", "no docking path"],
  };

  for (const breite of [1280, 960, 744]) {
    for (const [von, nach] of [["de", "en"], ["en", "de"]]) {
      await page.setViewportSize({ width: breite, height: 900 });
      await load();
      await page.evaluate((l) => setLanguage(l), von);

      for (const sprache of [von, nach]) {
        if (sprache !== von) await page.evaluate((l) => setLanguage(l), sprache);
        const wie = sprache === von
          ? `${breite} px, ${von}`
          : `${breite} px, ${von} erzeugt, dann ${sprache}`;

        const k = await kopfzeile("inspectorStock");
        const texte = k.marken.map((m) => m.text);

        check(`${wie}: die Kurzform des Bestands nennt ihn in dieser Sprache`,
          JSON.stringify(texte) === JSON.stringify(ERWARTET[sprache]), JSON.stringify(texte));
        check(`${wie}: kein Textbehaelter der Kopfzeile „Bestand“ ist abgeschnitten`,
          k.abgeschnitten.length === 0, JSON.stringify(k.abgeschnitten));
        check(`${wie}: jede Marke wird getroffen`,
          k.marken.length > 0 && k.marken.every((m) => m.getroffen),
          JSON.stringify(k.marken.map((m) => `${m.text}:${m.grund}`)));
        check(`${wie}: keine Zeile beginnt mit dem Trennzeichen`,
          k.zeilen.every((z) => Math.abs(z.vorn) < 0.5), JSON.stringify(k.zeilen));
        check(`${wie}: jede Zeile schliesst rechts mit der Kurzform ab`,
          k.zeilen.every((z) => Math.abs(z.rechtsFrei) <= 1), JSON.stringify(k.zeilen));

        /*
         * Zwischen den Marken steht Trennzeichen UND Leerraum. Ohne den
         * Leerraum stand dort „Search Wire· Dockpfad“ - und es gab keine
         * Stelle zum Umbrechen.
         */
        check(`${wie}: zwischen den Marken stehen Trennzeichen und Leerraum`,
          k.abstaende.length > 0 && Math.abs(k.abstaende[0] - k.sollAbstand) < 0.5,
          `${JSON.stringify(k.abstaende)} gegen ${k.sollAbstand.toFixed(2)}`);
      }
    }
  }

  await page.setViewportSize({ width: 1600, height: 900 });

  check("keine Konsolen-/Seitenfehler", consoleErrors.length === 0,
    consoleErrors.join(" | "));
} finally {
  await browser.close();
}

finish("Der Inspektor zeigt genau einen Zustand und bleibt tastaturbedienbar.");
