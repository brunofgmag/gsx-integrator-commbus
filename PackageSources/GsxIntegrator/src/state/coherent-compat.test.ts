import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// npm test and the CI workflow both run from the app directory.
const SOURCE_ROOT = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(tsx?|scss)$/.test(entry) && !entry.endsWith(".test.ts") ? [path] : [];
  });
}

// Measured in the simulator on 2026-08-24: the Coherent engine behind the EFB
// view has no globalThis, and the app's install promise rejected with
// "Can't find variable: globalThis" without anything else complaining.
test("no source file reaches for globalThis", () => {
  const offenders = sourceFiles(SOURCE_ROOT).filter((path) =>
    readFileSync(path, "utf8").includes("globalThis"),
  );

  assert.deepEqual(offenders, [], "use window, which Coherent does have");
});

// Measured in the simulator on 2026-08-24: every element in the app view
// computed columnGap "normal", and the dot rendered flush against the text.
test("no stylesheet spaces things with flexbox gap", () => {
  const offenders = sourceFiles(SOURCE_ROOT).filter(
    (path) => path.endsWith(".scss") && /^\s*(column-|row-)?gap\s*:/m.test(readFileSync(path, "utf8")),
  );

  assert.deepEqual(offenders, [], "use margins, which Coherent does honour");
});
