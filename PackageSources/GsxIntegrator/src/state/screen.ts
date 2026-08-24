export type Tone = "text" | "muted" | "accent" | "ok" | "warn" | "error";

export interface StatusChip {
  label: string;
  value: string;
  tone: Tone;
}

export interface DataRow {
  label: string;
  value: string;
}

export type CardId = "fuel" | "pax" | "simbrief";

export interface DataCard {
  id: CardId;
  title: string;
  metric: string;
  metricTone: Tone;
  progress: number | null;
  refusal: string | null;
  rows: DataRow[];
}

export interface StateCard {
  title: string;
  counter: string;
  text: string;
  pilotMark: string | null;
  next: string;
  countdown: string;
}

export interface CommandError {
  label: string;
  text: string;
}

export interface ScreenModel {
  connected: boolean;
  statusText: string;
  chips: StatusChip[];
  state: StateCard | null;
  advisories: string[];
  commandError: CommandError | null;
  cards: DataCard[];
  fault?: string;
}

export const CHIP_SLOTS = 5;
export const ADVISORY_SLOTS = 5;
export const CARD_SLOTS = 3;
export const ROW_SLOTS = 3;

const CONNECTED_TEXT = "CONNECTED";
const DISCONNECTED_TEXT = "DISCONNECTED";

type Fields = Record<string, unknown>;

export function disconnectedScreen(): ScreenModel {
  return disconnected();
}

function disconnected(fault?: string): ScreenModel {
  const model: ScreenModel = {
    connected: false,
    statusText: DISCONNECTED_TEXT,
    chips: [],
    state: null,
    advisories: [],
    commandError: null,
    cards: [],
  };

  return fault === undefined ? model : { ...model, fault };
}

type Decoded = { fields: Fields } | { silent: true } | { fault: string };

function decode(raw: unknown): Decoded {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { silent: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { fault: `malformed payload: ${(error as Error).message}` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { fault: `payload is not an object: ${typeof parsed}` };
  }

  const fields = parsed as Fields;
  const connected = fields["connected"];

  if (connected === undefined || connected === false) {
    return { silent: true };
  }

  if (typeof connected !== "boolean") {
    return { fault: `field "connected" is ${typeof connected}, expected boolean` };
  }

  return { fields };
}

export function readScreen(raw: unknown): ScreenModel {
  const decoded = decode(raw);

  if ("fault" in decoded) {
    return disconnected(decoded.fault);
  }

  if ("silent" in decoded) {
    return disconnected();
  }

  const fields = decoded.fields;

  return {
    connected: true,
    statusText: CONNECTED_TEXT,
    chips: readChips(fields),
    state: readState(fields),
    advisories: readAdvisories(fields),
    commandError: readCommandError(fields),
    cards: readCards(fields),
  };
}

function text(fields: Fields, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function flag(fields: Fields, key: string): boolean {
  return fields[key] === true;
}

function number(fields: Fields, key: string): number | null {
  const value = fields[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function chip(fields: Fields, labelKey: string, valueKey: string, tone: Tone): StatusChip | null {
  const label = text(fields, labelKey);
  const value = text(fields, valueKey);

  return label === null || value === null ? null : { label, value, tone };
}

function readChips(fields: Fields): StatusChip[] {
  return [
    chip(fields, "simLabel", "simStatusText", "ok"),
    chip(fields, "gsxLabel", "gsxStatusText", flag(fields, "gsxAvailable") ? "ok" : "warn"),
    chip(
      fields,
      "aircraftLabel",
      "aircraftNameText",
      flag(fields, "aircraftSupported") ? "text" : "muted",
    ),
    chip(
      fields,
      "turnaroundModeLabel",
      "turnaroundModeText",
      flag(fields, "enabled") ? "accent" : "muted",
    ),
    chip(
      fields,
      "loadingModeLabel",
      "loadingModeText",
      flag(fields, "autoStartLoading") ? "accent" : "muted",
    ),
  ].filter((entry): entry is StatusChip => entry !== null);
}

function readState(fields: Fields): StateCard | null {
  const stateText = text(fields, "stateText");
  if (stateText === null) {
    return null;
  }

  return {
    title: text(fields, "turnaroundStateLabel") ?? "",
    counter: text(fields, "phaseCounterText") ?? "",
    text: stateText,
    pilotMark: flag(fields, "advancedByPilot") ? text(fields, "advancedByPilotText") : null,
    next: text(fields, "nextPhaseText") ?? "",
    countdown: text(fields, "holdCountdownText") ?? "",
  };
}

function readAdvisories(fields: Fields): string[] {
  const raised: (string | null)[] = [
    flag(fields, "gsxProfileConflict") ? text(fields, "gsxProfileAdvisoryText") : null,
    flag(fields, "pmdgOptionsConflict") ? text(fields, "pmdgOptionsAdvisoryText") : null,
    flag(fields, "cargoDoorStuck") ? text(fields, "cargoDoorAdvisoryText") : null,
    flag(fields, "fuelRequestStalled") ? text(fields, "fuelRequestAdvisoryText") : null,
    text(fields, "phaseTip"),
  ];

  return raised.filter((entry): entry is string => entry !== null);
}

function readCommandError(fields: Fields): CommandError | null {
  const message = text(fields, "commandError");
  if (message === null) {
    return null;
  }

  return { label: text(fields, "commandErrorLabel") ?? "", text: message };
}

function row(fields: Fields, labelKey: string, valueKey: string): DataRow | null {
  const label = text(fields, labelKey);
  const value = text(fields, valueKey);

  return label === null || value === null ? null : { label, value };
}

function rows(fields: Fields, pairs: [string, string][]): DataRow[] {
  return pairs
    .map(([labelKey, valueKey]) => row(fields, labelKey, valueKey))
    .filter((entry): entry is DataRow => entry !== null);
}

function card(
  fields: Fields,
  id: CardId,
  titleKey: string,
  metricKey: string,
  metricTone: Tone,
  progress: number | null,
  refusalKey: string | null,
  pairs: [string, string][],
): DataCard | null {
  const title = text(fields, titleKey);
  if (title === null) {
    return null;
  }

  return {
    id,
    title,
    metric: text(fields, metricKey) ?? "",
    metricTone,
    progress,
    refusal: refusalKey === null ? null : text(fields, refusalKey),
    rows: rows(fields, pairs),
  };
}

function simbriefTone(fields: Fields): Tone {
  if (flag(fields, "simbriefReady")) {
    return "ok";
  }

  return flag(fields, "simbriefError") ? "error" : "muted";
}

function paxCard(fields: Fields): DataCard | null {
  const progress = flag(fields, "inDeboardingPhase")
    ? number(fields, "deboardingProgress")
    : number(fields, "boardingProgress");

  const rows: [string, string][] = flag(fields, "cargoAircraft")
    ? [["targetZfwLabel", "targetZfwText"]]
    : [
        ["paxLabel", "paxCountText"],
        ["targetZfwLabel", "targetZfwText"],
      ];

  return card(fields, "pax", "paxCardLabel", "paxProgressText", "accent", progress, null, rows);
}

function readCards(fields: Fields): DataCard[] {
  return [
    card(fields, "fuel", "fuelCardLabel", "fuelProgressText", "accent", number(fields, "fuelProgress"), null, [
      ["loadedFuelLabel", "loadedFuelText"],
      ["targetFuelLabel", "targetFuelText"],
      ["fuelRateLabel", "fuelRateText"],
    ]),
    paxCard(fields),
    card(
      fields,
      "simbrief",
      "simbriefCardLabel",
      "simbriefStatusText",
      simbriefTone(fields),
      null,
      "simbriefRefusal",
      [
        ["plannedFuelLabel", "plannedFuelText"],
        ["plannedZfwLabel", "plannedZfwText"],
        ["plannedPaxLabel", "plannedPaxText"],
      ],
    ),
  ].filter((entry): entry is DataCard => entry !== null);
}
