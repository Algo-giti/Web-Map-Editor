#!/usr/bin/env node
// Zero-dependency Unit-Tests für die CaSSAndRA-Kompatibilität:
// Typ-Bezeichner, Anzeigename (label) und die Umrechnung zwischen der
// internen Relativdarstellung und absolutem WGS84.
//
// Die getesteten Funktionen werden direkt aus index.html extrahiert und in
// einem minimalen Sandkasten ausgeführt. Dadurch braucht das Projekt weiterhin
// kein Build-System und keinen Browser für diese Prüfungen.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extractDeclarations, readInlineScript } from "./extract-script.mjs";

const NAMES = [
  /*
   * Seit die Meterausgaben des Pruefberichts ueber formatMeters() laufen,
   * braucht validateMapData() die Funktion - und sie liest die Sprache aus
   * currentLanguage. Beide gehoeren deshalb in den Sandkasten; sonst bricht
   * der Test mit "formatMeters is not defined" ab. Seit Schritt 1 stuetzt
   * sich formatMeters() auf formatNumber() - die eine Stelle, an der eine
   * Zahl ihr Format bekommt -, also gehoert auch die dazu.
   */
  "currentLanguage",
  "formatNumber",
  "formatMeters",
  "SUNRAY_FACTOR",
  "CASSANDRA_NAME_BY_TYPE",
  "FEATURE_TYPE_BY_NAME",
  "getFeatureType",
  "featureTypeState",
  "isSupportedFeature",
  "cassandraNameForFeature",
  "walkCoordinates",
  "collectCoords",
  "coordinatesEqual",
  "getAtPath",
  "isDockFeature",
  "isSearchWireFeature",
  "layerName",
  "collectionExtent",
  "classifyCoordinateScale",
  "hasKnownScale",
  "scaleUnitLabel",
  "SCALE_METRIC_MIN_EXTENT",
  "SCALE_RELATIVE_MAX_EXTENT",
  "scaleFactorForData",
  "toWorld",
  "polygonAreaMeters",
  "geometryCoordinateSequences",
  "computeBoundsForData",
  "validateMapData",
  /* Seit dem vierten Durchgang haelt ein Befund seine Rohwerte; die
     Textlisten von validateMapData() sind daraus abgeleitet. */
  "BEFUND_TEXTE",
  "befundText",
  "pruefErgebnis",
  "GEOMETRY_EPSILON_AREA",
  "GEOMETRY_CHECK_PAIR_BUDGET",
  "turnDirection",
  "segmentsProperlyIntersect",
  "pointInRing",
  "closestPointOnSegment",
  "pointSegmentDistance",
  "segmentDistance",
  "sequenceBounds",
  "boundsOverlap",
  "edgeCount",
  "edgeAt",
  "spendPair",
  "ringSelfIntersections",
  "ringRelation",
  "narrowGaps",
  "pointIsMowable",
  "getUniqueOuterRing",
  "mowerWidth",
  "collectGeometryFindings",
  "isUsableCoordinate",
  "usableCoordinates",
  "countLineFeaturePoints",
  "isEmptyLineFeature",
  "I18N_EN",
  "I18N_PATTERNS",
  "I18N_LABEL_PREFIXES",
  "normalizeI18nText",
  "translateHistoryLabel",
  "translateGermanText",
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
  "parseScale",
  "readEmbeddedScale",
  "scaleModeForFactor",
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

  /*
   * validateMapData() entscheidet anhand des Modus, ob es Meterangaben machen
   * darf. Der Modus ist eine globale Variable und wird deshalb - wie data und
   * scaleFactor - als Parameter in den Sandkasten gereicht.
   */
  coordMode: "sunray-relative",
};

const source = extractDeclarations(readInlineScript(), NAMES);
const factory = new Function(
  "localStorage",
  "data",
  "scaleFactor",
  "coordMode",
  `${source}\nreturn {${NAMES.join(",")}, setData:(value)=>{data=value;}, setScale:(value)=>{scaleFactor=value;}, setCoordMode:(value)=>{coordMode=value;}, getOrigin:()=>referenceOrigin};`
);

const app = factory(sandbox.localStorage, sandbox.data, sandbox.scaleFactor, sandbox.coordMode);

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

console.log("Docking-Pfad: freie Punktzahl");

/*
 * Weder CaSSAndRA noch die Sunray-Firmware schreiben eine Punktzahl vor
 * (Belege in CLAUDE.md, Abschnitt 5). Geprueft wird deshalb die echte
 * validateMapData(), nicht eine Nachbildung der Regel.
 */
function mapWithDock(pointCount) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0]]],
        },
      },
      feature(
        "dockpoints",
        Array.from({ length: pointCount }, (_, index) => [index * 0.00001, 0])
      ),
    ],
  };
}

function dockMessages(pointCount) {
  const result = app.validateMapData(mapWithDock(pointCount));
  const relevant = (list) => list.filter((message) => message.includes("Docking-Pfad"));

  return {
    errors: relevant(result.errors),
    warnings: relevant(result.warnings),
  };
}

/* Die Testkarte darf ausser dem Dockpfad keine Befunde erzeugen. */
const baseline = app.validateMapData(mapWithDock(3));
check("Testkarte ist ansonsten fehlerfrei",
  baseline.errors.length === 0, JSON.stringify(baseline.errors));

const emptyDock = dockMessages(0);
check("leerer Dockpfad ist nur eine Warnung",
  emptyDock.errors.length === 0 && emptyDock.warnings.length === 1,
  JSON.stringify(emptyDock));

const singleDock = dockMessages(1);
check("ein einzelner Punkt ist ein Fehler",
  singleDock.errors.length === 1 && singleDock.warnings.length === 0,
  JSON.stringify(singleDock));
check("der Fehler nennt die Mindestanzahl",
  singleDock.errors[0].includes("mindestens 2"), singleDock.errors[0]);

const twoDock = dockMessages(2);
check("zwei Punkte sind gueltig", twoDock.errors.length === 0, JSON.stringify(twoDock));
check("zwei Punkte erzeugen den Praxis-Hinweis",
  twoDock.warnings.length === 1 && twoDock.warnings[0].includes("üblicherweise"),
  JSON.stringify(twoDock));

/* Der Fall, der bestehende Nutzer betrifft: unveraendertes Verhalten bei 3. */
const threeDock = dockMessages(3);
check("drei Punkte sind gueltig und ohne Warnung",
  threeDock.errors.length === 0 && threeDock.warnings.length === 0,
  JSON.stringify(threeDock));

const fiveDock = dockMessages(5);
check("fuenf Punkte sind gueltig", fiveDock.errors.length === 0, JSON.stringify(fiveDock));
check("fuenf Punkte erzeugen eine Warnung, keinen Fehler",
  fiveDock.warnings.length === 1 && fiveDock.warnings[0].includes("5 Punkte"),
  JSON.stringify(fiveDock));

/* Keine Obergrenze: auch ein sehr langer Pfad bleibt gueltig. */
const longDock = dockMessages(40);
check("keine Obergrenze", longDock.errors.length === 0, JSON.stringify(longDock));

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
console.log("Massstabserkennung");

/*
 * Entscheidend ist die AUSDEHNUNG, nicht der Betrag. Eine WGS84-Mähkarte ist
 * zwangsläufig winzig ausgedehnt (200 m = 0,0018 Grad), eine Meterkarte
 * zwangsläufig gross. Der Betrag trennt danach nur noch absolut von relativ.
 */
const DEG = 111111;

function box(sizeMetres, divisor, offset = 0) {
  const s = sizeMetres / divisor;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "perimeter" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [offset, offset], [offset + s, offset],
            [offset + s, offset + s], [offset, offset + s],
            [offset, offset],
          ]],
        },
      },
    ],
  };
}

const modeOf = (map) => app.classifyCoordinateScale(map).mode;

check("Sunray relativ, 200 m", modeOf(box(200, DEG)) === "sunray-relative",
  modeOf(box(200, DEG)));
check("Sunray relativ, kleiner Garten 8 m",
  modeOf(box(8, DEG)) === "sunray-relative");
check("Sunray relativ, 5 km bleibt erkannt",
  modeOf(box(5000, DEG)) === "sunray-relative", modeOf(box(5000, DEG)));

check("absolutes WGS84 bei Berlin",
  modeOf(box(200, DEG, 13.4)) === "absolute", modeOf(box(200, DEG, 13.4)));

/*
 * Der eigentliche Fix: eine Karte, deren Zahlen schlicht Meter sind, wurde
 * früher als absolutes WGS84 gelesen und beim Import mit 111111 multipliziert.
 */
check("Meterkarte 200 m ist keine Gradkarte",
  modeOf(box(200, 1)) === "metric-assumed", modeOf(box(200, 1)));
check("Meterkarte 8 m ist keine Gradkarte",
  modeOf(box(8, 1)) === "metric-assumed", modeOf(box(8, 1)));
check("Meterkarte mit Versatz bleibt metrisch",
  modeOf(box(200, 1, 1000)) === "metric-assumed", modeOf(box(200, 1, 1000)));

/* Zweifelsfall: keine Lesart plausibel. */
check("winziges Feld von 0,5 m ist ein Zweifelsfall",
  modeOf(box(0.5, 1)) === "ambiguous", modeOf(box(0.5, 1)));
check("Relativkarte von 15 km ist ein Zweifelsfall",
  modeOf(box(15000, DEG)) === "ambiguous", modeOf(box(15000, DEG)));

/*
 * Die frühere Erkennung prüfte auf Zentimeter-Genauigkeit und kippte, sobald
 * Punkte frei gesetzt wurden. Die Ausdehnung ändert sich dadurch nicht.
 */
const edited = box(200, DEG);
edited.features[0].geometry.coordinates[0][1] = [200.001234 / DEG, 0.0007891 / DEG];
edited.features[0].geometry.coordinates[0][2] = [200.004321 / DEG, 200.001111 / DEG];
check("frei gesetzte Punkte kippen den Modus nicht",
  modeOf(edited) === "sunray-relative", modeOf(edited));

/* Der Faktor folgt dem Modus. */
check("Faktor relativ", app.classifyCoordinateScale(box(200, DEG)).metersPerUnit === DEG);
check("Faktor metrisch", app.classifyCoordinateScale(box(200, 1)).metersPerUnit === 1);
check("Faktor Zweifelsfall", app.classifyCoordinateScale(box(0.5, 1)).metersPerUnit === 1);

/* Beide Lesarten werden für die Meldung mitgeliefert. */
const doubt = app.classifyCoordinateScale(box(0.5, 1));
check("Zweifelsfall nennt die metrische Grösse",
  near(doubt.metricSizeMeters, Math.hypot(0.5, 0.5), 1e-9), String(doubt.metricSizeMeters));
check("Zweifelsfall nennt die relative Grösse",
  near(doubt.relativeSizeMeters, Math.hypot(0.5, 0.5) * DEG, 1e-3),
  String(doubt.relativeSizeMeters));

/* Randfälle. */
check("leere Karte", app.classifyCoordinateScale({ type: "FeatureCollection", features: [] }).empty === true);
check("Schwellen sind geordnet",
  app.SCALE_RELATIVE_MAX_EXTENT < app.SCALE_METRIC_MIN_EXTENT);

/* isAbsoluteWgs84Collection folgt jetzt derselben Klassifikation. */
check("Meterkarte gilt nicht mehr als absolut",
  app.isAbsoluteWgs84Collection(box(200, 1)) === false);
check("echte Gradkarte gilt weiterhin als absolut",
  app.isAbsoluteWgs84Collection(box(200, DEG, 13.4)) === true);

console.log("Massstab in der Datei");

check("gueltiger Massstab", app.parseScale(111111)?.metersPerUnit === 111111);
check("Massstab 1 ist gueltig", app.parseScale(1)?.metersPerUnit === 1);
check("null wird abgelehnt", app.parseScale(0) === null);
check("negativ wird abgelehnt", app.parseScale(-5) === null);
check("keine Zahl wird abgelehnt", app.parseScale("abc") === null);
check("fehlendes Feld", app.readEmbeddedScale({}) === null);
check("Feld wird gelesen",
  app.readEmbeddedScale({ coordinateScale: { metersPerUnit: 1 } })?.metersPerUnit === 1);

check("Faktor 111111 ist relativ", app.scaleModeForFactor(111111) === "sunray-relative");
check("Faktor 1 ist metrisch (angenommen)", app.scaleModeForFactor(1) === "metric-assumed");

/*
 * Der eigentliche Zweck: der Wert in der Datei schlaegt jede Heuristik. Eine
 * Karte, die die Groessenordnungspruefung als metrisch einstufen wuerde, wird
 * mit hinterlegtem Massstab als relativ gelesen.
 */
const declared = box(200, 1);
declared.coordinateScale = { metersPerUnit: 111111 };
check("Heuristik wuerde metrisch sagen",
  app.classifyCoordinateScale(declared).mode === "metric-assumed");
check("Datei-Massstab schlaegt Heuristik",
  app.prepareImportedCollection(declared, {}).scaleMode === "sunray-relative",
  app.prepareImportedCollection(declared, {}).scaleMode);

/* -------------------------------------------------------------------- */
console.log("Zusicherungen im Export");

app.setData({
  type: "FeatureCollection",
  features: [feature("perimeter", [[0, 0], [0.00001, 0], [0.00001, 0.00001], [0, 0]])],
});
app.setReferenceOrigin({ lat: 52.5, lon: 13.4 });

app.setCoordMode("sunray-relative");
app.setScale(111111);
const known = app.buildExportCollection(false, null);
check("bei bekanntem Massstab wird der Bezugspunkt geschrieben",
  known.referenceOrigin?.lat === 52.5);
check("bei bekanntem Massstab wird der Massstab geschrieben",
  known.coordinateScale?.metersPerUnit === 111111,
  JSON.stringify(known.coordinateScale));

/*
 * Bei unbekanntem Massstab darf keine Zusicherung in die Datei, die sie nicht
 * einloest - weder ein Bezugspunkt noch ein Massstab.
 */
app.setCoordMode("unknown");
const unknown = app.buildExportCollection(false, null);
check("bei unbekanntem Massstab kein Bezugspunkt",
  unknown.referenceOrigin === undefined, JSON.stringify(unknown.referenceOrigin));
check("bei unbekanntem Massstab kein Massstab",
  unknown.coordinateScale === undefined, JSON.stringify(unknown.coordinateScale));
check("absoluter Export bei unbekanntem Massstab verweigert",
  app.buildExportCollection(true, null) === null);

/* -------------------------------------------------------------------- */
console.log("Kartenpruefung bei unbekanntem Massstab");

const mapForCheck = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "perimeter" },
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [0.7, 0], [0.7, 0.7], [0, 0.7], [0, 0]]],
      },
    },
  ],
};

app.setCoordMode("unknown");
const unknownReport = app.validateMapData(mapForCheck);

check("keine Flaeche wird behauptet",
  !unknownReport.info.some((m) => /Perimeterfläche: [\d.]+ m²/.test(m)),
  JSON.stringify(unknownReport.info));
check("stattdessen wird gesagt, dass nicht gerechnet werden konnte",
  unknownReport.info.some((m) => m.includes("konnte nicht berechnet werden")),
  JSON.stringify(unknownReport.info));
check("die Segmentpruefung meldet ihre Einschraenkung",
  unknownReport.info.some((m) => m.includes("Segmentprüfung")),
  JSON.stringify(unknownReport.info));

app.setCoordMode("sunray-relative");
const knownReport = app.validateMapData(mapForCheck);
check("bei bekanntem Massstab wird die Flaeche genannt",
  knownReport.info.some((m) => m.startsWith("Perimeterfläche:") && m.includes("m²")),
  JSON.stringify(knownReport.info));
check("und die Segmentpruefung meldet keine Einschraenkung",
  !knownReport.info.some((m) => m.includes("Segmentprüfung")));

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

/*
 * formatOrigin() folgt seit Schritt 1 der Oberflaechensprache - es laeuft
 * ueber formatNumber() statt ueber toFixed(). Im Sandkasten steht
 * currentLanguage auf dem Startwert "de", der Bezugspunkt erscheint hier also
 * mit Komma. Die englische Fassung ist im Browser zugesichert
 * (tools/test-origin-conflict.mjs): der Sandkasten haelt Werte, keine
 * lebenden Bindungen, die Sprache laesst sich hier nicht umschalten.
 */
check("formatOrigin ist stabil und folgt der Sprache",
  app.formatOrigin({ lat: 52.5, lon: 13.4 }) === "52,500000 / 13,400000",
  app.formatOrigin({ lat: 52.5, lon: 13.4 }));

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
/*
 * Lokale Beispielkarten, falls vorhanden. Der Ordner test/ ist ueber
 * .gitignore ausgeschlossen und enthaelt echte Nutzerkarten; er gehoert NICHT
 * zu einem frischen Checkout, und das Ueberspringen ist deshalb kein Fehler.
 *
 * Gesucht wird nach IRGENDEINER .json/.geojson in diesem Ordner, nicht nach
 * einem bestimmten Namen. Vorher stand hier ein fester Dateiname - und damit
 * der Name einer privaten Karte in einer versionierten Datei, was die
 * Privatsphaere-Regel ausdruecklich verbietet ("niemals ... Dateinamen ... in
 * versionierte Dateien einbetten"). check-privacy.mjs findet das nicht: es
 * sucht nach Kartendateien, nicht nach Namen darin.
 *
 * Nebenwirkung, die den Fall zugleich besser macht: der Test haengt nicht mehr
 * an einer Datei, die nur eine Person hat. Wer irgendeine Karte dort ablegt,
 * bekommt den Rundlauf - und bei mehreren laeuft er ueber jede einzelne.
 */
const sampleDir = new URL("../test/", import.meta.url);
const sampleMaps = existsSync(sampleDir)
  ? readdirSync(sampleDir)
      .filter((name) => /\.(geojson|json)$/i.test(name))
      .sort()
  : [];

if (sampleMaps.length === 0) {
  console.log("Rundlauf mit lokalen Beispielkarten: uebersprungen (keine Datei unter test/)");
} else {
  console.log(`Rundlauf mit lokalen Beispielkarten (nicht im Repository): ${sampleMaps.length}`);
}

for (const name of sampleMaps) {
  const sample = JSON.parse(readFileSync(new URL(name, sampleDir), "utf8"));

  /*
   * Der Dateiname wird bewusst NICHT ausgegeben - er koennte selbst privat
   * sein. Gezaehlt wird stattdessen die Position in der sortierten Liste.
   */
  const nr = sampleMaps.indexOf(name) + 1;
  const sampleOrigin = { lat: 52.5, lon: 13.4 };
  const before = app.collectCoords(sample).map((point) => [...point]);

  check(`Beispielkarte ${nr} liegt relativ vor`, !app.isAbsoluteWgs84Collection(sample));

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

  check(`Rundlauf der Beispielkarte ${nr} verlustfrei`, worst * 111111 < 1e-6,
    `Abweichung ${(worst * 111111).toExponential(2)} m`);
}

/* -------------------------------------------------------------------- */
console.log("Uebersetzungsmuster: Reihenfolge");

/*
 * I18N_PATTERNS wird von oben nach unten durchsucht und beim ERSTEN Treffer
 * abgebrochen. Steht ein allgemeines Muster vor einem spezielleren, greift das
 * falsche: "1 Fehler" traf lange auf /^(\d+) Fehler$/ und wurde zu
 * "1 errors" - an der sichtbarsten Stelle der englischen Oberflaeche.
 *
 * Die konkreten Faelle:
 */
check('"1 Fehler" wird zur Einzahl',
  app.translateGermanText("1 Fehler") === "1 error",
  app.translateGermanText("1 Fehler"));
check('"3 Fehler" bleibt Mehrzahl',
  app.translateGermanText("3 Fehler") === "3 errors",
  app.translateGermanText("3 Fehler"));
check('"1 Warnung" wird zur Einzahl',
  app.translateGermanText("1 Warnung") === "1 warning",
  app.translateGermanText("1 Warnung"));
check('"2 Warnungen" bleibt Mehrzahl',
  app.translateGermanText("2 Warnungen") === "2 warnings",
  app.translateGermanText("2 Warnungen"));
check("die Kurzform der Statuszeile stimmt",
  app.translateGermanText("1 Fehler, 1 Warnung") === "1 error, 1 warning",
  app.translateGermanText("1 Fehler, 1 Warnung"));

/*
 * Und die Liste als Ganzes: fuer jedes Muster wird ein Beispieltext erzeugt
 * und geprueft, ob ein FRUEHERES, ALLGEMEINERES Muster ihn abfaengt.
 * Umgekehrt - speziell vor allgemein - ist die richtige Reihenfolge und wird
 * nicht gemeldet. Muster, aus denen sich kein Beispiel erzeugen laesst,
 * bleiben ungeprueft; sie haben durchweg eindeutige Praefixe.
 */
function patternSamples(source) {
  const body = source.replace(/^\^/, "").replace(/\$$/, "");
  const variants = [];

  for (const digits of ["1", "3"]) {
    let text = body
      .replace(/\(\\d\+\)/g, digits)
      .replace(/\(\[\\d\.,\]\+\)/g, digits === "1" ? "1,00" : "3,50")
      .replace(/\(\.\+\??\)/g, "X")
      .replace(/\(\[AB\]\)/g, "A")
      .replace(/\(\?:e\)\?/g, "e")
      .replace(/\(\?:s\)\?/g, "s")
      .replace(/\\d\+/g, digits)
      .replace(/(\w)\?/g, "$1")
      .replace(/\\([.\/(){}\[\]|?*+^$-])/g, "$1");

    if (/[\\()\[\]|*+?]/.test(text)) continue;
    variants.push(text);
  }

  return [...new Set(variants)];
}

const patternList = app.I18N_PATTERNS;
const patternExamples = patternList.map(([pattern]) =>
  patternSamples(pattern.source).filter((text) => pattern.test(text)));

const shadowing = [];

patternList.forEach(([pattern], index) => {
  for (const text of patternExamples[index]) {
    const winner = patternList.findIndex(([other]) => other.test(text));
    if (winner === -1 || winner >= index) continue;

    /* Nur ein ALLGEMEINERES frueheres Muster ist ein Fehler. */
    const earlierIsBroader =
      patternExamples[index].every((t) => patternList[winner][0].test(t)) &&
      patternExamples[winner].some((t) => !pattern.test(t));

    if (earlierIsBroader) {
      shadowing.push(`"${text}" -> #${winner} statt #${index}`);
    }
  }
});

check("kein allgemeines Muster verdeckt ein spezielleres",
  shadowing.length === 0, shadowing.join(" | "));

const checkedPatterns = patternExamples.filter((s) => s.length).length;
console.log(
  `  ${checkedPatterns} von ${patternList.length} Mustern automatisch geprueft`);

/*
 * Doppelte Schluessel in I18N_EN.
 *
 * Ein Objektliteral nimmt denselben Schluessel zweimal klaglos an - der
 * SPAETERE gewinnt. Die fertige Map zeigt davon nichts, deshalb wird hier der
 * Quelltext gelesen und nicht app.I18N_EN. Drei solche Paare standen unbemerkt
 * in der Liste; sie waren zufaellig gleich uebersetzt, die naechste Doppelung
 * muss es nicht sein.
 */
const dictionarySource = (() => {
  const script = readInlineScript();
  const start = script.indexOf("const I18N_EN");
  const end = script.indexOf("const I18N_PATTERNS");
  return script.slice(start, end);
})();

const dictionaryKeys = [
  ...dictionarySource.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g),
].map((m) => m[1]);

const seenKeys = new Set();
const duplicateKeys = [];

for (const key of dictionaryKeys) {
  if (seenKeys.has(key) && !duplicateKeys.includes(key)) duplicateKeys.push(key);
  seenKeys.add(key);
}

check("kein Schluessel steht zweimal in I18N_EN",
  duplicateKeys.length === 0, duplicateKeys.join(" | "));

/*
 * Dasselbe fuer I18N_PATTERNS. Ein doppeltes Muster ist harmloser als ein
 * doppelter Schluessel - das zweite ist schlicht tot, weil die Suche beim
 * ersten Treffer abbricht -, aber es ist eine stille Doppelung derselben Art,
 * und die naechste koennte zwei verschiedene Uebersetzungen tragen.
 *
 * Gefunden wurde genau das beim Aufloesen der Seitenleiste: das Muster fuer
 * "N Punkte ausgewaehlt" stand seit Etappe 5 zweimal in der Liste.
 */
const duplicatePatterns = [];
const seenPatterns = new Set();

for (const [pattern] of app.I18N_PATTERNS) {
  const quelle = String(pattern);
  if (seenPatterns.has(quelle) && !duplicatePatterns.includes(quelle)) {
    duplicatePatterns.push(quelle);
  }
  seenPatterns.add(quelle);
}

check("kein Muster steht zweimal in I18N_PATTERNS",
  duplicatePatterns.length === 0, duplicatePatterns.join(" | "));

console.log(`  ${dictionaryKeys.length} Woerterbucheintraege, ${seenKeys.size} eindeutig`);

/* -------------------------------------------------------------------- */
console.log("Alt-Buchstaben der Menueleiste");

/*
 * Der Alt-Buchstabe eines Menues ist ABGELEITET: der erste Buchstabe seines
 * Titels in der laufenden Sprache. Das ist die richtige Wahl - eine Tabelle
 * Buchstabe -> Menue waere eine zweite Quelle und zeigte nach einer
 * Umbenennung still auf das falsche Menue.
 *
 * Der Preis ist diese Pruefung: haetten in einer Sprache zwei Titel denselben
 * Anfangsbuchstaben, gewaenne im Browser schlicht das erste Menue, und das
 * zweite waere per Tastatur unerreichbar - ohne Fehler, ohne Meldung.
 *
 * Geprueft wird deshalb JEDES Woerterbuch, nicht nur das laufende. Eine neue
 * Sprache muss hier scheitern, nicht erst beim Durchklicken.
 */
const menuTitles = [...readFileSync(
  new URL("../index.html", import.meta.url), "utf8"
).matchAll(
  /<button id="menu\w+Btn"[^>]*class="menu-title"[\s\S]*?>([^<]+)<\/button>/g
)].map((m) => m[1].trim());

check("die Menueleiste hat vier Titel", menuTitles.length === 4,
  JSON.stringify(menuTitles));

/** Nennt jedes Paar, das denselben Anfangsbuchstaben traegt. */
const altKollisionen = (titel) => {
  const buchstaben = titel.map((t) => t.trim().charAt(0).toLowerCase());
  const treffer = [];

  for (let i = 0; i < buchstaben.length; i++) {
    for (let j = i + 1; j < buchstaben.length; j++) {
      if (buchstaben[i] === buchstaben[j]) {
        treffer.push(
          `"${titel[i]}" und "${titel[j]}" beginnen beide mit ` +
          `"${buchstaben[i].toUpperCase()}"`
        );
      }
    }
  }

  return treffer;
};

/*
 * Der Melder selbst wird geprueft. Eine Zusicherung "keine Kollision" bestuende
 * sonst auch dann, wenn die Suche gar nichts faende - und genau dieser Fall
 * soll ja eines Tages laut scheitern.
 */
const probe = altKollisionen(["Datei", "Ansicht", "Karte", "Dateien"]);

check("der Melder findet eine kuenstliche Kollision",
  probe.length === 1 && probe[0].includes("Datei") &&
  probe[0].includes("Dateien") && probe[0].includes('"D"'),
  JSON.stringify(probe));

/*
 * Die Woerterbuecher, gegen die geprueft wird. Deutsch ist die Quellsprache
 * und braucht keine Uebersetzung; jedes weitere Woerterbuch kommt als
 * [Name, Uebersetzer] dazu und wird damit automatisch mitgeprueft.
 */
const woerterbuecher = [
  ["Deutsch", (text) => text],
  ["Englisch", (text) => app.translateGermanText(text)],
];

for (const [sprache, uebersetze] of woerterbuecher) {
  const titel = menuTitles.map(uebersetze);
  const kollisionen = altKollisionen(titel);

  check(`${sprache}: die vier Alt-Buchstaben sind eindeutig`,
    kollisionen.length === 0, kollisionen.join(" | "));

  const buchstaben = titel.map((t) => t.trim().charAt(0).toUpperCase());
  console.log(
    `  ${sprache}: ${titel.map((t, i) => `${t} (Alt+${buchstaben[i]})`).join(", ")}`);
}

/* -------------------------------------------------------------------- */
console.log("Punktzahl einer Linie");

/*
 * Ein Eintrag in coordinates ist nur dann ein Punkt, wenn er ein Paar
 * endlicher Zahlen ist. Ein leerer Ring [[]] ist ein Eintrag OHNE Punkt -
 * genau daran hing ein unbenutzbares Werkzeug: die Search Wire galt als
 * befuellt, das Zeichnen war gesperrt und stattdessen "verlaengern" angeboten.
 */
const line = (coordinates, type = "LineString") =>
  ({ type: "Feature", properties: { name: "search wire" },
     geometry: coordinates === undefined ? undefined : { type, coordinates } });

check("Feature ohne geometry hat 0 Punkte",
  app.countLineFeaturePoints({ type: "Feature", properties: {} }) === 0);
check("geometry null hat 0 Punkte",
  app.countLineFeaturePoints({ type: "Feature", geometry: null }) === 0);
check("coordinates fehlt: 0 Punkte",
  app.countLineFeaturePoints(line(undefined)) === 0);
check("leeres coordinates-Array: 0 Punkte",
  app.countLineFeaturePoints(line([])) === 0);
check("ein leerer Ring ist KEIN Punkt",
  app.countLineFeaturePoints(line([[]])) === 0,
  String(app.countLineFeaturePoints(line([[]]))));
check("mehrere leere Ringe sind keine Punkte",
  app.countLineFeaturePoints(line([[], [], []])) === 0);
check("zwei echte Punkte zaehlen",
  app.countLineFeaturePoints(line([[1, 2], [3, 4]])) === 2);
check("ein einzelner echter Punkt zaehlt",
  app.countLineFeaturePoints(line([[1, 2]])) === 1);
check("unvollstaendiges Paar zaehlt nicht",
  app.countLineFeaturePoints(line([[1]])) === 0);
check("NaN und Unendlich zaehlen nicht",
  app.countLineFeaturePoints(line([[NaN, 1], [1, Infinity]])) === 0);
check("null-Eintraege zaehlen nicht",
  app.countLineFeaturePoints(line([null, [1, 2]])) === 1);
check("echte Punkte neben leeren Ringen werden gezaehlt",
  app.countLineFeaturePoints(line([[], [1, 2], [], [3, 4]])) === 2);

/* Dieselbe Zaehlung entscheidet, was beim Verbinden als leer gilt. */
check("leerer Platzhalter gilt als leer",
  app.isEmptyLineFeature(line([])) === true);
check("Platzhalter mit leerem Ring gilt ebenfalls als leer",
  app.isEmptyLineFeature(line([[]])) === true);
check("ein echter Punkt ist NICHT leer",
  app.isEmptyLineFeature(line([[1, 2]])) === false);

/* -------------------------------------------------------------------- */
console.log(
  failures === 0
    ? "\ntest-cassandra: alle Pruefungen bestanden."
    : `\ntest-cassandra: FEHLGESCHLAGEN (${failures})`
);

process.exitCode = failures === 0 ? 0 : 1;
