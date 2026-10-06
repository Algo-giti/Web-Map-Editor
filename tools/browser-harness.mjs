#!/usr/bin/env node
// Gemeinsamer Unterbau für die optionalen Browsertests (smoke-test.mjs und
// test-origin-conflict.mjs).
//
// Zweck: Die Suche nach Playwright und nach einem startbaren Browser steht
// genau hier - nicht dupliziert in jedem Testskript und vor allem nicht als
// hartkodierter Pfad in der Dokumentation. Konkrete Verzeichnisse und
// Versionsnummern unterscheiden sich pro Rechner und veralten in der Doku
// sofort; dieser Code prüft sie stattdessen zur Laufzeit.
//
// Beide Tests sind bewusst KEIN Bestandteil von check-all.mjs. check-all ist
// die abhängigkeitsfreie Stufe und soll das bleiben; `playwright-core` ist
// keine Projekt-Abhängigkeit und wird einmalig pro Umgebung AUSSERHALB des
// Repositories installiert (kein package.json im Repo):
//
//   cd "$SCRATCH" && npm init -y && npm install playwright-core
//   PLAYWRIGHT_CORE_PATH="$SCRATCH" node tools/smoke-test.mjs
//
// PLAYWRIGHT_CORE_PATH zeigt auf das Verzeichnis, das node_modules enthält.
// Damit bleibt die Installation ausserhalb des Repositories, ohne dass dort
// ein node_modules-Verzeichnis oder ein Symlink angelegt werden muss. Liegt
// playwright-core ohnehin im Auflösungspfad, wird die Variable nicht gebraucht.
//
// Ein Browser wird in dieser Reihenfolge gesucht:
//   1. $CHROME_PATH, falls gesetzt
//   2. ein bereits installierter System-Browser (Chrome/Chromium)
//   3. ein Build im ms-playwright-Cache, ohne feste Versionsnummer
//   4. der von playwright-core selbst verwaltete Browser
//
// Fehlt alles, geben die Tests eine Anleitung aus und enden mit Exit-Code 2.

import { accessSync, constants, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Ist der Pfad eine ausführbare Datei? */
function isExecutable(candidate) {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Sucht einen Programmnamen in $PATH. */
function resolveOnPath(name) {
  const entries = (process.env.PATH || "").split(platform() === "win32" ? ";" : ":");

  for (const entry of entries) {
    if (!entry) continue;
    const candidate = join(entry, name);
    if (isExecutable(candidate)) return candidate;
  }

  return null;
}

/** Übliche Namen und Orte eines bereits installierten Chrome/Chromium. */
function findSystemBrowser() {
  const names = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
  ];

  for (const name of names) {
    const found = resolveOnPath(name);
    if (found) return found;
  }

  const fixedLocations = [
    "/opt/google/chrome/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const candidate of fixedLocations) {
    if (isExecutable(candidate)) return candidate;
  }

  return null;
}

/** Wurzelverzeichnis des Playwright-Browsercaches je Plattform. */
function playwrightCacheRoots() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  }

  const home = homedir();

  switch (platform()) {
    case "darwin":
      return [join(home, "Library", "Caches", "ms-playwright")];
    case "win32":
      return [join(process.env.LOCALAPPDATA || home, "ms-playwright")];
    default:
      return [join(home, ".cache", "ms-playwright")];
  }
}

/**
 * Sucht einen Chromium-Build im Playwright-Cache.
 *
 * Bewusst ohne feste Versionsnummer: der Cache heißt je nach Playwright-Stand
 * chromium-1148, chromium-1208, ... Zusätzlich wird die Binary wirklich auf
 * Ausführbarkeit geprüft - ein vorhandenes Cache-Verzeichnis bedeutet nicht,
 * dass der Download vollständig war.
 */
function findCachedBrowser() {
  const relativeBinaries = [
    join("chrome-linux64", "chrome"),
    join("chrome-linux", "chrome"),
    join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    join("chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
    join("chrome-win", "chrome.exe"),
  ];

  for (const root of playwrightCacheRoots()) {
    let entries;
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }

    // Absteigend, damit der neueste Build zuerst probiert wird.
    const builds = entries
      .filter((entry) => entry.startsWith("chromium"))
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));

    for (const build of builds) {
      for (const relative of relativeBinaries) {
        const candidate = join(root, build, relative);
        if (isExecutable(candidate)) return candidate;
      }
    }
  }

  return null;
}

/** Liefert den zu verwendenden Browserpfad, oder null für Playwrights eigenen. */
export function findBrowserExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  return findSystemBrowser() || findCachedBrowser();
}

/** file://-URL der Anwendung. */
export function indexUrl() {
  return pathToFileURL(new URL("../index.html", import.meta.url).pathname).href;
}

/**
 * Lädt playwright-core - zuerst aus dem normalen Auflösungspfad, danach aus
 * dem über PLAYWRIGHT_CORE_PATH angegebenen Verzeichnis.
 *
 * Der zweite Weg existiert, weil ESM-Importe NODE_PATH ignorieren. Ohne ihn
 * bliebe nur, ein node_modules ins Repository zu legen - genau das soll die
 * Trennung von App und Testwerkzeug verhindern.
 */
async function importPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    /* Nicht im Auflösungspfad; unten weitersuchen. */
  }

  const base = process.env.PLAYWRIGHT_CORE_PATH;
  if (!base) return null;

  try {
    const requireFrom = createRequire(join(base, "package.json"));
    const resolved = requireFrom.resolve("playwright-core");
    const loaded = await import(pathToFileURL(resolved).href);

    /*
     * require.resolve() zeigt auf den CommonJS-Einstieg. Beim dynamischen
     * Import landen dessen Exporte je nach Modulform unter `default` statt
     * als benannte Exporte - deshalb beide Formen abdecken.
     */
    return loaded?.chromium ? loaded : loaded?.default ?? null;
  } catch {
    return null;
  }
}


const SETUP_HINT =
  "Dieser Test ist optional und absichtlich nicht Teil von check-all.mjs.\n" +
  "Einmalig AUSSERHALB des Repositories einrichten (kein package.json im Repo):\n" +
  '  cd "$SCRATCH" && npm init -y && npm install playwright-core\n' +
  '  PLAYWRIGHT_CORE_PATH="$SCRATCH" node tools/<test>.mjs\n' +
  "Einen Browser stellt entweder ein installiertes Chrome/Chromium bereit oder:\n" +
  "  npx --yes playwright install chromium\n" +
  "Mit CHROME_PATH lässt sich ein bestimmtes Programm erzwingen.";

/**
 * Startet einen Browser für einen Test.
 *
 * Liefert null, wenn Playwright fehlt oder kein Browser startet. Der Aufrufer
 * beendet sich dann mit EXIT-CODE 2 - fehlende Testinfrastruktur ist kein
 * Testfehler, aber auch kein bestandener Test.
 *
 * Bis zum Laeufer war das eine 0, und damit war ein Lauf ohne Browser von einem
 * bestandenen nicht zu unterscheiden. run-browser-tests.mjs zaehlt 2 deshalb als
 * "uebersprungen" und meldet den Lauf ausdruecklich als NICHT gelaufen.
 */
export async function launchBrowser(toolName) {
  const playwright = await importPlaywright();

  if (!playwright) {
    console.error(`${toolName}: playwright-core ist in dieser Umgebung nicht installiert.\n${SETUP_HINT}`);
    return null;
  }

  const { chromium } = playwright;

  const executablePath = findBrowserExecutable();
  const launchOptions = executablePath ? { executablePath } : {};

  try {
    const browser = await chromium.launch(launchOptions);
    if (executablePath) console.log(`${toolName}: Browser ${executablePath}`);
    return browser;
  } catch (error) {
    console.error(`${toolName}: konnte keinen Browser starten (${error.message}).\n${SETUP_HINT}`);
    return null;
  }
}

/**
 * Liefert eine Stelle auf der Karte, an der WIRKLICH die Karte liegt.
 *
 * Der Anlass ist die Auswahlleiste des elften Durchgangs: sie liegt links oben
 * über der Karte, sobald etwas ausgewählt ist, und faengt dort jedes
 * Zeigerereignis ab. Die drei Klicks "auf die leere Karte" standen bis dahin
 * auf festen 2/2 bzw. 5/5 - gemessen 7 bis 10 px neben dem Leistenstreifen.
 * Sie bestanden also, aber nicht mit Absicht: niemand hatte diese Zahlen
 * gewaehlt, weil dort Platz bleiben sollte.
 *
 * GESUCHT WIRD, STATT GERECHNET: der Helfer sucht den ersten Punkt, an dem
 * `elementFromPoint()` das `svg` SELBST liefert - keinen Marker, keine Ebene,
 * kein Fenster. Damit haengt die Stelle an keiner Breite und an keiner Zahl;
 * sie stimmt auch dann noch, wenn die Leiste eine Zeile mehr traegt oder
 * woandershin zieht.
 *
 * Zurueckgegeben wird die Stelle RELATIV zum svg, also so, wie
 * `locator.click({position})` sie erwartet, oder `null`, wenn die Karte
 * vollstaendig verdeckt ist - dann gehoert eine benannte Zusicherung dorthin
 * und kein Klick ins Blaue.
 */
export function freieKartenstelle(page, { schritt = 8, luft = 12 } = {}) {
  return page.evaluate(({ weite, luft: rand }) => {
    const svg = document.getElementById("svg");

    if (!svg) return null;

    const r = svg.getBoundingClientRect();

    /*
     * Frei heisst: der Punkt UND seine Umgebung liegen auf dem svg. Ohne den
     * Rand faende die Suche den 8 px breiten Streifen links neben der
     * Auswahlleiste - gemessen, das war die erste Fassung. Ein Klick dort
     * ginge zwar durch, aber er stuende wieder nur zufaellig frei, und genau
     * das war der Anlass fuer diesen Helfer.
     */
    const frei = (x, y) =>
      document.elementFromPoint(x, y) === svg &&
      document.elementFromPoint(x - rand, y) === svg &&
      document.elementFromPoint(x + rand, y) === svg &&
      document.elementFromPoint(x, y - rand) === svg &&
      document.elementFromPoint(x, y + rand) === svg;

    for (let y = r.top + rand + 2; y < r.bottom - rand - 2; y += weite) {
      for (let x = r.left + rand + 2; x < r.right - rand - 2; x += weite) {
        if (frei(x, y)) return { x: Math.round(x - r.left), y: Math.round(y - r.top) };
      }
    }

    return null;
  }, { weite: schritt, luft });
}


/**
 * Baut den Auslöser für Menübefehle: Menü öffnen, Eintrag anklicken.
 *
 * Der Helfer kapselt AUSSCHLIESSLICH diese beiden Gesten. Das Lauschen auf
 * `download` oder `dialog` bleibt beim Aufrufer und muss dort weiterhin VOR
 * dem Aufruf stehen - ein Ereignis, auf das erst nach dem Auslösen gehört
 * wird, ist verloren.
 *
 * Ein Eintrag ist nur im offenen Menü sichtbar; Playwright verlangt
 * Sichtbarkeit für click(). Genau deshalb gibt es den Helfer: sonst stünde
 * dieselbe Geste an über einem Dutzend Stellen.
 *
 * Er ist eine Fabrik wie createKlicker() und aus demselben Grund: ein
 * GESPERRTER Eintrag wurde vorher trotzdem angeklickt, und Playwright wartete
 * dreissig Sekunden auf eine Freigabe, die nicht kommt. Aus einer klaren
 * Ablehnung wurde ein stummer Abbruch, der seine Ursache nicht nennt. Geprüft
 * wird deshalb VOR dem Klick; ist der Eintrag gesperrt, reisst eine benannte
 * Zusicherung, es wird NICHT geklickt und das Menü wird wieder geschlossen.
 *
 * Die Zusicherung wird IMMER ausgegeben, nicht nur im Fehlerfall - eine, die
 * man nur sieht, wenn sie reisst, belegt im Gutfall nichts.
 *
 * check() ist je Test eine eigene Closure, deshalb die Fabrik: so kann eine
 * Aufrufstelle sie nicht vergessen. Ein vierter Parameter könnte weggelassen
 * werden, und der Wächter meldete dann nichts.
 *
 * UNTERSCHIED ZU createKlicker(), und er ist erzwungen, nicht gewählt: dort
 * genügt ein `false` an den Aufrufer, weil dessen Abschnitt in einer Funktion
 * liegt und mit `return` enden kann. Die Menübefehle stehen dagegen im
 * obersten `try`-Block ihrer Datei, und dort ist `return` kein gültiges
 * JavaScript - ein Rückgabewert liesse sich an den meisten der Aufrufstellen
 * gar nicht befolgen. Gemessen an der Mutation "Raster… gesperrt": die
 * Zusicherung riss, das Skript lief weiter und endete in `page.fill(
 * "#gridStepInput", …)` - also doch im Timeout, den der Wächter gerade
 * verhindern soll. Deshalb bricht der Helfer den Lauf SELBST ab. Der Fehler
 * nennt den Eintrag; die gerissene Zusicherung steht unmittelbar darüber.
 */
export function createMenueBefehl(page, check) {
  return async (menue, eintrag) => {
    /*
     * Erst zaehlen, dann klicken: ein Titel oder Eintrag, den es unter diesem
     * Text nicht gibt, liess click() und isEnabled() dreissig Sekunden warten.
     * Gemessen an der Mutation, die den Woerterbucheintrag von „Karte pruefen“
     * entfernt - in der englischen Oberflaeche heisst der Eintrag dann nicht
     * „Validate map“, und aus einer fehlenden Uebersetzung wurde ein stummer
     * Timeout. Jetzt reisst dieselbe benannte Zusicherung wie bei einem
     * gesperrten Eintrag, mit dem Grund daneben.
     */
    const titel = page.locator(".menu-title", { hasText: menue }).first();
    const titelDa = (await page.locator(".menu-title", { hasText: menue }).count()) > 0;

    let item = null;
    let vorhanden = false;

    if (titelDa) {
      await titel.click();

      const panel = page.locator(".menu-panel:not([hidden])").first();
      await panel.waitFor({ state: "visible" });

      item = panel.locator(".menu-item", { hasText: eintrag }).first();
      vorhanden = (await panel.locator(".menu-item", { hasText: eintrag }).count()) > 0;
    }

    /*
     * isEnabled() erfasst beide Sperrformen dieser Datei - das native
     * `disabled` der Menüknöpfe und ein `aria-disabled`. Nachgemessen, nicht
     * angenommen. Ein <label> (Kontrollkästchen, Dateiauswahl) ist kein
     * Formularelement und gilt darum immer als frei.
     */
    const frei = vorhanden && await item.isEnabled();
    const grund = !titelDa
      ? `es gibt kein Menü "${menue}" - nicht geklickt`
      : !vorhanden
        ? "es gibt keinen Eintrag mit diesem Text - nicht geklickt"
        : "der Eintrag ist gesperrt - nicht geklickt";
    check(`Menüeintrag "${menue} \u2192 ${eintrag}" ist frei`, frei, grund);

    if (frei) await item.click();

    /*
     * Ein Kontrollkästchen lässt das Menü bewusst offen - wer eine Ebene
     * ausschaltet, will oft gleich die nächste. Für den Test ist ein offenes
     * Panel über der Karte aber ein Hindernis, deshalb hier zumachen. Bei
     * einem gesperrten Eintrag steht es ohnehin noch offen.
     */
    if (await page.locator(".menu-panel:not([hidden])").count()) {
      await page.keyboard.press("Escape");
      await page.locator(".menu-panel:not([hidden])").first()
        .waitFor({ state: "hidden" })
        .catch(() => {});
    }

    if (!frei) {
      throw new Error(
        `Menüeintrag "${menue} \u2192 ${eintrag}": ${grund}, Lauf abgebrochen.`
      );
    }

    return true;
  };
}

/**
 * Wird das Element an seinen EIGENEN Koordinaten wirklich getroffen?
 *
 * getComputedStyle(el).display prüft eine Eigenschaft des Elements selbst -
 * ein abschneidender Vorfahr sitzt eine Ebene höher und bleibt dabei
 * unsichtbar. `display` beantwortet "will sichtbar sein", diese Prüfung
 * "ist sichtbar": elementFromPoint liefert, was der Browser an dieser Stelle
 * tatsächlich zeichnet.
 *
 * Genau das hat der erste Bildschirmabzug der Menüleiste gefunden und kein
 * Test: header trug overflow:hidden, die Panels waren gerechnet da, sichtbar
 * und anklickbar nicht - und elementFromPoint lieferte den toolRail.
 *
 * Für jedes Element, das absichtlich über seinen Container hinausragt:
 * Menüpanels, die schwebenden Fenster über der Karte, Overlays.
 */
export function elementGetroffen(page, selector, { dy = 20 } = {}) {
  return page.evaluate(([sel, abstand]) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, grund: "Element fehlt" };

    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { ok: false, grund: "keine Ausdehnung" };

    const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + abstand);

    return {
      ok: !!treffer && el.contains(treffer),
      grund: treffer
        ? (treffer.id || treffer.className || treffer.tagName)
        : "nichts",
    };
  }, [selector, dy]);
}

/**
 * Öffnet alles, was einen Wert verdecken könnte: die Faltbereiche von
 * Seitenleiste und Inspektor - und optional ein Menü der Leiste.
 *
 * Die Faltbereiche ersatzlos wegzulassen wäre die schlechtere Wahl: ein
 * Selektor, der nichts mehr trifft, wirft nicht, er tut nur nichts - und der
 * Test bestünde weiter, ohne noch etwas zu prüfen.
 */
export async function openAllFolds(page, menue = null) {
  await page.evaluate(() => {
    /*
     * "#featureNavigator details" ist seit Etappe 7b noetig und der Grund, warum
     * dieser Selektor nicht raten darf: die Feature-Navigation baut je Feature
     * ein eigenes <details class="feature-card">, und das ist zu, solange das
     * Feature nicht ausgewaehlt ist. Bis 7b lag die Navigation in der
     * Seitenleiste, wo "#sidebar details" diese Karten mitoeffnete; seit dem
     * Umzug in den Inspektor trifft dort nichts mehr - ".inspector-fold" meint
     * nur den aeusseren Block.
     *
     * "#sidebar details" ist mit Etappe 7e entfallen: die Seitenleiste gibt es
     * nicht mehr. Ein Selektor, der nichts mehr treffen KANN, gehoert nicht
     * stehengelassen - er sieht beim naechsten Lesen wie eine Zusicherung aus.
     *
     * Genau der Fall, vor dem der Absatz oben warnt: der Selektor hat nicht
     * geworfen, er hat nur nichts mehr getan.
     */
    /*
     * ".tool-settings" stand hier bis zum 06.10.2026: die Einstellungen der
     * Umformwerkzeuge lagen eingeklappt unter ihrem Knopf. Sie stehen seitdem
     * offen im Block des gewaehlten Werkzeugs, und der Selektor koennte nichts
     * mehr treffen - er ist entfernt, wie "#sidebar details" vor ihm.
     */
    document.querySelectorAll(
      ".inspector-fold, #featureNavigator details"
    ).forEach((d) => d.setAttribute("open", ""));
  });

  if (menue) {
    await page.locator(".menu-title", { hasText: menue }).first().click();
    await page.locator(".menu-panel:not([hidden])").first()
      .waitFor({ state: "visible" });
  }
}

/**
 * Waehlt ein Umformwerkzeug in der Werkzeugleiste - seit dem 06.10.2026 der
 * Weg zu Begradigen, Reduzieren, Rechtwinklig und Glaetten. Ihre Knoepfe und
 * Einstellungen stehen nur im Inspektor, solange das Werkzeug gewaehlt ist;
 * vorher lagen sie im Faltblock "Umformen", den openAllFolds() oeffnete.
 *
 * Geklickt wird nur, wenn das Werkzeug noch nicht gewaehlt ist - ein zweiter
 * Klick waehlte es wieder ab. Danach wird zugesichert, dass sein Block
 * wirklich gezeichnet wird; steht er nicht da, bricht der Helfer den Lauf ab
 * wie createMenueBefehl(): der naechste Klick ginge auf einen Knopf, der nicht
 * gezeichnet wird, und wartete dreissig Sekunden.
 *
 * `name` ist der Name aus TRANSFORM_TOOLS ("straighten", "reduce", "rectify",
 * "smooth"); welcher Block dazugehoert, liest der Helfer aus derselben Liste
 * im Bestand und fuehrt ihn nicht ein zweites Mal.
 */
export function createUmformwerkzeug(page, check) {
  return async (name) => {
    const lage = await page.evaluate((n) => {
      const eintrag = typeof TRANSFORM_TOOLS === "undefined"
        ? null
        : TRANSFORM_TOOLS.find((t) => t.name === n);
      const knopf = eintrag ? document.getElementById(eintrag.button) : null;

      return {
        block: eintrag?.block ?? null,
        knopf: eintrag?.button ?? null,
        da: !!knopf,
        gewaehlt: knopf?.getAttribute("aria-pressed") === "true",
      };
    }, name);

    if (lage.da && !lage.gewaehlt) {
      await page.locator(`#${lage.knopf}`).click();
      await page.waitForTimeout(200);
    }

    const steht = lage.da && await page.evaluate(
      (id) => !!document.getElementById(id)?.checkVisibility(), lage.block);

    check(`Umformwerkzeug „${name}“ gewaehlt: sein Block steht im Inspektor`, steht,
      lage.da ? `#${lage.block} wird nicht gezeichnet` : "kein solches Werkzeug in der Leiste");

    if (!steht) {
      throw new Error(`Umformwerkzeug „${name}“: sein Block steht nicht da, Lauf abgebrochen.`);
    }

    return true;
  };
}

/**
 * Klickt einen Knopf, der gesperrt sein KANN - und klickt ihn nicht, wenn er
 * gesperrt ist.
 *
 * Eine gerissene check()-Zusicherung bricht den Lauf nicht ab; unmittelbar
 * danach klickt das Skript weiter, und der gesperrte Knopf liefert doch einen
 * Timeout. Der Helfer sichert deshalb zu UND kehrt bei gesperrtem Knopf mit
 * false zurueck, damit der Aufrufer den Abschnitt abbrechen kann.
 *
 * Er stand bis zum vierten Durchgang als lokale Fassung in test-merge.mjs.
 * Hier liegt er, damit es keine zweite Kopie gibt - dieselbe Regel wie bei
 * openAllFolds(). Die Fabrik bindet check(), das je Test eine eigene Closure
 * ist.
 */
export function createKlicker(page, check) {
  return async (selektor, name, grundSelektor = null) => {
    const frei = await page.locator(selektor).isEnabled();

    check(name, frei,
      grundSelektor
        ? await page.locator(grundSelektor).textContent()
        : `${selektor} ist gesperrt`);

    if (!frei) return false;

    await page.locator(selektor).click();
    return true;
  };
}


/**
 * Klickt einen Punktmarker - auch dann, wenn die Angaben zur Auswahl ihn
 * verdecken.
 *
 * Die Angaben stehen seit ihrem Umzug unten rechts ueber der Karte und fangen
 * dort jedes Zeigerereignis ab, sobald etwas ausgewaehlt ist. Ein Strg+Klick
 * auf einen Marker darunter liefe sonst dreissig Sekunden in "subtree
 * intercepts pointer events". Der Helfer geht den Weg, den ein Nutzer geht:
 * er klappt die Angaben ueber ihren GRIFF zu, klickt den Marker und klappt sie
 * danach wieder auf. Gemessen wird damit im selben Zustand wie ohne Helfer -
 * aufgeklappt -, und der Griff ist bei jedem solchen Klick mitbelegt.
 *
 * NUR die Angaben, nicht die Auswahlleiste links oben: fuer sie gilt die
 * Entscheidung aus dem einundzwanzigsten Durchgang - ein Test klappt sie nicht
 * zu, sondern waehlt die Reihenfolge (waehlePunkte() in test-merge.mjs).
 *
 * Verdeckt etwas anderes den Marker, wird NICHT geklickt: die Zusicherung
 * nennt, was dort liegt, und der Aufrufer bekommt false. Dieselbe Regel wie bei
 * createKlicker(). Die Zusicherung steht IMMER da, nicht nur im Fehlerfall -
 * eine, die man nur sieht, wenn sie reisst, belegt im Gutfall nichts.
 *
 * `ziel` ist ein Locator oder der Schluessel eines Markers (data-vertex-key).
 * Diese Fassung stand bis zum Umzug der Angaben als lokales markerKlicken() in
 * test-scale.mjs, ohne das Zuklappen; sie liegt jetzt hier, damit es keine
 * zweite Kopie gibt.
 */
export function createMarkerKlicker(page, check) {
  const lage = (marker) => marker.evaluate((m) => {
    const r = m.getBoundingClientRect();
    const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);

    return {
      key: m.dataset.vertexKey || "?",
      ok: oben === m,
      grund: oben ? (oben.id || oben.getAttribute("class") || oben.tagName) : "nichts",
      unterDenAngaben: !!oben && !!oben.closest("#selectionOverlay"),
    };
  });

  /* Aufklappen: ueber den Griff, solange er dasteht. Ist die Auswahl nach dem
     Klick leer, stehen die Angaben gar nicht da - dann wird nur der
     Ausgangszustand wiederhergestellt, damit die naechste Auswahl ihn hat. */
  const aufklappen = async () => {
    const griff = page.locator("#selectionOverlayHandle");

    if (await griff.isVisible()) {
      await griff.click();
    } else {
      await page.evaluate(() => {
        document.getElementById("selectionOverlay").open = true;
      });
    }

    await page.waitForTimeout(150);
  };

  return async (ziel, optionen = {}) => {
    const marker = typeof ziel === "string"
      ? page.locator(`circle.vertex[data-vertex-key="${ziel}"]`)
      : ziel;

    if ((await marker.count()) !== 1) {
      check(`der Marker ${typeof ziel === "string" ? ziel : "?"} ist getroffen`,
        false, `${await marker.count()} Marker statt einem`);
      return false;
    }

    let stand = await lage(marker);
    let zugeklappt = false;

    if (!stand.ok && stand.unterDenAngaben) {
      await page.locator("#selectionOverlayHandle").click();
      await page.waitForTimeout(150);
      zugeklappt = true;
      stand = await lage(marker);
    }

    check(`der Marker ${stand.key} ist getroffen`, stand.ok,
      zugeklappt ? `auch bei zugeklappten Angaben: ${stand.grund}` : stand.grund);

    if (stand.ok) await marker.click(optionen);
    if (zugeklappt) await aufklappen();

    return stand.ok;
  };
}


/** Kleiner Zähler für Zusicherungen, gemeinsam von beiden Tests genutzt. */
export function createChecker(toolName) {
  let failures = 0;

  return {
    check(label, condition, detail = "") {
      /*
       * Eine Zusicherung, die keinen Wahrheitswert prueft, kann nicht
       * reissen. Genau so bestand "und sie steht sichtbar da" ueber einen
       * ganzen Durchgang: elementGetroffen() liefert {ok, grund}, und ein
       * Objekt ist immer wahr. Das ist keine Formfrage - es ist dieselbe
       * Klasse wie "eine Zusicherung ueber ein Ausbleiben beweist nichts",
       * nur eine Ebene tiefer.
       */
      if (typeof condition !== "boolean") {
        failures++;
        console.error(
          `  FAIL ${label} - Bedingung ist kein Wahrheitswert, sondern ` +
          `${typeof condition}; diese Zusicherung koennte nicht reissen`
        );
        return;
      }

      if (condition) {
        console.log(`  ok   ${label}`);
        return;
      }

      failures++;
      console.error(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
    },
    get failures() {
      return failures;
    },
    finish(okMessage) {
      console.log(failures ? `\n${toolName}: FEHLGESCHLAGEN (${failures})` : `\n${toolName}: ${okMessage}`);
      process.exitCode = failures ? 1 : 0;
    },
  };
}
