#!/usr/bin/env node
// Zero-dependency check: verifies that every string-literal
// document.getElementById("...") call in index.html refers to an id that
// actually exists in the HTML markup. This is the "DOM ID audit" and part
// of the "stale-reference audit" described in AGENTS.md / DEVELOPMENT.md -
// most runtime crashes in this project's history came from exactly this
// class of bug (an element removed from the HTML while JS still reached
// for its id).

import { readFileSync } from "node:fs";

const indexPath = new URL("../index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");

const existingIds = new Set(
  [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1])
);

const getByIdCalls = [...html.matchAll(/getElementById\(\s*(["'`])([^"'`]*)\1\s*\)/g)];
const dynamicCalls = [...html.matchAll(/getElementById\(\s*[^"'`)]/g)].length;

const missing = [];
const seen = new Set();
for (const match of getByIdCalls) {
  const id = match[2];
  if (seen.has(id)) continue;
  seen.add(id);
  if (!existingIds.has(id)) missing.push(id);
}

console.log(
  `check-dom-ids: ${existingIds.size} ids in markup, ${seen.size} distinct literal getElementById() references` +
    (dynamicCalls ? `, ${dynamicCalls} dynamic (non-literal) call(s) skipped - review those by hand` : "")
);

if (missing.length > 0) {
  console.error("check-dom-ids: FAILED - referenced ids missing from index.html:");
  for (const id of missing) console.error(`  - ${id}`);
  process.exitCode = 1;
} else {
  console.log("check-dom-ids: OK - every literal getElementById() reference resolves to an existing id.");
}
