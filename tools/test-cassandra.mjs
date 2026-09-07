#!/usr/bin/env node
// Zero-dependency Unit-Tests für die CaSSAndRA-Kompatibilität:
// Typ-Bezeichner, Anzeigename (label) und die Umrechnung zwischen der
// internen Relativdarstellung und absolutem WGS84.
//
// Die getesteten Funktionen werden direkt aus index.html extrahiert und in
// einem minimalen Sandkasten ausgeführt. Dadurch braucht das Projekt weiterhin
// kein Build-System und keinen Browser für diese Prüfungen.

import { existsSync, readFileSync } from "node:fs";
import { extractDeclarations, readInlineScript } from "./extract-script.mjs";

const NAMES = [
  "SUNRAY_FACTOR",
  "CASSANDRA_NAME_BY_TYPE",
  "FEATURE_TYPE_BY_NAME",
  "getFeatureType",
  "featureTypeState",
  "isSupportedFeature",
  "cassandraNameForFeature",
  "walkCoordinates",
  "collectCoords",
  "describeFeature",
  "DEGREE_METERS",
  "ABSOLUTE_WGS84_THRESHOLD",
  "ORIGIN_MATCH_TOLERANCE_METERS",
  "referenceOrigin",
  "originLonScale",
  "hasReferenceOrigin",
  "metersToAbsolute",
  "absoluteToMeters",
  "originDistanceMeters",
  "originsMatch",
  "formatOrigin",
  "originConflict",
  "isAbsoluteWgs84Collection",
  "convertCollectionCoordinates",
  "absoluteCollectionToRelative",
  "relativeCollectionToAbsolute",
  "REFERENCE_ORIGIN_STORAGE_KEY",
  "parseOrigin",
  "setReferenceOrigin",
  "readEmbeddedOrigin",
  "prepareImportedCollection",
  "buildExportCollection"
];

const store = new Map();
const sandbox = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  },
  data: null,
  scaleFactor: 111111,
};

const source = extractDeclarations(readInlineScript(), NAMES);
const factory = new Function(
  "localStorage",
  "data",
  "scaleFactor",
  `${source}\nreturn {${NAMES.join(",")}, setData:(value)=>{data=value;}, setScale:(value)=>{scaleFactor=value;}, getOrigin:()=>referenceOrigin};`
);

const app = factory(sandbox.localStorage, sandbox.data, sandbox.scaleFactor);

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
}

function near(actual, expected, tolerance = 1e-9) {
  return Math.abs(actual - expected) <= tolerance;
}

function feature(name, coordinates, extra = {}) {
  return {
    type: "Feature",
    properties: { name },
    geometry: { type: "LineString", coordinates },
    ...extra,
  };
}

/* -------------------------------------------------------------------- */
console.log("Typ-Bezeichner");

check("perimeter", app.getFeatureType(feature("perimeter", [])) === "perimeter");
check("exclusion", app.getFeatureType(feature("exclusion", [])) === "exclusion");
check("search wire", app.getFeatureType(feature("search wire", [])) === "searchwire");
check("searchwire alias", app.getFeatureType(feature("searchwire", [])) === "searchwire");
check("dockpoints", app.getFeatureType(feature("dockpoints", [])) === "dockpoints");
check("dock points alias", app.getFeatureType(feature("dock points", [])) === "dockpoints");
check("Groß-/Kleinschreibung", app.getFeatureType(feature("Perimeter", [])) === "perimeter");
check("unbekannt", app.getFeatureType(feature("mow path", [])) === "other");
check("ohne properties", app.getFeatureType({}) === "other");

console.log("Export-Bezeichner (CaSSAndRA-Vokabular)");

check("searchwire -> 'search wire'",
  app.cassandraNameForFeature(feature("searchwire", [])) === "search wire");
check("dock points -> 'dockpoints'",
  app.cassandraNameForFeature(feature("dock points", [])) === "dockpoints");
check("perimeter bleibt", app.cassandraNameForFeature(feature("perimeter", [])) === "perimeter");
check("exclusion bleibt", app.cassandraNameForFeature(feature("exclusion", [])) === "exclusion");
check("fremder Name bleibt erhalten",
  app.cassandraNameForFeature(feature("mow path", [])) === "mow path");

console.log("Unterstuetzte und nicht unterstuetzte Typen");

for (const name of ["perimeter", "exclusion", "search wire", "dockpoints", "searchwire", "dock points"]) {
  check(`"${name}" ist bearbeitbar`, app.isSupportedFeature(feature(name, [])));
  check(`"${name}" gilt als unterstuetzt`,
    app.featureTypeState(feature(name, [])) === "supported");
}

/*
 * Zwei fachlich verschiedene Faelle: ein gesetzter, aber unbekannter Name ist
 * eine falsche Behauptung (Fehler in der Validierung); ein fehlender Name ist
 * nur eine fehlende Angabe (Warnung). Beide sind gleichermassen nicht
 * bearbeitbar.
 */
const namedUnknown = feature("mow path", []);
check("unbekannter Name ist nicht bearbeitbar", !app.isSupportedFeature(namedUnknown));
check("unbekannter Name wird als solcher erkannt",
  app.featureTypeState(namedUnknown) === "unknown-name",
  app.featureTypeState(namedUnknown));

const noProperties = { type: "Feature", geometry: { type: "LineString", coordinates: [] } };
check("Feature ohne properties ist nicht bearbeitbar",
  !app.isSupportedFeature(noProperties));
check("Feature ohne properties gilt als fehlende Angabe",
  app.featureTypeState(noProperties) === "missing-name",
  app.featureTypeState(noProperties));

check("leerer Name gilt als fehlende Angabe",
  app.featureTypeState(feature("   ", [])) === "missing-name");
check("fehlender Name wird NICHT als unbekannter Name gemeldet",
  app.featureTypeState({ type: "Feature", properties: {} }) === "missing-name");

/* Nicht bearbeitbar heisst nicht "wird veraendert". */
check("fehlender Name wird beim Export nicht erfunden",
  app.cassandraNameForFeature(noProperties) === "");

console.log("Anzeigename (label)");

check("label hat Vorrang",
  app.describeFeature(feature("exclusion", [], { properties: { name: "exclusion", label: "Beet Nord" } })) === "Beet Nord");
check("ohne label wird abgeleitet",
  app.describeFeature(feature("perimeter", [])) === "Perimeter");
check("Exclusion mit idx",
  app.describeFeature(feature("exclusion", [], { idx: 2 })) === "Exclusion #2");
check("search wire Anzeige",
  app.describeFeature(feature("search wire", [])) === "Search wire");
check("leeres label wird ignoriert",
  app.describeFeature(feature("perimeter", [], { properties: { name: "perimeter", label: "  " } })) === "Perimeter");

/* -------------------------------------------------------------------- */
console.log("Koordinatenbezug");

check("cos(lat)-Skalierung",
  near(app.originLonScale(52), 111111 * Math.cos((52 * Math.PI) / 180), 1e-6));
check("cos(0) = 1", near(app.originLonScale(0), 111111, 1e-9));

const origin = { lat: 52.5, lon: 13.4 };

const [lon, lat] = app.metersToAbsolute(100, 200, origin);
check("100 m Ost verschiebt Länge",
  near(lon, 13.4 + 100 / (111111 * Math.cos((52.5 * Math.PI) / 180)), 1e-12));
check("200 m Nord verschiebt Breite", near(lat, 52.5 + 200 / 111111, 1e-12));

const [east, north] = app.absoluteToMeters(lon, lat, origin);
check("Meter-Rundlauf Ost", near(east, 100, 1e-6));
check("Meter-Rundlauf Nord", near(north, 200, 1e-6));

check("absolute Karte erkannt",
  app.isAbsoluteWgs84Collection({ features: [feature("perimeter", [[13.4, 52.5]])] }));
check("relative Karte nicht als absolut erkannt",
  !app.isAbsoluteWgs84Collection({ features: [feature("perimeter", [[-0.00017, -0.00007]])] }));
check("leere Karte ist nicht absolut",
  !app.isAbsoluteWgs84Collection({ features: [] }));

/* -------------------------------------------------------------------- */
console.log("Rundlauf relativ -> absolut -> relativ");

function relativeMap() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [0, 0],
            [0.00018, 0],
            [0.00018, 0.00027],
            [0, 0.00027],
            [0, 0],
          ]],
        },
      },
      feature("search wire", [[0.00002, 0.00002], [0.00009, 0.00011]]),
    ],
  };
}

function allPoints(collection) {
  return app.collectCoords(collection);
}

for (const testOrigin of [{ lat: 0, lon: 0 }, { lat: 52.5, lon: 13.4 }, { lat: -33.9, lon: 151.2 }]) {
  const before = allPoints(relativeMap());
  const roundTripped = relativeMap();

  app.relativeCollectionToAbsolute(roundTripped, testOrigin, 111111);
  app.absoluteCollectionToRelative(roundTripped, testOrigin);

  const after = allPoints(roundTripped);
  const worst = Math.max(
    ...before.map((point, index) =>
      Math.max(
        Math.abs(point[0] - after[index][0]),
        Math.abs(point[1] - after[index][1])
      )
    )
  );

  check(
    `Rundlauf verlustfrei (lat0=${testOrigin.lat})`,
    worst * 111111 < 1e-6,
    `Abweichung ${(worst * 111111).toExponential(2)} m`
  );
}

const identity = relativeMap();
app.relativeCollectionToAbsolute(identity, { lat: 0, lon: 0 }, 111111);
check("lat0=lon0=0 laesst Relativkarte unveraendert",
  JSON.stringify(identity) === JSON.stringify(relativeMap()));

/* -------------------------------------------------------------------- */
console.log("Bezugspunkt");

check("gueltige Position", app.parseOrigin("52.5", "13.4")?.lat === 52.5);
check("Breite ausserhalb des Bereichs", app.parseOrigin("95", "13.4") === null);
check("Laenge ausserhalb des Bereichs", app.parseOrigin("52.5", "200") === null);
check("keine Zahl", app.parseOrigin("abc", "13.4") === null);
check("eingebetteter Bezugspunkt",
  app.readEmbeddedOrigin({ referenceOrigin: { lat: 52.5, lon: 13.4 } })?.lon === 13.4);
check("fehlender Bezugspunkt", app.readEmbeddedOrigin({}) === null);

/* -------------------------------------------------------------------- */
console.log("Import");

const relativeImport = relativeMap();
check("relative Karte wird nicht umgerechnet",
  app.prepareImportedCollection(relativeImport).absolute === false);

const absoluteImport = {
  type: "FeatureCollection",
  referenceOrigin: { lat: 52.5, lon: 13.4 },
  features: [feature("perimeter", [[13.4, 52.5], [13.4005, 52.5008]])],
};

const importResult = app.prepareImportedCollection(absoluteImport);
check("absolute Karte erkannt", importResult.absolute === true);
check("eingebetteter Bezugspunkt uebernommen", importResult.derivedOrigin === false);

const importedPoints = allPoints(absoluteImport);
check("erster Punkt liegt im Ursprung",
  near(importedPoints[0][0], 0, 1e-12) && near(importedPoints[0][1], 0, 1e-12));
check("Karte liegt nach dem Import relativ vor",
  !app.isAbsoluteWgs84Collection(absoluteImport));

/* -------------------------------------------------------------------- */
console.log("Bezugspunkt-Konflikt");

const baseOrigin = { lat: 52.5, lon: 13.4 };

check("identische Bezugspunkte passen zusammen",
  app.originsMatch(baseOrigin, { lat: 52.5, lon: 13.4 }));

/*
 * Knapp unterhalb der Toleranz: 0.005 m nach Norden. Ein Grad Breite sind
 * DEGREE_METERS Meter, also ist 0.005 / DEGREE_METERS ein halber Zentimeter.
 */
const halfCentimetreNorth = {
  lat: 52.5 + 0.005 / app.DEGREE_METERS,
  lon: 13.4,
};

check("Rundungsrauschen gilt als derselbe Standort",
  app.originsMatch(baseOrigin, halfCentimetreNorth));
check("Abstand unter der Toleranz",
  app.originDistanceMeters(baseOrigin, halfCentimetreNorth) < app.ORIGIN_MATCH_TOLERANCE_METERS);

/* Knapp oberhalb: 2 cm nach Norden. */
const twoCentimetresNorth = {
  lat: 52.5 + 0.02 / app.DEGREE_METERS,
  lon: 13.4,
};

check("2 cm gelten als abweichender Standort",
  !app.originsMatch(baseOrigin, twoCentimetresNorth));

/*
 * Ost-West muss die cos(lat)-Skalierung berücksichtigen: ein Längengrad ist
 * auf 52.5 Grad Breite nur cos(52.5) so lang wie ein Breitengrad.
 */
const oneMetreEast = {
  lat: 52.5,
  lon: 13.4 + 1 / app.originLonScale(52.5),
};

check("Ost-West-Abstand nutzt cos(lat)",
  near(app.originDistanceMeters(baseOrigin, oneMetreEast), 1, 1e-6),
  String(app.originDistanceMeters(baseOrigin, oneMetreEast)));

check("kein Konflikt ohne Datei-Bezugspunkt",
  app.originConflict(null, baseOrigin) === null);
check("kein Konflikt bei passendem Bezugspunkt",
  app.originConflict(halfCentimetreNorth, baseOrigin) === null);

const conflict = app.originConflict(twoCentimetresNorth, baseOrigin);
check("Konflikt bei abweichendem Bezugspunkt", conflict !== null);
check("Konflikt nennt den Abstand",
  conflict && near(conflict.distance, 0.02, 1e-6), String(conflict?.distance));
check("Konflikt nennt beide Bezugspunkte",
  conflict?.fileOrigin.lat === twoCentimetresNorth.lat &&
  conflict?.activeOrigin.lat === baseOrigin.lat);

check("formatOrigin ist stabil",
  app.formatOrigin({ lat: 52.5, lon: 13.4 }) === "52.500000 / 13.400000");

/* -------------------------------------------------------------------- */
console.log("Import mit widersprechendem Bezugspunkt");

/* Ausgangslage: aktiver Bezugspunkt ist die RTK-Basis der ersten Karte. */
app.setReferenceOrigin(baseOrigin);

function absoluteMapAt(origin) {
  return {
    type: "FeatureCollection",
    referenceOrigin: { lat: origin.lat, lon: origin.lon },
    features: [feature("perimeter", [[origin.lon, origin.lat]])],
  };
}

/* Eine zweite Karte nennt eine deutlich andere Basis (rund 1.1 km noerdlich). */
const otherBase = { lat: 52.51, lon: 13.4 };

const guarded = absoluteMapAt(otherBase);
const guardedFrame = app.prepareImportedCollection(guarded, { keepActiveOrigin: true });

check("abweichender Bezugspunkt wird gemeldet", guardedFrame.conflict !== null);
check("Datei-Bezugspunkt bleibt am Ergebnis haengen",
  guardedFrame.fileOrigin?.lat === otherBase.lat);
check("aktiver Bezugspunkt wurde NICHT ueberschrieben",
  app.getOrigin().lat === baseOrigin.lat,
  `referenceOrigin.lat=${app.getOrigin().lat}`);
check("gemeldeter Abstand stimmt",
  near(guardedFrame.conflict.distance, 0.01 * app.DEGREE_METERS, 1e-3),
  String(guardedFrame.conflict?.distance));

/* Ohne Schutz - kein anderer Slot geladen - wird weiterhin uebernommen. */
app.setReferenceOrigin(baseOrigin);

const unguarded = absoluteMapAt(otherBase);
const unguardedFrame = app.prepareImportedCollection(unguarded, { keepActiveOrigin: false });

check("ohne geladene Zweitkarte kein Konflikt", unguardedFrame.conflict === null);
check("ohne geladene Zweitkarte wird uebernommen",
  app.getOrigin().lat === otherBase.lat);

/* Passender Bezugspunkt erzeugt auch mit Schutz keinen Konflikt. */
app.setReferenceOrigin(baseOrigin);

const matching = absoluteMapAt(halfCentimetreNorth);
const matchingFrame = app.prepareImportedCollection(matching, { keepActiveOrigin: true });

check("passender Bezugspunkt ist kein Konflikt", matchingFrame.conflict === null);

/* -------------------------------------------------------------------- */
console.log("Exportsperre bei Bezugspunkt-Konflikt");

app.setData({
  type: "FeatureCollection",
  features: [feature("perimeter", [[0, 0], [0.00001, 0.00001]])],
});

app.setReferenceOrigin(baseOrigin);

check("Export ohne Datei-Bezugspunkt laeuft",
  app.buildExportCollection(true, null) !== null);
check("Export bei passendem Bezugspunkt laeuft",
  app.buildExportCollection(true, halfCentimetreNorth) !== null);
check("absoluter Export bei Konflikt wird verweigert",
  app.buildExportCollection(true, otherBase) === null);

/*
 * Der relative Pfad ist nicht der harmlosere, sondern der leisere: eine gegen
 * X gerechnete Relativkarte liegt auf einem Roboter mit Basis Y um X-Y daneben,
 * ohne dass die Datei irgendeinen Hinweis darauf enthielte. Deshalb ebenfalls
 * gesperrt.
 */
check("relativer Export bei Konflikt wird ebenfalls verweigert",
  app.buildExportCollection(false, otherBase) === null);
check("relativer Export ohne Konflikt laeuft",
  app.buildExportCollection(false, null) !== null);

/* Nutzer traegt den Bezugspunkt der Datei ein - danach laeuft der Export. */
app.setReferenceOrigin(otherBase);

check("absoluter Export nach Aufloesen wieder moeglich",
  app.buildExportCollection(true, otherBase) !== null);
check("relativer Export nach Aufloesen wieder moeglich",
  app.buildExportCollection(false, otherBase) !== null);
check("Export schreibt danach den aufgeloesten Bezugspunkt",
  app.buildExportCollection(true, otherBase).referenceOrigin?.lat === otherBase.lat);

/* -------------------------------------------------------------------- */
console.log("Export");

app.setData({
  type: "FeatureCollection",
  features: [
    feature("searchwire", [[0.00002, 0.00002], [0.00009, 0.00011]]),
    feature("dock points", [[0, 0], [0.00001, 0], [0.00002, 0]]),
    feature("mow path", [[0, 0]]),
  ],
});

app.setReferenceOrigin({ lat: 52.5, lon: 13.4 });

const exportedRelative = app.buildExportCollection(false);
check("Export normalisiert 'searchwire'",
  exportedRelative.features[0].properties.name === "search wire");
check("Export normalisiert 'dock points'",
  exportedRelative.features[1].properties.name === "dockpoints");
check("Export laesst fremdes Feature unveraendert",
  exportedRelative.features[2].properties.name === "mow path");
check("Export schreibt Bezugspunkt",
  exportedRelative.referenceOrigin?.lat === 52.5);
check("relativer Export bleibt relativ",
  !app.isAbsoluteWgs84Collection(exportedRelative));

const exportedAbsolute = app.buildExportCollection(true);
check("absoluter Export liefert WGS84",
  app.isAbsoluteWgs84Collection(exportedAbsolute));
check("absoluter Export normalisiert ebenfalls",
  exportedAbsolute.features[0].properties.name === "search wire");

/* Der Export darf die Arbeitskopie weder umbenennen noch verschieben. */
const workingCopy = app.buildExportCollection(false);
app.buildExportCollection(true);
check("Export veraendert die Arbeitskopie nicht",
  JSON.stringify(app.buildExportCollection(false)) === JSON.stringify(workingCopy));

/* -------------------------------------------------------------------- */
const sampleMap = new URL("../test/herbine_2025_1.json", import.meta.url);

if (existsSync(sampleMap)) {
  console.log("Rundlauf mit lokaler Beispielkarte (nicht im Repository)");

  const sample = JSON.parse(readFileSync(sampleMap, "utf8"));
  const sampleOrigin = { lat: 52.5, lon: 13.4 };
  const before = app.collectCoords(sample).map((point) => [...point]);

  check("Beispielkarte liegt relativ vor", !app.isAbsoluteWgs84Collection(sample));

  app.relativeCollectionToAbsolute(sample, sampleOrigin, 111111);
  app.absoluteCollectionToRelative(sample, sampleOrigin);

  const after = app.collectCoords(sample);
  const worst = Math.max(
    ...before.map((point, index) =>
      Math.max(
        Math.abs(point[0] - after[index][0]),
        Math.abs(point[1] - after[index][1])
      )
    )
  );

  check("Rundlauf der Beispielkarte verlustfrei", worst * 111111 < 1e-6,
    `Abweichung ${(worst * 111111).toExponential(2)} m`);
} else {
  console.log("Rundlauf mit lokaler Beispielkarte: uebersprungen (keine Datei unter test/)");
}

/* -------------------------------------------------------------------- */
console.log(
  failures === 0
    ? "\ntest-cassandra: alle Pruefungen bestanden."
    : `\ntest-cassandra: FEHLGESCHLAGEN (${failures})`
);

process.exitCode = failures === 0 ? 0 : 1;
