/**
 * Panel element for PANEL_GSX_INTEGRATOR_COMMBUS.
 *
 * The panel exists only so the toolbar registers and renders the package icon
 * (which injects toolbar_code.js). The bridge has no UI: if the panel is ever
 * opened it hides itself immediately. The toolbar button is hidden by
 * toolbar_code.js, so normally this panel is never shown.
 */
class GsxIntegratorCommBusPanel extends TemplateElement {
	constructor() {
		super(...arguments);
	}

	connectedCallback() {
		super.connectedCallback();
		this.ingameUi = this.querySelector("ingame-ui");
		if (this.ingameUi) {
			this.ingameUi.addEventListener("panelActive", () => {
				this.ingameUi.style.display = "none";
			});
		}
	}
}

window.customElements.define("gsx-integrator-commbus-panel", GsxIntegratorCommBusPanel);
if (typeof checkAutoload === "function") {
	checkAutoload();
}
