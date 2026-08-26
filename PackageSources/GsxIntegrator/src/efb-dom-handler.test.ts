import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sourceFiles } from "./test-support/sources.ts";

const SOURCE_ROOT = join(process.cwd(), "src");

const DOM_HANDLER =
  /\bon(Click|DblClick|MouseDown|MouseUp|MouseEnter|MouseLeave|MouseOver|MouseOut|MouseMove|Input|Change|Submit|KeyDown|KeyUp|KeyPress|Focus|Blur|TouchStart|TouchEnd|TouchMove|Wheel|Scroll)\s*=\s*\{/;

function components(): string[] {
  return sourceFiles(SOURCE_ROOT, (entry) => entry.endsWith(".tsx"));
}

function inlineHandlers(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      DOM_HANDLER.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : [],
    );
}

test("no element takes a DOM event handler as a JSX prop", () => {
  const offenders = components().flatMap(inlineHandlers);

  assert.deepEqual(
    offenders,
    [],
    "FSComponent writes the function into the HTML attribute, where `this` is the element and the handler dies silently; attach it with addEventListener in onAfterRender instead",
  );
});
