import { DisplayComponent, FSComponent } from "@microsoft/msfs-sdk";
import type { ComponentProps, Subscribable, VNode } from "@microsoft/msfs-sdk";

import "./ConnectionPage.scss";

export interface ConnectionPageProps extends ComponentProps {
  statusText: Subscribable<string>;
  connected: Subscribable<boolean>;
}

export class ConnectionPage extends DisplayComponent<ConnectionPageProps> {
  public render(): VNode {
    return (
      <div class="connection-page">
        <div class="card">
          <span class="card-label">GSX INTEGRATOR</span>
          <div class="status-row">
            <span
              class={this.props.connected.map((connected) => (connected ? "dot dot-ok" : "dot dot-off"))}
            />
            <span class="status-text">{this.props.statusText}</span>
          </div>
        </div>
      </div>
    );
  }
}
