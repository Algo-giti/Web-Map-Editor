#!/usr/bin/env node
// Runs all static, zero-dependency checks in sequence. Intended to be run
// before reporting any change to index.html as complete. See CLAUDE.md
// ("Testumgebung") for how this fits into the overall verification flow.

import { execFileSync } from "node:child_process";

const checks = [
  "check-syntax.mjs",
  "check-dom-ids.mjs",
  "check-privacy.mjs",
  "test-cassandra.mjs",
  "test-geometry.mjs",
];

let failed = false;
for (const check of checks) {
  console.log(`\n=== ${check} ===`);
  try {
    execFileSync(process.execPath, [new URL(check, import.meta.url).pathname], {
      stdio: "inherit",
    });
  } catch {
    failed = true;
  }
}

console.log(failed ? "\ncheck-all: FAILED - see above." : "\ncheck-all: all checks passed.");
process.exitCode = failed ? 1 : 0;
