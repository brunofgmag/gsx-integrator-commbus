/**
 * GSX Integrator CommBus — invisible toolbar bridge: hides its own button,
 * relays "GSXI.Toolbar.Command" (WASM->JS) to a Coherent panel toggle, and
 * reports "GSXI.Toolbar.State" (JS->WASM): ready/open/closed/unavailable.
 */
(function initGsxiCommBusToolbar() {
	if (window.__gsxiCommBusToolbarLoaded) {
		return;
	}
	window.__gsxiCommBusToolbarLoaded = true;

	const OWN_ICON = "coui://html_ui/vfs/html_ui/icons/toolbar/GSX_INTEGRATOR_COMMBUS_ICON.svg";
	const OWN_PANEL_ID = "PANEL_GSX_INTEGRATOR_COMMBUS";
	const GSX_ICON = "coui://html_ui/vfs/html_ui/icons/toolbar/ICON_TOOLBAR_GSX_PANEL.svg";
	const GSX_PANEL_ID = "PANEL_FSDT_GSX_PANEL";
	const CMD_EVENT = "GSXI.Toolbar.Command";
	const STATE_EVENT = "GSXI.Toolbar.State";

	let listener = null;

	const log = (...args) => console.log("[GSXI CommBus][toolbar]", ...args);

	const getToolbar = () =>
		document.querySelector("ui-panel") || document.querySelector("tool-bar");

	const findOwnButton = (toolbar) =>
		toolbar.querySelector('ui-resource-element[icon="' + OWN_ICON + '"]') ||
		toolbar.querySelector('toolbar-button[panel-id="' + OWN_PANEL_ID + '"]');

	const findGsxButton = () => {
		const toolbar = getToolbar();
		if (!toolbar) {
			return null;
		}
		return (
			toolbar.querySelector('ui-resource-element[icon="' + GSX_ICON + '"]') ||
			toolbar.querySelector('toolbar-button[panel-id="' + GSX_PANEL_ID + '"]')
		);
	};

	const hideOwnButton = () => {
		const toolbar = getToolbar();
		if (!toolbar) {
			return false;
		}
		const own = findOwnButton(toolbar);
		if (own) {
			own.style.display = "none";
			return true;
		}
		return false;
	};

	const readGsxState = () => {
		const btn = findGsxButton();
		if (!btn) {
			return "unavailable";
		}
		let selected;
		if (btn.visualFlags && typeof btn.visualFlags.selected !== "undefined") {
			selected = btn.visualFlags.selected;
		} else {
			selected = btn.classList.length > 1;
		}
		return selected ? "open" : "closed";
	};

	const sendState = (state) => {
		if (listener && typeof listener.callWasm === "function") {
			listener.callWasm(STATE_EVENT, String(state));
			log("state ->", state);
		} else {
			console.warn("[GSXI CommBus][toolbar] cannot send state (listener has no callWasm):", state);
		}
	};

	const handleCommand = async (payload) => {
		const cmd = String(payload || "").trim().toLowerCase();
		if (cmd !== "open" && cmd !== "close") {
			sendState("unavailable");
			return;
		}
		try {
			await Coherent.call("TOOLBAR_BUTTON_TOGGLE", GSX_PANEL_ID, cmd === "open");
			setTimeout(() => sendState(readGsxState()), 500);
		} catch (error) {
			console.error("[GSXI CommBus][toolbar] TOOLBAR_BUTTON_TOGGLE failed", error);
			sendState("unavailable");
		}
	};

	// Report GSX state changes triggered by the user clicking the GSX icon too,
	// so the LVar stays accurate regardless of who toggled it.
	const attachGsxClickWatcher = () => {
		const btn = findGsxButton();
		if (!btn || btn.__gsxiWatched) {
			return;
		}
		btn.__gsxiWatched = true;
		btn.addEventListener("click", () => setTimeout(() => sendState(readGsxState()), 500));
	};

	// Path to the MSFS CommBus service. RegisterCommBusListener (from this file)
	// returns a listener with BOTH .on() (WASM->JS) and .callWasm() (JS->WASM).
	// A bare RegisterViewListener("JS_LISTENER_COMM_BUS") only has .on(), so the
	// state would never reach the WASM. We therefore ensure CommBus.js is loaded.
	const COMMBUS_JS = "/JS/Services/CommBus.js";

	const finishRegister = () => {
		const hasCommBus = typeof RegisterCommBusListener === "function";
		const register = hasCommBus
			? RegisterCommBusListener
			: (callback) => RegisterViewListener("JS_LISTENER_COMM_BUS", callback);

		listener = register(() => {
			listener.on(CMD_EVENT, handleCommand);
			const canSend = typeof listener.callWasm === "function";
			if (!canSend) {
				console.warn("[GSXI CommBus][toolbar] listener has no callWasm(); state will NOT reach the WASM (CommBus.js missing?).");
			}
			sendState("ready");
			log("CommBus listener ready (callWasm=" + canSend + ")");
		});
	};

	const registerBridge = () => {
		if (typeof RegisterCommBusListener === "function") {
			finishRegister();
			return;
		}
		// Load the CommBus service first so we get callWasm().
		const existing = document.head.querySelector('script[src="' + COMMBUS_JS + '"]');
		if (existing) {
			existing.addEventListener("load", finishRegister, { once: true });
			setTimeout(() => { if (!listener) finishRegister(); }, 1000);
			return;
		}
		const script = document.createElement("script");
		script.src = COMMBUS_JS;
		script.async = false;
		script.addEventListener("load", finishRegister, { once: true });
		script.addEventListener("error", () => {
			console.warn("[GSXI CommBus][toolbar] failed to load CommBus.js; falling back to view listener (no callWasm).");
			finishRegister();
		}, { once: true });
		document.head.appendChild(script);
	};

	const init = () => {
		// Wait until the toolbar DOM exists so we can hide our own button.
		if (!hideOwnButton()) {
			setTimeout(init, 1000);
			return;
		}
		attachGsxClickWatcher();
		registerBridge();
		log("initialized (own button hidden)");
	};

	(async () => {
		// MSFS 2024 toolbar requires legacyInit() before legacy APIs are usable.
		try {
			if (typeof window.legacyInit === "function") {
				await window.legacyInit();
			}
		} catch (e) {
			/* MSFS 2020 or already initialized — ignore */
		}
		init();
	})();
})();
