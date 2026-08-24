import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sourceFiles } from "./test-support/sources.ts";

const SOURCE_ROOT = join(process.cwd(), "src");

const HAIRLINE = /^\s*border(-[a-z]+)?:\s*\d+px\s+solid/;
const FLOOR = /^\s*@media\s*\(max-height:\s*716px\)/;

function stylesheets(): string[] {
  return sourceFiles(SOURCE_ROOT, (entry) => entry.endsWith(".scss"));
}

function unscaledPixels(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (HAIRLINE.test(line) || FLOOR.test(line)) {
        return [];
      }

      const outsideScale = line.replace(/s[xy]\([^)]*\)/g, "");
      return /\d+(\.\d+)?px/.test(outsideScale) ? [`${path}:${index + 1}: ${line.trim()}`] : [];
    });
}

test("every pixel in a stylesheet goes through the panel scale", () => {
  const offenders = stylesheets().flatMap(unscaledPixels);

  assert.deepEqual(
    offenders,
    [],
    "the EFB draws against a 516x716 base and multiplies by --panel-width/--panel-height, so wrap the value in sx() or sy()",
  );
});

test("no stylesheet clamps with max() or clamp()", () => {
  const offenders = stylesheets().filter((path) =>
    /[\s:(,](max|clamp)\(/.test(readFileSync(path, "utf8")),
  );

  assert.deepEqual(
    offenders,
    [],
    "Coherent drops the whole declaration; the floor below the base is the max-height: 716px query",
  );
});
