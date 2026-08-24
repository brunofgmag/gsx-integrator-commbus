import { App, AppBootMode, AppSuspendMode, AppView, Efb } from "@efb/efb-api";
import type { AppInstallProps, AppViewProps, RequiredProps, TVNode } from "@efb/efb-api";
import { FSComponent, Subject } from "@microsoft/msfs-sdk";
import type { VNode } from "@microsoft/msfs-sdk";

import { clientChannel, COMMBUS_SERVICE, POLL_MS } from "./state/ClientChannel.ts";
import { ConnectionPage } from "./Components/ConnectionPage.tsx";

import "./GsxIntegrator.scss";

declare const BASE_URL: string;

async function loadOnce(load: () => Promise<void>): Promise<void> {
  try {
    await load();
  } catch (reason) {
    const text = String(reason);
    if (!text.includes("already loaded")) {
      throw reason;
    }
  }
}

class GsxIntegratorView extends AppView<RequiredProps<AppViewProps, "bus">> {
  private readonly statusText = Subject.create(clientChannel.current.statusText);
  private readonly connected = Subject.create(clientChannel.current.connected);
  private unsubscribe: (() => void) | null = null;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.unsubscribe = clientChannel.subscribe((model) => {
      this.statusText.set(model.statusText);
      this.connected.set(model.connected);
    });
  }

  public destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.destroy();
  }

  public render(): VNode {
    return (
      <div class="gsx-integrator-app">
        <ConnectionPage statusText={this.statusText} connected={this.connected} />
      </div>
    );
  }
}

class GsxIntegrator extends App {
  public BootMode = AppBootMode.WARM;

  public SuspendMode = AppSuspendMode.SLEEP;

  public get name(): string {
    return "GSX Integrator";
  }

  public get icon(): string {
    return `${BASE_URL}/Assets/app-icon.svg`;
  }

  public async install(_props: AppInstallProps): Promise<void> {
    await loadOnce(() => Efb.loadCss(`${BASE_URL}/GsxIntegrator.css`));
    await clientChannel.start(() => loadOnce(() => Efb.loadJs(COMMBUS_SERVICE)));

    window.setInterval(() => clientChannel.poll(Date.now()), POLL_MS);
  }

  public get compatibleAircraftModels(): string[] | undefined {
    return undefined;
  }

  public render(): TVNode<GsxIntegratorView> {
    return <GsxIntegratorView bus={this.bus} />;
  }
}

Efb.use(GsxIntegrator);
