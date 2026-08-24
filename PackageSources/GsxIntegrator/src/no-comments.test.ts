import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sourceFiles } from "./test-support/sources.ts";

const SOURCE_ROOT = join(process.cwd(), "src");

const STRINGS = /"[^"]*"|'[^']*'|`[^`]*`/g;

function comments(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      const outsideStrings = line.replace(STRINGS, "");
      return /\/\/|\/\*/.test(outsideStrings)
        ? [`${path}:${index + 1}: ${line.trim()}`]
        : [];
    });
}

test("no source file carries a comment", () => {
  const offenders = sourceFiles(SOURCE_ROOT, (entry) =>
    /\.(tsx?|scss)$/.test(entry),
  ).flatMap(comments);

  assert.deepEqual(
    offenders,
    [],
    "code that needs a comment is not readable enough; the reason belongs in the vault, and the instruction in an assertion message",
  );
});
