#!/usr/bin/env node
// Zero-dependency check: extracts the single inline <script> block from
// index.html and runs `node --check` against it. Mirrors the manual
// procedure described in AGENTS.md / docs/DEVELOPMENT.md so it can run
// automatically instead of being repeated by hand before every release.

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const indexPath = new URL("../index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");

const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

if (scriptBlocks.length === 0) {
  console.error("check-syntax: no inline <script> block found in index.html");
  process.exit(1);
}
if (scriptBlocks.length > 1) {
  console.error(
    `check-syntax: expected exactly one inline <script> block, found ${scriptBlocks.length}. ` +
      "Update this tool if index.html now intentionally contains multiple script blocks."
  );
  process.exit(1);
}

const scriptContent = scriptBlocks[0][1];
const tmpFile = join(tmpdir(), `web-map-editor-extracted-${Date.now()}.js`);
writeFileSync(tmpFile, scriptContent, "utf8");

try {
  execFileSync(process.execPath, ["--check", tmpFile], { stdio: "inherit" });
  console.log("check-syntax: OK - inline script is syntactically valid JavaScript.");
} catch {
  console.error("check-syntax: FAILED - see node --check output above.");
  process.exitCode = 1;
} finally {
  unlinkSync(tmpFile);
}
