import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(process.cwd(), "src/Components");

const stylesheet = readFileSync(join(COMPONENTS, "OperationsPage.scss"), "utf8");
const page = readFileSync(join(COMPONENTS, "OperationsPage.tsx"), "utf8");
const root = readFileSync(join(process.cwd(), "src/GsxIntegrator.tsx"), "utf8");

function rule(selector: string): string | null {
  const escaped = selector.replace(/\./g, "\\.");
  const found = stylesheet.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));

  return found === null ? null : found[1];
}

test("the page draws the resume question above the advisory list", () => {
  const question = page.indexOf("<DecisionSlot ");
  const list = page.indexOf('<div class="advisory-list">');

  assert.notEqual(question, -1);
  assert.ok(question < list, "the question is what the turnaround waits on, so it comes first");
});

test("the answers stack in a column instead of wrapping beside the text", () => {
  assert.match(rule(".decision-actions") ?? "", /flex-direction:\s*column/);
  assert.doesNotMatch(rule(".decision-actions") ?? "", /flex-wrap/);
});

test("the resume answer stands out and the restart answer stays plain", () => {
  assert.match(rule(".decision-primary") ?? "", /var\(--gsxi-accent\)/);
  assert.doesNotMatch(rule(".decision-secondary") ?? "", /var\(--gsxi-accent\)/);
});

test("the root view sends the answer the button names, without the restart confirmation step", () => {
  assert.match(root, /onDecide=\{\(command\) => clientChannel\.send\(command\)\}/);
  assert.doesNotMatch(
    page.slice(page.indexOf("class DecisionButtonSlot"), page.indexOf("class DecisionSlot")),
    /confirm|armed|setTimeout/i,
  );
});
