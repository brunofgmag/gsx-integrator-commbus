import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADVISORY_SLOTS,
  CARD_SLOTS,
  CHIP_SLOTS,
  ROW_SLOTS,
  disconnectedScreen,
  readScreen,
} from "./screen.ts";
import type { DataCard, ScreenModel } from "./screen.ts";

const FULL_PAYLOAD = readFileSync(
  join(process.cwd(), "src/state/__fixtures__/full-payload.json"),
  "utf8",
);

function payloadWithout(...keys: string[]): string {
  const decoded = JSON.parse(FULL_PAYLOAD) as Record<string, unknown>;
  for (const key of keys) {
    delete decoded[key];
  }
  return JSON.stringify(decoded);
}

function payloadWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...(JSON.parse(FULL_PAYLOAD) as object), ...overrides });
}

function cardTitled(model: ScreenModel, title: string): DataCard | undefined {
  return model.cards.find((card) => card.title === title);
}

test("the full payload yields every block of the screen", () => {
  const model = readScreen(FULL_PAYLOAD);

  assert.equal(model.connected, true);
  assert.equal(model.fault, undefined);

  assert.deepEqual(
    model.chips.map((chip) => [chip.label, chip.value, chip.tone]),
    [
      ["Sim", "Connected", "ok"],
      ["GSX Pro", "Connected", "ok"],
      ["Aircraft", "PMDG 737-800", "text"],
      ["Turnaround", "Auto", "accent"],
      ["Loading", "Auto", "accent"],
    ],
  );

  assert.deepEqual(model.state, {
    title: "Turnaround state",
    counter: "12/26",
    text: "Waiting for start loading",
    pilotMark: "Unlocked by the pilot",
    next: "Next ▸ Waiting for beacon & brake",
    countdown: "Next state in 12s",
  });

  assert.deepEqual(model.commandError, {
    label: "Error",
    text: "GSX refused the request: menu busy",
  });

  assert.deepEqual(
    model.cards.map((card) => card.title),
    ["Fuel", "Boarding", "SimBrief OFP"],
  );

  assert.deepEqual(cardTitled(model, "Fuel"), {
    id: "fuel",
    title: "Fuel",
    metric: "100%",
    metricTone: "accent",
    progress: 100,
    refusal: null,
    rows: [
      { label: "Loaded", value: "6.637 kg" },
      { label: "Planned", value: "6.637 kg" },
      { label: "Rate", value: "0.8 kg/s" },
    ],
  });

  assert.deepEqual(cardTitled(model, "Boarding"), {
    id: "pax",
    title: "Boarding",
    metric: "43%",
    metricTone: "accent",
    progress: 42.5,
    refusal: null,
    rows: [
      { label: "Pax", value: "69 / 162" },
      { label: "Planned ZFW", value: "52.340 kg" },
    ],
  });

  assert.deepEqual(cardTitled(model, "SimBrief OFP"), {
    id: "simbrief",
    title: "SimBrief OFP",
    metric: "Ready",
    metricTone: "ok",
    progress: null,
    refusal: null,
    rows: [
      { label: "Fuel", value: "6.637 kg" },
      { label: "ZFW", value: "52.340 kg" },
      { label: "Pax", value: "162" },
    ],
  });
});

test("each card carries the identity the page draws it by", () => {
  const model = readScreen(FULL_PAYLOAD);

  assert.deepEqual(
    model.cards.map((card) => card.id),
    ["fuel", "pax", "simbrief"],
  );
});

test("a card that drops out does not shift the identity of the others", () => {
  const model = readScreen(payloadWithout("fuelCardLabel"));

  assert.deepEqual(
    model.cards.map((card) => card.id),
    ["pax", "simbrief"],
  );
});

test("the payload prints its phrases as they arrived, without a unit or a separator of our own", () => {
  const model = readScreen(payloadWith({ loadedFuelText: "14.632 lb", fuelRateText: "44 lb/s" }));
  const fuel = cardTitled(model, "Fuel");

  assert.equal(fuel?.rows[0]?.value, "14.632 lb");
  assert.equal(fuel?.rows[2]?.value, "44 lb/s");
});

test("a payload without the SimBrief block yields no card instead of an empty one", () => {
  const model = readScreen(
    payloadWithout(
      "simbriefCardLabel",
      "simbriefStatusText",
      "plannedFuelLabel",
      "plannedFuelText",
      "plannedZfwLabel",
      "plannedZfwText",
      "plannedPaxLabel",
      "plannedPaxText",
    ),
  );

  assert.deepEqual(
    model.cards.map((card) => card.title),
    ["Fuel", "Boarding"],
  );
});

test("a card whose rows are all missing keeps its metric instead of vanishing", () => {
  const model = readScreen(
    payloadWithout("plannedFuelText", "plannedZfwText", "plannedPaxText"),
  );

  assert.deepEqual(cardTitled(model, "SimBrief OFP")?.rows, []);
  assert.equal(cardTitled(model, "SimBrief OFP")?.metric, "Ready");
});

test("a missing row drops out and leaves the rows around it in place", () => {
  const model = readScreen(payloadWithout("targetFuelText"));

  assert.deepEqual(cardTitled(model, "Fuel")?.rows, [
    { label: "Loaded", value: "6.637 kg" },
    { label: "Rate", value: "0.8 kg/s" },
  ]);
});

test("a cargo aircraft drops the pax row and keeps the target", () => {
  const model = readScreen(payloadWith({ cargoAircraft: true }));

  assert.deepEqual(cardTitled(model, "Boarding")?.rows, [
    { label: "Planned ZFW", value: "52.340 kg" },
  ]);
});

test("progress at zero, at a fraction and at a hundred all reach the bar", () => {
  for (const [published, expected] of [
    [0, 0],
    [42.5, 42.5],
    [100, 100],
  ] as const) {
    const model = readScreen(payloadWith({ fuelProgress: published }));

    assert.equal(cardTitled(model, "Fuel")?.progress, expected, `fuelProgress=${published}`);
  }
});

test("a progress that is not a number leaves the bar out rather than drawing zero", () => {
  const model = readScreen(payloadWithout("fuelProgress"));

  assert.equal(cardTitled(model, "Fuel")?.progress, null);
});

test("the deboarding phase draws the deboarding progress", () => {
  const model = readScreen(
    payloadWith({
      inDeboardingPhase: true,
      paxCardLabel: "Deboarding",
      paxProgressText: "80%",
      deboardingProgress: 80,
    }),
  );

  assert.equal(cardTitled(model, "Deboarding")?.progress, 80);
});

test("every advisory the client raised is printed, in the order the window prints them", () => {
  const model = readScreen(FULL_PAYLOAD);

  assert.deepEqual(model.advisories, [
    "The GSX profile for this aircraft does not set 'refueling = 0', so the fuel truck never connects the hose. Apply the fix, then restart GSX or reload the flight.",
    "The PMDG options file does not enable the SDK data broadcast, so the client cannot read this aircraft. Apply the fix, then reload the flight.",
    "A GSX loader is waiting for the main cargo door. Make sure a hydraulic pump is on.",
    "GSX took the refuelling request but the truck has not arrived. Check the GSX menu, or another service may be holding it.",
    "Press START LOADING or activate the SmartSwitch to begin refueling and boarding.",
  ]);
});

test("an advisory whose flag is down is not printed", () => {
  const model = readScreen(
    payloadWith({
      gsxProfileConflict: false,
      pmdgOptionsConflict: false,
      cargoDoorStuck: false,
      fuelRequestStalled: false,
    }),
  );

  assert.deepEqual(model.advisories, [
    "Press START LOADING or activate the SmartSwitch to begin refueling and boarding.",
  ]);
});

test("an advisory raised without its text is not printed as a blank strip", () => {
  const model = readScreen(payloadWithout("gsxProfileAdvisoryText", "phaseTip"));

  assert.equal(model.advisories.length, 3);
  assert.equal(model.advisories.includes(""), false);
});

test("no fix button reaches the app, because the client never publishes its label", () => {
  const published = new Set(Object.keys(JSON.parse(FULL_PAYLOAD) as object));

  assert.equal(published.has("gsxProfileActionLabel"), false);
  assert.equal(published.has("pmdgOptionsActionLabel"), false);
});

test("the SimBrief refusal is carried and marks the card", () => {
  const model = readScreen(
    payloadWith({
      simbriefRefusal: "SimBrief returned no OFP for this pilot id",
      simbriefReady: false,
      simbriefError: true,
      simbriefStatusText: "Error",
    }),
  );

  assert.equal(cardTitled(model, "SimBrief OFP")?.refusal, "SimBrief returned no OFP for this pilot id");
  assert.equal(cardTitled(model, "SimBrief OFP")?.metricTone, "error");
});

test("a SimBrief that is neither ready nor in error stays muted", () => {
  const model = readScreen(
    payloadWith({ simbriefReady: false, simbriefError: false, simbriefStatusText: "Loading" }),
  );

  assert.equal(cardTitled(model, "SimBrief OFP")?.metricTone, "muted");
});

test("a client that is not talking to the sim or to GSX warns on both chips", () => {
  const model = readScreen(
    payloadWith({
      gsxAvailable: false,
      gsxStatusText: "Offline",
      aircraftSupported: false,
      aircraftNameText: "Standby",
      enabled: false,
      autoStartLoading: false,
    }),
  );

  assert.deepEqual(
    model.chips.map((chip) => chip.tone),
    ["ok", "warn", "muted", "muted", "muted"],
  );
});

test("a phase nobody unlocked carries no pilot mark", () => {
  const model = readScreen(payloadWith({ advancedByPilot: false }));

  assert.equal(model.state?.pilotMark, null);
});

test("no command error yields no error strip", () => {
  const model = readScreen(payloadWith({ commandError: "" }));

  assert.equal(model.commandError, null);
});

test("a payload announcing a connected client yields the connected model", () => {
  const model = readScreen('{"connected":true}');

  assert.equal(model.connected, true);
  assert.equal(model.statusText, "CONNECTED");
  assert.equal(model.fault, undefined);
});

test("a payload announcing a disconnected client yields the disconnected model", () => {
  const model = readScreen('{"connected":false}');

  assert.equal(model.connected, false);
  assert.equal(model.statusText, "DISCONNECTED");
});

test("a missing payload yields the disconnected model instead of a blank screen", () => {
  for (const raw of [undefined, null, "", "   "]) {
    const model = readScreen(raw);

    assert.equal(model.connected, false, `raw=${JSON.stringify(raw)}`);
    assert.equal(model.statusText, "DISCONNECTED", `raw=${JSON.stringify(raw)}`);
  }
});

test("a payload without the connected field yields the disconnected model", () => {
  const model = readScreen('{"phase":3}');

  assert.equal(model.connected, false);
  assert.equal(model.statusText, "DISCONNECTED");
});

test("an unknown field is accepted and ignored", () => {
  const model = readScreen('{"connected":true,"somethingTheAppNeverHeardOf":{"deep":[1,2]}}');

  assert.equal(model.connected, true);
  assert.equal(model.statusText, "CONNECTED");
  assert.equal(model.fault, undefined);
});

test("malformed JSON yields the disconnected model and a fault to log", () => {
  const model = readScreen('{"connected":true');

  assert.equal(model.connected, false);
  assert.equal(model.statusText, "DISCONNECTED");
  assert.match(model.fault ?? "", /malformed payload/i);
});

test("a payload that is valid JSON but not an object yields the disconnected model and a fault", () => {
  const model = readScreen("42");

  assert.equal(model.connected, false);
  assert.match(model.fault ?? "", /not an object/i);
});

test("a non-boolean connected field is refused rather than coerced", () => {
  for (const raw of ['{"connected":"true"}', '{"connected":1}', '{"connected":null}']) {
    const model = readScreen(raw);

    assert.equal(model.connected, false, raw);
    assert.match(model.fault ?? "", /expected boolean/i, raw);
  }
});

test("a client that goes away wipes the turnaround instead of freezing the last numbers", () => {
  const model = readScreen(payloadWith({ connected: false }));

  assert.equal(model.statusText, "DISCONNECTED");
  assert.deepEqual(model.chips, []);
  assert.equal(model.state, null);
  assert.deepEqual(model.advisories, []);
  assert.deepEqual(model.cards, []);
  assert.equal(model.commandError, null);
});

test("the departure payload says the same thing as a full payload gone dark", () => {
  assert.deepEqual(readScreen('{"connected":false}'), readScreen(payloadWith({ connected: false })));
});

test("the disconnected model and a departure payload say the same thing", () => {
  assert.deepEqual(readScreen('{"connected":false}'), disconnectedScreen());
});

test("the model never outgrows the slots the page draws", () => {
  const model = readScreen(FULL_PAYLOAD);

  assert.ok(model.chips.length <= CHIP_SLOTS, `${model.chips.length} chips`);
  assert.ok(model.advisories.length <= ADVISORY_SLOTS, `${model.advisories.length} advisories`);
  assert.ok(model.cards.length <= CARD_SLOTS, `${model.cards.length} cards`);

  for (const card of model.cards) {
    assert.ok(card.rows.length <= ROW_SLOTS, `${card.title} has ${card.rows.length} rows`);
  }
});
