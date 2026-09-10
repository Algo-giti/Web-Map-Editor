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
 * Löst einen Menübefehl aus: Menü öffnen, Eintrag anklicken.
 *
 * Der Helfer kapselt AUSSCHLIESSLICH diese beiden Gesten. Das Lauschen auf
 * `download` oder `dialog` bleibt beim Aufrufer und muss dort weiterhin VOR
 * dem Aufruf stehen - ein Ereignis, auf das erst nach dem Auslösen gehört
 * wird, ist verloren.
 *
 * Ein Eintrag ist nur im offenen Menü sichtbar; Playwright verlangt
 * Sichtbarkeit für click(). Genau deshalb gibt es den Helfer: sonst stünde
 * dieselbe Geste an über einem Dutzend Stellen.
 */
export async function menueBefehl(page, menue, eintrag) {
  const titel = page.locator(".menu-title", { hasText: menue }).first();
  await titel.click();

  const panel = page.locator(".menu-panel:not([hidden])").first();
  await panel.waitFor({ state: "visible" });

  await panel.locator(".menu-item", { hasText: eintrag }).first().click();

  /*
   * Ein Kontrollkästchen lässt das Menü bewusst offen - wer eine Ebene
   * ausschaltet, will oft gleich die nächste. Für den Test ist ein offenes
   * Panel über der Karte aber ein Hindernis, deshalb hier zumachen.
   */
  if (await page.locator(".menu-panel:not([hidden])").count()) {
    await page.keyboard.press("Escape");
    await page.locator(".menu-panel:not([hidden])").first()
      .waitFor({ state: "hidden" })
      .catch(() => {});
  }
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
    document.querySelectorAll(
      ".inspector-fold, .tool-settings, #featureNavigator details"
    ).forEach((d) => d.setAttribute("open", ""));
  });

  if (menue) {
    await page.locator(".menu-title", { hasText: menue }).first().click();
    await page.locator(".menu-panel:not([hidden])").first()
      .waitFor({ state: "visible" });
  }
}

/** Kleiner Zähler für Zusicherungen, gemeinsam von beiden Tests genutzt. */
export function createChecker(toolName) {
  let failures = 0;

  return {
    check(label, condition, detail = "") {
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
