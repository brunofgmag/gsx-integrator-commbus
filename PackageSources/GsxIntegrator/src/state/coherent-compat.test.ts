import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sourceFiles } from "../test-support/sources.ts";

const SOURCE_ROOT = join(process.cwd(), "src");

function appSources(): string[] {
  return sourceFiles(
    SOURCE_ROOT,
    (entry) => /\.(tsx?|scss)$/.test(entry) && !entry.endsWith(".test.ts"),
  );
}

test("no source file reaches for globalThis", () => {
  const offenders = appSources().filter((path) =>
    readFileSync(path, "utf8").includes("globalThis"),
  );

  assert.deepEqual(offenders, [], "use window, which Coherent does have");
});

test("no stylesheet spaces things with flexbox gap", () => {
  const offenders = appSources().filter(
    (path) => path.endsWith(".scss") && /^\s*(column-|row-)?gap\s*:/m.test(readFileSync(path, "utf8")),
  );

  assert.deepEqual(offenders, [], "use margins, which Coherent does honour");
});
