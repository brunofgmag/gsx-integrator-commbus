import { disconnectedScreen, readScreen } from "./screen.ts";
import type { ScreenModel } from "./screen.ts";

export const STATE_CHANNEL = "GSXI.Efb.State";
export const HELLO_CHANNEL = "GSXI.Efb.Hello";
export const COMMAND_CHANNEL = "GSXI.Efb.Command";
export const RELAY_CHANNEL = "GSXI.Bridge.JsRelay";
export const COMMBUS_SERVICE = "/JS/Services/CommBus.js";

export const SILENCE_MS = 5000;
export const ANSWER_DEADLINE_MS = 5000;
export const POLL_MS = 1000;

export type ScreenListener = (model: ScreenModel) => void;

export interface CommBusListener {
  on(channel: string, handler: (payload: string) => void): void;
  callWasm?(channel: string, payload: string): void;
}

export type ListenerFactory = (onReady: () => void) => CommBusListener;

const log = (...args: unknown[]): void => console.log("[GSXI][efb-app]", ...args);
const warn = (...args: unknown[]): void => console.warn("[GSXI][efb-app]", ...args);

declare const global: unknown;

function simulatorScope(): Record<string, unknown> {
  return (typeof window !== "undefined" ? window : global) as Record<string, unknown>;
}

function simulatorListenerFactory(): ListenerFactory | undefined {
  const scope = simulatorScope();

  const commBus = scope["RegisterCommBusListener"];
  if (typeof commBus === "function") {
    return commBus as ListenerFactory;
  }

  const view = scope["RegisterViewListener"];
  if (typeof view === "function") {
    return (onReady) =>
      (view as (name: string, onReady: () => void) => CommBusListener)("JS_LISTENER_COMM_BUS", onReady);
  }

  return undefined;
}

export class ClientChannel {
  private model: ScreenModel = disconnectedScreen();
  private readonly listeners = new Set<ScreenListener>();
  private started = false;
  private listener: CommBusListener | null = null;
  private lastHeardMs: number | null = null;
  private askedMs: number | null = null;
  private lastRaw: string | null = null;
  private subscribed = false;

  private readonly resolveFactory: () => ListenerFactory | undefined;

  public constructor(resolveFactory: () => ListenerFactory | undefined = simulatorListenerFactory) {
    this.resolveFactory = resolveFactory;
  }

  public get current(): ScreenModel {
    return this.model;
  }

  public subscribe(listener: ScreenListener): () => void {
    this.listeners.add(listener);
    listener(this.model);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public accept(raw: unknown, nowMs = Date.now()): void {
    this.lastHeardMs = nowMs;
    this.askedMs = null;

    const next = readScreen(raw);
    if (next.fault !== undefined) {
      warn(`dropping message on ${STATE_CHANNEL}:`, next.fault);
    }

    this.publish(next, typeof raw === "string" ? raw : "");
  }

  public poll(nowMs: number): void {
    if (this.listener === null) {
      return;
    }

    if (this.askedMs !== null) {
      if (nowMs - this.askedMs >= ANSWER_DEADLINE_MS) {
        this.askedMs = null;
        this.lastHeardMs = nowMs;
        this.publish(disconnectedScreen(), null);
      }

      return;
    }

    if (this.lastHeardMs === null || nowMs - this.lastHeardMs >= SILENCE_MS) {
      this.ask(nowMs);
    }
  }

  private listen(): void {
    if (this.subscribed || this.listener === null) {
      return;
    }

    this.subscribed = true;
    this.listener.on(STATE_CHANNEL, (payload) => this.accept(payload));
    log(`listening on ${STATE_CHANNEL}`);
  }

  private ask(nowMs: number): void {
    this.askedMs = nowMs;
    this.sayHello();
  }

  private publish(next: ScreenModel, raw: string | null): void {
    if (raw === this.lastRaw) {
      return;
    }

    this.lastRaw = raw;
    this.model = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  public send(command: string): void {
    this.relay(COMMAND_CHANNEL, JSON.stringify({ command }));
  }

  private sayHello(): void {
    this.relay(HELLO_CHANNEL, "hello");
  }

  private relay(channel: string, payload: string): void {
    const callWasm = this.listener?.callWasm;
    if (callWasm === undefined) {
      warn(`the listener has no callWasm; nothing reaches the client on ${channel}.`);
      return;
    }

    callWasm.call(this.listener, RELAY_CHANNEL, JSON.stringify({ channel, payload }));
  }

  public async start(loadService: () => Promise<void>): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    try {
      await loadService();
    } catch (error) {
      warn(`failed to load ${COMMBUS_SERVICE}; falling back to the bare view listener.`, error);
    }


    const factory = this.resolveFactory();
    if (factory === undefined) {
      warn("no CommBus listener factory available; the app stays disconnected.");
      return;
    }

    this.listener = factory(() => {
      this.listen();
      this.ask(Date.now());
    });

    this.listen();
  }
}

export const clientChannel = new ClientChannel();
