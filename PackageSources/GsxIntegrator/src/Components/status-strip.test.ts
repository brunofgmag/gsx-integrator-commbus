import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(process.cwd(), "src/Components");

const stylesheet = readFileSync(join(COMPONENTS, "OperationsPage.scss"), "utf8");
const page = readFileSync(join(COMPONENTS, "OperationsPage.tsx"), "utf8");

function rule(selector: string): string | null {
  const escaped = selector.replace(/\./g, "\\.");
  const found = stylesheet.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));

  return found === null ? null : found[1];
}

test("the status strip and its rows do not wrap their chips", () => {
  for (const selector of [".chip-strip", ".chip-row", ".chip-row-modes"]) {
    assert.doesNotMatch(
      rule(selector) ?? "",
      /flex-wrap/,
      `${selector}: the two rows are fixed, so a chip must never fall onto a third line`,
    );
  }
});

test("the stylesheet declares the chip row", () => {
  assert.notEqual(rule(".chip-row"), null);
});

test("the page draws exactly two chip rows", () => {
  const rows = page.match(/<div class="chip-row[ "]/g) ?? [];

  assert.equal(rows.length, 2);
});
