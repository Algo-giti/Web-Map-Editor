#!/usr/bin/env node
// Zero-dependency check: heuristic privacy audit for index.html, per the
// "Privacy" section in AGENTS.md / DEVELOPMENT.md. The published app must
// never ship with embedded real map/RTK data. A clean index.html contains
// zero occurrences of a GeoJSON "coordinates" key and its only
// FeatureCollection literal is the empty EMPTY_FEATURE_COLLECTION constant.
//
// This is a heuristic, not a proof: it cannot detect private data hidden
// under a renamed key. Always eyeball a diff before release too.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const indexPath = new URL("../index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");

const problems = [];
const warnings = [];

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

// Map files anywhere in the working tree are real user data. They are fine to
// keep locally for testing, but must never end up in a commit.
function findMapFiles(directory) {
  const found = [];

  for (const entry of readdirSync(directory)) {
    if (entry === ".git" || entry === "node_modules") continue;

    const fullPath = join(directory, entry);

    if (statSync(fullPath).isDirectory()) {
      found.push(...findMapFiles(fullPath));
      continue;
    }

    if (!/\.(geojson|json)$/i.test(entry)) continue;
    if (readFileSync(fullPath, "utf8").includes("FeatureCollection")) {
      found.push(relative(repoRoot, fullPath));
    }
  }

  return found;
}

let trackedFiles = new Set();
try {
  trackedFiles = new Set(
    execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
  );
} catch {
  // Not a git repository (or git unavailable) - skip the tracked/untracked split.
}

for (const mapFile of findMapFiles(repoRoot)) {
  if (trackedFiles.has(mapFile)) {
    problems.push(`map file "${mapFile}" is tracked by git - map data must never be committed.`);
  } else {
    warnings.push(`map file "${mapFile}" is present but untracked - keep it out of commits.`);
  }
}

for (const warning of warnings) console.warn(`check-privacy: warning - ${warning}`);

if (problems.length > 0) {
  console.error("check-privacy: FAILED - possible private map data:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log("check-privacy: OK - no embedded coordinates/GeoJSON data detected in index.html.");
}
