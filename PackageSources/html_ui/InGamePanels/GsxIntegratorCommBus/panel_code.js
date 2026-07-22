/**
 * Registers the package toolbar icon (which injects toolbar_code.js);
 * the bridge itself has no UI and hides this panel if it is ever opened.
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
