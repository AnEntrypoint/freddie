import path, { basename, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs, { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import os, { homedir } from "node:os";
import { assign, assign as assign$1, createActor, createActor as createActor$1, createMachine, createMachine as createMachine$1, fromPromise, fromPromise as fromPromise$1, waitFor } from "xstate";
import * as sdkNs from "acptoapi";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region node_modules/plugsdk/dist/index.js
var HookType = Object.freeze({
	PRE_TOOL_USE: "pre_tool_use",
	POST_TOOL_USE: "post_tool_use",
	POST_TOOL_USE_FAILURE: "post_tool_use_failure",
	POST_TOOL_BATCH: "post_tool_batch",
	PERMISSION_REQUEST: "permission_request",
	PERMISSION_DENIED: "permission_denied",
	SESSION_START: "session_start",
	SESSION_END: "session_end",
	SETUP: "setup",
	PROMPT_SUBMIT: "prompt_submit",
	PROMPT_EXPANSION: "prompt_expansion",
	NOTIFICATION: "notification",
	STOP: "stop",
	STOP_FAILURE: "stop_failure",
	SUBAGENT_START: "subagent_start",
	SUBAGENT_STOP: "subagent_stop",
	TASK_CREATED: "task_created",
	TASK_COMPLETED: "task_completed",
	TEAMMATE_IDLE: "teammate_idle",
	INSTRUCTIONS_LOADED: "instructions_loaded",
	CONFIG_CHANGE: "config_change",
	CWD_CHANGED: "cwd_changed",
	FILE_CHANGED: "file_changed",
	WORKTREE_CREATE: "worktree_create",
	WORKTREE_REMOVE: "worktree_remove",
	PRE_COMPACT: "pre_compact",
	POST_COMPACT: "post_compact",
	ELICITATION: "elicitation",
	ELICITATION_RESULT: "elicitation_result"
});
var NATIVE_TO_CANONICAL = Object.freeze({
	PreToolUse: HookType.PRE_TOOL_USE,
	PostToolUse: HookType.POST_TOOL_USE,
	PostToolUseFailure: HookType.POST_TOOL_USE_FAILURE,
	PostToolBatch: HookType.POST_TOOL_BATCH,
	PermissionRequest: HookType.PERMISSION_REQUEST,
	PermissionDenied: HookType.PERMISSION_DENIED,
	SessionStart: HookType.SESSION_START,
	SessionEnd: HookType.SESSION_END,
	Setup: HookType.SETUP,
	UserPromptSubmit: HookType.PROMPT_SUBMIT,
	UserPromptExpansion: HookType.PROMPT_EXPANSION,
	Notification: HookType.NOTIFICATION,
	Stop: HookType.STOP,
	StopFailure: HookType.STOP_FAILURE,
	SubagentStart: HookType.SUBAGENT_START,
	SubagentStop: HookType.SUBAGENT_STOP,
	TaskCreated: HookType.TASK_CREATED,
	TaskCompleted: HookType.TASK_COMPLETED,
	TeammateIdle: HookType.TEAMMATE_IDLE,
	InstructionsLoaded: HookType.INSTRUCTIONS_LOADED,
	ConfigChange: HookType.CONFIG_CHANGE,
	CwdChanged: HookType.CWD_CHANGED,
	FileChanged: HookType.FILE_CHANGED,
	WorktreeCreate: HookType.WORKTREE_CREATE,
	WorktreeRemove: HookType.WORKTREE_REMOVE,
	PreCompact: HookType.PRE_COMPACT,
	PostCompact: HookType.POST_COMPACT,
	Elicitation: HookType.ELICITATION,
	ElicitationResult: HookType.ELICITATION_RESULT
});
var CANONICAL_TO_NATIVE = Object.freeze(Object.fromEntries(Object.entries(NATIVE_TO_CANONICAL).map(([k, v]) => [v, k])));
var NO_MATCHER_EVENTS = /* @__PURE__ */ new Set([
	"UserPromptSubmit",
	"PostToolBatch",
	"TaskCreated",
	"TaskCompleted",
	"Stop",
	"TeammateIdle",
	"CwdChanged",
	"WorktreeCreate",
	"WorktreeRemove"
]);
var PERMISSION_DECISION_EVENTS = /* @__PURE__ */ new Set(["PreToolUse", "PermissionRequest"]);
var TOP_LEVEL_DECISION_EVENTS = /* @__PURE__ */ new Set([
	"UserPromptSubmit",
	"UserPromptExpansion",
	"Stop",
	"SubagentStop",
	"PostToolBatch",
	"PreCompact",
	"ConfigChange",
	"TaskCreated",
	"TaskCompleted",
	"TeammateIdle"
]);
var claudeAdapter = {
	name: "claude",
	listNativeEvents: () => Object.keys(NATIVE_TO_CANONICAL),
	getCanonical: (native) => NATIVE_TO_CANONICAL[native] ?? null,
	getNative: (canonical) => CANONICAL_TO_NATIVE[canonical] ?? null,
	eventSupportsMatcher: (native) => !NO_MATCHER_EVENTS.has(native),
	isPermissionDecisionEvent: (native) => PERMISSION_DECISION_EVENTS.has(native),
	isTopLevelDecisionEvent: (native) => TOP_LEVEL_DECISION_EVENTS.has(native),
	/**
	* Match Claude Code's documented matcher rules:
	*   '*' | '' | undefined         → match every event/tool name
	*   /^[A-Za-z0-9_|]+$/           → exact string OR pipe-separated literal list
	*   anything else                → JavaScript regex
	*/
	matches(matcher, target) {
		if (matcher === void 0 || matcher === null || matcher === "" || matcher === "*") return true;
		if (/^[A-Za-z0-9_|]+$/.test(matcher)) return matcher.split("|").includes(target);
		try {
			return new RegExp(matcher).test(target);
		} catch {
			return false;
		}
	}
};
function loadClaudePlugin(dir) {
	const root = resolve(dir);
	if (!existsSync(root)) throw new Error(`loadClaudePlugin: ${root} does not exist`);
	const manifest = readJsonIfExists(join(root, ".claude-plugin", "plugin.json")) || readJsonIfExists(join(root, "plugin.json")) || {};
	if (!manifest.name) manifest.name = basename(root);
	const pickPath = (field, def) => {
		const v = manifest[field];
		if (typeof v === "string") return [join(root, v)];
		if (Array.isArray(v)) return v.map((p) => typeof p === "string" ? join(root, p) : null).filter(Boolean);
		if (v && typeof v === "object") return null;
		return def ? [join(root, def)] : [];
	};
	return {
		root,
		format: "claude-code",
		manifest,
		hooks: loadHooks(root, manifest),
		skills: loadSkills(pickPath("skills", "skills")),
		commands: loadCommands(pickPath("commands", "commands")),
		agents: loadAgents(pickPath("agents", "agents")),
		mcpServers: loadInlineOrFile(root, manifest, "mcpServers", ".mcp.json", (j) => j?.mcpServers ?? j ?? {}),
		lspServers: loadInlineOrFile(root, manifest, "lspServers", ".lsp.json", (j) => j ?? {}),
		monitors: loadMonitors(root, manifest),
		themes: loadThemes(pickPath("themes", "themes")),
		outputStyles: loadOutputStyles(pickPath("outputStyles", "output-styles")),
		settings: readJsonIfExists(join(root, "settings.json")) || {},
		userConfig: manifest.userConfig || {},
		channels: manifest.channels || [],
		dependencies: manifest.dependencies || [],
		bin: existsSync(join(root, "bin")) ? join(root, "bin") : null
	};
}
function readJsonIfExists(p) {
	return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
function loadHooks(root, manifest) {
	const v = manifest.hooks;
	if (v && typeof v === "object" && !Array.isArray(v)) return v.hooks || v;
	if (typeof v === "string") {
		const f = join(root, v);
		if (existsSync(f)) {
			const j = JSON.parse(readFileSync(f, "utf8"));
			return j.hooks || j;
		}
	}
	const def = join(root, "hooks", "hooks.json");
	if (existsSync(def)) {
		const j = JSON.parse(readFileSync(def, "utf8"));
		return j.hooks || j;
	}
	return {};
}
function loadSkills(paths) {
	const out = [];
	for (const p of paths) {
		if (!existsSync(p)) continue;
		for (const name of readdirSync(p)) {
			const f = join(p, name, "SKILL.md");
			if (!existsSync(f)) continue;
			const { fields, body } = parseFrontmatter(readFileSync(f, "utf8"));
			out.push({
				name: fields.name || name,
				dir: join(p, name),
				file: f,
				fields,
				body,
				description: fields.description || ""
			});
		}
	}
	return out;
}
function loadCommands(paths) {
	const out = [];
	for (const p of paths) {
		if (!existsSync(p)) continue;
		const s = statSync(p);
		if (s.isFile() && p.endsWith(".md")) {
			out.push(parseMarkdownEntry(p));
			continue;
		}
		if (s.isDirectory()) for (const n of readdirSync(p)) {
			const f = join(p, n);
			if (statSync(f).isFile() && f.endsWith(".md")) out.push(parseMarkdownEntry(f));
		}
	}
	return out;
}
var AGENT_FORBIDDEN = [
	"hooks",
	"mcpServers",
	"permissionMode"
];
function loadAgents(paths) {
	const out = [];
	for (const p of paths) {
		if (!existsSync(p)) continue;
		const files = statSync(p).isFile() ? [p] : readdirSync(p).map((f) => join(p, f)).filter((f) => statSync(f).isFile() && f.endsWith(".md"));
		for (const f of files) {
			const { fields, body } = parseFrontmatter(readFileSync(f, "utf8"));
			for (const k of AGENT_FORBIDDEN) if (fields[k] !== void 0) throw new Error(`agent ${f}: field "${k}" not allowed`);
			if (fields.isolation && fields.isolation !== "worktree") throw new Error(`agent ${f}: isolation must be "worktree"`);
			out.push({
				name: fields.name || basename(f, ".md"),
				file: f,
				fields,
				body,
				description: fields.description || ""
			});
		}
	}
	return out;
}
function loadInlineOrFile(root, manifest, key, def, project) {
	const v = manifest[key];
	if (v && typeof v === "object" && !Array.isArray(v)) return project(v);
	if (typeof v === "string") {
		const f = join(root, v);
		if (existsSync(f)) return project(JSON.parse(readFileSync(f, "utf8")));
	}
	const d = join(root, def);
	return project(existsSync(d) ? JSON.parse(readFileSync(d, "utf8")) : null);
}
function loadMonitors(root, manifest) {
	const v = manifest.monitors;
	if (Array.isArray(v)) return v;
	if (typeof v === "string") {
		const f = join(root, v);
		if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
	}
	const d = join(root, "monitors", "monitors.json");
	return existsSync(d) ? JSON.parse(readFileSync(d, "utf8")) : [];
}
function loadThemes(paths) {
	const out = [];
	for (const p of paths) {
		if (!existsSync(p)) continue;
		for (const n of readdirSync(p)) {
			if (!n.endsWith(".json")) continue;
			out.push({
				slug: basename(n, ".json"),
				file: join(p, n),
				...JSON.parse(readFileSync(join(p, n), "utf8"))
			});
		}
	}
	return out;
}
function loadOutputStyles(paths) {
	const out = [];
	for (const p of paths) {
		if (!existsSync(p)) continue;
		for (const n of readdirSync(p)) if (n.endsWith(".md")) out.push(parseMarkdownEntry(join(p, n)));
	}
	return out;
}
function parseMarkdownEntry(file) {
	const { fields, body } = parseFrontmatter(readFileSync(file, "utf8"));
	return {
		name: fields.name || basename(file, extname(file)),
		file,
		fields,
		body,
		description: fields.description || ""
	};
}
function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return {
		fields: {},
		body: text
	};
	const fields = {};
	for (const line of m[1].split(/\r?\n/)) {
		if (!line.trim() || line.startsWith("#")) continue;
		const i = line.indexOf(":");
		if (i < 0) continue;
		fields[line.slice(0, i).trim()] = parseScalar(line.slice(i + 1).trim());
	}
	return {
		fields,
		body: m[2]
	};
}
function parseScalar(raw) {
	if (raw === "") return "";
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
	if (raw.startsWith("\"") && raw.endsWith("\"") || raw.startsWith("[") && raw.endsWith("]")) try {
		return JSON.parse(raw);
	} catch {}
	if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
	return raw;
}
var wasmInstances = /* @__PURE__ */ new Map();
async function getWasmInstance(plugin, modulePath) {
	const key = plugin.manifest.name + ":" + modulePath;
	if (wasmInstances.has(key)) return wasmInstances.get(key);
	const bytes = readFileSync(modulePath);
	const wasi = globalThis.WASI || await import("node:wasi").then((m) => m.WASI).catch(() => null);
	let imports = {};
	let instance;
	if (wasi) {
		const w = new wasi({
			version: "preview1",
			args: [plugin.manifest.name],
			env: {},
			preopens: { "/": plugin.root }
		});
		imports = typeof w.getImportObject === "function" ? w.getImportObject() : { wasi_snapshot_preview1: w.wasiImport };
		const mod = await WebAssembly.compile(bytes);
		instance = await WebAssembly.instantiate(mod, imports);
		try {
			w.initialize?.(instance);
		} catch {
			try {
				w.start?.(instance);
			} catch {}
		}
	} else {
		const mod = await WebAssembly.compile(bytes);
		instance = await WebAssembly.instantiate(mod, imports);
	}
	wasmInstances.set(key, instance);
	return instance;
}
function wasmWriteString(instance, str) {
	const enc = new TextEncoder().encode(str);
	const alloc = instance.exports.plugkit_alloc || instance.exports.malloc;
	const mem = instance.exports.memory;
	if (!alloc || !mem) throw new Error("wasm module missing plugkit_alloc/memory exports");
	const ptr = alloc(enc.length);
	new Uint8Array(mem.buffer, ptr, enc.length).set(enc);
	return {
		ptr,
		len: enc.length
	};
}
function wasmReadString(instance, ptr, len) {
	const mem = instance.exports.memory;
	const bytes = new Uint8Array(mem.buffer, ptr, len);
	return new TextDecoder().decode(bytes);
}
function wasmFreeString(instance, ptr, len) {
	const free = instance.exports.plugkit_free || instance.exports.free;
	if (free) free(ptr, len);
}
function createHost$1({ on = {}, dataRoot, env = process.env, timeout = 6e4 } = {}) {
	const plugins = [];
	const procs = [];
	const monitorOnDemand = /* @__PURE__ */ new Map();
	const mcpToolHandles = [];
	function pluginDataDir(plugin) {
		const dir = join(dataRoot || join(homedir(), ".plugsdk-data"), plugin.manifest.name.replace(/[^a-zA-Z0-9_-]/g, "-"));
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		return dir;
	}
	function userConfigBag(plugin) {
		const bag = {};
		for (const k of Object.keys(plugin.userConfig || {})) {
			const envKey = "CLAUDE_PLUGIN_OPTION_" + k;
			if (env[envKey] !== void 0) bag[k] = env[envKey];
			else if (plugin.userConfig[k]?.default !== void 0) bag[k] = plugin.userConfig[k].default;
		}
		return Object.assign(bag, plugin._userConfig || {});
	}
	function subst(str, plugin) {
		if (typeof str !== "string") return str;
		const data = pluginDataDir(plugin);
		const uc = userConfigBag(plugin);
		return str.replace(/\$\{([^}]+)\}/g, (_, key) => {
			if (key === "CLAUDE_PLUGIN_ROOT") return plugin.root;
			if (key === "CLAUDE_PLUGIN_DATA") return data;
			if (key.startsWith("user_config.")) return uc[key.slice(12)] ?? "";
			return env[key] ?? "";
		});
	}
	function childEnv(plugin, extra = {}) {
		const data = pluginDataDir(plugin);
		const uc = userConfigBag(plugin);
		const envKv = {};
		for (const [k, v] of Object.entries(uc)) envKv["CLAUDE_PLUGIN_OPTION_" + k] = String(v);
		return {
			...env,
			CLAUDE_PLUGIN_ROOT: plugin.root,
			CLAUDE_PLUGIN_DATA: data,
			...envKv,
			...extra
		};
	}
	function track(child) {
		procs.push(child);
		return child;
	}
	function spawnMonitor(plugin, monitor) {
		const child = track(spawn(subst(monitor.command, plugin), {
			shell: true,
			env: childEnv(plugin)
		}));
		let buf = "";
		child.stdout?.on("data", (d) => {
			buf += d.toString();
			let i;
			while ((i = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, i);
				buf = buf.slice(i + 1);
				if (line.trim()) on.onMonitorLine?.(plugin, monitor, line);
			}
		});
	}
	function startMonitorsAtBoot(plugin) {
		for (const m of plugin.monitors || []) if (!m.when || m.when === "always") spawnMonitor(plugin, m);
		else if (m.when.startsWith("on-skill-invoke:")) {
			const skill = m.when.slice(16);
			monitorOnDemand.set(plugin.manifest.name + ":" + skill, () => spawnMonitor(plugin, m));
		}
	}
	async function startMcp(plugin) {
		for (const [serverName, cfg] of Object.entries(plugin.mcpServers || {})) {
			const args = (cfg.args || []).map((a) => subst(a, plugin));
			const cwd = cfg.cwd ? subst(cfg.cwd, plugin) : plugin.root;
			let child;
			try {
				child = track(spawn(subst(cfg.command, plugin), args, {
					env: childEnv(plugin, cfg.env || {}),
					cwd,
					stdio: [
						"pipe",
						"pipe",
						"pipe"
					]
				}));
			} catch {
				continue;
			}
			let exited = false;
			child.on("error", () => {
				exited = true;
			});
			child.on("exit", () => {
				exited = true;
			});
			const handle = mcpHandle(plugin, serverName, child);
			mcpToolHandles.push(handle);
			const tools = await Promise.race([handle.ready, new Promise((r) => setTimeout(() => r([]), 2e3))]).catch(() => []);
			if (exited) continue;
			for (const tool of tools) on.onMcpTool?.(plugin, serverName, tool, (a) => handle.call(tool.name, a));
		}
	}
	function startLsp(plugin) {
		for (const [lang, cfg] of Object.entries(plugin.lspServers || {})) {
			const args = (cfg.args || []).map((a) => subst(a, plugin));
			try {
				track(spawn(subst(cfg.command, plugin), args, {
					env: childEnv(plugin, cfg.env || {}),
					stdio: [
						"pipe",
						"pipe",
						"pipe"
					]
				})).on("error", () => {});
				on.onLsp?.(plugin, lang, cfg);
			} catch {}
		}
	}
	function emitComponents(plugin) {
		for (const s of plugin.skills || []) on.onSkill?.(plugin, s);
		for (const a of plugin.agents || []) on.onAgent?.(plugin, a);
		for (const c of plugin.commands || []) on.onCommand?.(plugin, c);
		for (const t of plugin.themes || []) on.onTheme?.(plugin, t);
		for (const o of plugin.outputStyles || []) on.onOutputStyle?.(plugin, o);
		for (const ch of plugin.channels || []) on.onChannel?.(plugin, ch);
		if (plugin.bin) on.onBin?.(plugin, plugin.bin);
		if (plugin.settings && Object.keys(plugin.settings).length) on.onSetting?.(plugin, plugin.settings);
	}
	async function use(plugin) {
		plugins.push(plugin);
		emitComponents(plugin);
		startMonitorsAtBoot(plugin);
		startLsp(plugin);
		await startMcp(plugin);
	}
	function notifySkillInvoked(pluginName, skillName) {
		const key = pluginName + ":" + skillName;
		const f = monitorOnDemand.get(key);
		if (f) {
			monitorOnDemand.delete(key);
			f();
		}
	}
	async function dispatch(eventName, payload = {}) {
		const tasks = [];
		const unhandled = [];
		for (const plugin of plugins) {
			const entries = plugin.hooks?.[eventName];
			if (!Array.isArray(entries)) continue;
			const target = matcherTarget(eventName, payload);
			for (const group of entries) {
				if (group.matcher !== void 0 && !claudeAdapter.matches(group.matcher, target)) continue;
				for (const handler of group.hooks || []) if (handler.type === "command") tasks.push(runCommand(plugin, handler, eventName, payload));
				else if (handler.type === "http") tasks.push(runHttp(plugin, handler, eventName, payload));
				else if (handler.type === "mcp_tool") tasks.push(runMcpTool(plugin, handler, eventName, payload));
				else if (handler.type === "wasm") tasks.push(runWasm(plugin, handler, eventName, payload));
				else unhandled.push({
					plugin: plugin.manifest.name,
					handler
				});
			}
		}
		return mergeResults(eventName, await Promise.all(tasks), unhandled);
	}
	function runCommand(plugin, handler, eventName, payload) {
		return new Promise((res) => {
			const ms = handler.timeout ?? timeout;
			const child = spawn(subst(handler.command, plugin), {
				shell: handler.shell === "powershell" ? "powershell" : true,
				env: childEnv(plugin, { CLAUDE_PROJECT_DIR: payload.cwd || env.CLAUDE_PROJECT_DIR || process.cwd() }),
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				]
			});
			let out = "", err = "";
			const t = setTimeout(() => {
				try {
					child.kill();
				} catch {}
			}, ms);
			child.stdout.on("data", (d) => out += d.toString());
			child.stderr.on("data", (d) => err += d.toString());
			child.on("close", (code) => {
				clearTimeout(t);
				let parsed = null;
				try {
					parsed = out.trim() ? JSON.parse(out.trim()) : null;
				} catch {
					parsed = { raw: out.trim() };
				}
				res({
					plugin: plugin.manifest.name,
					exitCode: code,
					stdout: out,
					stderr: err,
					output: parsed,
					eventName,
					handler
				});
			});
			child.on("error", (e) => {
				clearTimeout(t);
				res({
					plugin: plugin.manifest.name,
					error: e.message,
					exitCode: -1
				});
			});
			child.stdin.end(JSON.stringify({
				hook_event_name: eventName,
				...payload
			}));
		});
	}
	async function runHttp(plugin, handler, eventName, payload) {
		const url = subst(handler.url, plugin);
		const headers = Object.fromEntries(Object.entries(handler.headers || {}).map(([k, v]) => [k, subst(v, plugin)]));
		try {
			const r = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...headers
				},
				body: JSON.stringify({
					hook_event_name: eventName,
					...payload
				})
			});
			const text = await r.text();
			let parsed = null;
			try {
				parsed = text.trim() ? JSON.parse(text) : null;
			} catch {
				parsed = { raw: text };
			}
			return {
				plugin: plugin.manifest.name,
				exitCode: r.ok ? 0 : 1,
				output: parsed,
				eventName,
				handler
			};
		} catch (e) {
			return {
				plugin: plugin.manifest.name,
				exitCode: -1,
				error: e.message
			};
		}
	}
	async function runWasm(plugin, handler, eventName, payload) {
		try {
			const modulePath = subst(handler.module, plugin);
			const exportName = handler.export || `hook_${eventName.replace(/[A-Z]/g, (m, i) => (i ? "_" : "") + m.toLowerCase())}`;
			const instance = await getWasmInstance(plugin, modulePath);
			const fn = instance.exports[exportName];
			if (typeof fn !== "function") return {
				plugin: plugin.manifest.name,
				exitCode: -1,
				error: `wasm export not found: ${exportName}`
			};
			const { ptr, len } = wasmWriteString(instance, JSON.stringify({
				hook_event_name: eventName,
				...payload
			}));
			let resultPtr, resultLen;
			try {
				const r = fn(ptr, len);
				if (typeof r === "bigint" || typeof r === "number") {
					const v = BigInt(r);
					resultPtr = Number(v & 4294967295n);
					resultLen = Number(v >> 32n & 4294967295n);
				} else if (Array.isArray(r) && r.length === 2) [resultPtr, resultLen] = r;
			} finally {
				wasmFreeString(instance, ptr, len);
			}
			let parsed = null;
			if (resultPtr && resultLen) {
				const out = wasmReadString(instance, resultPtr, resultLen);
				wasmFreeString(instance, resultPtr, resultLen);
				try {
					parsed = out.trim() ? JSON.parse(out) : null;
				} catch {
					parsed = { raw: out };
				}
			}
			return {
				plugin: plugin.manifest.name,
				exitCode: 0,
				output: parsed,
				eventName,
				handler
			};
		} catch (e) {
			return {
				plugin: plugin.manifest.name,
				exitCode: -1,
				error: e.message,
				eventName,
				handler
			};
		}
	}
	async function runMcpTool(plugin, handler, eventName, payload) {
		const handle = mcpToolHandles.find((h) => h.plugin === plugin.manifest.name && h.serverName === handler.server);
		if (!handle) return {
			plugin: plugin.manifest.name,
			exitCode: -1,
			error: "mcp server not running: " + handler.server
		};
		try {
			const subbed = JSON.parse(subst(JSON.stringify(handler.input || {}), plugin));
			const r = await handle.call(handler.tool, subbed);
			return {
				plugin: plugin.manifest.name,
				exitCode: 0,
				output: r,
				eventName,
				handler
			};
		} catch (e) {
			return {
				plugin: plugin.manifest.name,
				exitCode: -1,
				error: e.message
			};
		}
	}
	async function shutdown() {
		for (const p of procs) try {
			p.kill();
		} catch {}
		procs.length = 0;
		for (const h of mcpToolHandles) try {
			h.shutdown();
		} catch {}
		mcpToolHandles.length = 0;
	}
	return {
		plugins: () => plugins.slice(),
		use,
		dispatch,
		shutdown,
		notifySkillInvoked,
		subst,
		childEnv
	};
}
function matcherTarget(event, payload) {
	if ([
		"PreToolUse",
		"PostToolUse",
		"PostToolUseFailure",
		"PermissionRequest",
		"PermissionDenied",
		"SubagentStart",
		"SubagentStop"
	].includes(event)) return payload.tool_name || payload.agent_type || "";
	if (event === "SessionStart" || event === "SessionEnd" || event === "PreCompact" || event === "PostCompact") return payload.source || "";
	if (event === "Setup") return payload.trigger || "";
	if (event === "Notification") return payload.notification_type || "";
	return "";
}
var PERM_ORDER = [
	"deny",
	"defer",
	"ask",
	"allow"
];
function mergeResults(eventName, results, unhandled) {
	const merged = {
		results,
		unhandled
	};
	let bestPerm = null, blockDec = null;
	const ctx = [], updates = [];
	for (const r of results) {
		if (r.exitCode === 2) blockDec = blockDec || { reason: r.stderr?.trim() || "blocked" };
		const o = r.output;
		if (!o || typeof o !== "object") continue;
		if (o.continue === false) merged.continue = false;
		if (o.stopReason) merged.stopReason = o.stopReason;
		if (o.suppressOutput) merged.suppressOutput = true;
		if (o.systemMessage) merged.systemMessage = (merged.systemMessage ? merged.systemMessage + "\n" : "") + o.systemMessage;
		const h = o.hookSpecificOutput;
		if (h) {
			if (h.permissionDecision) {
				const c = PERM_ORDER.indexOf(h.permissionDecision);
				const b = bestPerm ? PERM_ORDER.indexOf(bestPerm.permissionDecision) : 99;
				if (c >= 0 && c < b) bestPerm = h;
			}
			if (h.additionalContext) ctx.push(h.additionalContext);
			if (h.updatedInput) updates.push(h.updatedInput);
		}
		if (o.decision === "block") blockDec = blockDec || { reason: o.reason || "blocked" };
	}
	if (claudeAdapter.isPermissionDecisionEvent(eventName) && bestPerm) merged.hookSpecificOutput = {
		hookEventName: eventName,
		...bestPerm
	};
	else if (ctx.length || updates.length) {
		merged.hookSpecificOutput = { hookEventName: eventName };
		if (ctx.length) merged.hookSpecificOutput.additionalContext = ctx.join("\n");
		if (updates.length) merged.hookSpecificOutput.updatedInput = Object.assign({}, ...updates);
	}
	if (blockDec && claudeAdapter.isTopLevelDecisionEvent(eventName)) {
		merged.decision = "block";
		merged.reason = blockDec.reason;
	}
	if (blockDec && claudeAdapter.isPermissionDecisionEvent(eventName) && !bestPerm) merged.hookSpecificOutput = {
		hookEventName: eventName,
		permissionDecision: "deny",
		permissionDecisionReason: blockDec.reason
	};
	return merged;
}
function mcpHandle(plugin, serverName, child) {
	let nextId = 1;
	const pending = /* @__PURE__ */ new Map();
	let buf = "";
	child.stdout.on("data", (d) => {
		buf += d.toString();
		let i;
		while ((i = buf.indexOf("\n")) >= 0) {
			const line = buf.slice(0, i);
			buf = buf.slice(i + 1);
			if (!line.trim()) continue;
			try {
				const msg = JSON.parse(line);
				if (msg.id != null && pending.has(msg.id)) {
					const { resolve: resolve2, reject } = pending.get(msg.id);
					pending.delete(msg.id);
					msg.error ? reject(new Error(msg.error.message || "mcp error")) : resolve2(msg.result);
				}
			} catch {}
		}
	});
	function rpc(method, params) {
		return new Promise((resolve2, reject) => {
			const id = nextId++;
			pending.set(id, {
				resolve: resolve2,
				reject
			});
			child.stdin.write(JSON.stringify({
				jsonrpc: "2.0",
				id,
				method,
				params
			}) + "\n");
		});
	}
	const ready = (async () => {
		await rpc("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: {
				name: "plugsdk",
				version: "1"
			}
		}).catch(() => null);
		return (await rpc("tools/list", {}).catch(() => ({ tools: [] })))?.tools || [];
	})();
	const handle = {
		plugin: plugin.manifest.name,
		serverName,
		tools: [],
		ready: ready.then((t) => {
			handle.tools = t;
			return t;
		}),
		call: (name, args) => rpc("tools/call", {
			name,
			arguments: args || {}
		}),
		shutdown: () => {
			try {
				child.kill();
			} catch {}
		}
	};
	return handle;
}
//#endregion
//#region src/host/contract.js
var SURFACES = [
	"pi",
	"gui",
	"both"
];
var PI_VERBS = [
	"tool",
	"env",
	"command",
	"cron",
	"platform",
	"memory",
	"skill",
	"context",
	"agentExt",
	"cli"
];
var GUI_VERBS = [
	"route",
	"page",
	"nav",
	"debug",
	"api",
	"asset"
];
var HOOK_NAMES = [
	"preToolCall",
	"postToolCall",
	"preLlmCall",
	"postLlmCall",
	"onSessionStart",
	"onSessionEnd",
	"onTurnStart",
	"onTurnEnd",
	"onMessageInbound",
	"onMessageOutbound",
	"onPreCompact",
	"onPostCompact"
];
HookType.PRE_TOOL_USE, HookType.POST_TOOL_USE, HookType.SESSION_START, HookType.SESSION_END, HookType.PROMPT_SUBMIT, HookType.STOP, HookType.PRE_COMPACT, HookType.POST_COMPACT;
var FREDDIE_TO_NATIVE_HOOK = {
	preToolCall: "PreToolUse",
	postToolCall: "PostToolUse",
	onSessionStart: "SessionStart",
	onSessionEnd: "SessionEnd",
	onMessageInbound: "UserPromptSubmit",
	onMessageOutbound: "Stop",
	onPreCompact: "PreCompact",
	onPostCompact: "PostCompact"
};
function validatePlugin(p) {
	if (!p || typeof p !== "object") throw new Error("plugin: object required");
	if (!p.name || typeof p.name !== "string") throw new Error("plugin.name: string required");
	if (!SURFACES.includes(p.surfaces)) throw new Error(`plugin ${p.name}: surfaces must be one of ${SURFACES.join(",")}`);
	if (typeof p.register !== "function") throw new Error(`plugin ${p.name}: register(ctx) function required`);
	if (p.requires && !Array.isArray(p.requires)) throw new Error(`plugin ${p.name}: requires must be array`);
	return p;
}
function topoSort(plugins) {
	const byName = new Map(plugins.map((p) => [p.name, p]));
	const seen = /* @__PURE__ */ new Map();
	const out = [];
	const visit = (name, stack) => {
		if (seen.get(name) === "done") return;
		if (seen.get(name) === "visiting") throw new Error(`plugin cycle: ${[...stack, name].join(" -> ")}`);
		const p = byName.get(name);
		if (!p) throw new Error(`plugin missing: ${name} (required by ${stack[stack.length - 1] || "root"})`);
		seen.set(name, "visiting");
		for (const dep of p.requires || []) visit(dep, [...stack, name]);
		seen.set(name, "done");
		out.push(p);
	};
	for (const p of plugins) visit(p.name, []);
	return out;
}
//#endregion
//#region src/host/host_helpers.js
function reg(map, kind) {
	return {
		register(spec) {
			if (!spec?.name) throw new Error(`${kind}.name required`);
			map.set(spec.name, spec);
		},
		get: (n) => map.get(n),
		list: () => [...map.values()],
		has: (n) => map.has(n),
		size: () => map.size
	};
}
function makePi() {
	const m = {
		tools: /* @__PURE__ */ new Map(),
		envs: /* @__PURE__ */ new Map(),
		commands: /* @__PURE__ */ new Map(),
		crons: /* @__PURE__ */ new Map(),
		platforms: /* @__PURE__ */ new Map(),
		memory: /* @__PURE__ */ new Map(),
		skills: /* @__PURE__ */ new Map(),
		contexts: /* @__PURE__ */ new Map(),
		agentExts: /* @__PURE__ */ new Map(),
		cli: /* @__PURE__ */ new Map()
	};
	return {
		_state: m,
		tools: reg(m.tools, "tool"),
		envs: reg(m.envs, "env"),
		commands: reg(m.commands, "command"),
		crons: reg(m.crons, "cron"),
		platforms: reg(m.platforms, "platform"),
		memory: reg(m.memory, "memory"),
		skills: reg(m.skills, "skill"),
		contexts: reg(m.contexts, "context"),
		agentExts: reg(m.agentExts, "agentExt"),
		cli: reg(m.cli, "cli"),
		async dispatchTool(name, args = {}, ctx = {}) {
			const t = m.tools.get(name);
			if (!t) return JSON.stringify({ error: `unknown tool: ${name}` });
			if (t.checkFn && t.checkFn(t) === false) return JSON.stringify({
				error: `tool unavailable: ${name}`,
				requires: t.requiresEnv || []
			});
			try {
				const r = await t.handler(args, ctx);
				return typeof r === "string" ? r : JSON.stringify(r);
			} catch (e) {
				return JSON.stringify({
					error: String(e?.message || e),
					tool: name
				});
			}
		}
	};
}
function makeGui() {
	const r = [], pages = /* @__PURE__ */ new Map(), nav = [], debugs = /* @__PURE__ */ new Map(), apis = /* @__PURE__ */ new Map(), assets = /* @__PURE__ */ new Map();
	return {
		_state: {
			routes: r,
			pages,
			nav,
			debugs,
			apis,
			assets
		},
		route: (method, p, h) => r.push({
			method: method.toUpperCase(),
			path: p,
			handler: h
		}),
		page: (s, d) => pages.set(s, d),
		nav: (i) => nav.push(i),
		debug: (n, fn) => debugs.set(n, fn),
		api: (g, d) => apis.set(g, d),
		asset: (p, c) => assets.set(p, c),
		routes: { list: () => r },
		pages: {
			get: (s) => pages.get(s),
			list: () => [...pages.values()],
			has: (s) => pages.has(s)
		},
		navItems: { list: () => nav },
		debugs: {
			list: () => [...debugs.entries()].map(([n, f]) => ({
				name: n,
				snapshot: f
			})),
			get: (n) => debugs.get(n)
		}
	};
}
function ccPayloadFor(name, payload) {
	if (name === "preToolCall" || name === "postToolCall") return {
		tool_name: payload?.name,
		tool_input: payload?.args || payload?.input,
		tool_response: payload?.result
	};
	if (name === "onMessageInbound" || name === "onMessageOutbound") return { prompt: payload?.content || payload?.text || "" };
	if (name === "onPreCompact" || name === "onPostCompact") return {
		trigger: payload?.trigger || "auto",
		messages_count: payload?.messages?.length ?? 0,
		summary: payload?.summary ?? null
	};
	return payload || {};
}
function guard(surface, allowed, name, verbs) {
	if (allowed) return surface;
	return new Proxy({}, { get(_, key) {
		if (verbs.includes(String(key))) return () => {
			throw new Error(`plugin ${name}: surface verb '${String(key)}' not allowed (declared surfaces=${name})`);
		};
		return surface[key];
	} });
}
function scopedCfg(name, store) {
	const k = `plugins.${name}`;
	return {
		get: (kk, d) => store.get(`${k}.${kk}`, d),
		set: (kk, v) => store.set(`${k}.${kk}`, v),
		all: () => store.all(k) || {}
	};
}
var nullStore = () => {
	const m = /* @__PURE__ */ new Map();
	return {
		get: (k, d) => m.has(k) ? m.get(k) : d,
		set: (k, v) => m.set(k, v),
		all: (p) => Object.fromEntries([...m.entries()].filter(([k]) => k.startsWith(p)))
	};
};
function makeCcHooks({ surfaces, pi, binPaths, inboundListeners }) {
	const pi_ok = surfaces.includes("pi");
	return {
		onSkill: (p, s) => pi_ok && pi.skills.register({
			name: p.manifest.name + ":" + s.name,
			description: s.description,
			content: s.body,
			source: "cc:" + p.manifest.name,
			frontmatter: s.fields,
			file: s.file
		}),
		onAgent: (p, a) => pi_ok && pi.agentExts.register({
			name: p.manifest.name + ":" + a.name,
			description: a.description,
			frontmatter: a.fields,
			body: a.body,
			source: "cc:" + p.manifest.name,
			file: a.file
		}),
		onCommand: (p, c) => pi_ok && pi.commands.register({
			name: p.manifest.name + ":" + c.name,
			description: c.description,
			body: c.body,
			frontmatter: c.fields,
			source: "cc:" + p.manifest.name
		}),
		onTheme: (p, t) => pi_ok && pi.contexts.register({
			name: "theme:" + p.manifest.name + ":" + t.slug,
			description: t.name,
			theme: t
		}),
		onOutputStyle: (p, o) => pi_ok && pi.contexts.register({
			name: "style:" + p.manifest.name + ":" + o.name,
			description: o.description,
			body: o.body,
			frontmatter: o.fields
		}),
		onChannel: (p, c) => pi_ok && pi.platforms.register({
			name: "cc:" + p.manifest.name + ":" + c.server,
			server: c.server,
			userConfig: c.userConfig || {},
			source: "cc:" + p.manifest.name
		}),
		onSetting: (p, s) => {
			if (s.agent && pi_ok && !pi.agentExts.has("default")) pi.agentExts.register({
				name: "default",
				target: p.manifest.name + ":" + s.agent
			});
		},
		onBin: (_, dir) => binPaths.push(dir),
		onMcpTool: (p, server, tool, call) => pi_ok && pi.tools.register({
			name: "cc:" + p.manifest.name + ":" + server + ":" + tool.name,
			schema: {
				name: tool.name,
				description: tool.description || "",
				parameters: tool.inputSchema || {}
			},
			handler: (args) => call(args)
		}),
		onMonitorLine: (p, mon, line) => {
			for (const fn of inboundListeners) fn({
				source: "monitor:" + p.manifest.name + ":" + mon.name,
				text: line
			});
		}
	};
}
function makeHooksRegistry(ccHost) {
	const reg2 = Object.fromEntries(HOOK_NAMES.map((n) => [n, []]));
	return {
		on(name, fn) {
			if (!HOOK_NAMES.includes(name)) throw new Error(`unknown hook: ${name}`);
			reg2[name].push(fn);
		},
		async invoke(name, payload) {
			let cur = payload;
			for (const fn of reg2[name] || []) cur = await fn(cur) ?? cur;
			const native = FREDDIE_TO_NATIVE_HOOK[name];
			if (native && ccHost.plugins().length && !process.env.FREDDIE_DISABLE_CC_HOOKS) {
				const r = await ccHost.dispatch(native, ccPayloadFor(name, cur));
				const extras = {};
				if (typeof r.systemMessage === "string" && r.systemMessage.length) extras.systemMessage = r.systemMessage;
				const addCtx = r.hookSpecificOutput?.additionalContext;
				if (typeof addCtx === "string" && addCtx.length) extras.additionalContext = addCtx;
				if (r.decision === "block") return {
					...cur,
					...extras,
					behavior: "block",
					reason: r.reason
				};
				if (r.hookSpecificOutput?.permissionDecision === "deny") return {
					...cur,
					...extras,
					behavior: "block",
					reason: r.hookSpecificOutput?.permissionDecisionReason || "denied"
				};
				if (r.hookSpecificOutput?.updatedInput) return {
					...cur,
					...extras,
					...r.hookSpecificOutput.updatedInput
				};
				if (Object.keys(extras).length) return {
					...cur,
					...extras
				};
			}
			return cur;
		},
		names: () => HOOK_NAMES,
		listeners: (n) => [...reg2[n] || []]
	};
}
function isCcPluginDir(dir) {
	if (fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) return true;
	if (!fs.existsSync(path.join(dir, "plugin.json"))) return false;
	return fs.existsSync(path.join(dir, "hooks", "hooks.json")) || fs.existsSync(path.join(dir, "skills")) || fs.existsSync(path.join(dir, "agents"));
}
function makeCcLoaders(ccHost, env) {
	async function useCcDir(dir) {
		try {
			await ccHost.use(loadClaudePlugin(dir));
		} catch (e) {
			if (env.FREDDIE_LOG_STDOUT) console.error(`cc-plugin ${dir} failed: ${e.message}`);
		}
	}
	async function loadCcPlugins(roots) {
		for (const root of roots) {
			if (!root || !fs.existsSync(root)) continue;
			for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const dir = path.join(root, entry.name);
				if (isCcPluginDir(dir)) await useCcDir(dir);
			}
		}
		return ccHost.plugins().length;
	}
	const CC_EXCLUDE = new Set(["gm-cc"]);
	async function loadCcFromNodeModules(startDir) {
		const seen = new Set(ccHost.plugins().map((p) => p.root));
		let cur = path.resolve(startDir);
		while (true) {
			const nm = path.join(cur, "node_modules");
			if (fs.existsSync(nm)) for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const dirs = entry.name.startsWith("@") ? fs.readdirSync(path.join(nm, entry.name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(nm, entry.name, e.name)) : [path.join(nm, entry.name)];
				for (const d of dirs) {
					if (seen.has(d) || !isCcPluginDir(d) || CC_EXCLUDE.has(path.basename(d))) continue;
					seen.add(d);
					await useCcDir(d);
				}
			}
			const parent = path.dirname(cur);
			if (parent === cur) break;
			cur = parent;
		}
		return ccHost.plugins().length;
	}
	return {
		loadCcPlugins,
		loadCcFromNodeModules
	};
}
//#endregion
//#region src/host/host.js
function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded }) {
	return async function load(plugins) {
		const sorted = topoSort(plugins.map(validatePlugin));
		for (const p of sorted) {
			const want = p.surfaces;
			const ctxPi = (want === "pi" || want === "both") && surfaces.includes("pi") ? pi : guard(pi, false, p.name, PI_VERBS);
			const ctxGui = (want === "gui" || want === "both") && surfaces.includes("gui") ? gui : guard(gui, false, p.name, GUI_VERBS);
			const log = (lv, m, f) => {
				const line = JSON.stringify({
					ts: Date.now(),
					plugin: p.name,
					level: lv,
					msg: m,
					...f || {}
				});
				if (env.FREDDIE_LOG_STDOUT) console.log(line);
			};
			const ctx = {
				pi: ctxPi,
				gui: ctxGui,
				hooks,
				log: {
					info: (m, f) => log("info", m, f),
					warn: (m, f) => log("warn", m, f),
					error: (m, f) => log("error", m, f)
				},
				config: scopedCfg(p.name, configStore),
				host,
				env
			};
			await p.register(ctx);
			loaded.push(p);
		}
		return loaded.length;
	};
}
function createHost({ surfaces = ["pi", "gui"], configStore = nullStore(), env = process.env } = {}) {
	const pi = makePi(), gui = makeGui();
	const binPaths = [];
	const inboundListeners = [];
	const ccHost = createHost$1({
		env,
		on: makeCcHooks({
			surfaces,
			pi,
			binPaths,
			inboundListeners
		})
	});
	const hooks = makeHooksRegistry(ccHost);
	const loaded = [];
	const host = {
		pi: surfaces.includes("pi") ? pi : null,
		gui: surfaces.includes("gui") ? gui : null,
		hooks,
		binPaths: () => binPaths.slice(),
		ccPlugins: () => ccHost.plugins(),
		onInbound: (fn) => inboundListeners.push(fn),
		plugins: () => loaded.map((p) => ({
			name: p.name,
			version: p.version || null,
			surfaces: p.surfaces,
			requires: p.requires || []
		})),
		get: (n) => loaded.find((p) => p.name === n) || null,
		shutdown: () => ccHost.shutdown()
	};
	host.load = makePluginLoader({
		surfaces,
		pi,
		gui,
		hooks,
		configStore,
		env,
		host,
		loaded
	});
	const cc = makeCcLoaders(ccHost, env);
	host.loadCcPlugins = cc.loadCcPlugins;
	host.loadCcFromNodeModules = cc.loadCcFromNodeModules;
	return host;
}
async function discoverPlugins(roots) {
	const found = [];
	for (const root of roots) {
		if (!root || !fs.existsSync(root)) continue;
		for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const file = path.join(root, entry.name, "plugin.js");
			if (!fs.existsSync(file)) continue;
			const mod = await import(pathToFileURL(file).href);
			const p = mod.default || mod.plugin;
			if (p) found.push(p);
		}
	}
	return found;
}
//#endregion
//#region src/home.js
var home_exports = /* @__PURE__ */ __exportAll({
	applyHomeOverride: () => applyHomeOverride,
	applyProfileOverride: () => applyProfileOverride,
	displayFreddieHome: () => displayFreddieHome,
	getFreddieHome: () => getFreddieHome,
	getProfilesRoot: () => getProfilesRoot,
	listProfiles: () => listProfiles,
	resetCacheForTests: () => resetCacheForTests
});
function getFreddieHome() {
	if (_cached) return _cached;
	const env = process.env.FREDDIE_HOME;
	if (env) {
		_cached = env;
		ensure(env);
		return env;
	}
	const profile = process.env.FREDDIE_PROFILE;
	const root = path.join(os.homedir(), ".freddie");
	const home = profile ? path.join(root, "profiles", profile) : root;
	_cached = home;
	ensure(home);
	return home;
}
function displayFreddieHome() {
	const profile = process.env.FREDDIE_PROFILE;
	return profile ? `~/.freddie/profiles/${profile}` : "~/.freddie";
}
function applyProfileOverride(name) {
	if (!name || name === "default") {
		delete process.env.FREDDIE_PROFILE;
		_cached = null;
		return;
	}
	process.env.FREDDIE_PROFILE = name;
	_cached = null;
}
function applyHomeOverride(absPath) {
	if (!absPath) {
		delete process.env.FREDDIE_HOME;
		_cached = null;
		return;
	}
	process.env.FREDDIE_HOME = absPath;
	_cached = null;
	ensure(absPath);
}
function getProfilesRoot() {
	if (process.env.FREDDIE_PROFILES_ROOT) return process.env.FREDDIE_PROFILES_ROOT;
	if (process.env.FREDDIE_HOME) return path.join(process.env.FREDDIE_HOME, "profiles");
	return path.join(os.homedir(), ".freddie", "profiles");
}
function listProfiles() {
	const root = getProfilesRoot();
	if (!fs.existsSync(root)) return [];
	return fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
}
function resetCacheForTests() {
	_cached = null;
}
function ensure(p) {
	try {
		fs.mkdirSync(p, { recursive: true });
	} catch {}
}
var _cached;
var init_home = __esmMin((() => {
	_cached = null;
}));
//#endregion
//#region src/projects.js
init_home();
var REGISTRY_PATH = path.join(os.homedir(), ".freddie", "projects.json");
var DEFAULT_REGISTRY = {
	active: "default",
	projects: [{
		name: "default",
		path: path.join(os.homedir(), ".freddie"),
		created_at: (/* @__PURE__ */ new Date()).toISOString()
	}]
};
function ensureRegistry() {
	const dir = path.dirname(REGISTRY_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	if (!fs.existsSync(REGISTRY_PATH)) fs.writeFileSync(REGISTRY_PATH, JSON.stringify(DEFAULT_REGISTRY, null, 2));
}
function loadRegistry() {
	ensureRegistry();
	try {
		const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
		if (!raw.projects || !Array.isArray(raw.projects)) return DEFAULT_REGISTRY;
		if (!raw.projects.find((p) => p.name === "default")) raw.projects.unshift(DEFAULT_REGISTRY.projects[0]);
		if (!raw.active) raw.active = "default";
		return raw;
	} catch {
		return DEFAULT_REGISTRY;
	}
}
function getActiveProject() {
	const reg = loadRegistry();
	return reg.projects.find((p) => p.name === reg.active) || reg.projects[0];
}
function applyActiveProjectFromRegistry() {
	const proj = getActiveProject();
	if (proj) applyHomeOverride(proj.path);
	return proj;
}
//#endregion
//#region src/host/index.js
init_home();
var _host = null;
var _loaded = false;
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var REPO_PLUGINS = path.resolve(__dirname, "..", "..", "plugins");
function host() {
	if (!_host) _host = createHost({ surfaces: ["pi", "gui"] });
	return _host;
}
async function bootHost(extraRoots = []) {
	const h = host();
	if (_loaded) return h;
	_loaded = true;
	if (!process.env.FREDDIE_HOME && !process.env.FREDDIE_PROFILE) applyActiveProjectFromRegistry();
	const plugins = await discoverPlugins([
		REPO_PLUGINS,
		path.join(getFreddieHome(), "plugins"),
		path.join(process.cwd(), ".freddie", "plugins"),
		...extraRoots
	]);
	await h.load(plugins);
	const ccRoots = [path.join(getFreddieHome(), "cc-plugins"), path.join(process.cwd(), ".freddie", "cc-plugins")];
	await h.loadCcPlugins(ccRoots);
	const extra = (process.env.FREDDIE_EXTRA_CC_ROOTS || "").split(path.delimiter).filter(Boolean);
	for (const r of [
		__dirname,
		process.cwd(),
		...extra
	]) await h.loadCcFromNodeModules(r);
	return h;
}
function resetHostForTests() {
	_host = null;
	_loaded = false;
}
//#endregion
//#region src/toolsets.js
function available(host) {
	return host.pi.tools.list().filter((t) => !t.checkFn || t.checkFn(t) !== false);
}
async function getEnabledToolSchemas(enabled = ["core"], disabled = []) {
	const h = await bootHost();
	const enabledSet = new Set(enabled);
	const disabledSet = new Set(disabled);
	return available(h).filter((t) => enabledSet.has(t.toolset || "core") && !disabledSet.has(t.name)).map((t) => t.schema);
}
//#endregion
//#region src/observability/log.js
init_home();
var SEVERITIES = {
	debug: 10,
	info: 20,
	warning: 30,
	error: 40
};
var _streams = /* @__PURE__ */ new Map();
function streamFor(name) {
	if (_streams.has(name)) return _streams.get(name);
	const dir = path.join(getFreddieHome(), "logs");
	fs.mkdirSync(dir, { recursive: true });
	const s = fs.createWriteStream(path.join(dir, `${name}.log`), { flags: "a" });
	_streams.set(name, s);
	return s;
}
function log({ subsystem = "app", severity = "info", msg = "", ...rest }) {
	const rec = {
		ts: (/* @__PURE__ */ new Date()).toISOString(),
		subsystem,
		severity,
		msg,
		...rest
	};
	const line = JSON.stringify(rec) + "\n";
	streamFor(subsystem).write(line);
	if (SEVERITIES[severity] >= 30) streamFor("errors").write(line);
}
function logger(subsystem) {
	return {
		debug: (msg, e = {}) => log({
			subsystem,
			severity: "debug",
			msg,
			...e
		}),
		info: (msg, e = {}) => log({
			subsystem,
			severity: "info",
			msg,
			...e
		}),
		warn: (msg, e = {}) => log({
			subsystem,
			severity: "warning",
			msg,
			...e
		}),
		error: (msg, e = {}) => log({
			subsystem,
			severity: "error",
			msg,
			...e
		})
	};
}
//#endregion
//#region node_modules/js-yaml/dist/js-yaml.mjs
/*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT */
function isNothing(subject) {
	return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
	return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
	if (Array.isArray(sequence)) return sequence;
	else if (isNothing(sequence)) return [];
	return [sequence];
}
function extend(target, source) {
	var index, length, key, sourceKeys;
	if (source) {
		sourceKeys = Object.keys(source);
		for (index = 0, length = sourceKeys.length; index < length; index += 1) {
			key = sourceKeys[index];
			target[key] = source[key];
		}
	}
	return target;
}
function repeat(string, count) {
	var result = "", cycle;
	for (cycle = 0; cycle < count; cycle += 1) result += string;
	return result;
}
function isNegativeZero(number) {
	return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
function formatError(exception, compact) {
	var where = "", message = exception.reason || "(unknown reason)";
	if (!exception.mark) return message;
	if (exception.mark.name) where += "in \"" + exception.mark.name + "\" ";
	where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
	if (!compact && exception.mark.snippet) where += "\n\n" + exception.mark.snippet;
	return message + " " + where;
}
function YAMLException$1(reason, mark) {
	Error.call(this);
	this.name = "YAMLException";
	this.reason = reason;
	this.mark = mark;
	this.message = formatError(this, false);
	if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
	else this.stack = (/* @__PURE__ */ new Error()).stack || "";
}
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
	var head = "";
	var tail = "";
	var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
	if (position - lineStart > maxHalfLength) {
		head = " ... ";
		lineStart = position - maxHalfLength + head.length;
	}
	if (lineEnd - position > maxHalfLength) {
		tail = " ...";
		lineEnd = position + maxHalfLength - tail.length;
	}
	return {
		str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "→") + tail,
		pos: position - lineStart + head.length
	};
}
function padStart(string, max) {
	return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
	options = Object.create(options || null);
	if (!mark.buffer) return null;
	if (!options.maxLength) options.maxLength = 79;
	if (typeof options.indent !== "number") options.indent = 1;
	if (typeof options.linesBefore !== "number") options.linesBefore = 3;
	if (typeof options.linesAfter !== "number") options.linesAfter = 2;
	var re = /\r?\n|\r|\0/g;
	var lineStarts = [0];
	var lineEnds = [];
	var match;
	var foundLineNo = -1;
	while (match = re.exec(mark.buffer)) {
		lineEnds.push(match.index);
		lineStarts.push(match.index + match[0].length);
		if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
	}
	if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
	var result = "", i, line;
	var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
	var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
	for (i = 1; i <= options.linesBefore; i++) {
		if (foundLineNo - i < 0) break;
		line = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
		result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
	}
	line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
	result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
	result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
	for (i = 1; i <= options.linesAfter; i++) {
		if (foundLineNo + i >= lineEnds.length) break;
		line = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
		result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
	}
	return result.replace(/\n$/, "");
}
function compileStyleAliases(map) {
	var result = {};
	if (map !== null) Object.keys(map).forEach(function(style) {
		map[style].forEach(function(alias) {
			result[String(alias)] = style;
		});
	});
	return result;
}
function Type$1(tag, options) {
	options = options || {};
	Object.keys(options).forEach(function(name) {
		if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) throw new exception("Unknown option \"" + name + "\" is met in definition of \"" + tag + "\" YAML type.");
	});
	this.options = options;
	this.tag = tag;
	this.kind = options["kind"] || null;
	this.resolve = options["resolve"] || function() {
		return true;
	};
	this.construct = options["construct"] || function(data) {
		return data;
	};
	this.instanceOf = options["instanceOf"] || null;
	this.predicate = options["predicate"] || null;
	this.represent = options["represent"] || null;
	this.representName = options["representName"] || null;
	this.defaultStyle = options["defaultStyle"] || null;
	this.multi = options["multi"] || false;
	this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
	if (YAML_NODE_KINDS.indexOf(this.kind) === -1) throw new exception("Unknown kind \"" + this.kind + "\" is specified for \"" + tag + "\" YAML type.");
}
function compileList(schema, name) {
	var result = [];
	schema[name].forEach(function(currentType) {
		var newIndex = result.length;
		result.forEach(function(previousType, previousIndex) {
			if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) newIndex = previousIndex;
		});
		result[newIndex] = currentType;
	});
	return result;
}
function compileMap() {
	var result = {
		scalar: {},
		sequence: {},
		mapping: {},
		fallback: {},
		multi: {
			scalar: [],
			sequence: [],
			mapping: [],
			fallback: []
		}
	}, index, length;
	function collectType(type) {
		if (type.multi) {
			result.multi[type.kind].push(type);
			result.multi["fallback"].push(type);
		} else result[type.kind][type.tag] = result["fallback"][type.tag] = type;
	}
	for (index = 0, length = arguments.length; index < length; index += 1) arguments[index].forEach(collectType);
	return result;
}
function Schema$1(definition) {
	return this.extend(definition);
}
function resolveYamlNull(data) {
	if (data === null) return true;
	var max = data.length;
	return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
	return null;
}
function isNull(object) {
	return object === null;
}
function resolveYamlBoolean(data) {
	if (data === null) return false;
	var max = data.length;
	return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
	return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
	return Object.prototype.toString.call(object) === "[object Boolean]";
}
function isHexCode(c) {
	return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
	return 48 <= c && c <= 55;
}
function isDecCode(c) {
	return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
	if (data === null) return false;
	var max = data.length, index = 0, hasDigits = false, ch;
	if (!max) return false;
	ch = data[index];
	if (ch === "-" || ch === "+") ch = data[++index];
	if (ch === "0") {
		if (index + 1 === max) return true;
		ch = data[++index];
		if (ch === "b") {
			index++;
			for (; index < max; index++) {
				ch = data[index];
				if (ch === "_") continue;
				if (ch !== "0" && ch !== "1") return false;
				hasDigits = true;
			}
			return hasDigits && ch !== "_";
		}
		if (ch === "x") {
			index++;
			for (; index < max; index++) {
				ch = data[index];
				if (ch === "_") continue;
				if (!isHexCode(data.charCodeAt(index))) return false;
				hasDigits = true;
			}
			return hasDigits && ch !== "_";
		}
		if (ch === "o") {
			index++;
			for (; index < max; index++) {
				ch = data[index];
				if (ch === "_") continue;
				if (!isOctCode(data.charCodeAt(index))) return false;
				hasDigits = true;
			}
			return hasDigits && ch !== "_";
		}
	}
	if (ch === "_") return false;
	for (; index < max; index++) {
		ch = data[index];
		if (ch === "_") continue;
		if (!isDecCode(data.charCodeAt(index))) return false;
		hasDigits = true;
	}
	if (!hasDigits || ch === "_") return false;
	return true;
}
function constructYamlInteger(data) {
	var value = data, sign = 1, ch;
	if (value.indexOf("_") !== -1) value = value.replace(/_/g, "");
	ch = value[0];
	if (ch === "-" || ch === "+") {
		if (ch === "-") sign = -1;
		value = value.slice(1);
		ch = value[0];
	}
	if (value === "0") return 0;
	if (ch === "0") {
		if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
		if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
		if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
	}
	return sign * parseInt(value, 10);
}
function isInteger(object) {
	return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
}
function resolveYamlFloat(data) {
	if (data === null) return false;
	if (!YAML_FLOAT_PATTERN.test(data) || data[data.length - 1] === "_") return false;
	return true;
}
function constructYamlFloat(data) {
	var value = data.replace(/_/g, "").toLowerCase(), sign = value[0] === "-" ? -1 : 1;
	if ("+-".indexOf(value[0]) >= 0) value = value.slice(1);
	if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
	else if (value === ".nan") return NaN;
	return sign * parseFloat(value, 10);
}
function representYamlFloat(object, style) {
	var res;
	if (isNaN(object)) switch (style) {
		case "lowercase": return ".nan";
		case "uppercase": return ".NAN";
		case "camelcase": return ".NaN";
	}
	else if (Number.POSITIVE_INFINITY === object) switch (style) {
		case "lowercase": return ".inf";
		case "uppercase": return ".INF";
		case "camelcase": return ".Inf";
	}
	else if (Number.NEGATIVE_INFINITY === object) switch (style) {
		case "lowercase": return "-.inf";
		case "uppercase": return "-.INF";
		case "camelcase": return "-.Inf";
	}
	else if (common.isNegativeZero(object)) return "-0.0";
	res = object.toString(10);
	return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
	return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
function resolveYamlTimestamp(data) {
	if (data === null) return false;
	if (YAML_DATE_REGEXP.exec(data) !== null) return true;
	if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
	return false;
}
function constructYamlTimestamp(data) {
	var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
	match = YAML_DATE_REGEXP.exec(data);
	if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
	if (match === null) throw new Error("Date resolve error");
	year = +match[1];
	month = +match[2] - 1;
	day = +match[3];
	if (!match[4]) return new Date(Date.UTC(year, month, day));
	hour = +match[4];
	minute = +match[5];
	second = +match[6];
	if (match[7]) {
		fraction = match[7].slice(0, 3);
		while (fraction.length < 3) fraction += "0";
		fraction = +fraction;
	}
	if (match[9]) {
		tz_hour = +match[10];
		tz_minute = +(match[11] || 0);
		delta = (tz_hour * 60 + tz_minute) * 6e4;
		if (match[9] === "-") delta = -delta;
	}
	date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
	if (delta) date.setTime(date.getTime() - delta);
	return date;
}
function representYamlTimestamp(object) {
	return object.toISOString();
}
function resolveYamlMerge(data) {
	return data === "<<" || data === null;
}
function resolveYamlBinary(data) {
	if (data === null) return false;
	var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;
	for (idx = 0; idx < max; idx++) {
		code = map.indexOf(data.charAt(idx));
		if (code > 64) continue;
		if (code < 0) return false;
		bitlen += 6;
	}
	return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
	var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map = BASE64_MAP, bits = 0, result = [];
	for (idx = 0; idx < max; idx++) {
		if (idx % 4 === 0 && idx) {
			result.push(bits >> 16 & 255);
			result.push(bits >> 8 & 255);
			result.push(bits & 255);
		}
		bits = bits << 6 | map.indexOf(input.charAt(idx));
	}
	tailbits = max % 4 * 6;
	if (tailbits === 0) {
		result.push(bits >> 16 & 255);
		result.push(bits >> 8 & 255);
		result.push(bits & 255);
	} else if (tailbits === 18) {
		result.push(bits >> 10 & 255);
		result.push(bits >> 2 & 255);
	} else if (tailbits === 12) result.push(bits >> 4 & 255);
	return new Uint8Array(result);
}
function representYamlBinary(object) {
	var result = "", bits = 0, idx, tail, max = object.length, map = BASE64_MAP;
	for (idx = 0; idx < max; idx++) {
		if (idx % 3 === 0 && idx) {
			result += map[bits >> 18 & 63];
			result += map[bits >> 12 & 63];
			result += map[bits >> 6 & 63];
			result += map[bits & 63];
		}
		bits = (bits << 8) + object[idx];
	}
	tail = max % 3;
	if (tail === 0) {
		result += map[bits >> 18 & 63];
		result += map[bits >> 12 & 63];
		result += map[bits >> 6 & 63];
		result += map[bits & 63];
	} else if (tail === 2) {
		result += map[bits >> 10 & 63];
		result += map[bits >> 4 & 63];
		result += map[bits << 2 & 63];
		result += map[64];
	} else if (tail === 1) {
		result += map[bits >> 2 & 63];
		result += map[bits << 4 & 63];
		result += map[64];
		result += map[64];
	}
	return result;
}
function isBinary(obj) {
	return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
function resolveYamlOmap(data) {
	if (data === null) return true;
	var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
	for (index = 0, length = object.length; index < length; index += 1) {
		pair = object[index];
		pairHasKey = false;
		if (_toString$2.call(pair) !== "[object Object]") return false;
		for (pairKey in pair) if (_hasOwnProperty$3.call(pair, pairKey)) if (!pairHasKey) pairHasKey = true;
		else return false;
		if (!pairHasKey) return false;
		if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
		else return false;
	}
	return true;
}
function constructYamlOmap(data) {
	return data !== null ? data : [];
}
function resolveYamlPairs(data) {
	if (data === null) return true;
	var index, length, pair, keys, result, object = data;
	result = new Array(object.length);
	for (index = 0, length = object.length; index < length; index += 1) {
		pair = object[index];
		if (_toString$1.call(pair) !== "[object Object]") return false;
		keys = Object.keys(pair);
		if (keys.length !== 1) return false;
		result[index] = [keys[0], pair[keys[0]]];
	}
	return true;
}
function constructYamlPairs(data) {
	if (data === null) return [];
	var index, length, pair, keys, result, object = data;
	result = new Array(object.length);
	for (index = 0, length = object.length; index < length; index += 1) {
		pair = object[index];
		keys = Object.keys(pair);
		result[index] = [keys[0], pair[keys[0]]];
	}
	return result;
}
function resolveYamlSet(data) {
	if (data === null) return true;
	var key, object = data;
	for (key in object) if (_hasOwnProperty$2.call(object, key)) {
		if (object[key] !== null) return false;
	}
	return true;
}
function constructYamlSet(data) {
	return data !== null ? data : {};
}
function _class(obj) {
	return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
	return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
	return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
	return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
	return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
	var lc;
	if (48 <= c && c <= 57) return c - 48;
	lc = c | 32;
	if (97 <= lc && lc <= 102) return lc - 97 + 10;
	return -1;
}
function escapedHexLen(c) {
	if (c === 120) return 2;
	if (c === 117) return 4;
	if (c === 85) return 8;
	return 0;
}
function fromDecimalCode(c) {
	if (48 <= c && c <= 57) return c - 48;
	return -1;
}
function simpleEscapeSequence(c) {
	return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? "\"" : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
	if (c <= 65535) return String.fromCharCode(c);
	return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
}
function setProperty(object, key, value) {
	if (key === "__proto__") Object.defineProperty(object, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value
	});
	else object[key] = value;
}
function State$1(input, options) {
	this.input = input;
	this.filename = options["filename"] || null;
	this.schema = options["schema"] || _default;
	this.onWarning = options["onWarning"] || null;
	this.legacy = options["legacy"] || false;
	this.json = options["json"] || false;
	this.listener = options["listener"] || null;
	this.implicitTypes = this.schema.compiledImplicit;
	this.typeMap = this.schema.compiledTypeMap;
	this.length = input.length;
	this.position = 0;
	this.line = 0;
	this.lineStart = 0;
	this.lineIndent = 0;
	this.firstTabInLine = -1;
	this.documents = [];
}
function generateError(state, message) {
	var mark = {
		name: state.filename,
		buffer: state.input.slice(0, -1),
		position: state.position,
		line: state.line,
		column: state.position - state.lineStart
	};
	mark.snippet = snippet(mark);
	return new exception(message, mark);
}
function throwError(state, message) {
	throw generateError(state, message);
}
function throwWarning(state, message) {
	if (state.onWarning) state.onWarning.call(null, generateError(state, message));
}
function captureSegment(state, start, end, checkJson) {
	var _position, _length, _character, _result;
	if (start < end) {
		_result = state.input.slice(start, end);
		if (checkJson) for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
			_character = _result.charCodeAt(_position);
			if (!(_character === 9 || 32 <= _character && _character <= 1114111)) throwError(state, "expected valid JSON character");
		}
		else if (PATTERN_NON_PRINTABLE.test(_result)) throwError(state, "the stream contains non-printable characters");
		state.result += _result;
	}
}
function mergeMappings(state, destination, source, overridableKeys) {
	var sourceKeys, key, index, quantity;
	if (!common.isObject(source)) throwError(state, "cannot merge mappings; the provided source object is unacceptable");
	sourceKeys = Object.keys(source);
	for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
		key = sourceKeys[index];
		if (!_hasOwnProperty$1.call(destination, key)) {
			setProperty(destination, key, source[key]);
			overridableKeys[key] = true;
		}
	}
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
	var index, quantity;
	if (Array.isArray(keyNode)) {
		keyNode = Array.prototype.slice.call(keyNode);
		for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
			if (Array.isArray(keyNode[index])) throwError(state, "nested arrays are not supported inside keys");
			if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") keyNode[index] = "[object Object]";
		}
	}
	if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") keyNode = "[object Object]";
	keyNode = String(keyNode);
	if (_result === null) _result = {};
	if (keyTag === "tag:yaml.org,2002:merge") if (Array.isArray(valueNode)) for (index = 0, quantity = valueNode.length; index < quantity; index += 1) mergeMappings(state, _result, valueNode[index], overridableKeys);
	else mergeMappings(state, _result, valueNode, overridableKeys);
	else {
		if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
			state.line = startLine || state.line;
			state.lineStart = startLineStart || state.lineStart;
			state.position = startPos || state.position;
			throwError(state, "duplicated mapping key");
		}
		setProperty(_result, keyNode, valueNode);
		delete overridableKeys[keyNode];
	}
	return _result;
}
function readLineBreak(state) {
	var ch = state.input.charCodeAt(state.position);
	if (ch === 10) state.position++;
	else if (ch === 13) {
		state.position++;
		if (state.input.charCodeAt(state.position) === 10) state.position++;
	} else throwError(state, "a line break is expected");
	state.line += 1;
	state.lineStart = state.position;
	state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
	var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
	while (ch !== 0) {
		while (is_WHITE_SPACE(ch)) {
			if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
			ch = state.input.charCodeAt(++state.position);
		}
		if (allowComments && ch === 35) do
			ch = state.input.charCodeAt(++state.position);
		while (ch !== 10 && ch !== 13 && ch !== 0);
		if (is_EOL(ch)) {
			readLineBreak(state);
			ch = state.input.charCodeAt(state.position);
			lineBreaks++;
			state.lineIndent = 0;
			while (ch === 32) {
				state.lineIndent++;
				ch = state.input.charCodeAt(++state.position);
			}
		} else break;
	}
	if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) throwWarning(state, "deficient indentation");
	return lineBreaks;
}
function testDocumentSeparator(state) {
	var _position = state.position, ch = state.input.charCodeAt(_position);
	if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
		_position += 3;
		ch = state.input.charCodeAt(_position);
		if (ch === 0 || is_WS_OR_EOL(ch)) return true;
	}
	return false;
}
function writeFoldedLines(state, count) {
	if (count === 1) state.result += " ";
	else if (count > 1) state.result += common.repeat("\n", count - 1);
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
	var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch = state.input.charCodeAt(state.position);
	if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) return false;
	if (ch === 63 || ch === 45) {
		following = state.input.charCodeAt(state.position + 1);
		if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) return false;
	}
	state.kind = "scalar";
	state.result = "";
	captureStart = captureEnd = state.position;
	hasPendingContent = false;
	while (ch !== 0) {
		if (ch === 58) {
			following = state.input.charCodeAt(state.position + 1);
			if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) break;
		} else if (ch === 35) {
			preceding = state.input.charCodeAt(state.position - 1);
			if (is_WS_OR_EOL(preceding)) break;
		} else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) break;
		else if (is_EOL(ch)) {
			_line = state.line;
			_lineStart = state.lineStart;
			_lineIndent = state.lineIndent;
			skipSeparationSpace(state, false, -1);
			if (state.lineIndent >= nodeIndent) {
				hasPendingContent = true;
				ch = state.input.charCodeAt(state.position);
				continue;
			} else {
				state.position = captureEnd;
				state.line = _line;
				state.lineStart = _lineStart;
				state.lineIndent = _lineIndent;
				break;
			}
		}
		if (hasPendingContent) {
			captureSegment(state, captureStart, captureEnd, false);
			writeFoldedLines(state, state.line - _line);
			captureStart = captureEnd = state.position;
			hasPendingContent = false;
		}
		if (!is_WHITE_SPACE(ch)) captureEnd = state.position + 1;
		ch = state.input.charCodeAt(++state.position);
	}
	captureSegment(state, captureStart, captureEnd, false);
	if (state.result) return true;
	state.kind = _kind;
	state.result = _result;
	return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
	var ch = state.input.charCodeAt(state.position), captureStart, captureEnd;
	if (ch !== 39) return false;
	state.kind = "scalar";
	state.result = "";
	state.position++;
	captureStart = captureEnd = state.position;
	while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 39) {
		captureSegment(state, captureStart, state.position, true);
		ch = state.input.charCodeAt(++state.position);
		if (ch === 39) {
			captureStart = state.position;
			state.position++;
			captureEnd = state.position;
		} else return true;
	} else if (is_EOL(ch)) {
		captureSegment(state, captureStart, captureEnd, true);
		writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
		captureStart = captureEnd = state.position;
	} else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
	else {
		state.position++;
		captureEnd = state.position;
	}
	throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
	var captureStart, captureEnd, hexLength, hexResult, tmp, ch = state.input.charCodeAt(state.position);
	if (ch !== 34) return false;
	state.kind = "scalar";
	state.result = "";
	state.position++;
	captureStart = captureEnd = state.position;
	while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 34) {
		captureSegment(state, captureStart, state.position, true);
		state.position++;
		return true;
	} else if (ch === 92) {
		captureSegment(state, captureStart, state.position, true);
		ch = state.input.charCodeAt(++state.position);
		if (is_EOL(ch)) skipSeparationSpace(state, false, nodeIndent);
		else if (ch < 256 && simpleEscapeCheck[ch]) {
			state.result += simpleEscapeMap[ch];
			state.position++;
		} else if ((tmp = escapedHexLen(ch)) > 0) {
			hexLength = tmp;
			hexResult = 0;
			for (; hexLength > 0; hexLength--) {
				ch = state.input.charCodeAt(++state.position);
				if ((tmp = fromHexCode(ch)) >= 0) hexResult = (hexResult << 4) + tmp;
				else throwError(state, "expected hexadecimal character");
			}
			state.result += charFromCodepoint(hexResult);
			state.position++;
		} else throwError(state, "unknown escape sequence");
		captureStart = captureEnd = state.position;
	} else if (is_EOL(ch)) {
		captureSegment(state, captureStart, captureEnd, true);
		writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
		captureStart = captureEnd = state.position;
	} else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
	else {
		state.position++;
		captureEnd = state.position;
	}
	throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
	var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = Object.create(null), keyNode, keyTag, valueNode, ch = state.input.charCodeAt(state.position);
	if (ch === 91) {
		terminator = 93;
		isMapping = false;
		_result = [];
	} else if (ch === 123) {
		terminator = 125;
		isMapping = true;
		_result = {};
	} else return false;
	if (state.anchor !== null) state.anchorMap[state.anchor] = _result;
	ch = state.input.charCodeAt(++state.position);
	while (ch !== 0) {
		skipSeparationSpace(state, true, nodeIndent);
		ch = state.input.charCodeAt(state.position);
		if (ch === terminator) {
			state.position++;
			state.tag = _tag;
			state.anchor = _anchor;
			state.kind = isMapping ? "mapping" : "sequence";
			state.result = _result;
			return true;
		} else if (!readNext) throwError(state, "missed comma between flow collection entries");
		else if (ch === 44) throwError(state, "expected the node content, but found ','");
		keyTag = keyNode = valueNode = null;
		isPair = isExplicitPair = false;
		if (ch === 63) {
			following = state.input.charCodeAt(state.position + 1);
			if (is_WS_OR_EOL(following)) {
				isPair = isExplicitPair = true;
				state.position++;
				skipSeparationSpace(state, true, nodeIndent);
			}
		}
		_line = state.line;
		_lineStart = state.lineStart;
		_pos = state.position;
		composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
		keyTag = state.tag;
		keyNode = state.result;
		skipSeparationSpace(state, true, nodeIndent);
		ch = state.input.charCodeAt(state.position);
		if ((isExplicitPair || state.line === _line) && ch === 58) {
			isPair = true;
			ch = state.input.charCodeAt(++state.position);
			skipSeparationSpace(state, true, nodeIndent);
			composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
			valueNode = state.result;
		}
		if (isMapping) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
		else if (isPair) _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
		else _result.push(keyNode);
		skipSeparationSpace(state, true, nodeIndent);
		ch = state.input.charCodeAt(state.position);
		if (ch === 44) {
			readNext = true;
			ch = state.input.charCodeAt(++state.position);
		} else readNext = false;
	}
	throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
	var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch = state.input.charCodeAt(state.position);
	if (ch === 124) folding = false;
	else if (ch === 62) folding = true;
	else return false;
	state.kind = "scalar";
	state.result = "";
	while (ch !== 0) {
		ch = state.input.charCodeAt(++state.position);
		if (ch === 43 || ch === 45) if (CHOMPING_CLIP === chomping) chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
		else throwError(state, "repeat of a chomping mode identifier");
		else if ((tmp = fromDecimalCode(ch)) >= 0) if (tmp === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
		else if (!detectedIndent) {
			textIndent = nodeIndent + tmp - 1;
			detectedIndent = true;
		} else throwError(state, "repeat of an indentation width identifier");
		else break;
	}
	if (is_WHITE_SPACE(ch)) {
		do
			ch = state.input.charCodeAt(++state.position);
		while (is_WHITE_SPACE(ch));
		if (ch === 35) do
			ch = state.input.charCodeAt(++state.position);
		while (!is_EOL(ch) && ch !== 0);
	}
	while (ch !== 0) {
		readLineBreak(state);
		state.lineIndent = 0;
		ch = state.input.charCodeAt(state.position);
		while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
			state.lineIndent++;
			ch = state.input.charCodeAt(++state.position);
		}
		if (!detectedIndent && state.lineIndent > textIndent) textIndent = state.lineIndent;
		if (is_EOL(ch)) {
			emptyLines++;
			continue;
		}
		if (state.lineIndent < textIndent) {
			if (chomping === CHOMPING_KEEP) state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
			else if (chomping === CHOMPING_CLIP) {
				if (didReadContent) state.result += "\n";
			}
			break;
		}
		if (folding) if (is_WHITE_SPACE(ch)) {
			atMoreIndented = true;
			state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
		} else if (atMoreIndented) {
			atMoreIndented = false;
			state.result += common.repeat("\n", emptyLines + 1);
		} else if (emptyLines === 0) {
			if (didReadContent) state.result += " ";
		} else state.result += common.repeat("\n", emptyLines);
		else state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
		didReadContent = true;
		detectedIndent = true;
		emptyLines = 0;
		captureStart = state.position;
		while (!is_EOL(ch) && ch !== 0) ch = state.input.charCodeAt(++state.position);
		captureSegment(state, captureStart, state.position, false);
	}
	return true;
}
function readBlockSequence(state, nodeIndent) {
	var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
	if (state.firstTabInLine !== -1) return false;
	if (state.anchor !== null) state.anchorMap[state.anchor] = _result;
	ch = state.input.charCodeAt(state.position);
	while (ch !== 0) {
		if (state.firstTabInLine !== -1) {
			state.position = state.firstTabInLine;
			throwError(state, "tab characters must not be used in indentation");
		}
		if (ch !== 45) break;
		following = state.input.charCodeAt(state.position + 1);
		if (!is_WS_OR_EOL(following)) break;
		detected = true;
		state.position++;
		if (skipSeparationSpace(state, true, -1)) {
			if (state.lineIndent <= nodeIndent) {
				_result.push(null);
				ch = state.input.charCodeAt(state.position);
				continue;
			}
		}
		_line = state.line;
		composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
		_result.push(state.result);
		skipSeparationSpace(state, true, -1);
		ch = state.input.charCodeAt(state.position);
		if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a sequence entry");
		else if (state.lineIndent < nodeIndent) break;
	}
	if (detected) {
		state.tag = _tag;
		state.anchor = _anchor;
		state.kind = "sequence";
		state.result = _result;
		return true;
	}
	return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
	var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
	if (state.firstTabInLine !== -1) return false;
	if (state.anchor !== null) state.anchorMap[state.anchor] = _result;
	ch = state.input.charCodeAt(state.position);
	while (ch !== 0) {
		if (!atExplicitKey && state.firstTabInLine !== -1) {
			state.position = state.firstTabInLine;
			throwError(state, "tab characters must not be used in indentation");
		}
		following = state.input.charCodeAt(state.position + 1);
		_line = state.line;
		if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
			if (ch === 63) {
				if (atExplicitKey) {
					storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
					keyTag = keyNode = valueNode = null;
				}
				detected = true;
				atExplicitKey = true;
				allowCompact = true;
			} else if (atExplicitKey) {
				atExplicitKey = false;
				allowCompact = true;
			} else throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
			state.position += 1;
			ch = following;
		} else {
			_keyLine = state.line;
			_keyLineStart = state.lineStart;
			_keyPos = state.position;
			if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
			if (state.line === _line) {
				ch = state.input.charCodeAt(state.position);
				while (is_WHITE_SPACE(ch)) ch = state.input.charCodeAt(++state.position);
				if (ch === 58) {
					ch = state.input.charCodeAt(++state.position);
					if (!is_WS_OR_EOL(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
					if (atExplicitKey) {
						storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
						keyTag = keyNode = valueNode = null;
					}
					detected = true;
					atExplicitKey = false;
					allowCompact = false;
					keyTag = state.tag;
					keyNode = state.result;
				} else if (detected) throwError(state, "can not read an implicit mapping pair; a colon is missed");
				else {
					state.tag = _tag;
					state.anchor = _anchor;
					return true;
				}
			} else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
			else {
				state.tag = _tag;
				state.anchor = _anchor;
				return true;
			}
		}
		if (state.line === _line || state.lineIndent > nodeIndent) {
			if (atExplicitKey) {
				_keyLine = state.line;
				_keyLineStart = state.lineStart;
				_keyPos = state.position;
			}
			if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) if (atExplicitKey) keyNode = state.result;
			else valueNode = state.result;
			if (!atExplicitKey) {
				storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
				keyTag = keyNode = valueNode = null;
			}
			skipSeparationSpace(state, true, -1);
			ch = state.input.charCodeAt(state.position);
		}
		if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
		else if (state.lineIndent < nodeIndent) break;
	}
	if (atExplicitKey) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
	if (detected) {
		state.tag = _tag;
		state.anchor = _anchor;
		state.kind = "mapping";
		state.result = _result;
	}
	return detected;
}
function readTagProperty(state) {
	var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch = state.input.charCodeAt(state.position);
	if (ch !== 33) return false;
	if (state.tag !== null) throwError(state, "duplication of a tag property");
	ch = state.input.charCodeAt(++state.position);
	if (ch === 60) {
		isVerbatim = true;
		ch = state.input.charCodeAt(++state.position);
	} else if (ch === 33) {
		isNamed = true;
		tagHandle = "!!";
		ch = state.input.charCodeAt(++state.position);
	} else tagHandle = "!";
	_position = state.position;
	if (isVerbatim) {
		do
			ch = state.input.charCodeAt(++state.position);
		while (ch !== 0 && ch !== 62);
		if (state.position < state.length) {
			tagName = state.input.slice(_position, state.position);
			ch = state.input.charCodeAt(++state.position);
		} else throwError(state, "unexpected end of the stream within a verbatim tag");
	} else {
		while (ch !== 0 && !is_WS_OR_EOL(ch)) {
			if (ch === 33) if (!isNamed) {
				tagHandle = state.input.slice(_position - 1, state.position + 1);
				if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
				isNamed = true;
				_position = state.position + 1;
			} else throwError(state, "tag suffix cannot contain exclamation marks");
			ch = state.input.charCodeAt(++state.position);
		}
		tagName = state.input.slice(_position, state.position);
		if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
	}
	if (tagName && !PATTERN_TAG_URI.test(tagName)) throwError(state, "tag name cannot contain such characters: " + tagName);
	try {
		tagName = decodeURIComponent(tagName);
	} catch (err) {
		throwError(state, "tag name is malformed: " + tagName);
	}
	if (isVerbatim) state.tag = tagName;
	else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) state.tag = state.tagMap[tagHandle] + tagName;
	else if (tagHandle === "!") state.tag = "!" + tagName;
	else if (tagHandle === "!!") state.tag = "tag:yaml.org,2002:" + tagName;
	else throwError(state, "undeclared tag handle \"" + tagHandle + "\"");
	return true;
}
function readAnchorProperty(state) {
	var _position, ch = state.input.charCodeAt(state.position);
	if (ch !== 38) return false;
	if (state.anchor !== null) throwError(state, "duplication of an anchor property");
	ch = state.input.charCodeAt(++state.position);
	_position = state.position;
	while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) ch = state.input.charCodeAt(++state.position);
	if (state.position === _position) throwError(state, "name of an anchor node must contain at least one character");
	state.anchor = state.input.slice(_position, state.position);
	return true;
}
function readAlias(state) {
	var _position, alias, ch = state.input.charCodeAt(state.position);
	if (ch !== 42) return false;
	ch = state.input.charCodeAt(++state.position);
	_position = state.position;
	while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) ch = state.input.charCodeAt(++state.position);
	if (state.position === _position) throwError(state, "name of an alias node must contain at least one character");
	alias = state.input.slice(_position, state.position);
	if (!_hasOwnProperty$1.call(state.anchorMap, alias)) throwError(state, "unidentified alias \"" + alias + "\"");
	state.result = state.anchorMap[alias];
	skipSeparationSpace(state, true, -1);
	return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
	var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type, flowIndent, blockIndent;
	if (state.listener !== null) state.listener("open", state);
	state.tag = null;
	state.anchor = null;
	state.kind = null;
	state.result = null;
	allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
	if (allowToSeek) {
		if (skipSeparationSpace(state, true, -1)) {
			atNewLine = true;
			if (state.lineIndent > parentIndent) indentStatus = 1;
			else if (state.lineIndent === parentIndent) indentStatus = 0;
			else if (state.lineIndent < parentIndent) indentStatus = -1;
		}
	}
	if (indentStatus === 1) while (readTagProperty(state) || readAnchorProperty(state)) if (skipSeparationSpace(state, true, -1)) {
		atNewLine = true;
		allowBlockCollections = allowBlockStyles;
		if (state.lineIndent > parentIndent) indentStatus = 1;
		else if (state.lineIndent === parentIndent) indentStatus = 0;
		else if (state.lineIndent < parentIndent) indentStatus = -1;
	} else allowBlockCollections = false;
	if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
	if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
		if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) flowIndent = parentIndent;
		else flowIndent = parentIndent + 1;
		blockIndent = state.position - state.lineStart;
		if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) hasContent = true;
		else {
			if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) hasContent = true;
			else if (readAlias(state)) {
				hasContent = true;
				if (state.tag !== null || state.anchor !== null) throwError(state, "alias node should not have any properties");
			} else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
				hasContent = true;
				if (state.tag === null) state.tag = "?";
			}
			if (state.anchor !== null) state.anchorMap[state.anchor] = state.result;
		}
		else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
	}
	if (state.tag === null) {
		if (state.anchor !== null) state.anchorMap[state.anchor] = state.result;
	} else if (state.tag === "?") {
		if (state.result !== null && state.kind !== "scalar") throwError(state, "unacceptable node kind for !<?> tag; it should be \"scalar\", not \"" + state.kind + "\"");
		for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
			type = state.implicitTypes[typeIndex];
			if (type.resolve(state.result)) {
				state.result = type.construct(state.result);
				state.tag = type.tag;
				if (state.anchor !== null) state.anchorMap[state.anchor] = state.result;
				break;
			}
		}
	} else if (state.tag !== "!") {
		if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) type = state.typeMap[state.kind || "fallback"][state.tag];
		else {
			type = null;
			typeList = state.typeMap.multi[state.kind || "fallback"];
			for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
				type = typeList[typeIndex];
				break;
			}
		}
		if (!type) throwError(state, "unknown tag !<" + state.tag + ">");
		if (state.result !== null && type.kind !== state.kind) throwError(state, "unacceptable node kind for !<" + state.tag + "> tag; it should be \"" + type.kind + "\", not \"" + state.kind + "\"");
		if (!type.resolve(state.result, state.tag)) throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
		else {
			state.result = type.construct(state.result, state.tag);
			if (state.anchor !== null) state.anchorMap[state.anchor] = state.result;
		}
	}
	if (state.listener !== null) state.listener("close", state);
	return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
	var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
	state.version = null;
	state.checkLineBreaks = state.legacy;
	state.tagMap = Object.create(null);
	state.anchorMap = Object.create(null);
	while ((ch = state.input.charCodeAt(state.position)) !== 0) {
		skipSeparationSpace(state, true, -1);
		ch = state.input.charCodeAt(state.position);
		if (state.lineIndent > 0 || ch !== 37) break;
		hasDirectives = true;
		ch = state.input.charCodeAt(++state.position);
		_position = state.position;
		while (ch !== 0 && !is_WS_OR_EOL(ch)) ch = state.input.charCodeAt(++state.position);
		directiveName = state.input.slice(_position, state.position);
		directiveArgs = [];
		if (directiveName.length < 1) throwError(state, "directive name must not be less than one character in length");
		while (ch !== 0) {
			while (is_WHITE_SPACE(ch)) ch = state.input.charCodeAt(++state.position);
			if (ch === 35) {
				do
					ch = state.input.charCodeAt(++state.position);
				while (ch !== 0 && !is_EOL(ch));
				break;
			}
			if (is_EOL(ch)) break;
			_position = state.position;
			while (ch !== 0 && !is_WS_OR_EOL(ch)) ch = state.input.charCodeAt(++state.position);
			directiveArgs.push(state.input.slice(_position, state.position));
		}
		if (ch !== 0) readLineBreak(state);
		if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) directiveHandlers[directiveName](state, directiveName, directiveArgs);
		else throwWarning(state, "unknown document directive \"" + directiveName + "\"");
	}
	skipSeparationSpace(state, true, -1);
	if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
		state.position += 3;
		skipSeparationSpace(state, true, -1);
	} else if (hasDirectives) throwError(state, "directives end mark is expected");
	composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
	skipSeparationSpace(state, true, -1);
	if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) throwWarning(state, "non-ASCII line breaks are interpreted as content");
	state.documents.push(state.result);
	if (state.position === state.lineStart && testDocumentSeparator(state)) {
		if (state.input.charCodeAt(state.position) === 46) {
			state.position += 3;
			skipSeparationSpace(state, true, -1);
		}
		return;
	}
	if (state.position < state.length - 1) throwError(state, "end of the stream or a document separator is expected");
	else return;
}
function loadDocuments(input, options) {
	input = String(input);
	options = options || {};
	if (input.length !== 0) {
		if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) input += "\n";
		if (input.charCodeAt(0) === 65279) input = input.slice(1);
	}
	var state = new State$1(input, options);
	var nullpos = input.indexOf("\0");
	if (nullpos !== -1) {
		state.position = nullpos;
		throwError(state, "null byte is not allowed in input");
	}
	state.input += "\0";
	while (state.input.charCodeAt(state.position) === 32) {
		state.lineIndent += 1;
		state.position += 1;
	}
	while (state.position < state.length - 1) readDocument(state);
	return state.documents;
}
function loadAll$1(input, iterator, options) {
	if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
		options = iterator;
		iterator = null;
	}
	var documents = loadDocuments(input, options);
	if (typeof iterator !== "function") return documents;
	for (var index = 0, length = documents.length; index < length; index += 1) iterator(documents[index]);
}
function load$1(input, options) {
	var documents = loadDocuments(input, options);
	if (documents.length === 0) return;
	else if (documents.length === 1) return documents[0];
	throw new exception("expected a single document in the stream, but found more");
}
function compileStyleMap(schema, map) {
	var result, keys, index, length, tag, style, type;
	if (map === null) return {};
	result = {};
	keys = Object.keys(map);
	for (index = 0, length = keys.length; index < length; index += 1) {
		tag = keys[index];
		style = String(map[tag]);
		if (tag.slice(0, 2) === "!!") tag = "tag:yaml.org,2002:" + tag.slice(2);
		type = schema.compiledTypeMap["fallback"][tag];
		if (type && _hasOwnProperty.call(type.styleAliases, style)) style = type.styleAliases[style];
		result[tag] = style;
	}
	return result;
}
function encodeHex(character) {
	var string = character.toString(16).toUpperCase(), handle, length;
	if (character <= 255) {
		handle = "x";
		length = 2;
	} else if (character <= 65535) {
		handle = "u";
		length = 4;
	} else if (character <= 4294967295) {
		handle = "U";
		length = 8;
	} else throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
	return "\\" + handle + common.repeat("0", length - string.length) + string;
}
function State(options) {
	this.schema = options["schema"] || _default;
	this.indent = Math.max(1, options["indent"] || 2);
	this.noArrayIndent = options["noArrayIndent"] || false;
	this.skipInvalid = options["skipInvalid"] || false;
	this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
	this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
	this.sortKeys = options["sortKeys"] || false;
	this.lineWidth = options["lineWidth"] || 80;
	this.noRefs = options["noRefs"] || false;
	this.noCompatMode = options["noCompatMode"] || false;
	this.condenseFlow = options["condenseFlow"] || false;
	this.quotingType = options["quotingType"] === "\"" ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
	this.forceQuotes = options["forceQuotes"] || false;
	this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
	this.implicitTypes = this.schema.compiledImplicit;
	this.explicitTypes = this.schema.compiledExplicit;
	this.tag = null;
	this.result = "";
	this.duplicates = [];
	this.usedDuplicates = null;
}
function indentString(string, spaces) {
	var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
	while (position < length) {
		next = string.indexOf("\n", position);
		if (next === -1) {
			line = string.slice(position);
			position = length;
		} else {
			line = string.slice(position, next + 1);
			position = next + 1;
		}
		if (line.length && line !== "\n") result += ind;
		result += line;
	}
	return result;
}
function generateNextLine(state, level) {
	return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str) {
	var index, length, type;
	for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
		type = state.implicitTypes[index];
		if (type.resolve(str)) return true;
	}
	return false;
}
function isWhitespace(c) {
	return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
	return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
	return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
	var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
	var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
	return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
}
function isPlainSafeFirst(c) {
	return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
	return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
	var first = string.charCodeAt(pos), second;
	if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
		second = string.charCodeAt(pos + 1);
		if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
	}
	return first;
}
function needIndentIndicator(string) {
	return /^\n* /.test(string);
}
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
	var i;
	var char = 0;
	var prevChar = null;
	var hasLineBreak = false;
	var hasFoldableLine = false;
	var shouldTrackWidth = lineWidth !== -1;
	var previousLineBreak = -1;
	var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
	if (singleLineOnly || forceQuotes) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
		char = codePointAt(string, i);
		if (!isPrintable(char)) return STYLE_DOUBLE;
		plain = plain && isPlainSafe(char, prevChar, inblock);
		prevChar = char;
	}
	else {
		for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
			char = codePointAt(string, i);
			if (char === CHAR_LINE_FEED) {
				hasLineBreak = true;
				if (shouldTrackWidth) {
					hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
					previousLineBreak = i;
				}
			} else if (!isPrintable(char)) return STYLE_DOUBLE;
			plain = plain && isPlainSafe(char, prevChar, inblock);
			prevChar = char;
		}
		hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
	}
	if (!hasLineBreak && !hasFoldableLine) {
		if (plain && !forceQuotes && !testAmbiguousType(string)) return STYLE_PLAIN;
		return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
	}
	if (indentPerLevel > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
	if (!forceQuotes) return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
	return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
	state.dump = function() {
		if (string.length === 0) return state.quotingType === QUOTING_TYPE_DOUBLE ? "\"\"" : "''";
		if (!state.noCompatMode) {
			if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) return state.quotingType === QUOTING_TYPE_DOUBLE ? "\"" + string + "\"" : "'" + string + "'";
		}
		var indent = state.indent * Math.max(1, level);
		var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
		var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
		function testAmbiguity(string) {
			return testImplicitResolving(state, string);
		}
		switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
			case STYLE_PLAIN: return string;
			case STYLE_SINGLE: return "'" + string.replace(/'/g, "''") + "'";
			case STYLE_LITERAL: return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
			case STYLE_FOLDED: return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
			case STYLE_DOUBLE: return "\"" + escapeString(string) + "\"";
			default: throw new exception("impossible error: invalid scalar style");
		}
	}();
}
function blockHeader(string, indentPerLevel) {
	var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
	var clip = string[string.length - 1] === "\n";
	return indentIndicator + (clip && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip ? "" : "-") + "\n";
}
function dropEndingNewline(string) {
	return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
	var lineRe = /(\n+)([^\n]*)/g;
	var result = function() {
		var nextLF = string.indexOf("\n");
		nextLF = nextLF !== -1 ? nextLF : string.length;
		lineRe.lastIndex = nextLF;
		return foldLine(string.slice(0, nextLF), width);
	}();
	var prevMoreIndented = string[0] === "\n" || string[0] === " ";
	var moreIndented;
	var match;
	while (match = lineRe.exec(string)) {
		var prefix = match[1], line = match[2];
		moreIndented = line[0] === " ";
		result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
		prevMoreIndented = moreIndented;
	}
	return result;
}
function foldLine(line, width) {
	if (line === "" || line[0] === " ") return line;
	var breakRe = / [^ ]/g;
	var match;
	var start = 0, end, curr = 0, next = 0;
	var result = "";
	while (match = breakRe.exec(line)) {
		next = match.index;
		if (next - start > width) {
			end = curr > start ? curr : next;
			result += "\n" + line.slice(start, end);
			start = end + 1;
		}
		curr = next;
	}
	result += "\n";
	if (line.length - start > width && curr > start) result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
	else result += line.slice(start);
	return result.slice(1);
}
function escapeString(string) {
	var result = "";
	var char = 0;
	var escapeSeq;
	for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
		char = codePointAt(string, i);
		escapeSeq = ESCAPE_SEQUENCES[char];
		if (!escapeSeq && isPrintable(char)) {
			result += string[i];
			if (char >= 65536) result += string[i + 1];
		} else result += escapeSeq || encodeHex(char);
	}
	return result;
}
function writeFlowSequence(state, level, object) {
	var _result = "", _tag = state.tag, index, length, value;
	for (index = 0, length = object.length; index < length; index += 1) {
		value = object[index];
		if (state.replacer) value = state.replacer.call(object, String(index), value);
		if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
			if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
			_result += state.dump;
		}
	}
	state.tag = _tag;
	state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
	var _result = "", _tag = state.tag, index, length, value;
	for (index = 0, length = object.length; index < length; index += 1) {
		value = object[index];
		if (state.replacer) value = state.replacer.call(object, String(index), value);
		if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
			if (!compact || _result !== "") _result += generateNextLine(state, level);
			if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) _result += "-";
			else _result += "- ";
			_result += state.dump;
		}
	}
	state.tag = _tag;
	state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
	var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
	for (index = 0, length = objectKeyList.length; index < length; index += 1) {
		pairBuffer = "";
		if (_result !== "") pairBuffer += ", ";
		if (state.condenseFlow) pairBuffer += "\"";
		objectKey = objectKeyList[index];
		objectValue = object[objectKey];
		if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
		if (!writeNode(state, level, objectKey, false, false)) continue;
		if (state.dump.length > 1024) pairBuffer += "? ";
		pairBuffer += state.dump + (state.condenseFlow ? "\"" : "") + ":" + (state.condenseFlow ? "" : " ");
		if (!writeNode(state, level, objectValue, false, false)) continue;
		pairBuffer += state.dump;
		_result += pairBuffer;
	}
	state.tag = _tag;
	state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
	var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
	if (state.sortKeys === true) objectKeyList.sort();
	else if (typeof state.sortKeys === "function") objectKeyList.sort(state.sortKeys);
	else if (state.sortKeys) throw new exception("sortKeys must be a boolean or a function");
	for (index = 0, length = objectKeyList.length; index < length; index += 1) {
		pairBuffer = "";
		if (!compact || _result !== "") pairBuffer += generateNextLine(state, level);
		objectKey = objectKeyList[index];
		objectValue = object[objectKey];
		if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
		if (!writeNode(state, level + 1, objectKey, true, true, true)) continue;
		explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
		if (explicitPair) if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += "?";
		else pairBuffer += "? ";
		pairBuffer += state.dump;
		if (explicitPair) pairBuffer += generateNextLine(state, level);
		if (!writeNode(state, level + 1, objectValue, true, explicitPair)) continue;
		if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += ":";
		else pairBuffer += ": ";
		pairBuffer += state.dump;
		_result += pairBuffer;
	}
	state.tag = _tag;
	state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
	var _result, typeList = explicit ? state.explicitTypes : state.implicitTypes, index, length, type, style;
	for (index = 0, length = typeList.length; index < length; index += 1) {
		type = typeList[index];
		if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
			if (explicit) if (type.multi && type.representName) state.tag = type.representName(object);
			else state.tag = type.tag;
			else state.tag = "?";
			if (type.represent) {
				style = state.styleMap[type.tag] || type.defaultStyle;
				if (_toString.call(type.represent) === "[object Function]") _result = type.represent(object, style);
				else if (_hasOwnProperty.call(type.represent, style)) _result = type.represent[style](object, style);
				else throw new exception("!<" + type.tag + "> tag resolver accepts not \"" + style + "\" style");
				state.dump = _result;
			}
			return true;
		}
	}
	return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
	state.tag = null;
	state.dump = object;
	if (!detectType(state, object, false)) detectType(state, object, true);
	var type = _toString.call(state.dump);
	var inblock = block;
	var tagStr;
	if (block) block = state.flowLevel < 0 || state.flowLevel > level;
	var objectOrArray = type === "[object Object]" || type === "[object Array]", duplicateIndex, duplicate;
	if (objectOrArray) {
		duplicateIndex = state.duplicates.indexOf(object);
		duplicate = duplicateIndex !== -1;
	}
	if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) compact = false;
	if (duplicate && state.usedDuplicates[duplicateIndex]) state.dump = "*ref_" + duplicateIndex;
	else {
		if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) state.usedDuplicates[duplicateIndex] = true;
		if (type === "[object Object]") if (block && Object.keys(state.dump).length !== 0) {
			writeBlockMapping(state, level, state.dump, compact);
			if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
		} else {
			writeFlowMapping(state, level, state.dump);
			if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
		}
		else if (type === "[object Array]") if (block && state.dump.length !== 0) {
			if (state.noArrayIndent && !isblockseq && level > 0) writeBlockSequence(state, level - 1, state.dump, compact);
			else writeBlockSequence(state, level, state.dump, compact);
			if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
		} else {
			writeFlowSequence(state, level, state.dump);
			if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
		}
		else if (type === "[object String]") {
			if (state.tag !== "?") writeScalar(state, state.dump, level, iskey, inblock);
		} else if (type === "[object Undefined]") return false;
		else {
			if (state.skipInvalid) return false;
			throw new exception("unacceptable kind of an object to dump " + type);
		}
		if (state.tag !== null && state.tag !== "?") {
			tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
			if (state.tag[0] === "!") tagStr = "!" + tagStr;
			else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") tagStr = "!!" + tagStr.slice(18);
			else tagStr = "!<" + tagStr + ">";
			state.dump = tagStr + " " + state.dump;
		}
	}
	return true;
}
function getDuplicateReferences(object, state) {
	var objects = [], duplicatesIndexes = [], index, length;
	inspectNode(object, objects, duplicatesIndexes);
	for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) state.duplicates.push(objects[duplicatesIndexes[index]]);
	state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
	var objectKeyList, index, length;
	if (object !== null && typeof object === "object") {
		index = objects.indexOf(object);
		if (index !== -1) {
			if (duplicatesIndexes.indexOf(index) === -1) duplicatesIndexes.push(index);
		} else {
			objects.push(object);
			if (Array.isArray(object)) for (index = 0, length = object.length; index < length; index += 1) inspectNode(object[index], objects, duplicatesIndexes);
			else {
				objectKeyList = Object.keys(object);
				for (index = 0, length = objectKeyList.length; index < length; index += 1) inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
			}
		}
	}
}
function dump$1(input, options) {
	options = options || {};
	var state = new State(options);
	if (!state.noRefs) getDuplicateReferences(input, state);
	var value = input;
	if (state.replacer) value = state.replacer.call({ "": value }, "", value);
	if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
	return "";
}
function renamed(from, to) {
	return function() {
		throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
	};
}
var common, exception, snippet, TYPE_CONSTRUCTOR_OPTIONS, YAML_NODE_KINDS, type, schema, str, seq, map, failsafe, _null, bool, int, YAML_FLOAT_PATTERN, SCIENTIFIC_WITHOUT_DOT, float, json, core, YAML_DATE_REGEXP, YAML_TIMESTAMP_REGEXP, timestamp, merge, BASE64_MAP, binary, _hasOwnProperty$3, _toString$2, omap, _toString$1, pairs, _hasOwnProperty$2, set, _default, _hasOwnProperty$1, CONTEXT_FLOW_IN, CONTEXT_FLOW_OUT, CONTEXT_BLOCK_IN, CONTEXT_BLOCK_OUT, CHOMPING_CLIP, CHOMPING_STRIP, CHOMPING_KEEP, PATTERN_NON_PRINTABLE, PATTERN_NON_ASCII_LINE_BREAKS, PATTERN_FLOW_INDICATORS, PATTERN_TAG_HANDLE, PATTERN_TAG_URI, simpleEscapeCheck, simpleEscapeMap, i, directiveHandlers, loader, _toString, _hasOwnProperty, CHAR_BOM, CHAR_TAB, CHAR_LINE_FEED, CHAR_CARRIAGE_RETURN, CHAR_SPACE, CHAR_EXCLAMATION, CHAR_DOUBLE_QUOTE, CHAR_SHARP, CHAR_PERCENT, CHAR_AMPERSAND, CHAR_SINGLE_QUOTE, CHAR_ASTERISK, CHAR_COMMA, CHAR_MINUS, CHAR_COLON, CHAR_EQUALS, CHAR_GREATER_THAN, CHAR_QUESTION, CHAR_COMMERCIAL_AT, CHAR_LEFT_SQUARE_BRACKET, CHAR_RIGHT_SQUARE_BRACKET, CHAR_GRAVE_ACCENT, CHAR_LEFT_CURLY_BRACKET, CHAR_VERTICAL_LINE, CHAR_RIGHT_CURLY_BRACKET, ESCAPE_SEQUENCES, DEPRECATED_BOOLEANS_SYNTAX, DEPRECATED_BASE60_SYNTAX, QUOTING_TYPE_SINGLE, QUOTING_TYPE_DOUBLE, STYLE_PLAIN, STYLE_SINGLE, STYLE_LITERAL, STYLE_FOLDED, STYLE_DOUBLE, dumper, Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump, jsYaml;
var init_js_yaml = __esmMin((() => {
	common = {
		isNothing,
		isObject,
		toArray,
		repeat,
		isNegativeZero,
		extend
	};
	YAMLException$1.prototype = Object.create(Error.prototype);
	YAMLException$1.prototype.constructor = YAMLException$1;
	YAMLException$1.prototype.toString = function toString(compact) {
		return this.name + ": " + formatError(this, compact);
	};
	exception = YAMLException$1;
	snippet = makeSnippet;
	TYPE_CONSTRUCTOR_OPTIONS = [
		"kind",
		"multi",
		"resolve",
		"construct",
		"instanceOf",
		"predicate",
		"represent",
		"representName",
		"defaultStyle",
		"styleAliases"
	];
	YAML_NODE_KINDS = [
		"scalar",
		"sequence",
		"mapping"
	];
	type = Type$1;
	Schema$1.prototype.extend = function extend(definition) {
		var implicit = [];
		var explicit = [];
		if (definition instanceof type) explicit.push(definition);
		else if (Array.isArray(definition)) explicit = explicit.concat(definition);
		else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
			if (definition.implicit) implicit = implicit.concat(definition.implicit);
			if (definition.explicit) explicit = explicit.concat(definition.explicit);
		} else throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
		implicit.forEach(function(type$1) {
			if (!(type$1 instanceof type)) throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
			if (type$1.loadKind && type$1.loadKind !== "scalar") throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
			if (type$1.multi) throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
		});
		explicit.forEach(function(type$1) {
			if (!(type$1 instanceof type)) throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
		});
		var result = Object.create(Schema$1.prototype);
		result.implicit = (this.implicit || []).concat(implicit);
		result.explicit = (this.explicit || []).concat(explicit);
		result.compiledImplicit = compileList(result, "implicit");
		result.compiledExplicit = compileList(result, "explicit");
		result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
		return result;
	};
	schema = Schema$1;
	str = new type("tag:yaml.org,2002:str", {
		kind: "scalar",
		construct: function(data) {
			return data !== null ? data : "";
		}
	});
	seq = new type("tag:yaml.org,2002:seq", {
		kind: "sequence",
		construct: function(data) {
			return data !== null ? data : [];
		}
	});
	map = new type("tag:yaml.org,2002:map", {
		kind: "mapping",
		construct: function(data) {
			return data !== null ? data : {};
		}
	});
	failsafe = new schema({ explicit: [
		str,
		seq,
		map
	] });
	_null = new type("tag:yaml.org,2002:null", {
		kind: "scalar",
		resolve: resolveYamlNull,
		construct: constructYamlNull,
		predicate: isNull,
		represent: {
			canonical: function() {
				return "~";
			},
			lowercase: function() {
				return "null";
			},
			uppercase: function() {
				return "NULL";
			},
			camelcase: function() {
				return "Null";
			},
			empty: function() {
				return "";
			}
		},
		defaultStyle: "lowercase"
	});
	bool = new type("tag:yaml.org,2002:bool", {
		kind: "scalar",
		resolve: resolveYamlBoolean,
		construct: constructYamlBoolean,
		predicate: isBoolean,
		represent: {
			lowercase: function(object) {
				return object ? "true" : "false";
			},
			uppercase: function(object) {
				return object ? "TRUE" : "FALSE";
			},
			camelcase: function(object) {
				return object ? "True" : "False";
			}
		},
		defaultStyle: "lowercase"
	});
	int = new type("tag:yaml.org,2002:int", {
		kind: "scalar",
		resolve: resolveYamlInteger,
		construct: constructYamlInteger,
		predicate: isInteger,
		represent: {
			binary: function(obj) {
				return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
			},
			octal: function(obj) {
				return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
			},
			decimal: function(obj) {
				return obj.toString(10);
			},
			hexadecimal: function(obj) {
				return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
			}
		},
		defaultStyle: "decimal",
		styleAliases: {
			binary: [2, "bin"],
			octal: [8, "oct"],
			decimal: [10, "dec"],
			hexadecimal: [16, "hex"]
		}
	});
	YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
	float = new type("tag:yaml.org,2002:float", {
		kind: "scalar",
		resolve: resolveYamlFloat,
		construct: constructYamlFloat,
		predicate: isFloat,
		represent: representYamlFloat,
		defaultStyle: "lowercase"
	});
	json = failsafe.extend({ implicit: [
		_null,
		bool,
		int,
		float
	] });
	core = json;
	YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
	YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
	timestamp = new type("tag:yaml.org,2002:timestamp", {
		kind: "scalar",
		resolve: resolveYamlTimestamp,
		construct: constructYamlTimestamp,
		instanceOf: Date,
		represent: representYamlTimestamp
	});
	merge = new type("tag:yaml.org,2002:merge", {
		kind: "scalar",
		resolve: resolveYamlMerge
	});
	BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
	binary = new type("tag:yaml.org,2002:binary", {
		kind: "scalar",
		resolve: resolveYamlBinary,
		construct: constructYamlBinary,
		predicate: isBinary,
		represent: representYamlBinary
	});
	_hasOwnProperty$3 = Object.prototype.hasOwnProperty;
	_toString$2 = Object.prototype.toString;
	omap = new type("tag:yaml.org,2002:omap", {
		kind: "sequence",
		resolve: resolveYamlOmap,
		construct: constructYamlOmap
	});
	_toString$1 = Object.prototype.toString;
	pairs = new type("tag:yaml.org,2002:pairs", {
		kind: "sequence",
		resolve: resolveYamlPairs,
		construct: constructYamlPairs
	});
	_hasOwnProperty$2 = Object.prototype.hasOwnProperty;
	set = new type("tag:yaml.org,2002:set", {
		kind: "mapping",
		resolve: resolveYamlSet,
		construct: constructYamlSet
	});
	_default = core.extend({
		implicit: [timestamp, merge],
		explicit: [
			binary,
			omap,
			pairs,
			set
		]
	});
	_hasOwnProperty$1 = Object.prototype.hasOwnProperty;
	CONTEXT_FLOW_IN = 1;
	CONTEXT_FLOW_OUT = 2;
	CONTEXT_BLOCK_IN = 3;
	CONTEXT_BLOCK_OUT = 4;
	CHOMPING_CLIP = 1;
	CHOMPING_STRIP = 2;
	CHOMPING_KEEP = 3;
	PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
	PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
	PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
	PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
	PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
	simpleEscapeCheck = new Array(256);
	simpleEscapeMap = new Array(256);
	for (i = 0; i < 256; i++) {
		simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
		simpleEscapeMap[i] = simpleEscapeSequence(i);
	}
	directiveHandlers = {
		YAML: function handleYamlDirective(state, name, args) {
			var match, major, minor;
			if (state.version !== null) throwError(state, "duplication of %YAML directive");
			if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
			match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
			if (match === null) throwError(state, "ill-formed argument of the YAML directive");
			major = parseInt(match[1], 10);
			minor = parseInt(match[2], 10);
			if (major !== 1) throwError(state, "unacceptable YAML version of the document");
			state.version = args[0];
			state.checkLineBreaks = minor < 2;
			if (minor !== 1 && minor !== 2) throwWarning(state, "unsupported YAML version of the document");
		},
		TAG: function handleTagDirective(state, name, args) {
			var handle, prefix;
			if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
			handle = args[0];
			prefix = args[1];
			if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
			if (_hasOwnProperty$1.call(state.tagMap, handle)) throwError(state, "there is a previously declared suffix for \"" + handle + "\" tag handle");
			if (!PATTERN_TAG_URI.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
			try {
				prefix = decodeURIComponent(prefix);
			} catch (err) {
				throwError(state, "tag prefix is malformed: " + prefix);
			}
			state.tagMap[handle] = prefix;
		}
	};
	loader = {
		loadAll: loadAll$1,
		load: load$1
	};
	_toString = Object.prototype.toString;
	_hasOwnProperty = Object.prototype.hasOwnProperty;
	CHAR_BOM = 65279;
	CHAR_TAB = 9;
	CHAR_LINE_FEED = 10;
	CHAR_CARRIAGE_RETURN = 13;
	CHAR_SPACE = 32;
	CHAR_EXCLAMATION = 33;
	CHAR_DOUBLE_QUOTE = 34;
	CHAR_SHARP = 35;
	CHAR_PERCENT = 37;
	CHAR_AMPERSAND = 38;
	CHAR_SINGLE_QUOTE = 39;
	CHAR_ASTERISK = 42;
	CHAR_COMMA = 44;
	CHAR_MINUS = 45;
	CHAR_COLON = 58;
	CHAR_EQUALS = 61;
	CHAR_GREATER_THAN = 62;
	CHAR_QUESTION = 63;
	CHAR_COMMERCIAL_AT = 64;
	CHAR_LEFT_SQUARE_BRACKET = 91;
	CHAR_RIGHT_SQUARE_BRACKET = 93;
	CHAR_GRAVE_ACCENT = 96;
	CHAR_LEFT_CURLY_BRACKET = 123;
	CHAR_VERTICAL_LINE = 124;
	CHAR_RIGHT_CURLY_BRACKET = 125;
	ESCAPE_SEQUENCES = {};
	ESCAPE_SEQUENCES[0] = "\\0";
	ESCAPE_SEQUENCES[7] = "\\a";
	ESCAPE_SEQUENCES[8] = "\\b";
	ESCAPE_SEQUENCES[9] = "\\t";
	ESCAPE_SEQUENCES[10] = "\\n";
	ESCAPE_SEQUENCES[11] = "\\v";
	ESCAPE_SEQUENCES[12] = "\\f";
	ESCAPE_SEQUENCES[13] = "\\r";
	ESCAPE_SEQUENCES[27] = "\\e";
	ESCAPE_SEQUENCES[34] = "\\\"";
	ESCAPE_SEQUENCES[92] = "\\\\";
	ESCAPE_SEQUENCES[133] = "\\N";
	ESCAPE_SEQUENCES[160] = "\\_";
	ESCAPE_SEQUENCES[8232] = "\\L";
	ESCAPE_SEQUENCES[8233] = "\\P";
	DEPRECATED_BOOLEANS_SYNTAX = [
		"y",
		"Y",
		"yes",
		"Yes",
		"YES",
		"on",
		"On",
		"ON",
		"n",
		"N",
		"no",
		"No",
		"NO",
		"off",
		"Off",
		"OFF"
	];
	DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
	QUOTING_TYPE_SINGLE = 1, QUOTING_TYPE_DOUBLE = 2;
	STYLE_PLAIN = 1, STYLE_SINGLE = 2, STYLE_LITERAL = 3, STYLE_FOLDED = 4, STYLE_DOUBLE = 5;
	dumper = { dump: dump$1 };
	Type = type;
	Schema = schema;
	FAILSAFE_SCHEMA = failsafe;
	JSON_SCHEMA = json;
	CORE_SCHEMA = core;
	DEFAULT_SCHEMA = _default;
	load = loader.load;
	loadAll = loader.loadAll;
	dump = dumper.dump;
	YAMLException = exception;
	types = {
		binary,
		float,
		map,
		null: _null,
		pairs,
		set,
		timestamp,
		bool,
		int,
		merge,
		omap,
		seq,
		str
	};
	safeLoad = renamed("safeLoad", "load");
	safeLoadAll = renamed("safeLoadAll", "loadAll");
	safeDump = renamed("safeDump", "dump");
	jsYaml = {
		Type,
		Schema,
		FAILSAFE_SCHEMA,
		JSON_SCHEMA,
		CORE_SCHEMA,
		DEFAULT_SCHEMA,
		load,
		loadAll,
		dump,
		YAMLException,
		types,
		safeLoad,
		safeLoadAll,
		safeDump
	};
}));
//#endregion
//#region src/config.js
var config_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_CONFIG: () => DEFAULT_CONFIG,
	checkConfigVersion: () => checkConfigVersion,
	configPath: () => configPath,
	expandEnvVars: () => expandEnvVars,
	getConfigValue: () => getConfigValue,
	getMissingConfigFields: () => getMissingConfigFields,
	loadConfig: () => loadConfig,
	readRawConfig: () => readRawConfig,
	saveConfig: () => saveConfig,
	saveConfigValue: () => saveConfigValue,
	validateConfigStructure: () => validateConfigStructure
});
function configPath() {
	return path.join(getFreddieHome(), "config.yaml");
}
function loadConfig() {
	const p = configPath();
	if (!fs.existsSync(p)) return clone(DEFAULT_CONFIG);
	const raw = jsYaml.load(fs.readFileSync(p, "utf8")) || {};
	return migrate(deepMerge(clone(DEFAULT_CONFIG), raw));
}
function saveConfig(cfg) {
	fs.mkdirSync(path.dirname(configPath()), { recursive: true });
	fs.writeFileSync(configPath(), jsYaml.dump(cfg, { lineWidth: 100 }), "utf8");
}
function saveConfigValue(dotpath, value) {
	const cfg = loadConfig();
	setDot(cfg, dotpath, value);
	saveConfig(cfg);
	return cfg;
}
function getConfigValue(dotpath, fallback = void 0) {
	return getDot(loadConfig(), dotpath, fallback);
}
function setDot(obj, dotpath, value) {
	const keys = dotpath.split(".");
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
		cur = cur[keys[i]];
	}
	cur[keys[keys.length - 1]] = value;
}
function getDot(obj, dotpath, fallback) {
	return dotpath.split(".").reduce((c, k) => c && k in c ? c[k] : void 0, obj) ?? fallback;
}
function deepMerge(target, src) {
	if (!src || typeof src !== "object") return target;
	for (const k of Object.keys(src)) if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) deepMerge(target[k], src[k]);
	else target[k] = src[k];
	return target;
}
function migrate(cfg) {
	const cur = cfg._config_version || 0;
	const target = DEFAULT_CONFIG._config_version;
	let work = cfg;
	for (let v = cur + 1; v <= target; v++) if (MIGRATIONS[v]) work = MIGRATIONS[v](work);
	work._config_version = target;
	return work;
}
function clone(o) {
	return JSON.parse(JSON.stringify(o));
}
function validateConfigStructure(cfg) {
	const issues = [];
	if (!cfg || typeof cfg !== "object") return [{
		path: "",
		message: "config must be an object"
	}];
	for (const [k, v] of Object.entries(DEFAULT_CONFIG)) if (!(k in cfg)) issues.push({
		path: k,
		severity: "info",
		message: "missing key (will use default)"
	});
	else if (typeof v === "object" && !Array.isArray(v) && (typeof cfg[k] !== "object" || Array.isArray(cfg[k]))) issues.push({
		path: k,
		severity: "warn",
		message: "expected object, got " + (Array.isArray(cfg[k]) ? "array" : typeof cfg[k])
	});
	if (cfg.agent && typeof cfg.agent.max_iterations !== "undefined" && (typeof cfg.agent.max_iterations !== "number" || cfg.agent.max_iterations < 1)) issues.push({
		path: "agent.max_iterations",
		severity: "error",
		message: "must be a positive integer"
	});
	if (cfg.toolsets && cfg.toolsets.enabled && !Array.isArray(cfg.toolsets.enabled)) issues.push({
		path: "toolsets.enabled",
		severity: "error",
		message: "must be an array"
	});
	return issues;
}
function expandEnvVars(value) {
	if (typeof value === "string") return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => process.env[name] || "");
	if (Array.isArray(value)) return value.map(expandEnvVars);
	if (value && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = expandEnvVars(v);
		return out;
	}
	return value;
}
function readRawConfig() {
	const p = configPath();
	return fs.existsSync(p) ? jsYaml.load(fs.readFileSync(p, "utf8")) || {} : {};
}
function checkConfigVersion() {
	const raw = readRawConfig();
	return {
		current: raw._config_version || 0,
		target: DEFAULT_CONFIG._config_version,
		needsMigration: (raw._config_version || 0) < DEFAULT_CONFIG._config_version
	};
}
function getMissingConfigFields(cfg = loadConfig()) {
	const missing = [];
	if (!cfg.agent?.provider) missing.push("agent.provider");
	return missing;
}
var DEFAULT_CONFIG, MIGRATIONS;
var init_config = __esmMin((() => {
	init_js_yaml();
	init_home();
	DEFAULT_CONFIG = {
		_config_version: 3,
		display: {
			skin: "default",
			tool_progress_command: false,
			background_process_notifications: "all"
		},
		agent: {
			provider: "anthropic",
			model: "",
			max_iterations: 90,
			fallback_model: null,
			save_trajectories: false,
			model_preference: [],
			model_queues: {},
			discovered_models: {}
		},
		memory: { provider: null },
		skills: { config: {} },
		terminal: { cwd: null },
		gateway: {
			timeout: 60,
			platforms: {}
		},
		plugins: { enabled: [] },
		toolsets: {
			enabled: ["core"],
			disabled: []
		}
	};
	MIGRATIONS = {
		1: (cfg) => cfg,
		2: (cfg) => {
			if (!cfg.agent) cfg.agent = {};
			if (!Array.isArray(cfg.agent.model_preference)) cfg.agent.model_preference = [];
			return cfg;
		},
		3: (cfg) => {
			if (!cfg.agent) cfg.agent = {};
			if (!cfg.agent.model_queues || typeof cfg.agent.model_queues !== "object") cfg.agent.model_queues = {};
			if (!cfg.agent.discovered_models || typeof cfg.agent.discovered_models !== "object") cfg.agent.discovered_models = {};
			return cfg;
		}
	};
}));
//#endregion
//#region src/agent/model-matrix.js
init_config();
var MATRIX_FILE = path.resolve(new URL(".", "" + import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..", "..", ".gm", "model-availability.json");
//#endregion
//#region src/agent/acptoapi-bridge.js
var log$1 = logger("acptoapi");
function getAcptoapiUrl() {
	return process.env.FREDDIE_LLM_URL || "http://127.0.0.1:4800/v1";
}
function getAcptoapiModel() {
	return process.env.FREDDIE_LLM_MODEL || "claude/haiku";
}
async function callLLM({ messages, tools = [], model } = {}) {
	const base = getAcptoapiUrl();
	const useModel = model || getAcptoapiModel();
	const hasTools = Array.isArray(tools) && tools.length > 0;
	const adaptedMessages = messages.map(adaptMessage);
	if (hasTools) {
		const cwd = process.cwd();
		const sysIdx = adaptedMessages.findIndex((m) => m.role === "system");
		const cwdNote = `\nWorking directory: ${cwd}\nUse your built-in tools (Bash, Read, Write) to explore files in this directory when needed.`;
		if (sysIdx >= 0) adaptedMessages[sysIdx] = {
			...adaptedMessages[sysIdx],
			content: (adaptedMessages[sysIdx].content || "") + cwdNote
		};
		else adaptedMessages.unshift({
			role: "system",
			content: cwdNote.trim()
		});
	}
	const body = {
		model: useModel,
		messages: adaptedMessages,
		stream: false,
		max_tokens: 4096
	};
	if (hasTools) body.tools = tools.map(adaptTool);
	const headers = {
		"content-type": "application/json",
		authorization: "Bearer none"
	};
	const cwd = process.cwd();
	if (Array.isArray(tools) && tools.length) headers["x-cwd"] = cwd;
	const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
		method: "POST",
		headers,
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`acptoapi ${res.status}: ${text.slice(0, 400)}`);
	}
	const json = await res.json();
	log$1.info("completed", {
		model: useModel,
		usage: json.usage
	});
	return adaptResponse(json);
}
function adaptMessage(m) {
	if (m.role === "tool") return {
		role: "tool",
		tool_call_id: m.tool_call_id,
		content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
	};
	if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) return {
		role: "assistant",
		content: m.content || "",
		tool_calls: m.tool_calls.map((tc) => ({
			id: tc.id || tc.tool_call_id,
			type: "function",
			function: {
				name: tc.name || tc.function?.name,
				arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {})
			}
		}))
	};
	return {
		role: m.role,
		content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
	};
}
function adaptTool(t) {
	return {
		type: "function",
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters || t.input_schema || {
				type: "object",
				properties: {}
			}
		}
	};
}
function adaptResponse(r) {
	const choice = r.choices?.[0]?.message || {};
	return {
		content: typeof choice.content === "string" ? choice.content : "",
		tool_calls: Array.isArray(choice.tool_calls) ? choice.tool_calls.map((tc) => ({
			id: tc.id,
			name: tc.function?.name,
			arguments: tryParseJson(tc.function?.arguments)
		})) : [],
		raw: r
	};
}
function tryParseJson(s) {
	try {
		return typeof s === "string" ? JSON.parse(s) : s || {};
	} catch {
		return {};
	}
}
async function isReachable(timeoutMs = 2e3) {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(getAcptoapiUrl().replace(/\/$/, "") + "/models", {
				headers: { authorization: "Bearer none" },
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			if (!res.ok) return false;
			const json = await res.json();
			return Array.isArray(json.data) && json.data.length > 0;
		} finally {
			clearTimeout(timeoutId);
		}
	} catch {
		return false;
	}
}
//#endregion
//#region src/agent/llm_resolver.js
var sdk = sdkNs && (sdkNs.default || sdkNs) || {};
var PROVIDER_KEYS = sdk.PROVIDER_KEYS || {};
var DEFAULTS = sdk.PROVIDER_DEFAULTS || {};
var toTools = (s) => s?.length ? s.map((t) => ({
	type: "function",
	function: {
		name: t.name,
		description: t.description || "",
		parameters: t.parameters || {
			type: "object",
			properties: {}
		}
	}
})) : void 0;
var toMsgs = (ms) => ms.map((m) => {
	if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) return {
		role: "assistant",
		content: m.content || "",
		tool_calls: m.tool_calls.map((tc) => ({
			id: tc.id,
			type: "function",
			function: {
				name: tc.name || tc.function?.name,
				arguments: typeof (tc.arguments || tc.function?.arguments) === "string" ? tc.arguments || tc.function?.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {})
			}
		}))
	};
	if (m.role === "tool") return {
		role: "tool",
		tool_call_id: m.tool_call_id,
		content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
	};
	return m;
});
var tryJson = (s) => {
	try {
		return typeof s === "string" ? JSON.parse(s) : s || {};
	} catch {
		return {};
	}
};
function adapt(result) {
	const c = result?.choices?.[0]?.message || {};
	return {
		content: typeof c.content === "string" ? c.content : "",
		tool_calls: Array.isArray(c.tool_calls) ? c.tool_calls.map((tc) => ({
			id: tc.id,
			name: tc.function?.name,
			arguments: tryJson(tc.function?.arguments)
		})) : [],
		raw: result
	};
}
var NAMED_CHAIN_NAMES = new Set([
	"fast",
	"cheap",
	"smart",
	"reasoning",
	"free",
	"local",
	"auto"
]);
async function buildModel({ provider, model, inputModel }) {
	if (provider) return `${provider}/${model || DEFAULTS[provider] || ""}`.replace(/\/$/, "");
	if (model) return model;
	if (inputModel) {
		if (typeof inputModel === "string" && !inputModel.includes("/") && !inputModel.includes(",") && NAMED_CHAIN_NAMES.has(inputModel)) return inputModel;
		return inputModel;
	}
	const pref = getConfigValue("agent.model_preference", []);
	if (Array.isArray(pref) && pref.length) {
		const links = pref.map((p) => `${p.provider}/${p.model || DEFAULTS[p.provider] || ""}`.replace(/\/$/, "")).filter((s) => s.includes("/"));
		if (links.length) return links.join(", ");
	}
	const auto = typeof sdk.buildAutoChain === "function" ? sdk.buildAutoChain(void 0) : [];
	const keyed = Array.isArray(auto) ? auto.filter((l) => {
		const env = PROVIDER_KEYS[l.model.split("/")[0]];
		return env && process.env[env];
	}) : [];
	if (keyed.length) return keyed.map((l) => l.model).join(", ");
	if (await isReachable()) return process.env.FREDDIE_LLM_MODEL || "auto";
	return null;
}
function resolveCallLLM({ provider, model } = {}) {
	return async (input) => {
		const m = await buildModel({
			provider,
			model,
			inputModel: input.model
		});
		if (!m) {
			const status = typeof sdk.getStatus === "function" ? sdk.getStatus().map((s) => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(", ") : "";
			throw new Error("no LLM backend reachable: set a provider API key or start acptoapi (http://127.0.0.1:4800/v1)" + (status ? " | sampler: " + status : ""));
		}
		try {
			if (typeof m === "string" && !m.includes(",") && !/^queue\//.test(m) && await isReachable()) return await callLLM({
				...input,
				model: m
			});
			const opts = {
				model: m,
				messages: toMsgs(input.messages),
				tools: toTools(input.tools),
				onFallback: input.onFallback,
				output: "openai"
			};
			if (/^queue\//.test(m)) opts.queuesMap = getConfigValue("agent.model_queues", {}) || {};
			if (m.includes(",") || /^queue\//.test(m)) opts.matrixSource = process.env.FREDDIE_MATRIX_URL || MATRIX_FILE;
			if (typeof sdk.chat !== "function") return await callLLM({
				...input,
				model: m
			});
			return adapt(await sdk.chat(opts));
		} catch (e) {
			if (/queue not found or empty/i.test(e.message)) throw e;
			if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) throw new Error(`chain exhausted: ${(e.attempted || []).map((a) => `${a.model}:${a.reason || "ok"}`).join("; ") || e.message}`);
			throw e;
		}
	};
}
function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ["core"], disabledToolsets = [], events } = {}) {
	const baseLLM = callLLM || resolveCallLLM({
		provider,
		model
	});
	const llm = events ? async (input) => {
		const t0 = Date.now();
		try {
			const out = await baseLLM(input);
			events.push({
				type: "llm_call",
				ok: true,
				durationMs: Date.now() - t0,
				provider: out?.raw?.provider || provider,
				model: out?.raw?.model || model,
				content_length: (out?.content || "").length,
				tool_calls_count: (out?.tool_calls || []).length,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			return out;
		} catch (e) {
			events.push({
				type: "llm_call",
				ok: false,
				durationMs: Date.now() - t0,
				provider,
				model,
				error: String(e?.message || e),
				stack: e?.stack || null,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			throw e;
		}
	} : baseLLM;
	return createMachine$1({
		id: "freddie-agent",
		initial: "idle",
		output: ({ context }) => ({
			messages: context.messages,
			result: context.lastResult,
			error: context.error,
			iterations: context.iterations
		}),
		context: ({ input }) => ({
			messages: input?.messages ? [...input.messages] : [],
			iterations: 0,
			maxIterations,
			interrupt: false,
			lastResult: null,
			error: null,
			provider,
			model,
			enabledToolsets,
			disabledToolsets
		}),
		states: {
			idle: { on: {
				SUBMIT: {
					target: "prompting",
					actions: assign$1({
						messages: ({ context, event }) => [...context.messages, {
							role: "user",
							content: event.prompt
						}],
						iterations: 0,
						interrupt: false,
						error: null
					})
				},
				INTERRUPT: { actions: assign$1({ interrupt: true }) }
			} },
			prompting: { invoke: {
				src: fromPromise$1(async ({ input }) => {
					const schemas = await getEnabledToolSchemas(input.enabledToolsets, input.disabledToolsets);
					return llm({
						messages: input.messages,
						tools: schemas,
						model: input.model,
						provider: input.provider
					});
				}),
				input: ({ context }) => ({
					messages: context.messages,
					model: context.model,
					provider: context.provider,
					enabledToolsets: context.enabledToolsets,
					disabledToolsets: context.disabledToolsets
				}),
				onDone: [{
					guard: ({ event }) => Array.isArray(event.output?.tool_calls) && event.output.tool_calls.length > 0,
					target: "tool_calls",
					actions: assign$1({ messages: ({ context, event }) => [...context.messages, {
						role: "assistant",
						content: event.output.content || "",
						tool_calls: event.output.tool_calls
					}] })
				}, {
					target: "done",
					actions: assign$1({
						messages: ({ context, event }) => [...context.messages, {
							role: "assistant",
							content: event.output.content || ""
						}],
						lastResult: ({ event }) => event.output.content || ""
					})
				}],
				onError: {
					target: "done",
					actions: assign$1({ error: ({ event }) => String(event.error?.message || event.error) })
				}
			} },
			tool_calls: { always: [
				{
					guard: ({ context }) => context.iterations >= context.maxIterations,
					target: "done",
					actions: assign$1({ error: "iteration budget exhausted" })
				},
				{
					guard: ({ context }) => context.interrupt,
					target: "done",
					actions: assign$1({ error: "interrupted" })
				},
				{ target: "executing_tools" }
			] },
			executing_tools: { invoke: {
				src: fromPromise$1(async ({ input }) => {
					const h = await bootHost();
					const calls = input.messages[input.messages.length - 1].tool_calls || [];
					const results = [];
					const extras = [];
					for (const call of calls) {
						const tname = call.name || call.function?.name;
						const targs = call.arguments || call.function?.arguments || {};
						const tcid = call.id || call.tool_call_id;
						const pushExtras = (r) => {
							if (r?.systemMessage) extras.push({
								role: "system",
								content: "[hook] " + r.systemMessage
							});
							if (r?.additionalContext) extras.push({
								role: "system",
								content: r.additionalContext
							});
						};
						const pre = await h.hooks.invoke("preToolCall", {
							name: tname,
							args: targs
						});
						pushExtras(pre);
						if (pre?.behavior === "block") {
							results.push({
								tool_call_id: tcid,
								content: JSON.stringify({
									error: "tool call denied by plugsdk hook",
									tool: tname,
									reason: pre.reason || "denied"
								})
							});
							continue;
						}
						const res = await h.pi.dispatchTool(tname, pre && pre.args || targs);
						pushExtras(await h.hooks.invoke("postToolCall", {
							name: tname,
							args: targs,
							result: res
						}));
						results.push({
							tool_call_id: tcid,
							content: res
						});
					}
					return {
						results,
						extras
					};
				}),
				input: ({ context }) => ({ messages: context.messages }),
				onDone: {
					target: "prompting",
					actions: assign$1({
						messages: ({ context, event }) => [
							...context.messages,
							...event.output.results.map((r) => ({
								role: "tool",
								tool_call_id: r.tool_call_id,
								content: r.content
							})),
							...event.output.extras
						],
						iterations: ({ context }) => context.iterations + 1
					})
				},
				onError: {
					target: "done",
					actions: assign$1({ error: ({ event }) => String(event.error?.message || event.error) })
				}
			} },
			done: {
				type: "final",
				output: ({ context }) => ({
					messages: context.messages,
					result: context.lastResult,
					error: context.error,
					iterations: context.iterations
				})
			}
		}
	});
}
async function writeTrajectory(out, { prompt, provider, model, skill, cwd, events = [], errorStack = null, witnessPath = null }) {
	try {
		const { getConfigValue } = await Promise.resolve().then(() => (init_config(), config_exports));
		if (!getConfigValue("agent.save_trajectories", false) && !witnessPath) return;
		const { getFreddieHome } = await Promise.resolve().then(() => (init_home(), home_exports));
		const fs = await import("node:fs");
		const path = await import("node:path");
		const dir = path.join(getFreddieHome(), "trajectories");
		fs.mkdirSync(dir, { recursive: true });
		const states = [];
		const toolCalls = [];
		const toolResults = [];
		let compressorInvocations = 0;
		for (const m of out.messages || []) {
			if (m.role === "assistant" && m.tool_calls?.length) {
				states.push("EXECUTE");
				for (const tc of m.tool_calls) toolCalls.push({
					name: tc.name || tc.function?.name,
					arguments: tc.arguments || tc.function?.arguments || {},
					id: tc.id
				});
			} else if (m.role === "user") states.push("PLAN");
			else if (m.role === "assistant") states.push("COMPLETE");
			else if (m.role === "tool") {
				states.push("VERIFY");
				toolResults.push({
					tool_call_id: m.tool_call_id,
					content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
				});
			}
			if (m.role === "system" && typeof m.content === "string" && /\[trajectory\.compressed\]/.test(m.content)) compressorInvocations += 1;
		}
		const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
		const slug = (prompt || "turn").slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
		const llmCalls = events.filter((e) => e.type === "llm_call");
		const streamChunks = events.filter((e) => e.type === "llm_chunk");
		const payload = {
			schema_version: 2,
			ts,
			prompt,
			provider,
			model,
			skill,
			cwd,
			iterations: out.iterations,
			result: out.result,
			error: out.error,
			error_stack: errorStack,
			state_transitions: states,
			tool_calls: toolCalls,
			tool_results: toolResults,
			llm_calls: llmCalls,
			llm_chunks_count: streamChunks.length,
			compressor_invocations: compressorInvocations,
			events,
			messages: out.messages
		};
		const file = path.join(dir, `${ts}-${slug}.json`);
		fs.writeFileSync(file, JSON.stringify(payload, null, 2));
		if (witnessPath) {
			const jsonl = [
				JSON.stringify({
					event: "session_start",
					ts,
					prompt,
					provider,
					model,
					skill,
					cwd
				}),
				...(out.messages || []).map((m, i) => JSON.stringify({
					event: "message",
					index: i,
					role: m.role,
					content: m.content,
					tool_calls: m.tool_calls || null,
					tool_call_id: m.tool_call_id || null
				})),
				...llmCalls.map((e) => JSON.stringify({
					event: "llm_call",
					...e
				})),
				JSON.stringify({
					event: "session_end",
					iterations: out.iterations,
					error: out.error,
					error_stack: errorStack,
					compressor_invocations: compressorInvocations
				})
			].join("\n");
			fs.mkdirSync(path.dirname(witnessPath), { recursive: true });
			fs.writeFileSync(witnessPath, jsonl);
		}
	} catch (_) {}
}
function mergeHookExtras(messages, r, tag) {
	if (!r) return messages;
	const e = [];
	if (r.systemMessage) e.push({
		role: "system",
		content: "[hook:" + tag + "] " + r.systemMessage
	});
	if (r.additionalContext) e.push({
		role: "system",
		content: r.additionalContext
	});
	return e.length ? [...messages, ...e] : messages;
}
async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 3e4, cwd, skill, witnessPath } = {}) {
	const events = [];
	const h = await bootHost();
	await h.hooks.invoke("onSessionStart", {
		prompt,
		model,
		provider,
		skill,
		cwd
	});
	let initMessages = [...messages];
	const sysParts = [];
	if (cwd) sysParts.push(`Working directory: ${cwd}. Always pass cwd="${cwd}" to bash tool calls. When reading or writing files use paths relative to this directory or absolute paths under it.`);
	if (skill) {
		const sd = h.pi.skills.get(skill);
		if (sd?.content) sysParts.push("Skill context:\n" + sd.content);
	}
	if (sysParts.length) initMessages.unshift({
		role: "user",
		content: sysParts.join("\n\n")
	});
	const inbound = await h.hooks.invoke("onMessageInbound", { content: prompt });
	if (inbound?.behavior === "block") {
		await h.hooks.invoke("onSessionEnd", { reason: "prompt_blocked" });
		return {
			messages: initMessages,
			result: null,
			error: "prompt blocked by plugsdk hook: " + (inbound.reason || "denied"),
			iterations: 0
		};
	}
	initMessages = mergeHookExtras(initMessages, inbound, "onMessageInbound");
	const actor = createActor$1(createAgentMachine({
		model,
		provider,
		callLLM,
		enabledToolsets,
		disabledToolsets,
		maxIterations,
		events
	}), { input: { messages: initMessages } });
	actor.start();
	actor.send({
		type: "SUBMIT",
		prompt
	});
	return await new Promise((resolve, reject) => {
		const t = setTimeout(() => {
			try {
				actor.stop();
			} catch {}
			reject(/* @__PURE__ */ new Error("agent turn timeout"));
		}, timeoutMs);
		actor.subscribe((snap) => {
			if (snap.status !== "done") return;
			clearTimeout(t);
			(async () => {
				const out = snap.output;
				const outbound = await h.hooks.invoke("onMessageOutbound", { content: out?.result || "" });
				if (outbound?.systemMessage || outbound?.additionalContext) out.messages = mergeHookExtras(out.messages || [], outbound, "onMessageOutbound");
				await h.hooks.invoke("onSessionEnd", {
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				});
				await writeTrajectory(out, {
					prompt,
					provider,
					model,
					skill,
					cwd,
					events,
					errorStack: out?.error ? events.find((e) => e.type === "llm_call" && !e.ok)?.stack || null : null,
					witnessPath
				});
				resolve(out);
			})().catch(reject);
		});
	});
}
//#endregion
//#region src/skills/index.js
init_js_yaml();
init_home();
var FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
function listSkills(extraDirs = []) {
	const dirs = [
		path.join(getFreddieHome(), "skills"),
		path.join(process.cwd(), "skills"),
		...extraDirs
	];
	const out = [];
	for (const d of dirs) if (fs.existsSync(d)) walk(d, out);
	return out.filter(platformOk);
}
function walk(d, out) {
	for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
		const full = path.join(d, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.name === "SKILL.md") out.push(loadSkill(full));
	}
}
function loadSkill(file) {
	const raw = fs.readFileSync(file, "utf8");
	const m = FRONTMATTER.exec(raw);
	if (!m) return {
		file,
		name: path.basename(path.dirname(file)),
		description: "",
		body: raw,
		frontmatter: {}
	};
	const fm = jsYaml.load(m[1]) || {};
	return {
		file,
		name: fm.name || path.basename(path.dirname(file)),
		description: fm.description || "",
		frontmatter: fm,
		body: m[2],
		platforms: fm.platforms
	};
}
function platformOk(skill) {
	const plats = skill.platforms || skill.frontmatter?.platforms;
	if (!Array.isArray(plats) || plats.length === 0) return true;
	const platform = os.platform() === "darwin" ? "macos" : os.platform();
	return plats.includes(platform);
}
function findSkill(name) {
	return listSkills().find((s) => s.name === name) || null;
}
function skillAsUserMessage(name, args = "") {
	const s = findSkill(name);
	if (!s) return null;
	return {
		role: "user",
		content: `[skill:${name}]\n${args ? `Arguments: ${args}\n\n` : ""}${s.body}`
	};
}
//#endregion
//#region src/context/engine.js
var ContextPlugins = {
	file: async ({ cwd = process.cwd() } = {}) => {
		const candidates = [
			".freddie-context",
			"CLAUDE.md",
			"AGENTS.md"
		];
		const blocks = [];
		for (const c of candidates) {
			const p = path.join(cwd, c);
			if (fs.existsSync(p)) blocks.push({
				name: "file:" + c,
				body: fs.readFileSync(p, "utf8")
			});
		}
		return blocks;
	},
	skills: async () => {
		return listSkills().map((s) => ({
			name: "skill:" + s.name,
			body: s.description
		}));
	},
	memory: async ({ provider } = {}) => {
		if (!provider) return [];
		try {
			return ((await provider.prefetch("")).items || []).slice(0, 5).map((it, i) => ({
				name: "memory:" + i,
				body: typeof it === "string" ? it : JSON.stringify(it)
			}));
		} catch {
			return [];
		}
	}
};
async function buildContext({ session = null, message = "", plugins = ["file"], options = {} } = {}) {
	const blocks = [];
	for (const name of plugins) {
		const p = ContextPlugins[name];
		if (!p) continue;
		const got = await p({
			session,
			message,
			...options
		});
		for (const b of got) blocks.push(b);
	}
	return blocks;
}
function blocksToSystemMessage(blocks) {
	if (!blocks.length) return null;
	return {
		role: "system",
		content: blocks.map((b) => `[${b.name}]\n${b.body}`).join("\n\n")
	};
}
//#endregion
//#region src/browser/index.js
init_config();
var FREDDIE_DEFAULT_CONFIG = DEFAULT_CONFIG;
//#endregion
export { ContextPlugins, DEFAULT_CONFIG, FREDDIE_DEFAULT_CONFIG, assign, blocksToSystemMessage, bootHost, buildContext, createActor, createAgentMachine, createMachine, findSkill, fromPromise, host, listSkills, log, logger, resetHostForTests, runTurn, skillAsUserMessage, waitFor };

//# sourceMappingURL=freddie.js.map