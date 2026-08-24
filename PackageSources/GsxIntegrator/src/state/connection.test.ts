import { test } from "node:test";
import assert from "node:assert/strict";

import { readConnection } from "./connection.ts";

test("a payload announcing a connected client yields the connected model", () => {
  const model = readConnection('{"connected":true}');

  assert.equal(model.connected, true);
  assert.equal(model.statusText, "CONNECTED");
  assert.equal(model.fault, undefined);
});

test("a payload announcing a disconnected client yields the disconnected model", () => {
  const model = readConnection('{"connected":false}');

  assert.equal(model.connected, false);
  assert.equal(model.statusText, "DISCONNECTED");
});

test("a missing payload yields the disconnected model instead of a blank screen", () => {
  for (const raw of [undefined, null, "", "   "]) {
    const model = readConnection(raw);

    assert.equal(model.connected, false, `raw=${JSON.stringify(raw)}`);
    assert.equal(model.statusText, "DISCONNECTED", `raw=${JSON.stringify(raw)}`);
  }
});

test("a payload without the connected field yields the disconnected model", () => {
  const model = readConnection('{"phase":3}');

  assert.equal(model.connected, false);
  assert.equal(model.statusText, "DISCONNECTED");
});

test("an unknown field is accepted and ignored", () => {
  const model = readConnection('{"connected":true,"somethingTheAppNeverHeardOf":{"deep":[1,2]}}');

  assert.equal(model.connected, true);
  assert.equal(model.statusText, "CONNECTED");
  assert.equal(model.fault, undefined);
});

test("malformed JSON yields the disconnected model and a fault to log", () => {
  const model = readConnection('{"connected":true');

  assert.equal(model.connected, false);
  assert.equal(model.statusText, "DISCONNECTED");
  assert.match(model.fault ?? "", /malformed payload/i);
});

test("a payload that is valid JSON but not an object yields the disconnected model and a fault", () => {
  const model = readConnection("42");

  assert.equal(model.connected, false);
  assert.match(model.fault ?? "", /not an object/i);
});

test("a non-boolean connected field is refused rather than coerced", () => {
  const model = readConnection('{"connected":"true"}');

  assert.equal(model.connected, false);
  assert.match(model.fault ?? "", /connected/i);
});
