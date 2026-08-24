export interface ConnectionModel {
  connected: boolean;
  statusText: string;
  fault?: string;
}

const CONNECTED_TEXT = "CONNECTED";
const DISCONNECTED_TEXT = "DISCONNECTED";

export function disconnectedModel(): ConnectionModel {
  return disconnected();
}

function disconnected(fault?: string): ConnectionModel {
  return fault === undefined
    ? { connected: false, statusText: DISCONNECTED_TEXT }
    : { connected: false, statusText: DISCONNECTED_TEXT, fault };
}

export function readConnection(raw: unknown): ConnectionModel {
  if (typeof raw !== "string" || raw.trim() === "") {
    return disconnected();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    return disconnected(`malformed payload: ${(error as Error).message}`);
  }

  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return disconnected(`payload is not an object: ${typeof decoded}`);
  }

  const connected = (decoded as Record<string, unknown>)["connected"];
  if (connected === undefined) {
    return disconnected();
  }

  if (typeof connected !== "boolean") {
    return disconnected(`field "connected" is ${typeof connected}, expected boolean`);
  }

  return connected
    ? { connected: true, statusText: CONNECTED_TEXT }
    : disconnected();
}
