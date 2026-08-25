import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANSWER_DEADLINE_MS,
  ClientChannel,
  COMMAND_CHANNEL,
  COMMBUS_SERVICE,
  HELLO_CHANNEL,
  RELAY_CHANNEL,
  SILENCE_MS,
  STATE_CHANNEL,
} from "./ClientChannel.ts";

test("a channel that has heard nothing reports disconnected", () => {
  const channel = new ClientChannel();

  assert.equal(channel.current.connected, false);
  assert.equal(channel.current.statusText, "DISCONNECTED");
});

test("a subscriber joining later is handed the last state at once", () => {
  const channel = new ClientChannel();
  channel.accept('{"connected":true}');

  const seen: boolean[] = [];
  channel.subscribe((model) => seen.push(model.connected));

  assert.deepEqual(seen, [true]);
});

test("subscribers are notified when the state changes", () => {
  const channel = new ClientChannel();
  const seen: boolean[] = [];
  channel.subscribe((model) => seen.push(model.connected));

  channel.accept('{"connected":true}');
  channel.accept('{"connected":false}');

  assert.deepEqual(seen, [false, true, false]);
});

test("an unchanged state does not wake the subscribers again", () => {
  const channel = new ClientChannel();
  channel.accept('{"connected":true}');

  const seen: boolean[] = [];
  channel.subscribe((model) => seen.push(model.connected));
  channel.accept('{"connected":true}');

  assert.deepEqual(seen, [true]);
});

test("a payload whose numbers moved wakes the subscribers", () => {
  const channel = new ClientChannel();
  channel.accept('{"connected":true,"fuelCardLabel":"Fuel","fuelProgress":10,"fuelProgressText":"10%"}');

  const seen: (number | null | undefined)[] = [];
  channel.subscribe((model) => seen.push(model.cards[0]?.progress));
  channel.accept('{"connected":true,"fuelCardLabel":"Fuel","fuelProgress":55,"fuelProgressText":"55%"}');

  assert.deepEqual(seen, [10, 55]);
});

test("a malformed message leaves the app disconnected instead of throwing", () => {
  const channel = new ClientChannel();
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    channel.accept('{"connected":true');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(channel.current.connected, false);
  assert.equal(warnings.length, 1);
});

test("unsubscribing stops the notifications", () => {
  const channel = new ClientChannel();
  const seen: boolean[] = [];
  const stop = channel.subscribe((model) => seen.push(model.connected));

  stop();
  channel.accept('{"connected":true}');

  assert.deepEqual(seen, [false]);
});

test("starting subscribes to the state channel once the service is loaded", async () => {
  const handlers = new Map<string, (payload: string) => void>();
  const listener = { on: (channel: string, handler: (payload: string) => void) => handlers.set(channel, handler) };
  const channel = new ClientChannel(() => (onReady) => {
    queueMicrotask(onReady);
    return listener;
  });

  const loaded: string[] = [];
  await channel.start(async () => {
    loaded.push(COMMBUS_SERVICE);
  });
  await new Promise((resolve) => queueMicrotask(() => resolve(null)));

  assert.deepEqual(loaded, [COMMBUS_SERVICE]);
  assert.ok(handlers.has(STATE_CHANNEL));

  handlers.get(STATE_CHANNEL)?.('{"connected":true}');
  assert.equal(channel.current.connected, true);
});

test("starting twice registers a single listener", async () => {
  let factories = 0;
  const channel = new ClientChannel(() => {
    factories += 1;
    return () => ({ on: () => undefined });
  });

  await channel.start(async () => undefined);
  await channel.start(async () => undefined);

  assert.equal(factories, 1);
});

test("a service that fails to load still lets the app register a listener", async () => {
  let registered = false;
  const channel = new ClientChannel(() => () => {
    registered = true;
    return { on: () => undefined };
  });

  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    await channel.start(async () => {
      throw new Error("coui refused");
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(registered, true);
});

test("a simulator with no listener factory leaves the app disconnected without throwing", async () => {
  const channel = new ClientChannel(() => undefined);

  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    await channel.start(async () => undefined);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(channel.current.connected, false);
  assert.equal(warnings.length, 1);
});

test("the app announces itself so a client that is already connected republishes", async () => {
  const sent: Array<[string, string]> = [];
  const listener = {
    on: () => undefined,
    callWasm: (channel: string, payload: string) => sent.push([channel, payload]),
  };
  const channel = new ClientChannel(() => (onReady) => {
    queueMicrotask(onReady);
    return listener;
  });

  await channel.start(async () => undefined);
  await new Promise((resolve) => queueMicrotask(() => resolve(null)));

  assert.deepEqual(sent, [[RELAY_CHANNEL, JSON.stringify({ channel: HELLO_CHANNEL, payload: "hello" })]]);
});

test("a listener without callWasm warns instead of throwing", async () => {
  const channel = new ClientChannel(() => (onReady) => {
    queueMicrotask(onReady);
    return { on: () => undefined };
  });

  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    await channel.start(async () => undefined);
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});

function pollingChannel(): { channel: ClientChannel; sent: Array<[string, string]> } {
  const sent: Array<[string, string]> = [];
  const listener = {
    on: () => undefined,
    callWasm: (channel: string, payload: string) => sent.push([channel, payload]),
  };
  const channel = new ClientChannel(() => (onReady) => {
    onReady();
    return listener;
  });

  return { channel, sent };
}

async function started(): Promise<{ channel: ClientChannel; sent: Array<[string, string]> }> {
  const made = pollingChannel();
  await made.channel.start(async () => undefined);
  made.sent.length = 0;

  return made;
}

test("silence shorter than the threshold asks nothing", async () => {
  const { channel, sent } = await started();
  channel.accept('{"connected":true}', 0);

  channel.poll(SILENCE_MS - 1);

  assert.deepEqual(sent, []);
  assert.equal(channel.current.connected, true);
});

test("silence past the threshold makes the app ask whether the client is there", async () => {
  const { channel, sent } = await started();
  channel.accept('{"connected":true}', 0);

  channel.poll(SILENCE_MS);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.[0], RELAY_CHANNEL);
  assert.equal(channel.current.connected, true);
});

test("a question that goes unanswered declares the client gone", async () => {
  const { channel } = await started();
  channel.accept('{"connected":true}', 0);
  channel.poll(SILENCE_MS);

  channel.poll(SILENCE_MS + ANSWER_DEADLINE_MS - 1);
  assert.equal(channel.current.connected, true);

  channel.poll(SILENCE_MS + ANSWER_DEADLINE_MS);
  assert.equal(channel.current.connected, false);
});

test("an answer to the question keeps the app connected and stops the countdown", async () => {
  const { channel, sent } = await started();
  channel.accept('{"connected":true}', 0);
  channel.poll(SILENCE_MS);
  sent.length = 0;

  channel.accept('{"connected":true}', SILENCE_MS + 100);

  channel.poll(SILENCE_MS + 200);
  assert.deepEqual(sent, [], "a resposta zerou o silêncio");

  channel.poll(SILENCE_MS + ANSWER_DEADLINE_MS + 100);
  assert.equal(channel.current.connected, true, "o prazo da pergunta anterior não vale mais");
});

test("a client declared gone is asked about again, but not every tick", async () => {
  const { channel, sent } = await started();
  channel.accept('{"connected":true}', 0);
  channel.poll(SILENCE_MS);
  const dead = SILENCE_MS + ANSWER_DEADLINE_MS;
  channel.poll(dead);
  sent.length = 0;

  channel.poll(dead + 1);
  assert.deepEqual(sent, [], "não repergunta no tique seguinte");

  channel.poll(dead + SILENCE_MS);
  assert.equal(sent.length, 1, "repergunta depois de um silêncio inteiro");
});

test("a client that comes back is heard without waiting for the next question", async () => {
  const { channel } = await started();
  channel.poll(SILENCE_MS);
  channel.poll(SILENCE_MS + ANSWER_DEADLINE_MS);
  assert.equal(channel.current.connected, false);

  channel.accept('{"connected":true}', SILENCE_MS + ANSWER_DEADLINE_MS + 10);

  assert.equal(channel.current.connected, true);
});

test("a touch reaches the client through the same relay the hello uses", async () => {
  const sent: Array<[string, string]> = [];
  const listener = {
    on: () => undefined,
    callWasm: (channel: string, payload: string) => sent.push([channel, payload]),
  };
  const channel = new ClientChannel(() => (onReady) => {
    queueMicrotask(onReady);
    return listener;
  });

  await channel.start(async () => undefined);
  await new Promise((resolve) => queueMicrotask(() => resolve(null)));
  sent.length = 0;

  channel.send("startLoading");

  assert.deepEqual(sent, [
    [
      RELAY_CHANNEL,
      JSON.stringify({
        channel: COMMAND_CHANNEL,
        payload: JSON.stringify({ command: "startLoading" }),
      }),
    ],
  ]);
});

test("a touch with no way back warns instead of throwing", async () => {
  const channel = new ClientChannel(() => (onReady) => {
    queueMicrotask(onReady);
    return { on: () => undefined };
  });

  await channel.start(async () => undefined);
  await new Promise((resolve) => queueMicrotask(() => resolve(null)));

  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    channel.send("startLoading");
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});
