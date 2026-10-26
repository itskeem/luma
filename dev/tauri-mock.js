// Developer-only: a stand-in for the Tauri backend, injected into a plain
// browser page so the UI can be driven and screenshotted without Windows.
// Usage: page.addInitScript({ path: "dev/tauri-mock.js" }) then set
// window.__MOCK_LABEL__ before load (default "main"). Not shipped in the app.
(() => {
	const label = window.__MOCK_LABEL__ || "main";
	let nextId = 1;
	let nextEvent = 1;
	const listeners = []; // { event, handler, id }
	const settings = Object.assign({}, window.__MOCK_SETTINGS__ || {});
	const calls = (window.__MOCK_CALLS__ = []);
	const cursor = (window.__MOCK_CURSOR__ = { x: 960, y: 400 });
	let leftDown = false;
	const open = [{ label }, ...(window.__MOCK_EXTRA__ || []).map((l) => ({ label: l }))];
	window.__MOCK_SET_LEFT__ = (v) => (leftDown = v);

	function emit(event, payload) {
		for (const l of listeners.slice()) {
			if (l.event === event && window["_" + l.handler]) window["_" + l.handler]({ event, id: l.id, payload });
		}
	}
	window.__MOCK_EMIT__ = emit;

	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };

	const defaults = {
		get_media_info: { title: "", artist: "", is_playing: false, has_media: false },
		get_battery_info: { level: 80, is_charging: false },
		get_volume: 0.5,
		get_brightness: 60,
		load_settings: settings,
		settings_file_readable: true,
		get_update_state: { available: false },
		is_left_button_down: null,
		foreground_fullscreen: false
	};

	async function invoke(cmd, args) {
		calls.push([cmd, args]);
		switch (cmd) {
			case "plugin:event|listen": {
				const id = nextEvent++;
				listeners.push({ event: args.event, handler: args.handler, id });
				return id;
			}
			case "plugin:event|unlisten":
				return null;
			case "plugin:event|emit":
				emit(args.event, args.payload);
				return null;
			case "plugin:window|cursor_position":
				return { x: cursor.x, y: cursor.y };
			case "plugin:window|outer_position":
				return { x: 0, y: 0 };
			case "plugin:window|outer_size":
				return { width: 1920, height: 420 };
			case "plugin:window|scale_factor":
				return 1;
			case "plugin:window|is_visible":
				return true;
			case "plugin:window|available_monitors":
				return [];
			case "plugin:window|primary_monitor":
				return null;
			case "plugin:webview|create_webview_window":
				open.push({ label: args.options.label });
				setTimeout(() => emit("tauri://created", null), 30);
				return null;
			case "plugin:window|destroy":
				open.splice(0, open.length, ...open.filter((w) => w.label === "main"));
				return null;
			case "plugin:window|get_all_windows":
				return open.map((w) => w.label);
			case "plugin:webview|get_all_webviews":
				return open.slice();
			case "save_setting":
				settings[args.key] = args.value;
				emit("settings-changed", { key: args.key, value: args.value });
				return null;
			case "is_left_button_down":
				return leftDown;
		}
		if (window.__MOCK_OVERRIDES__ && cmd in window.__MOCK_OVERRIDES__) return window.__MOCK_OVERRIDES__[cmd];
		if (cmd in defaults) return defaults[cmd];
		return null;
	}

	window.__TAURI_INTERNALS__ = {
		invoke,
		transformCallback(cb, once) {
			const id = nextId++;
			window["_" + id] = (data) => {
				if (once) delete window["_" + id];
				return cb(data);
			};
			return id;
		},
		unregisterCallback(id) {
			delete window["_" + id];
		},
		convertFileSrc: (p) => p,
		metadata: {
			currentWindow: { label },
			currentWebview: { windowLabel: label, label },
			windows: [{ label }],
			webviews: [{ windowLabel: label, label }]
		},
		plugins: {}
	};
})();
