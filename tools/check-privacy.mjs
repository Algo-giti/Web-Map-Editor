#!/usr/bin/env node
// Zero-dependency check: heuristic privacy audit for index.html, per the
// "Privacy" section in AGENTS.md / DEVELOPMENT.md. The published app must
// never ship with embedded real map/RTK data. A clean index.html contains
// zero occurrences of a GeoJSON "coordinates" key and its only
// FeatureCollection literal is the empty EMPTY_FEATURE_COLLECTION constant.
//
// This is a heuristic, not a proof: it cannot detect private data hidden
// under a renamed key. Always eyeball a diff before release too.

import { readFileSync } from "node:fs";

const indexPath = new URL("../index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");

const problems = [];

const coordinatesKeyMatches = [...html.matchAll(/"coordinates"\s*:/g)];
if (coordinatesKeyMatches.length > 0) {
  problems.push(
    `found ${coordinatesKeyMatches.length} occurrence(s) of a literal "coordinates": key - ` +
      "index.html should not contain embedded GeoJSON geometry."
  );
}

// Look for suspiciously long decimal numbers typical of real GPS/RTK
// coordinates (e.g. 51.9612345 or 7.61234567), outside of the known-safe
// SUNRAY_FACTOR-style integer constants.
const suspiciousDecimals = [...html.matchAll(/-?\d{1,3}\.\d{5,}/g)];
if (suspiciousDecimals.length > 0) {
  problems.push(
    `found ${suspiciousDecimals.length} high-precision decimal literal(s) that look like real ` +
      `coordinates, e.g. "${suspiciousDecimals[0][0]}" - verify these are not embedded map data.`
  );
}

const featureCollectionLiterals = [...html.matchAll(/type\s*:\s*["']FeatureCollection["']/g)];
if (featureCollectionLiterals.length > 1) {
  problems.push(
    `found ${featureCollectionLiterals.length} FeatureCollection object literals - expected exactly ` +
      "one (EMPTY_FEATURE_COLLECTION). Verify no additional embedded map was added."
  );
}

if (problems.length > 0) {
  console.error("check-privacy: FAILED - possible embedded private map data:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log("check-privacy: OK - no embedded coordinates/GeoJSON data detected in index.html.");
}
