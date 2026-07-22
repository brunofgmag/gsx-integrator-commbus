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
	const JS_SUBSCRIBE_EVENT = "GSXI.Bridge.JsSubscribe";
	const JS_RELAY_EVENT = "GSXI.Bridge.JsRelay";
	const JS_HELLO_EVENT = "GSXI.Bridge.JsHello";

	let listener = null;
	const relayedChannels = new Set();

	const log = (...args) => console.log("[GSXI CommBus][toolbar]", ...args);
	const warn = (...args) => console.warn("[GSXI CommBus][toolbar]", ...args);
	const error = (...args) => console.error("[GSXI CommBus][toolbar]", ...args);

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
			warn("cannot send state (listener has no callWasm):", state);
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
		} catch (err) {
			error("TOOLBAR_BUTTON_TOGGLE failed", err);
			sendState("unavailable");
		}
	};

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

		const relaySubscribe = (channel) => {
			const name = String(channel || "").trim();
			if (!name || relayedChannels.has(name)) {
				return;
			}
			relayedChannels.add(name);
			listener.on(name, (payload) => {
				if (typeof listener.callWasm === "function") {
					listener.callWasm(JS_RELAY_EVENT, JSON.stringify({ channel: name, payload: String(payload || "") }));
				}
			});
			log("relaying JS channel", name);
		};

		listener = register(() => {
			listener.on(CMD_EVENT, handleCommand);
			listener.on(JS_SUBSCRIBE_EVENT, relaySubscribe);
			const canSend = typeof listener.callWasm === "function";
			if (!canSend) {
				warn("listener has no callWasm(); state will NOT reach the WASM (CommBus.js missing?).");
			}
			if (canSend) {
				listener.callWasm(JS_HELLO_EVENT, "ready");
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
			warn("failed to load CommBus.js; falling back to view listener (no callWasm).");
			finishRegister();
		}, { once: true });
		document.head.appendChild(script);
	};

	const init = () => {
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
