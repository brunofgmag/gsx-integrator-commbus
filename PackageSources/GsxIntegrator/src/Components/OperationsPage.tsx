import { DisplayComponent, FSComponent } from "@microsoft/msfs-sdk";
import type { ComponentProps, NodeReference, Subscribable, Subscription, VNode } from "@microsoft/msfs-sdk";

import { ACTION_SLOTS, ADVISORY_SLOTS, CARD_SLOTS, CHIP_SLOTS, ROW_SLOTS } from "../state/screen.ts";
import type { Action, ActionId, DataCard, DataRow, ScreenModel, StatusChip, Touch } from "../state/screen.ts";

import "./OperationsPage.scss";

function display(ref: NodeReference<HTMLElement>, visible: boolean): void {
  ref.instance.style.display = visible ? "" : "none";
}

function refs<T extends DisplayComponent<any>>(count: number): NodeReference<T>[] {
  return Array.from({ length: count }, () => FSComponent.createRef<T>());
}

function within(progress: number): number {
  return Math.max(0, Math.min(100, progress));
}

class RowSlot extends DisplayComponent<ComponentProps> {
  private readonly root = FSComponent.createRef<HTMLDivElement>();
  private readonly label = FSComponent.createRef<HTMLSpanElement>();
  private readonly value = FSComponent.createRef<HTMLSpanElement>();

  public update(row: DataRow | null): void {
    display(this.root, row !== null);

    if (row === null) {
      return;
    }

    this.label.instance.textContent = row.label;
    this.value.instance.textContent = row.value;
  }

  public render(): VNode {
    return (
      <div class="data-row" ref={this.root}>
        <span class="row-label" ref={this.label} />
        <span class="row-value" ref={this.value} />
      </div>
    );
  }
}

class CardSlot extends DisplayComponent<ComponentProps> {
  private readonly root = FSComponent.createRef<HTMLDivElement>();
  private readonly title = FSComponent.createRef<HTMLSpanElement>();
  private readonly metric = FSComponent.createRef<HTMLSpanElement>();
  private readonly track = FSComponent.createRef<HTMLDivElement>();
  private readonly fill = FSComponent.createRef<HTMLDivElement>();
  private readonly refusal = FSComponent.createRef<HTMLDivElement>();
  private readonly rows = refs<RowSlot>(ROW_SLOTS);

  public update(card: DataCard | null): void {
    display(this.root, card !== null);

    if (card === null) {
      return;
    }

    this.root.instance.className = `data-card data-card-${card.id}`;
    this.title.instance.textContent = card.title;
    this.metric.instance.textContent = card.metric;
    this.metric.instance.className = `card-metric tone-${card.metricTone}`;

    display(this.track, card.progress !== null);
    if (card.progress !== null) {
      this.fill.instance.style.width = `${within(card.progress)}%`;
    }

    display(this.refusal, card.refusal !== null);
    this.refusal.instance.textContent = card.refusal ?? "";

    for (let slot = 0; slot < ROW_SLOTS; slot += 1) {
      this.rows[slot]?.instance.update(card.rows[slot] ?? null);
    }
  }

  public render(): VNode {
    return (
      <div class="data-card" ref={this.root}>
        <div class="card-head">
          <span class="card-title" ref={this.title} />
          <span class="card-metric" ref={this.metric} />
        </div>
        <div class="card-track" ref={this.track}>
          <div class="card-fill" ref={this.fill} />
        </div>
        <div class="card-refusal" ref={this.refusal} />
        <div class="card-rows">
          {this.rows.map((row) => (
            <RowSlot ref={row} />
          ))}
        </div>
      </div>
    );
  }
}

class ChipSlot extends DisplayComponent<ComponentProps> {
  private readonly root = FSComponent.createRef<HTMLDivElement>();
  private readonly text = FSComponent.createRef<HTMLSpanElement>();

  public update(chip: StatusChip | null): void {
    display(this.root, chip !== null);

    if (chip === null) {
      return;
    }

    this.text.instance.textContent = chip.label;
    this.text.instance.className = `chip-text tone-${chip.tone}`;
  }

  public render(): VNode {
    return (
      <span class="status-chip" ref={this.root}>
        <span class="chip-text" ref={this.text} />
      </span>
    );
  }
}

class AdvisorySlot extends DisplayComponent<ComponentProps> {
  private readonly root = FSComponent.createRef<HTMLDivElement>();
  private readonly text = FSComponent.createRef<HTMLSpanElement>();

  public update(advisory: string | null): void {
    display(this.root, advisory !== null);

    if (advisory === null) {
      return;
    }

    this.text.instance.textContent = advisory;
  }

  public render(): VNode {
    return (
      <div class="advisory" ref={this.root}>
        <span class="advisory-badge">Advisory</span>
        <span class="advisory-text" ref={this.text} />
      </div>
    );
  }
}

const DISARM_MS = 3000;

interface ActionSlotProps extends ComponentProps {
  onTouch: (id: ActionId) => void;
}

class ActionSlot extends DisplayComponent<ActionSlotProps> {
  private readonly root = FSComponent.createRef<HTMLButtonElement>();
  private readonly label = FSComponent.createRef<HTMLSpanElement>();

  private action: Action | null = null;
  private armed = false;
  private disarmHandle: number | null = null;

  private readonly onClick = (): void => this.touch();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.root.instance.addEventListener("click", this.onClick);
  }

  public update(action: Action | null): void {
    display(this.root, action !== null);

    const changed = action?.id !== this.action?.id || action?.enabled !== this.action?.enabled;
    this.action = action;

    if (changed) {
      this.disarm();
    }

    this.paint();
  }

  public destroy(): void {
    this.clearTimer();
    this.root.instance.removeEventListener("click", this.onClick);
    super.destroy();
  }

  private paint(): void {
    if (this.action === null) {
      return;
    }

    this.label.instance.textContent = this.armed
      ? (this.action.confirmLabel ?? this.action.label)
      : this.action.label;

    const state = this.armed ? " armed" : "";
    this.root.instance.className = `action-button${this.action.enabled ? "" : " disabled"}${state}`;
  }

  private clearTimer(): void {
    if (this.disarmHandle !== null) {
      window.clearTimeout(this.disarmHandle);
      this.disarmHandle = null;
    }
  }

  private disarm(): void {
    this.clearTimer();
    this.armed = false;
  }

  private touch(): void {
    if (this.action === null || !this.action.enabled) {
      return;
    }

    if (this.action.confirmLabel !== null && !this.armed) {
      this.armed = true;
      this.clearTimer();
      this.disarmHandle = window.setTimeout(() => {
        this.disarm();
        this.paint();
      }, DISARM_MS);
      this.paint();

      return;
    }

    const id = this.action.id;
    this.disarm();
    this.paint();
    this.props.onTouch(id);
  }

  public render(): VNode {
    return (
      <button class="action-button" ref={this.root}>
        <span class="action-label" ref={this.label} />
      </button>
    );
  }
}

interface TouchSlotProps extends ComponentProps {
  onTouch: (phase: number) => void;
}

class TouchSlot extends DisplayComponent<TouchSlotProps> {
  private readonly root = FSComponent.createRef<HTMLButtonElement>();
  private readonly label = FSComponent.createRef<HTMLSpanElement>();

  private touch: Touch | null = null;

  private readonly onClick = (): void => this.press();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.root.instance.addEventListener("click", this.onClick);
  }

  public update(touch: Touch | null): void {
    display(this.root, touch !== null);
    this.touch = touch;

    if (touch === null) {
      return;
    }

    this.label.instance.textContent = touch.label;
    this.root.instance.className = `touch-button${touch.enabled ? "" : " disabled"}`;
  }

  public destroy(): void {
    this.root.instance.removeEventListener("click", this.onClick);
    super.destroy();
  }

  private press(): void {
    if (this.touch === null || !this.touch.enabled) {
      return;
    }

    this.props.onTouch(this.touch.phase);
  }

  public render(): VNode {
    return (
      <button class="touch-button" ref={this.root}>
        <span class="touch-label" ref={this.label} />
      </button>
    );
  }
}

export interface OperationsPageProps extends ComponentProps {
  model: Subscribable<ScreenModel>;
  onTouch: (id: ActionId) => void;
  onPilotTouch: (phase: number) => void;
}

export class OperationsPage extends DisplayComponent<OperationsPageProps> {
  private readonly offline = FSComponent.createRef<HTMLDivElement>();
  private readonly online = FSComponent.createRef<HTMLDivElement>();
  private readonly offlineDot = FSComponent.createRef<HTMLSpanElement>();
  private readonly offlineText = FSComponent.createRef<HTMLSpanElement>();

  private readonly stateCard = FSComponent.createRef<HTMLDivElement>();
  private readonly stateTitle = FSComponent.createRef<HTMLSpanElement>();
  private readonly stateCounter = FSComponent.createRef<HTMLSpanElement>();
  private readonly stateText = FSComponent.createRef<HTMLDivElement>();
  private readonly pilotMark = FSComponent.createRef<HTMLDivElement>();
  private readonly nextPhase = FSComponent.createRef<HTMLSpanElement>();
  private readonly countdown = FSComponent.createRef<HTMLSpanElement>();

  private readonly errorStrip = FSComponent.createRef<HTMLDivElement>();
  private readonly errorLabel = FSComponent.createRef<HTMLSpanElement>();
  private readonly errorText = FSComponent.createRef<HTMLSpanElement>();

  private readonly chips = refs<ChipSlot>(CHIP_SLOTS);
  private readonly advisories = refs<AdvisorySlot>(ADVISORY_SLOTS);
  private readonly cards = refs<CardSlot>(CARD_SLOTS);
  private readonly actions = refs<ActionSlot>(ACTION_SLOTS);
  private readonly pilotTouch = FSComponent.createRef<TouchSlot>();
  private readonly actionBar = FSComponent.createRef<HTMLDivElement>();

  private subscription: Subscription | null = null;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscription = this.props.model.sub((model) => this.update(model), true);
  }

  public destroy(): void {
    this.subscription?.destroy();
    this.subscription = null;
    super.destroy();
  }

  private update(model: ScreenModel): void {
    display(this.offline, !model.connected);
    display(this.online, model.connected);

    this.offlineDot.instance.className = model.connected ? "dot dot-ok" : "dot dot-off";
    this.offlineText.instance.textContent = model.statusText;

    for (let slot = 0; slot < CHIP_SLOTS; slot += 1) {
      this.chips[slot]?.instance.update(model.chips[slot] ?? null);
    }

    display(this.stateCard, model.state !== null);
    if (model.state !== null) {
      this.stateTitle.instance.textContent = model.state.title;
      this.stateCounter.instance.textContent = model.state.counter;
      this.stateText.instance.textContent = model.state.text;
      display(this.pilotMark, model.state.pilotMark !== null);
      this.pilotMark.instance.textContent = model.state.pilotMark ?? "";
      this.nextPhase.instance.textContent = model.state.next;
      display(this.countdown, model.state.countdown !== "");
      this.countdown.instance.textContent = model.state.countdown;
    }

    for (let slot = 0; slot < ADVISORY_SLOTS; slot += 1) {
      this.advisories[slot]?.instance.update(model.advisories[slot] ?? null);
    }

    display(this.errorStrip, model.commandError !== null);
    if (model.commandError !== null) {
      this.errorLabel.instance.textContent = model.commandError.label;
      this.errorText.instance.textContent = model.commandError.text;
    }

    for (let slot = 0; slot < CARD_SLOTS; slot += 1) {
      this.cards[slot]?.instance.update(model.cards[slot] ?? null);
    }

    display(this.actionBar, model.actions.length > 0 || model.touch !== null);
    this.pilotTouch.instance.update(model.touch);
    for (let slot = 0; slot < ACTION_SLOTS; slot += 1) {
      this.actions[slot]?.instance.update(model.actions[slot] ?? null);
    }
  }

  public render(): VNode {
    return (
      <div class="operations-page">
        <div class="offline" ref={this.offline}>
          <div class="offline-card">
            <span class="offline-label">GSX INTEGRATOR</span>
            <div class="offline-status">
              <span class="dot dot-off" ref={this.offlineDot} />
              <span class="offline-text" ref={this.offlineText} />
            </div>
            <p class="offline-hint">Start GSX Integrator on your desktop.</p>
          </div>
        </div>

        <div class="online" ref={this.online}>
          <div class="page-header">
            <span class="header-label">GSX INTEGRATOR</span>
            <span class="header-status">
              <span class="dot dot-ok" />
            </span>
          </div>

          <div class="page-body">
            <div class="chip-strip">
              {this.chips.map((chip) => (
                <ChipSlot ref={chip} />
              ))}
            </div>

            <div class="state-card" ref={this.stateCard}>
              <div class="state-head">
                <span class="state-title" ref={this.stateTitle} />
                <span class="state-counter" ref={this.stateCounter} />
              </div>
              <div class="state-text" ref={this.stateText} />
              <div class="pilot-mark" ref={this.pilotMark} />
              <div class="state-next">
                <span class="next-phase" ref={this.nextPhase} />
                <span class="next-countdown" ref={this.countdown} />
              </div>
            </div>

            <div class="card-grid">
              {this.cards.map((card) => (
                <CardSlot ref={card} />
              ))}
            </div>

            <div class="error-strip" ref={this.errorStrip}>
              <span class="error-badge" ref={this.errorLabel} />
              <span class="error-text" ref={this.errorText} />
            </div>

            <div class="advisory-list">
              {this.advisories.map((advisory) => (
                <AdvisorySlot ref={advisory} />
              ))}
            </div>
          </div>

          <div class="action-bar" ref={this.actionBar}>
            <TouchSlot ref={this.pilotTouch} onTouch={this.props.onPilotTouch} />
            {this.actions.map((action) => (
              <ActionSlot ref={action} onTouch={this.props.onTouch} />
            ))}
          </div>
        </div>
      </div>
    );
  }
}
