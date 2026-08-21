import fs, { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path, { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile, spawn } from "node:child_process";
import os, { homedir } from "node:os";
import crypto$1, { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import readline from "node:readline";
import { assign, assign as assign$1, createActor, createActor as createActor$1, createMachine, createMachine as createMachine$1, fromPromise, fromPromise as fromPromise$1, waitFor } from "xstate";
import * as _sdkNs from "acptoapi";
import { promisify } from "node:util";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region src/browser/dotenv-browser-stub.js
function config() {
	return { parsed: {} };
}
var dotenv_browser_stub_default = { config };
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
			} catch (e) {
				console.error(`[plugsdk] wasm WASI init failed for plugin '${plugin.manifest.name}' (${modulePath}): ${e.message}`);
			}
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
		const root = dataRoot || join(homedir(), ".plugsdk-data");
		const id = plugin.manifest.name.replace(/[^a-zA-Z0-9_-]/g, "-");
		const dir = join(root, id);
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
			} catch (e) {
				console.error(`[plugsdk] failed to spawn MCP server '${serverName}' for plugin '${plugin.manifest.name}': ${e.message}`);
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
			} catch (e) {
				console.error(`[plugsdk] failed to spawn LSP server for '${lang}' in plugin '${plugin.manifest.name}': ${e.message} (loader still surfaces lspServers)`);
			}
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
			const cmd = subst(handler.command, plugin);
			const shell = handler.shell === "powershell" ? "powershell" : true;
			const child = spawn(cmd, {
				shell,
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
	"asset",
	"wsRoute"
];
var HOOK_NAMES = [
	"preToolCall",
	"postToolCall",
	"onToolProgress",
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
	const byName = /* @__PURE__ */ new Map();
	for (const p of plugins) {
		if (byName.has(p.name)) console.error(JSON.stringify({
			ts: Date.now(),
			level: "warn",
			msg: `plugin name collision: '${p.name}' declared by multiple plugin objects, only the last one is registered -- the earlier one's register() never runs`,
			plugin: p.name,
			losing_sourceFile: byName.get(p.name).__sourceFile || null,
			winning_sourceFile: p.__sourceFile || null
		}));
		byName.set(p.name, p);
	}
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
path.dirname(fileURLToPath(import.meta.url));
//#endregion
//#region src/env.js
/**
* Read an environment variable through the registry. Falls back to
* REGISTRY[name].default (if any) when unset. Unregistered names still work
* (pass-through) but log nothing extra — prefer adding an entry to REGISTRY.
*/
function env(name) {
	const entry = REGISTRY[name];
	const raw = process.env[name];
	if (raw !== void 0) return raw;
	return entry && "default" in entry ? entry.default : void 0;
}
var REGISTRY;
var init_env = __esmMin((() => {
	REGISTRY = {
		FREDDIE_HOME: {
			purpose: "override for freddie home directory",
			kind: "path"
		},
		FREDDIE_PROFILE: {
			purpose: "active named profile under ~/.freddie/profiles",
			kind: "string"
		},
		FREDDIE_PROFILES_ROOT: {
			purpose: "override for profiles root directory",
			kind: "path"
		},
		FREDDIE_DEBUG: {
			purpose: "enable debug logging",
			kind: "toggle"
		},
		FREDDIE_DISABLE_CC_HOOKS: {
			purpose: "disable Claude Code hook discovery",
			kind: "toggle"
		},
		FREDDIE_EXTRA_CC_ROOTS: {
			purpose: "extra Claude Code root directories to scan",
			kind: "path"
		},
		FREDDIE_LLM_MODEL: {
			purpose: "default LLM model id for freddie-internal LLM calls",
			kind: "string"
		},
		FREDDIE_LLM_TIMEOUT_MS: {
			purpose: "timeout in ms for freddie-internal LLM calls",
			kind: "number"
		},
		FREDDIE_LLM_URL: {
			purpose: "base URL for freddie-internal LLM endpoint",
			kind: "url"
		},
		FREDDIE_MATRIX_URL: {
			purpose: "base URL override for matrix platform integration",
			kind: "url"
		},
		FREDDIE_TEST_DB: {
			purpose: "override sqlite db path used in tests",
			kind: "path"
		},
		FREDDIE_CHAOS_INJECT: {
			purpose: "dev-only: percent chance (0-100) of a synthetic tool-dispatch error, to verify the agent loop degrades gracefully instead of crashing",
			kind: "number"
		},
		HOME: {
			purpose: "OS home directory (posix)",
			kind: "path"
		},
		USERPROFILE: {
			purpose: "OS home directory (windows)",
			kind: "path"
		},
		SHELL: {
			purpose: "user login shell",
			kind: "path"
		},
		ANTHROPIC_API_KEY: {
			purpose: "Anthropic provider key",
			kind: "secret",
			provider: true
		},
		OPENAI_API_KEY: {
			purpose: "OpenAI provider key",
			kind: "secret",
			provider: true
		},
		OPENAI_BASE_URL: {
			purpose: "OpenAI-compatible base URL override",
			kind: "url"
		},
		OPENROUTER_API_KEY: {
			purpose: "OpenRouter provider key",
			kind: "secret",
			provider: true
		},
		XAI_API_KEY: {
			purpose: "xAI (Grok) provider key",
			kind: "secret",
			provider: true
		},
		NOUS_API_KEY: {
			purpose: "Nous Research provider key",
			kind: "secret",
			provider: true
		},
		ZAI_BASE_URL: {
			purpose: "Z.ai base URL override",
			kind: "url"
		},
		ZAI_ENDPOINT: {
			purpose: "Z.ai endpoint override",
			kind: "url"
		},
		KIMI_BASE_URL: {
			purpose: "Kimi (Moonshot) base URL override",
			kind: "url"
		},
		KIMI_REGION: {
			purpose: "Kimi (Moonshot) region selector",
			kind: "string"
		},
		AZURE_OPENAI_API_VERSION: {
			purpose: "Azure OpenAI API version",
			kind: "string"
		},
		AZURE_OPENAI_DEPLOYMENT: {
			purpose: "Azure OpenAI deployment name",
			kind: "string"
		},
		AZURE_OPENAI_ENDPOINT: {
			purpose: "Azure OpenAI endpoint URL",
			kind: "url"
		},
		AWS_ACCESS_KEY_ID: {
			purpose: "AWS access key id (Bedrock provider)",
			kind: "secret",
			provider: true
		},
		AWS_SECRET_ACCESS_KEY: {
			purpose: "AWS secret access key (Bedrock provider)",
			kind: "secret",
			provider: true
		},
		AWS_SESSION_TOKEN: {
			purpose: "AWS session token (Bedrock provider)",
			kind: "secret"
		},
		AWS_REGION: {
			purpose: "AWS region for Bedrock provider",
			kind: "string"
		},
		GOOGLE_OAUTH_TOKEN: {
			purpose: "Google OAuth token (Gemini/Meet)",
			kind: "secret",
			provider: true
		},
		COPILOT_TOKEN: {
			purpose: "GitHub Copilot provider token",
			kind: "secret",
			provider: true
		},
		ACP_SHARED_SECRET: {
			purpose: "shared secret for ACP bridge auth",
			kind: "secret"
		},
		ACPTOAPI_LIVE_PROBE: {
			purpose: "enable live probe against acptoapi",
			kind: "toggle"
		},
		ACPTOAPI_PROBE_CAP: {
			purpose: "max number of acptoapi probes to run",
			kind: "number"
		},
		DAYTONA_API_KEY: {
			purpose: "Daytona sandbox API key",
			kind: "secret"
		},
		DAYTONA_API_URL: {
			purpose: "Daytona sandbox API URL",
			kind: "url"
		},
		DAYTONA_TARGET: {
			purpose: "Daytona sandbox target region",
			kind: "string"
		},
		MODAL_TOKEN_ID: {
			purpose: "Modal sandbox token id",
			kind: "secret"
		},
		MODAL_TOKEN_SECRET: {
			purpose: "Modal sandbox token secret",
			kind: "secret"
		},
		VERCEL_TOKEN: {
			purpose: "Vercel API token (auth + sandbox)",
			kind: "secret"
		},
		VERCEL_SANDBOX_URL: {
			purpose: "Vercel sandbox base URL",
			kind: "url"
		},
		SINGULARITY_BIN: {
			purpose: "path to singularity/apptainer binary",
			kind: "path"
		},
		BYTEROVER_API_KEY: {
			purpose: "Byterover memory backend key",
			kind: "secret"
		},
		HINDSIGHT_API_KEY: {
			purpose: "Hindsight memory backend key",
			kind: "secret"
		},
		HONCHO_API_KEY: {
			purpose: "Honcho memory backend key",
			kind: "secret"
		},
		MEM0_API_KEY: {
			purpose: "Mem0 memory backend key",
			kind: "secret"
		},
		OPENVIKING_API_KEY: {
			purpose: "OpenViking memory backend key",
			kind: "secret"
		},
		RETAINDB_API_KEY: {
			purpose: "RetainDB memory backend key",
			kind: "secret"
		},
		SUPERMEMORY_API_KEY: {
			purpose: "Supermemory memory backend key",
			kind: "secret"
		},
		ATROPOS_TOKEN: {
			purpose: "Atropos RL training service token",
			kind: "secret"
		},
		ATROPOS_URL: {
			purpose: "Atropos RL training service URL",
			kind: "url"
		},
		ELEVENLABS_API_KEY: {
			purpose: "ElevenLabs TTS API key",
			kind: "secret"
		},
		NEUTTS_URL: {
			purpose: "NeuTTS synth service URL",
			kind: "url"
		},
		REPLICATE_API_TOKEN: {
			purpose: "Replicate image-gen API token",
			kind: "secret"
		},
		SERPAPI_KEY: {
			purpose: "SerpAPI web search key (optional, falls back to DDG)",
			kind: "secret"
		},
		SPOTIFY_ACCESS_TOKEN: {
			purpose: "Spotify access token",
			kind: "secret"
		},
		BLUEBUBBLES_PASSWORD: {
			purpose: "BlueBubbles server password",
			kind: "secret"
		},
		DINGTALK_ACCESS_TOKEN: {
			purpose: "DingTalk bot access token",
			kind: "secret"
		},
		DISCORD_BOT_TOKEN: {
			purpose: "Discord bot token",
			kind: "secret"
		},
		FEISHU_APP_TOKEN: {
			purpose: "Feishu (Lark) app token",
			kind: "secret"
		},
		HASS_TOKEN: {
			purpose: "Home Assistant long-lived access token",
			kind: "secret"
		},
		HASS_URL: {
			purpose: "Home Assistant base URL",
			kind: "url"
		},
		IMAP_HOST: {
			purpose: "IMAP host for email platform",
			kind: "string"
		},
		MATRIX_ACCESS_TOKEN: {
			purpose: "Matrix access token",
			kind: "secret"
		},
		MATRIX_HOMESERVER: {
			purpose: "Matrix homeserver URL",
			kind: "url"
		},
		MATTERMOST_TOKEN: {
			purpose: "Mattermost bot token",
			kind: "secret"
		},
		MATTERMOST_URL: {
			purpose: "Mattermost server URL",
			kind: "url"
		},
		QQBOT_TOKEN: {
			purpose: "QQ bot token",
			kind: "secret"
		},
		SIGNAL_CLI_URL: {
			purpose: "signal-cli REST API URL",
			kind: "url"
		},
		SIGNAL_NUMBER: {
			purpose: "Signal registered phone number",
			kind: "string"
		},
		SLACK_BOT_TOKEN: {
			purpose: "Slack bot token",
			kind: "secret"
		},
		SLACK_SIGNING_SECRET: {
			purpose: "Slack request signing secret",
			kind: "secret"
		},
		SMTP_HOST: {
			purpose: "SMTP host for email platform",
			kind: "string"
		},
		SMTP_PASS: {
			purpose: "SMTP password",
			kind: "secret"
		},
		SMTP_PORT: {
			purpose: "SMTP port",
			kind: "number"
		},
		SMTP_USER: {
			purpose: "SMTP username",
			kind: "string"
		},
		TELEGRAM_BOT_TOKEN: {
			purpose: "Telegram bot token",
			kind: "secret"
		},
		TWILIO_FROM: {
			purpose: "Twilio sending phone number",
			kind: "string"
		},
		TWILIO_SID: {
			purpose: "Twilio account SID",
			kind: "secret"
		},
		TWILIO_TOKEN: {
			purpose: "Twilio auth token",
			kind: "secret"
		},
		WECOM_CALLBACK_TOKEN: {
			purpose: "WeCom callback verification token",
			kind: "secret"
		},
		WECOM_ENCODING_AES_KEY: {
			purpose: "WeCom callback AES encoding key",
			kind: "secret"
		},
		WECOM_WEBHOOK_KEY: {
			purpose: "WeCom webhook key",
			kind: "secret"
		},
		WEIXIN_TOKEN: {
			purpose: "WeChat (Weixin) verification token",
			kind: "secret"
		},
		WHATSAPP_API_TOKEN: {
			purpose: "WhatsApp Cloud API token",
			kind: "secret"
		},
		WHATSAPP_PHONE_NUMBER_ID: {
			purpose: "WhatsApp Cloud API phone number id",
			kind: "string"
		},
		WHATSAPP_VERIFY_TOKEN: {
			purpose: "WhatsApp webhook verify token",
			kind: "secret"
		},
		WHATSAPP_APP_SECRET: {
			purpose: "WhatsApp Cloud API app secret (enables webhook signature verification)",
			kind: "secret"
		},
		WHATSAPP_WEBHOOK_PORT: {
			purpose: "WhatsApp webhook listener port override",
			kind: "number"
		},
		WHATSAPP_WEBHOOK_PATH: {
			purpose: "WhatsApp webhook listener path override",
			kind: "string"
		}
	};
}));
//#endregion
//#region node_modules/js-yaml/dist/js-yaml.mjs
/*! js-yaml 5.3.0 https://github.com/nodeca/js-yaml @license MIT */
/**
* Create a normalized scalar tag definition.
*
* @category Tags
*/
function defineScalarTag(tagName, options) {
	return {
		tagName,
		nodeKind: "scalar",
		implicit: options.implicit ?? false,
		matchByTagPrefix: options.matchByTagPrefix ?? false,
		implicitFirstChars: options.implicitFirstChars ?? null,
		resolve: options.resolve,
		identify: options.identify,
		represent: options.represent ?? ((data) => String(data)),
		representTagName: options.representTagName ?? (() => tagName)
	};
}
/**
* Create a normalized sequence tag definition.
*
* @category Tags
*/
function defineSequenceTag(tagName, options) {
	const carrierIsResult = options.finalize === void 0;
	return {
		tagName,
		nodeKind: "sequence",
		implicit: false,
		matchByTagPrefix: options.matchByTagPrefix ?? false,
		create: options.create,
		addItem: options.addItem,
		finalize: options.finalize ?? ((carrier) => carrier),
		carrierIsResult,
		identify: options.identify,
		represent: options.represent ?? ((data) => data),
		representTagName: options.representTagName ?? (() => tagName)
	};
}
/**
* Create a normalized mapping tag definition.
*
* @category Tags
*/
function defineMappingTag(tagName, options) {
	const carrierIsResult = options.finalize === void 0;
	return {
		tagName,
		nodeKind: "mapping",
		implicit: false,
		matchByTagPrefix: options.matchByTagPrefix ?? false,
		create: options.create,
		addPair: options.addPair,
		has: options.has,
		keys: options.keys,
		get: options.get,
		finalize: options.finalize ?? ((carrier) => carrier),
		carrierIsResult,
		identify: options.identify,
		represent: options.represent ?? ((data) => data),
		representTagName: options.representTagName ?? (() => tagName)
	};
}
function parseYamlInteger$2(source) {
	let value = source;
	let sign = 1;
	if (value[0] === "-" || value[0] === "+") {
		if (value[0] === "-") sign = -1;
		value = value.slice(1);
	}
	if (value.startsWith("0b")) return sign * parseInt(value.slice(2), 2);
	if (value.startsWith("0o")) return sign * parseInt(value.slice(2), 8);
	if (value.startsWith("0x")) return sign * parseInt(value.slice(2), 16);
	return sign * parseInt(value, 10);
}
function resolveYamlInteger$2(source, isExplicit) {
	if (isExplicit) {
		if (!YAML_INTEGER_EXPLICIT_PATTERN$1.test(source)) return NOT_RESOLVED;
	} else if (!YAML_INTEGER_IMPLICIT_PATTERN$1.test(source)) return NOT_RESOLVED;
	const result = parseYamlInteger$2(source);
	return Number.isFinite(result) ? result : NOT_RESOLVED;
}
function parseYamlInteger$1(source) {
	let value = source;
	let sign = 1;
	if (value[0] === "-" || value[0] === "+") {
		if (value[0] === "-") sign = -1;
		value = value.slice(1);
	}
	if (value.startsWith("0b")) return sign * parseInt(value.slice(2), 2);
	if (value.startsWith("0o")) return sign * parseInt(value.slice(2), 8);
	if (value.startsWith("0x")) return sign * parseInt(value.slice(2), 16);
	return sign * parseInt(value, 10);
}
function resolveYamlInteger$1(source, isExplicit) {
	if (isExplicit) {
		if (!YAML_INTEGER_EXPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
	} else if (!YAML_INTEGER_IMPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
	const result = parseYamlInteger$1(source);
	return Number.isFinite(result) ? result : NOT_RESOLVED;
}
function parseYamlInteger(source) {
	let value = source.replace(/_/g, "");
	let sign = 1;
	if (value[0] === "-" || value[0] === "+") {
		if (value[0] === "-") sign = -1;
		value = value.slice(1);
	}
	if (value.startsWith("0b")) return sign * parseInt(value.slice(2), 2);
	if (value.startsWith("0x")) return sign * parseInt(value.slice(2), 16);
	if (value.includes(":")) {
		let result = 0;
		for (const part of value.split(":")) result = result * 60 + Number(part);
		return sign * result;
	}
	if (value !== "0" && value[0] === "0") return sign * parseInt(value, 8);
	return sign * parseInt(value, 10);
}
function resolveYamlInteger(source) {
	if (!YAML_INTEGER_PATTERN.test(source)) return NOT_RESOLVED;
	const result = parseYamlInteger(source);
	return Number.isFinite(result) ? result : NOT_RESOLVED;
}
function resolveYamlFloat$2(source) {
	if (!YAML_FLOAT_PATTERN$1.test(source)) return NOT_RESOLVED;
	let value = source.toLowerCase();
	const sign = value[0] === "-" ? -1 : 1;
	if ("+-".includes(value[0])) value = value.slice(1);
	if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
	if (value === ".nan") return NaN;
	const result = sign * parseFloat(value);
	if (Number.isFinite(result) || YAML_FLOAT_SPECIAL_PATTERN$1.test(source)) return result;
	return NOT_RESOLVED;
}
function representYamlFloat$2(object) {
	if (isNaN(object)) return ".nan";
	if (object === Number.POSITIVE_INFINITY) return ".inf";
	if (object === Number.NEGATIVE_INFINITY) return "-.inf";
	if (Object.is(object, -0)) return "-0.0";
	const result = object.toString(10);
	return /^[-+]?[0-9]+e/.test(result) ? result.replace("e", ".e") : result;
}
function resolveYamlFloat$1(source, isExplicit) {
	if (isExplicit) {
		if (!YAML_FLOAT_EXPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
		let value = source.toLowerCase();
		const sign = value[0] === "-" ? -1 : 1;
		if ("+-".includes(value[0])) value = value.slice(1);
		if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
		if (value === ".nan") return NaN;
		const result = sign * parseFloat(value);
		return Number.isFinite(result) ? result : NOT_RESOLVED;
	}
	if (!YAML_FLOAT_IMPLICIT_PATTERN.test(source)) return NOT_RESOLVED;
	const result = Number(source);
	if (Number.isFinite(result)) return result;
	return NOT_RESOLVED;
}
function representYamlFloat$1(object) {
	if (isNaN(object)) return ".nan";
	if (object === Number.POSITIVE_INFINITY) return ".inf";
	if (object === Number.NEGATIVE_INFINITY) return "-.inf";
	if (Object.is(object, -0)) return "-0.0";
	const result = object.toString(10);
	return /^[-+]?[0-9]+e/.test(result) ? result.replace("e", ".e") : result;
}
function resolveYamlFloat(source) {
	if (!YAML_FLOAT_PATTERN.test(source)) return NOT_RESOLVED;
	let value = source.toLowerCase().replace(/_/g, "");
	const sign = value[0] === "-" ? -1 : 1;
	if ("+-".includes(value[0])) value = value.slice(1);
	if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
	if (value === ".nan") return NaN;
	let result = 0;
	if (value.includes(":")) {
		for (const part of value.split(":")) result = result * 60 + Number(part);
		result *= sign;
	} else result = sign * parseFloat(value);
	if (Number.isFinite(result) || YAML_FLOAT_SPECIAL_PATTERN.test(source)) return result;
	return NOT_RESOLVED;
}
function representYamlFloat(object) {
	if (isNaN(object)) return ".nan";
	if (object === Number.POSITIVE_INFINITY) return ".inf";
	if (object === Number.NEGATIVE_INFINITY) return "-.inf";
	if (Object.is(object, -0)) return "-0.0";
	const result = object.toString(10);
	return /^[-+]?[0-9]+e/.test(result) ? result.replace("e", ".e") : result;
}
function resolveYamlBinary(source) {
	const input = source.replace(/\s/g, "");
	if (input.length % 4 !== 0 || !BASE64_PATTERN.test(input)) return NOT_RESOLVED;
	const binary = atob(input);
	const result = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
	return result;
}
function representYamlBinary(object) {
	let binary = "";
	for (let index = 0; index < object.length; index++) binary += String.fromCharCode(object[index]);
	return btoa(binary);
}
function makeUtcDate(year, month, day, hour = 0, minute = 0, second = 0, fraction = 0) {
	const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
	date.setUTCFullYear(year, month, day);
	return date;
}
function resolveYamlTimestamp(source) {
	let match = YAML_DATE_REGEXP.exec(source);
	if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(source);
	if (match === null) return NOT_RESOLVED;
	const year = +match[1];
	const month = +match[2] - 1;
	const day = +match[3];
	if (!match[4]) {
		const date = makeUtcDate(year, month, day);
		if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return NOT_RESOLVED;
		return date;
	}
	const hour = +match[4];
	const minute = +match[5];
	const second = +match[6];
	let fraction = 0;
	if (hour > 23 || minute > 59 || second > 59) return NOT_RESOLVED;
	if (match[7]) {
		let value = match[7].slice(0, 3);
		while (value.length < 3) value += "0";
		fraction = +value;
	}
	const date = makeUtcDate(year, month, day, hour, minute, second, fraction);
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return NOT_RESOLVED;
	if (match[9]) {
		const offsetHour = +match[10];
		const offsetMinute = +(match[11] || 0);
		if (offsetHour > 23 || offsetMinute > 59) return NOT_RESOLVED;
		const offset = (offsetHour * 60 + offsetMinute) * 6e4;
		date.setTime(date.getTime() - (match[9] === "-" ? -offset : offset));
	}
	return date;
}
function isPlainObject(data) {
	if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
	const prototype = Object.getPrototypeOf(data);
	return prototype === null || prototype === Object.prototype;
}
function pick(object, keys) {
	const result = {};
	for (const key of keys) if (object[key] !== void 0) result[key] = object[key];
	return result;
}
function createTagDefinitionMap() {
	return {
		scalar: Object.create(null),
		sequence: Object.create(null),
		mapping: Object.create(null)
	};
}
function createTagDefinitionListMap() {
	return {
		scalar: [],
		sequence: [],
		mapping: []
	};
}
function compileTags(tags) {
	const result = [];
	for (const tag of tags) {
		let index = result.length;
		for (let previousIndex = 0; previousIndex < result.length; previousIndex++) {
			const previous = result[previousIndex];
			if (previous.nodeKind === tag.nodeKind && previous.tagName === tag.tagName && previous.matchByTagPrefix === tag.matchByTagPrefix) {
				index = previousIndex;
				break;
			}
		}
		result[index] = tag;
	}
	return result;
}
function normalizeKey(key) {
	if (Array.isArray(key)) {
		const array = Array.prototype.slice.call(key);
		for (let index = 0; index < array.length; index++) {
			if (Array.isArray(array[index])) return null;
			if (typeof array[index] === "object" && Object.prototype.toString.call(array[index]) === "[object Object]") array[index] = "[object Object]";
		}
		return String(array);
	}
	if (typeof key === "object" && Object.prototype.toString.call(key) === "[object Object]") return "[object Object]";
	return String(key);
}
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
	let head = "";
	let tail = "";
	const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
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
	return " ".repeat(Math.max(max - string.length, 0)) + string;
}
function makeSnippet(mark, options) {
	if (!mark.buffer) return null;
	const opts = {
		...DEFAULT_SNIPPET_OPTIONS,
		...options
	};
	const re = /\r?\n|\r|\0/g;
	const lineStarts = [0];
	const lineEnds = [];
	let match;
	let foundLineNo = -1;
	while (match = re.exec(mark.buffer)) {
		lineEnds.push(match.index);
		lineStarts.push(match.index + match[0].length);
		if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
	}
	if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
	let result = "";
	const lineNoLength = Math.min(mark.line + opts.linesAfter, lineEnds.length).toString().length;
	const maxLineLength = opts.maxLength - (opts.indent + lineNoLength + 3);
	for (let i = 1; i <= opts.linesBefore; i++) {
		if (foundLineNo - i < 0) break;
		const line = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
		result = `${" ".repeat(opts.indent)}${padStart((mark.line - i + 1).toString(), lineNoLength)} | ${line.str}\n${result}`;
	}
	const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
	result += `${" ".repeat(opts.indent)}${padStart((mark.line + 1).toString(), lineNoLength)} | ${line.str}\n`;
	result += `${"-".repeat(opts.indent + lineNoLength + 3 + line.pos)}^\n`;
	for (let i = 1; i <= opts.linesAfter; i++) {
		if (foundLineNo + i >= lineEnds.length) break;
		const line = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
		result += `${" ".repeat(opts.indent)}${padStart((mark.line + i + 1).toString(), lineNoLength)} | ${line.str}\n`;
	}
	return result.replace(/\n$/, "");
}
function formatError(exception, compact) {
	let where = "";
	if (!exception.mark) return exception.reason;
	if (exception.mark.name) where += `in "${exception.mark.name}" `;
	where += `(${exception.mark.line + 1}:${exception.mark.column + 1})`;
	if (!compact && exception.mark.snippet) where += `\n\n${exception.mark.snippet}`;
	return `${exception.reason} ${where}`;
}
function simpleEscapeSequence(c) {
	switch (c) {
		case 48: return "\0";
		case 97: return "\x07";
		case 98: return "\b";
		case 116: return "	";
		case 9: return "	";
		case 110: return "\n";
		case 118: return "\v";
		case 102: return "\f";
		case 114: return "\r";
		case 101: return "\x1B";
		case 32: return " ";
		case 34: return "\"";
		case 47: return "/";
		case 92: return "\\";
		case 78: return "";
		case 95: return "\xA0";
		case 76: return "\u2028";
		case 80: return "\u2029";
		default: return "";
	}
}
function charFromCodepoint(c) {
	if (c <= 65535) return String.fromCharCode(c);
	return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
}
function fromHexCode$1(c) {
	if (c >= 48 && c <= 57) return c - 48;
	return (c | 32) - 97 + 10;
}
function escapedHexLen$1(c) {
	if (c === 120) return 2;
	if (c === 117) return 4;
	return 8;
}
function skipFoldedBreaks(input, position, end) {
	let breaks = 0;
	while (position < end) {
		const ch = input.charCodeAt(position);
		if (ch === 10) {
			breaks++;
			position++;
		} else if (ch === 13) {
			breaks++;
			position++;
			if (input.charCodeAt(position) === 10) position++;
		} else if (ch === 32 || ch === 9) position++;
		else break;
	}
	return {
		position,
		breaks
	};
}
function foldedBreaks(count) {
	if (count === 1) return " ";
	return "\n".repeat(count - 1);
}
function getPlainValue(input, start, end) {
	let result = "";
	let position = start;
	let captureStart = start;
	let captureEnd = start;
	while (position < end) {
		const ch = input.charCodeAt(position);
		if (ch === 10 || ch === 13) {
			result += input.slice(captureStart, captureEnd);
			const fold = skipFoldedBreaks(input, position, end);
			result += foldedBreaks(fold.breaks);
			position = captureStart = captureEnd = fold.position;
		} else {
			position++;
			if (ch !== 32 && ch !== 9) captureEnd = position;
		}
	}
	return result + input.slice(captureStart, captureEnd);
}
function getSingleQuotedValue(input, start, end) {
	let result = "";
	let position = start;
	let captureStart = start;
	let captureEnd = start;
	while (position < end) {
		const ch = input.charCodeAt(position);
		if (ch === 39) {
			result += input.slice(captureStart, position) + "'";
			position += 2;
			captureStart = captureEnd = position;
		} else if (ch === 10 || ch === 13) {
			result += input.slice(captureStart, captureEnd);
			const fold = skipFoldedBreaks(input, position, end);
			result += foldedBreaks(fold.breaks);
			position = captureStart = captureEnd = fold.position;
		} else {
			position++;
			if (ch !== 32 && ch !== 9) captureEnd = position;
		}
	}
	return result + input.slice(captureStart, end);
}
function getDoubleQuotedValue(input, start, end) {
	let result = "";
	let position = start;
	let captureStart = start;
	let captureEnd = start;
	while (position < end) {
		const ch = input.charCodeAt(position);
		if (ch === 92) {
			result += input.slice(captureStart, position);
			position++;
			const escaped = input.charCodeAt(position);
			if (escaped === 10 || escaped === 13) position = skipFoldedBreaks(input, position, end).position;
			else if (escaped < 256 && simpleEscapeCheck[escaped]) {
				result += simpleEscapeMap[escaped];
				position++;
			} else {
				let hexLength = escapedHexLen$1(escaped);
				let hexResult = 0;
				for (; hexLength > 0; hexLength--) {
					position++;
					const digit = fromHexCode$1(input.charCodeAt(position));
					hexResult = (hexResult << 4) + digit;
				}
				result += charFromCodepoint(hexResult);
				position++;
			}
			captureStart = captureEnd = position;
		} else if (ch === 10 || ch === 13) {
			result += input.slice(captureStart, captureEnd);
			const fold = skipFoldedBreaks(input, position, end);
			result += foldedBreaks(fold.breaks);
			position = captureStart = captureEnd = fold.position;
		} else {
			position++;
			if (ch !== 32 && ch !== 9) captureEnd = position;
		}
	}
	return result + input.slice(captureStart, end);
}
function getBlockValue(input, start, end, indent, chomping, folded) {
	const textIndent = indent < 0 ? 0 : indent;
	const region = input.slice(start, end).replace(/\r\n?/g, "\n");
	const lines = region === "" ? [] : (region.endsWith("\n") ? region.slice(0, -1) : region).split("\n");
	let result = "";
	let didReadContent = false;
	let emptyLines = 0;
	let atMoreIndented = false;
	for (const line of lines) {
		let column = 0;
		while (column < textIndent && line.charCodeAt(column) === 32) column++;
		if (indent < 0 || column >= line.length) {
			emptyLines++;
			continue;
		}
		const content = line.slice(textIndent);
		const first = content.charCodeAt(0);
		if (folded) if (first === 32 || first === 9) {
			atMoreIndented = true;
			result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
		} else if (atMoreIndented) {
			atMoreIndented = false;
			result += "\n".repeat(emptyLines + 1);
		} else if (emptyLines === 0) {
			if (didReadContent) result += " ";
		} else result += "\n".repeat(emptyLines);
		else result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
		result += content;
		didReadContent = true;
		emptyLines = 0;
	}
	if (chomping === CHOMPING_MODE.KEEP) result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
	else if (chomping !== CHOMPING_MODE.STRIP) {
		if (didReadContent) result += "\n";
	}
	return result;
}
/**
* Decodes the scalar referenced by event offsets in `input`.
*
* @category Events
*/
function getScalarValue(input, scalar) {
	if (scalar.valueStart === NO_RANGE$3) return "";
	const { valueStart, valueEnd } = scalar;
	if (scalar.fast) return input.slice(valueStart, valueEnd);
	switch (scalar.style) {
		case SCALAR_STYLE.SINGLE_QUOTED: return getSingleQuotedValue(input, valueStart, valueEnd);
		case SCALAR_STYLE.DOUBLE_QUOTED: return getDoubleQuotedValue(input, valueStart, valueEnd);
		case SCALAR_STYLE.LITERAL_BLOCK: return getBlockValue(input, valueStart, valueEnd, scalar.indent, scalar.chomping, false);
		case SCALAR_STYLE.FOLDED_BLOCK: return getBlockValue(input, valueStart, valueEnd, scalar.indent, scalar.chomping, true);
		default: return getPlainValue(input, valueStart, valueEnd);
	}
}
function tagPercentEncode(source) {
	return encodeURI(source).replace(/!/g, "%21");
}
function tagNameFull(rawTag, tagHandlers) {
	if (rawTag.startsWith("!<") && rawTag.endsWith(">")) return decodeURIComponent(rawTag.slice(2, -1));
	const handleEnd = rawTag.indexOf("!", 1);
	const handle = handleEnd === -1 ? "!" : rawTag.slice(0, handleEnd + 1);
	const prefix = tagHandlers?.[handle] ?? DEFAULT_TAG_HANDLERS[handle] ?? handle;
	return decodeURIComponent(prefix) + decodeURIComponent(rawTag.slice(handle.length));
}
function tagNameShort(fullTag) {
	let tag = fullTag;
	if (tag.charCodeAt(0) === 33) {
		tag = tag.slice(1);
		return `!${tagPercentEncode(tag)}`;
	}
	if (tag.slice(0, 18) === "tag:yaml.org,2002:") return `!!${tagPercentEncode(tag.slice(18))}`;
	return `!<${tagPercentEncode(tag)}>`;
}
function eventPosition$1(event) {
	if ("tagStart" in event && event.tagStart !== NO_RANGE$2) return event.tagStart;
	if ("anchorStart" in event && event.anchorStart !== NO_RANGE$2) return event.anchorStart;
	if ("valueStart" in event && event.valueStart !== NO_RANGE$2) return event.valueStart;
	if ("start" in event) return event.start;
	return 0;
}
function throwError$1(state, message) {
	YAMLException.throwAt(state.source, state.position, message, state.filename);
}
function finalizeCollection(state, position, tag, carrier) {
	try {
		return tag.finalize(carrier);
	} catch (error) {
		if (error instanceof YAMLException) throw error;
		YAMLException.throwAt(state.source, position, error instanceof Error ? error.message : String(error), state.filename);
	}
}
function constructScalar(state, event) {
	const source = getScalarValue(state.source, event);
	const rawTag = event.tagStart === NO_RANGE$2 ? "" : state.source.slice(event.tagStart, event.tagEnd);
	const strTag = state.schema.defaultScalarTag;
	if (rawTag !== "") {
		if (rawTag === "!") return {
			value: source,
			tag: strTag
		};
		const tagName = tagNameFull(rawTag, state.tagHandlers);
		const scalarTag = state.schema.lookupScalarTag(tagName);
		if (scalarTag) {
			const result = scalarTag.resolve(source, true, tagName);
			if (result === NOT_RESOLVED) throwError$1(state, `cannot resolve a node with !<${tagName}> explicit tag`);
			return {
				value: result,
				tag: scalarTag
			};
		}
		const collectionTagDef = state.schema.lookupMappingTag(tagName) ?? state.schema.lookupSequenceTag(tagName);
		if (collectionTagDef) {
			if (source !== "") throwError$1(state, `cannot resolve a node with !<${tagName}> explicit tag`);
			const carrier = collectionTagDef.create(tagName);
			return {
				value: collectionTagDef.carrierIsResult ? carrier : finalizeCollection(state, state.position, collectionTagDef, carrier),
				tag: collectionTagDef
			};
		}
		throwError$1(state, `unknown scalar tag !<${tagName}>`);
	}
	if (event.style === SCALAR_STYLE.PLAIN) return state.schema.resolveImplicitScalarTag(source);
	return {
		value: strTag.resolve(source, false, strTag.tagName),
		tag: strTag
	};
}
function collectionTagName(state, event, defaultTagName) {
	const rawTag = event.tagStart === NO_RANGE$2 ? "" : state.source.slice(event.tagStart, event.tagEnd);
	return rawTag === "" || rawTag === "!" ? defaultTagName : tagNameFull(rawTag, state.tagHandlers);
}
function isMappingTag(tag) {
	return tag.nodeKind === "mapping";
}
function mergeKeys(state, frame, source, sourceTag) {
	for (const sourceKey of sourceTag.keys(source)) {
		if (state.maxTotalMergeKeys !== -1 && ++state.totalMergeKeys > state.maxTotalMergeKeys) throwError$1(state, `merge keys exceeded maxTotalMergeKeys (${state.maxTotalMergeKeys})`);
		if (frame.tag.has(frame.value, sourceKey)) continue;
		const err = frame.tag.addPair(frame.value, sourceKey, sourceTag.get(source, sourceKey));
		if (err) throwError$1(state, err);
		(frame.overridable ??= /* @__PURE__ */ new Set()).add(sourceKey);
	}
}
function mergeSource(state, frame, source, sourceTag) {
	state.position = frame.keyPosition;
	if (isMappingTag(sourceTag)) mergeKeys(state, frame, source, sourceTag);
	else if (sourceTag.nodeKind === "sequence" && Array.isArray(source)) for (const element of source) {
		const elementTag = state.nodeTags.get(element);
		if (!elementTag) throwError$1(state, "cannot merge mappings; the provided source object is unacceptable");
		mergeKeys(state, frame, element, elementTag);
	}
	else throwError$1(state, "cannot merge mappings; the provided source object is unacceptable");
}
function addMappingValue(state, frame, key, value, tag) {
	state.position = frame.keyPosition;
	if (frame.keyIsMerge) {
		mergeSource(state, frame, value, tag);
		return;
	}
	if (!state.json && frame.tag.has(frame.value, key) && !frame.overridable?.has(key)) throwError$1(state, "duplicated mapping key");
	const err = frame.tag.addPair(frame.value, key, value);
	if (err) throwError$1(state, err);
	frame.overridable?.delete(key);
}
function addValue(state, value, tag) {
	const frame = state.frames[state.frames.length - 1];
	if (frame.kind === "document") {
		frame.value = value;
		frame.hasValue = true;
	} else if (frame.kind === "sequence") {
		if (isMappingTag(tag)) state.nodeTags.set(value, tag);
		const err = frame.tag.addItem(frame.value, value, frame.index++);
		if (err) throwError$1(state, err);
	} else if (frame.hasKey) {
		const key = frame.key;
		frame.key = void 0;
		frame.hasKey = false;
		addMappingValue(state, frame, key, value, tag);
	} else {
		frame.key = value;
		frame.keyPosition = state.position;
		frame.hasKey = true;
		frame.keyIsMerge = tag.tagName === MERGE_TAG_NAME;
	}
}
function storeAnchor(state, event, value, tag, isValueFinal) {
	if (event.anchorStart !== NO_RANGE$2) {
		const anchor = {
			value,
			tag,
			isValueFinal
		};
		state.anchors.set(state.source.slice(event.anchorStart, event.anchorEnd), anchor);
		return anchor;
	}
	return null;
}
/**
* Constructs JavaScript documents directly from parser events, without an
* intermediate AST.
*
* @category Events
*/
function constructFromEvents(events, options) {
	const state = {
		...DEFAULT_CONSTRUCTOR_OPTIONS,
		...options,
		events,
		documents: [],
		eventIndex: 0,
		position: 0,
		frames: [],
		anchors: /* @__PURE__ */ new Map(),
		nodeTags: /* @__PURE__ */ new Map(),
		tagHandlers: Object.create(null),
		totalMergeKeys: 0,
		aliasCount: 0
	};
	while (state.eventIndex < state.events.length) {
		const event = state.events[state.eventIndex++];
		state.position = eventPosition$1(event);
		switch (event.type) {
			case EVENT_ID.DOCUMENT:
				state.anchors = /* @__PURE__ */ new Map();
				state.nodeTags = /* @__PURE__ */ new Map();
				state.aliasCount = 0;
				state.tagHandlers = Object.create(null);
				for (const directive of event.directives) if (directive.kind === "tag") state.tagHandlers[directive.handle] = directive.prefix;
				state.frames.push({
					kind: "document",
					position: state.position,
					value: void 0,
					hasValue: false
				});
				break;
			case EVENT_ID.SCALAR: {
				const { value, tag } = constructScalar(state, event);
				storeAnchor(state, event, value, tag, true);
				addValue(state, value, tag);
				break;
			}
			case EVENT_ID.SEQUENCE: {
				const tagName = collectionTagName(state, event, "tag:yaml.org,2002:seq");
				const tag = state.schema.lookupSequenceTag(tagName);
				if (!tag) throwError$1(state, `unknown sequence tag !<${tagName}>`);
				const value = tag.create(tagName);
				const anchor = storeAnchor(state, event, value, tag, tag.carrierIsResult);
				state.frames.push({
					kind: "sequence",
					position: state.position,
					value,
					tag,
					anchor,
					index: 0
				});
				break;
			}
			case EVENT_ID.MAPPING: {
				const tagName = collectionTagName(state, event, "tag:yaml.org,2002:map");
				const tag = state.schema.lookupMappingTag(tagName);
				if (!tag) throwError$1(state, `unknown mapping tag !<${tagName}>`);
				const value = tag.create(tagName);
				const anchor = storeAnchor(state, event, value, tag, tag.carrierIsResult);
				state.frames.push({
					kind: "mapping",
					position: state.position,
					value,
					tag,
					anchor,
					key: void 0,
					keyPosition: state.position,
					hasKey: false,
					keyIsMerge: false,
					overridable: null
				});
				break;
			}
			case EVENT_ID.ALIAS: {
				if (state.maxAliases !== -1 && ++state.aliasCount > state.maxAliases) throwError$1(state, `aliases exceeded maxAliases (${state.maxAliases})`);
				const name = state.source.slice(event.anchorStart, event.anchorEnd);
				const anchor = state.anchors.get(name);
				if (!anchor) throwError$1(state, `unidentified alias "${name}"`);
				if (!anchor.isValueFinal) throwError$1(state, `recursive alias "${name}" is not supported for tag ${anchor.tag.tagName} because it uses finalize()`);
				addValue(state, anchor.value, anchor.tag);
				break;
			}
			case EVENT_ID.POP: {
				const frame = state.frames.pop();
				if (frame.kind === "mapping" && frame.hasKey) {
					state.position = frame.keyPosition;
					throwError$1(state, "incomplete mapping pair in event stream");
				}
				if (frame.kind === "document") state.documents.push(frame.value);
				else {
					const value = frame.tag.carrierIsResult ? frame.value : finalizeCollection(state, frame.position, frame.tag, frame.value);
					if (frame.anchor) {
						frame.anchor.value = value;
						frame.anchor.isValueFinal = true;
					}
					addValue(state, value, frame.tag);
				}
				break;
			}
		}
	}
	return state.documents;
}
function addDocumentEvent(state, explicitStart, explicitEnd) {
	state.events.push({
		type: EVENT_ID.DOCUMENT,
		explicitStart,
		explicitEnd,
		directives: state.directives
	});
}
function addSequenceEvent(state, start, anchorStart, anchorEnd, tagStart, tagEnd, style) {
	state.events.push({
		type: EVENT_ID.SEQUENCE,
		start,
		anchorStart,
		anchorEnd,
		tagStart,
		tagEnd,
		style
	});
}
function addMappingEvent(state, start, anchorStart, anchorEnd, tagStart, tagEnd, style) {
	state.events.push({
		type: EVENT_ID.MAPPING,
		start,
		anchorStart,
		anchorEnd,
		tagStart,
		tagEnd,
		style
	});
}
function insertFlowPairMappingEvent(state, snapshot) {
	state.events.splice(snapshot.eventsLength, 0, {
		type: EVENT_ID.MAPPING,
		start: snapshot.position,
		anchorStart: NO_RANGE$1,
		anchorEnd: NO_RANGE$1,
		tagStart: NO_RANGE$1,
		tagEnd: NO_RANGE$1,
		style: COLLECTION_STYLE.FLOW
	});
}
function addScalarEvent(state, valueStart, valueEnd, anchorStart, anchorEnd, tagStart, tagEnd, style, chomping = CHOMPING_MODE.CLIP, indent = -1, fast = false) {
	state.events.push({
		type: EVENT_ID.SCALAR,
		valueStart,
		valueEnd,
		anchorStart,
		anchorEnd,
		tagStart,
		tagEnd,
		style,
		chomping,
		indent,
		fast
	});
}
function addAliasEvent(state, anchorStart, anchorEnd) {
	state.events.push({
		type: EVENT_ID.ALIAS,
		anchorStart,
		anchorEnd
	});
}
function addPopEvent(state) {
	state.events.push({ type: EVENT_ID.POP });
}
function addEmptyScalarEvent(state) {
	addScalarEvent(state, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, NO_RANGE$1, SCALAR_STYLE.PLAIN);
}
function emptyProperties() {
	return {
		anchorStart: NO_RANGE$1,
		anchorEnd: NO_RANGE$1,
		tagStart: NO_RANGE$1,
		tagEnd: NO_RANGE$1
	};
}
function snapshotState(state) {
	return {
		position: state.position,
		line: state.line,
		lineStart: state.lineStart,
		lineIndent: state.lineIndent,
		firstTabInLine: state.firstTabInLine,
		eventsLength: state.events.length
	};
}
function restoreState(state, snapshot) {
	state.position = snapshot.position;
	state.line = snapshot.line;
	state.lineStart = snapshot.lineStart;
	state.lineIndent = snapshot.lineIndent;
	state.firstTabInLine = snapshot.firstTabInLine;
	state.events.length = snapshot.eventsLength;
}
function throwError(state, message) {
	YAMLException.throwAt(state.input.slice(0, state.length), state.position, message, state.filename);
}
function isEol(c) {
	return c === 10 || c === 13;
}
function isWhiteSpace(c) {
	return c === 9 || c === 32;
}
function isWsOrEol(c) {
	return isWhiteSpace(c) || isEol(c);
}
function isWsOrEolOrEnd(c) {
	return c === 0 || isWsOrEol(c);
}
function isFlowIndicator(c) {
	return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromDecimalCode(c) {
	return c >= 48 && c <= 57 ? c - 48 : -1;
}
function fromHexCode(c) {
	if (c >= 48 && c <= 57) return c - 48;
	const lc = c | 32;
	if (lc >= 97 && lc <= 102) return lc - 97 + 10;
	return -1;
}
function escapedHexLen(c) {
	if (c === 120) return 2;
	if (c === 117) return 4;
	if (c === 85) return 8;
	return 0;
}
function isSimpleEscape(c) {
	return c === 48 || c === 97 || c === 98 || c === 116 || c === 9 || c === 110 || c === 118 || c === 102 || c === 114 || c === 101 || c === 32 || c === 34 || c === 47 || c === 92 || c === 78 || c === 95 || c === 76 || c === 80;
}
function consumeLineBreak(state) {
	if (state.input.charCodeAt(state.position) === 10) state.position++;
	else {
		state.position++;
		if (state.input.charCodeAt(state.position) === 10) state.position++;
	}
	state.line++;
	state.lineStart = state.position;
	state.lineIndent = 0;
	state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments) {
	let lineBreaks = 0;
	let ch = state.input.charCodeAt(state.position);
	let hasSeparation = state.position === state.lineStart || isWsOrEol(state.input.charCodeAt(state.position - 1));
	while (ch !== 0) {
		while (isWhiteSpace(ch)) {
			hasSeparation = true;
			if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
			ch = state.input.charCodeAt(++state.position);
		}
		if (allowComments && hasSeparation && ch === 35) do
			ch = state.input.charCodeAt(++state.position);
		while (!isEol(ch) && ch !== 0);
		if (!isEol(ch)) break;
		consumeLineBreak(state);
		lineBreaks++;
		hasSeparation = true;
		ch = state.input.charCodeAt(state.position);
		while (ch === 32) {
			state.lineIndent++;
			ch = state.input.charCodeAt(++state.position);
		}
	}
	return lineBreaks;
}
function testDocumentSeparator(state, position = state.position) {
	const ch = state.input.charCodeAt(position);
	if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(position + 1) && ch === state.input.charCodeAt(position + 2)) {
		const following = state.input.charCodeAt(position + 3);
		return following === 0 || isWsOrEol(following);
	}
	return false;
}
function skipUntilLineEnd(state) {
	let ch = state.input.charCodeAt(state.position);
	while (ch !== 0 && !isEol(ch)) ch = state.input.charCodeAt(++state.position);
}
function checkPrintable(state, start, end) {
	if (PATTERN_NON_PRINTABLE.test(state.input.slice(start, end))) throwError(state, "the stream contains non-printable characters");
}
function readTagProperty(state, props, inFlow) {
	if (state.input.charCodeAt(state.position) !== 33) return false;
	if (props.tagStart !== NO_RANGE$1) throwError(state, "duplication of a tag property");
	const start = state.position;
	let isVerbatim = false;
	let isNamed = false;
	let tagHandle = "!";
	let ch = state.input.charCodeAt(++state.position);
	if (ch === 60) {
		isVerbatim = true;
		ch = state.input.charCodeAt(++state.position);
	} else if (ch === 33) {
		isNamed = true;
		tagHandle = "!!";
		ch = state.input.charCodeAt(++state.position);
	}
	let suffixStart = state.position;
	let tagName;
	if (isVerbatim) {
		while (ch !== 0 && ch !== 62) ch = state.input.charCodeAt(++state.position);
		if (ch !== 62) throwError(state, "unexpected end of the stream within a verbatim tag");
		tagName = state.input.slice(suffixStart, state.position);
		state.position++;
	} else {
		while (ch !== 0 && !isWsOrEol(ch) && !(inFlow && isFlowIndicator(ch))) {
			if (ch === 33) if (!isNamed) {
				tagHandle = state.input.slice(suffixStart - 1, state.position + 1);
				if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
				isNamed = true;
				suffixStart = state.position + 1;
			} else throwError(state, "tag suffix cannot contain exclamation marks");
			ch = state.input.charCodeAt(++state.position);
		}
		tagName = state.input.slice(suffixStart, state.position);
		if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
	}
	if (tagName && !(isVerbatim ? PATTERN_TAG_URI.test(tagName) : PATTERN_TAG_SUFFIX.test(tagName))) throwError(state, `tag name cannot contain such characters: ${tagName}`);
	if (!isVerbatim && tagHandle !== "!" && tagHandle !== "!!" && !HAS_OWN.call(state.tagHandlers, tagHandle)) throwError(state, `undeclared tag handle "${tagHandle}"`);
	props.tagStart = start;
	props.tagEnd = state.position;
	return true;
}
function readAnchorProperty(state, props) {
	if (state.input.charCodeAt(state.position) !== 38) return false;
	if (props.anchorStart !== NO_RANGE$1) throwError(state, "duplication of an anchor property");
	state.position++;
	const start = state.position;
	while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position)) && !isFlowIndicator(state.input.charCodeAt(state.position))) state.position++;
	if (state.position === start) throwError(state, "name of an anchor node must contain at least one character");
	props.anchorStart = start;
	props.anchorEnd = state.position;
	return true;
}
function readAlias(state, props) {
	if (state.input.charCodeAt(state.position) !== 42) return false;
	if (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1) throwError(state, "alias node should not have any properties");
	state.position++;
	const start = state.position;
	while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position)) && !isFlowIndicator(state.input.charCodeAt(state.position))) state.position++;
	if (state.position === start) throwError(state, "name of an alias node must contain at least one character");
	addAliasEvent(state, start, state.position);
	return true;
}
function readFlowScalarBreak(state, nodeIndent) {
	skipSeparationSpace(state, false);
	if (state.lineIndent < nodeIndent) throwError(state, "deficient indentation");
}
function readSingleQuotedScalar(state, nodeIndent, props) {
	if (state.input.charCodeAt(state.position) !== 39) return false;
	state.position++;
	const start = state.position;
	let simple = true;
	while (state.input.charCodeAt(state.position) !== 0) {
		const ch = state.input.charCodeAt(state.position);
		if (ch === 39) {
			if (state.input.charCodeAt(state.position + 1) === 39) {
				simple = false;
				state.position += 2;
				continue;
			}
			const end = state.position;
			state.position++;
			addScalarEvent(state, start, end, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, SCALAR_STYLE.SINGLE_QUOTED, CHOMPING_MODE.CLIP, -1, simple);
			return true;
		}
		if (isEol(ch)) {
			simple = false;
			readFlowScalarBreak(state, nodeIndent);
		} else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
		else if (ch !== 9 && ch < 32) throwError(state, "expected valid JSON character");
		else state.position++;
	}
	throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent, props) {
	if (state.input.charCodeAt(state.position) !== 34) return false;
	state.position++;
	const start = state.position;
	let simple = true;
	while (state.input.charCodeAt(state.position) !== 0) {
		const ch = state.input.charCodeAt(state.position);
		if (ch === 34) {
			const end = state.position;
			state.position++;
			addScalarEvent(state, start, end, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, SCALAR_STYLE.DOUBLE_QUOTED, CHOMPING_MODE.CLIP, -1, simple);
			return true;
		}
		if (ch === 92) {
			simple = false;
			const escaped = state.input.charCodeAt(++state.position);
			if (isEol(escaped)) readFlowScalarBreak(state, nodeIndent);
			else if (isSimpleEscape(escaped)) state.position++;
			else {
				let hexLength = escapedHexLen(escaped);
				if (hexLength === 0) throwError(state, "unknown escape sequence");
				while (hexLength-- > 0) {
					state.position++;
					if (fromHexCode(state.input.charCodeAt(state.position)) < 0) throwError(state, "expected hexadecimal character");
				}
				state.position++;
			}
		} else if (isEol(ch)) {
			simple = false;
			readFlowScalarBreak(state, nodeIndent);
		} else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
		else if (ch !== 9 && ch < 32) throwError(state, "expected valid JSON character");
		else state.position++;
	}
	throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readBlockScalar(state, parentIndent, props) {
	const ch = state.input.charCodeAt(state.position);
	let chomping = CHOMPING_MODE.CLIP;
	let indent = -1;
	let detectedIndent = false;
	if (ch !== 124 && ch !== 62) return false;
	const style = ch === 124 ? SCALAR_STYLE.LITERAL_BLOCK : SCALAR_STYLE.FOLDED_BLOCK;
	state.position++;
	while (state.input.charCodeAt(state.position) !== 0) {
		const current = state.input.charCodeAt(state.position);
		const digit = fromDecimalCode(current);
		if (current === 43 || current === 45) {
			if (chomping !== CHOMPING_MODE.CLIP) throwError(state, "repeat of a chomping mode identifier");
			chomping = current === 43 ? CHOMPING_MODE.KEEP : CHOMPING_MODE.STRIP;
			state.position++;
		} else if (digit >= 0) {
			if (digit === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
			if (detectedIndent) throwError(state, "repeat of an indentation width identifier");
			indent = parentIndent + digit - 1;
			detectedIndent = true;
			state.position++;
		} else break;
	}
	let hadWhitespace = false;
	while (isWhiteSpace(state.input.charCodeAt(state.position))) {
		hadWhitespace = true;
		state.position++;
	}
	if (hadWhitespace && state.input.charCodeAt(state.position) === 35) skipUntilLineEnd(state);
	if (isEol(state.input.charCodeAt(state.position))) consumeLineBreak(state);
	else if (state.input.charCodeAt(state.position) !== 0) throwError(state, "a line break is expected");
	let contentIndent = detectedIndent ? indent : -1;
	let maxLeadingIndent = 0;
	const valueStart = state.position;
	let valueEnd = state.position;
	while (state.input.charCodeAt(state.position) !== 0) {
		const linePosition = state.position;
		let column = 0;
		while (state.input.charCodeAt(linePosition + column) === 32) column++;
		const first = state.input.charCodeAt(linePosition + column);
		if (first === 0) {
			if (contentIndent >= 0) {
				if (column > contentIndent) valueEnd = linePosition + column;
			} else if (column > 0) valueEnd = linePosition + column;
			break;
		}
		if (linePosition === state.lineStart && testDocumentSeparator(state, linePosition)) break;
		if (!detectedIndent && contentIndent === -1 && isEol(first)) maxLeadingIndent = Math.max(maxLeadingIndent, column);
		if (!detectedIndent && contentIndent === -1 && !isEol(first)) {
			if (first === 9 && column < parentIndent) {
				state.position = linePosition + column;
				throwError(state, "tab characters must not be used in indentation");
			}
			if (column < maxLeadingIndent) {
				state.position = linePosition + column;
				throwError(state, "bad indentation of a mapping entry");
			}
		}
		if (contentIndent === -1 && first !== 0 && !isEol(first) && column < parentIndent) {
			state.lineIndent = column;
			state.position = linePosition + column;
			break;
		}
		if (!detectedIndent && first !== 0 && !isEol(first) && contentIndent === -1) contentIndent = column;
		const requiredIndent = contentIndent === -1 ? parentIndent + 1 : contentIndent;
		if (first !== 0 && !isEol(first) && column < requiredIndent) {
			state.lineIndent = column;
			state.position = linePosition + column;
			break;
		}
		skipUntilLineEnd(state);
		valueEnd = state.position;
		if (isEol(state.input.charCodeAt(state.position))) {
			consumeLineBreak(state);
			valueEnd = state.position;
		}
	}
	checkPrintable(state, valueStart, valueEnd);
	addScalarEvent(state, valueStart, valueEnd, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, style, chomping, contentIndent);
	return true;
}
function canStartPlainScalar(state, nodeContext) {
	const ch = state.input.charCodeAt(state.position);
	const inFlow = nodeContext === CONTEXT_FLOW_IN;
	if (ch === 0 || isWsOrEol(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96 || inFlow && isFlowIndicator(ch)) return false;
	if (ch === 63 || ch === 45) {
		const following = state.input.charCodeAt(state.position + 1);
		if (isWsOrEolOrEnd(following) || inFlow && isFlowIndicator(following)) return false;
	}
	return true;
}
function readPlainScalar(state, nodeIndent, nodeContext, props) {
	if (!canStartPlainScalar(state, nodeContext)) return false;
	const start = state.position;
	let end = state.position;
	let ch = state.input.charCodeAt(state.position);
	const inFlow = nodeContext === CONTEXT_FLOW_IN;
	let multiline = false;
	while (ch !== 0) {
		if (state.position === state.lineStart && testDocumentSeparator(state)) break;
		if (ch === 58) {
			const following = state.input.charCodeAt(state.position + 1);
			if (isWsOrEolOrEnd(following) || inFlow && isFlowIndicator(following)) break;
		} else if (ch === 35) {
			if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
		} else if (inFlow && isFlowIndicator(ch)) break;
		else if (isEol(ch)) {
			const savedPosition = state.position;
			const savedLine = state.line;
			const savedLineStart = state.lineStart;
			const savedLineIndent = state.lineIndent;
			skipSeparationSpace(state, false);
			if (state.lineIndent >= nodeIndent) {
				multiline = true;
				ch = state.input.charCodeAt(state.position);
				continue;
			}
			state.position = savedPosition;
			state.line = savedLine;
			state.lineStart = savedLineStart;
			state.lineIndent = savedLineIndent;
			break;
		}
		if (!isWhiteSpace(ch)) end = state.position + 1;
		ch = state.input.charCodeAt(++state.position);
	}
	if (end === start) return false;
	checkPrintable(state, start, end);
	addScalarEvent(state, start, end, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, SCALAR_STYLE.PLAIN, CHOMPING_MODE.CLIP, -1, !multiline);
	return true;
}
function skipFlowSeparationSpace(state, nodeIndent) {
	const startLine = state.line;
	skipSeparationSpace(state, true);
	if (state.line > startLine && state.lineIndent < nodeIndent || state.firstTabInLine !== -1 && state.lineIndent < nodeIndent) throwError(state, "deficient indentation");
}
function readFlowCollection(state, nodeIndent, props) {
	const ch = state.input.charCodeAt(state.position);
	const isMapping = ch === 123;
	const start = state.position;
	let readNext = true;
	if (ch !== 91 && ch !== 123) return false;
	const terminator = isMapping ? 125 : 93;
	if (isMapping) addMappingEvent(state, start, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, COLLECTION_STYLE.FLOW);
	else addSequenceEvent(state, start, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, COLLECTION_STYLE.FLOW);
	state.position++;
	while (state.input.charCodeAt(state.position) !== 0) {
		skipFlowSeparationSpace(state, nodeIndent);
		let ch = state.input.charCodeAt(state.position);
		if (ch === terminator) {
			state.position++;
			addPopEvent(state);
			return true;
		} else if (!readNext) throwError(state, "missed comma between flow collection entries");
		else if (ch === 44) throwError(state, "expected the node content, but found ','");
		let isPair = false;
		let isExplicitPair = false;
		if (ch === 63 && isWsOrEol(state.input.charCodeAt(state.position + 1))) {
			isPair = isExplicitPair = true;
			state.position += 1;
			skipFlowSeparationSpace(state, nodeIndent);
		}
		const entryLine = state.line;
		const entryStart = snapshotState(state);
		const keyWasRead = parseNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
		skipFlowSeparationSpace(state, nodeIndent);
		ch = state.input.charCodeAt(state.position);
		if ((isMapping || isExplicitPair || state.line === entryLine) && ch === 58) {
			isPair = true;
			state.position++;
			skipFlowSeparationSpace(state, nodeIndent);
			if (!isMapping) {
				insertFlowPairMappingEvent(state, entryStart);
				if (!keyWasRead) addEmptyScalarEvent(state);
			} else if (!keyWasRead) addEmptyScalarEvent(state);
			if (!parseNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true)) addEmptyScalarEvent(state);
			skipFlowSeparationSpace(state, nodeIndent);
			if (!isMapping) addPopEvent(state);
		} else if (isMapping && isPair) {
			if (!keyWasRead) addEmptyScalarEvent(state);
			addEmptyScalarEvent(state);
		} else if (isMapping) addEmptyScalarEvent(state);
		else if (isPair) {
			insertFlowPairMappingEvent(state, entryStart);
			if (!keyWasRead) addEmptyScalarEvent(state);
			addEmptyScalarEvent(state);
			addPopEvent(state);
		}
		ch = state.input.charCodeAt(state.position);
		if (ch === 44) {
			readNext = true;
			state.position++;
		} else readNext = false;
	}
	throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockSequence(state, nodeIndent, props) {
	if (state.firstTabInLine !== -1 || state.input.charCodeAt(state.position) !== 45 || !isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) return false;
	addSequenceEvent(state, state.position, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, COLLECTION_STYLE.BLOCK);
	while (state.input.charCodeAt(state.position) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) {
		if (state.firstTabInLine !== -1) {
			state.position = state.firstTabInLine;
			throwError(state, "tab characters must not be used in indentation");
		}
		const entryLine = state.line;
		state.position++;
		const hadBreak = skipSeparationSpace(state, true) > 0;
		if (state.firstTabInLine !== -1 && state.input.charCodeAt(state.position) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) throwError(state, "bad indentation of a sequence entry");
		if (hadBreak && state.lineIndent <= nodeIndent) addEmptyScalarEvent(state);
		else parseNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
		skipSeparationSpace(state, true);
		if (state.lineIndent < nodeIndent || state.position >= state.length) break;
		if (state.lineIndent > nodeIndent) throwError(state, "bad indentation of a sequence entry");
		if (state.line === entryLine && state.input.charCodeAt(state.position) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 1))) throwError(state, "bad indentation of a sequence entry");
	}
	addPopEvent(state);
	return true;
}
function readBlockMapping(state, nodeIndent, flowIndent, props) {
	let atExplicitKey = false;
	let detected = false;
	let mappingOpened = false;
	let pendingExplicitKey = false;
	if (state.firstTabInLine !== -1) return false;
	let ch = state.input.charCodeAt(state.position);
	while (ch !== 0) {
		if (!atExplicitKey && state.firstTabInLine !== -1) {
			state.position = state.firstTabInLine;
			throwError(state, "tab characters must not be used in indentation");
		}
		const following = state.input.charCodeAt(state.position + 1);
		const entryLine = state.line;
		if ((ch === 63 || ch === 58) && isWsOrEolOrEnd(following)) {
			if (!mappingOpened) {
				addMappingEvent(state, state.position, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, COLLECTION_STYLE.BLOCK);
				mappingOpened = true;
			}
			if (ch === 63) {
				if (atExplicitKey) addEmptyScalarEvent(state);
				detected = true;
				atExplicitKey = true;
			} else if (atExplicitKey) atExplicitKey = false;
			else {
				addEmptyScalarEvent(state);
				detected = true;
				atExplicitKey = false;
			}
			state.position += 1;
			pendingExplicitKey = true;
		} else {
			if (atExplicitKey) {
				addEmptyScalarEvent(state);
				atExplicitKey = false;
			}
			const beforeKey = snapshotState(state);
			if (!parseNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
			if (state.line === entryLine) {
				ch = state.input.charCodeAt(state.position);
				while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
				if (ch === 58) {
					ch = state.input.charCodeAt(++state.position);
					if (!isWsOrEolOrEnd(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
					if (!mappingOpened) {
						restoreState(state, beforeKey);
						addMappingEvent(state, beforeKey.position, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, COLLECTION_STYLE.BLOCK);
						mappingOpened = true;
						parseNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true);
						ch = state.input.charCodeAt(state.position);
						while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
						state.position++;
					}
					detected = true;
					atExplicitKey = false;
					pendingExplicitKey = false;
				} else if (detected) throwError(state, "expected ':' after a mapping key");
				else {
					if (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1) {
						restoreState(state, beforeKey);
						return false;
					}
					return true;
				}
			} else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
			else {
				if (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1) {
					restoreState(state, beforeKey);
					return false;
				}
				return true;
			}
		}
		if (parseNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, pendingExplicitKey)) pendingExplicitKey = false;
		if (!atExplicitKey) {
			if (pendingExplicitKey) {
				addEmptyScalarEvent(state);
				pendingExplicitKey = false;
			}
		}
		skipSeparationSpace(state, true);
		ch = state.input.charCodeAt(state.position);
		if ((state.line === entryLine || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
		else if (state.lineIndent < nodeIndent) break;
	}
	if (!detected) return false;
	if (atExplicitKey) addEmptyScalarEvent(state);
	if (mappingOpened) addPopEvent(state);
	return true;
}
function parseNode(state, parentIndent, nodeContext, allowToSeek, allowCompact, allowPropertyMapping = true) {
	if (state.depth >= state.maxDepth) throwError(state, `nesting exceeded maxDepth (${state.maxDepth})`);
	state.depth++;
	let indentStatus = 1;
	let atNewLine = false;
	let hasContent = false;
	let propertyStart = null;
	const props = emptyProperties();
	let allowBlockScalars = nodeContext === CONTEXT_BLOCK_OUT || nodeContext === CONTEXT_BLOCK_IN;
	let allowBlockCollections = allowBlockScalars;
	const allowBlockStyles = allowBlockScalars;
	if (allowToSeek && skipSeparationSpace(state, true)) {
		atNewLine = true;
		if (state.lineIndent > parentIndent) indentStatus = 1;
		else if (state.lineIndent === parentIndent) indentStatus = 0;
		else indentStatus = -1;
	}
	if (indentStatus === 1) while (true) {
		const ch = state.input.charCodeAt(state.position);
		const propertyState = snapshotState(state);
		if (atNewLine && indentStatus !== 1 && (ch === 33 || ch === 38)) break;
		if (atNewLine && allowBlockStyles && (props.tagStart !== NO_RANGE$1 || props.anchorStart !== NO_RANGE$1) && (ch === 33 || ch === 38)) {
			const fallbackState = snapshotState(state);
			const flowIndent = parentIndent + 1;
			if (readBlockMapping(state, state.position - state.lineStart, flowIndent, props) && state.events[fallbackState.eventsLength]?.type === EVENT_ID.MAPPING) {
				state.depth--;
				return true;
			}
			restoreState(state, fallbackState);
		}
		if (atNewLine && (ch === 33 && props.tagStart !== NO_RANGE$1 || ch === 38 && props.anchorStart !== NO_RANGE$1)) break;
		if (!readTagProperty(state, props, nodeContext === CONTEXT_FLOW_IN) && !readAnchorProperty(state, props)) break;
		if (propertyStart === null) propertyStart = propertyState;
		if (skipSeparationSpace(state, true)) {
			atNewLine = true;
			allowBlockCollections = allowBlockStyles;
			if (state.lineIndent > parentIndent) indentStatus = 1;
			else if (state.lineIndent === parentIndent) indentStatus = 0;
			else indentStatus = -1;
		} else allowBlockCollections = false;
	}
	if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
	if (indentStatus === 1 || nodeContext === CONTEXT_BLOCK_OUT) {
		const flowIndent = nodeContext === CONTEXT_FLOW_IN || nodeContext === CONTEXT_FLOW_OUT ? parentIndent : parentIndent + 1;
		const blockIndent = state.position - state.lineStart;
		if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent, props) || readBlockMapping(state, blockIndent, flowIndent, props)) || readFlowCollection(state, flowIndent, props)) hasContent = true;
		else {
			const ch = state.input.charCodeAt(state.position);
			if (propertyStart !== null && allowPropertyMapping && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62) {
				const fallbackState = snapshotState(state);
				const propertyIndent = propertyStart.position - propertyStart.lineStart;
				restoreState(state, propertyStart);
				if (readBlockMapping(state, propertyIndent, flowIndent, emptyProperties()) && state.events[fallbackState.eventsLength]?.type === EVENT_ID.MAPPING) hasContent = true;
				else restoreState(state, fallbackState);
			}
			if (!hasContent && (allowBlockScalars && readBlockScalar(state, flowIndent, props) || readSingleQuotedScalar(state, flowIndent, props) || readDoubleQuotedScalar(state, flowIndent, props) || readAlias(state, props) || readPlainScalar(state, flowIndent, nodeContext, props))) hasContent = true;
		}
		else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent, props);
	}
	allowBlockScalars = allowBlockScalars && !hasContent;
	if (!hasContent && (props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1 || allowBlockScalars)) {
		addScalarEvent(state, NO_RANGE$1, NO_RANGE$1, props.anchorStart, props.anchorEnd, props.tagStart, props.tagEnd, SCALAR_STYLE.PLAIN);
		hasContent = true;
	}
	state.depth--;
	return hasContent || props.anchorStart !== NO_RANGE$1 || props.tagStart !== NO_RANGE$1;
}
function readDirective(state) {
	if (state.lineIndent > 0 || state.input.charCodeAt(state.position) !== 37) return false;
	state.position++;
	const nameStart = state.position;
	while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position))) state.position++;
	const name = state.input.slice(nameStart, state.position);
	const args = [];
	if (name.length === 0) throwError(state, "directive name must not be less than one character in length");
	while (state.input.charCodeAt(state.position) !== 0 && !isEol(state.input.charCodeAt(state.position))) {
		while (isWhiteSpace(state.input.charCodeAt(state.position))) state.position++;
		if (state.input.charCodeAt(state.position) === 35 || isEol(state.input.charCodeAt(state.position)) || state.input.charCodeAt(state.position) === 0) break;
		const start = state.position;
		while (state.input.charCodeAt(state.position) !== 0 && !isWsOrEol(state.input.charCodeAt(state.position))) state.position++;
		args.push(state.input.slice(start, state.position));
	}
	if (isEol(state.input.charCodeAt(state.position))) consumeLineBreak(state);
	if (name === "YAML") {
		if (state.directives.some((directive) => directive.kind === "yaml")) throwError(state, "duplication of %YAML directive");
		if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
		const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
		if (match === null) throwError(state, "ill-formed argument of the YAML directive");
		if (parseInt(match[1], 10) !== 1) throwError(state, "unacceptable YAML version of the document");
		state.directives.push({
			kind: "yaml",
			version: args[0]
		});
	} else if (name === "TAG") {
		if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
		const [handle, prefix] = args;
		if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
		if (HAS_OWN.call(state.tagHandlers, handle)) throwError(state, `there is a previously declared suffix for "${handle}" tag handle`);
		if (!PATTERN_TAG_PREFIX.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
		state.tagHandlers[handle] = prefix;
		state.directives.push({
			kind: "tag",
			handle,
			prefix
		});
	}
	return true;
}
function readDocument(state) {
	state.directives = [];
	state.tagHandlers = Object.create(null);
	let hasDirectives = false;
	skipSeparationSpace(state, true);
	while (readDirective(state)) {
		hasDirectives = true;
		skipSeparationSpace(state, true);
	}
	let explicitStart = false;
	let explicitEnd = false;
	let allowCompact = true;
	if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45 && isWsOrEolOrEnd(state.input.charCodeAt(state.position + 3))) {
		explicitStart = true;
		const markerLine = state.line;
		state.position += 3;
		skipSeparationSpace(state, true);
		allowCompact = state.line > markerLine;
	} else if (hasDirectives) throwError(state, "directives end mark is expected");
	const documentEventIndex = state.events.length;
	if (!explicitStart && state.position === state.lineStart && state.input.charCodeAt(state.position) === 46 && testDocumentSeparator(state)) {
		state.position += 3;
		skipSeparationSpace(state, true);
		return;
	}
	addDocumentEvent(state, explicitStart, false);
	if (!parseNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, allowCompact, allowCompact)) addEmptyScalarEvent(state);
	skipSeparationSpace(state, true);
	if (state.position === state.lineStart && testDocumentSeparator(state)) {
		explicitEnd = state.input.charCodeAt(state.position) === 46;
		if (explicitEnd) {
			const markerLine = state.line;
			state.position += 3;
			skipSeparationSpace(state, true);
			if (state.line === markerLine && state.position < state.length) throwError(state, "end of the stream or a document separator is expected");
		}
	}
	const documentEvent = state.events[documentEventIndex];
	if (documentEvent?.type === EVENT_ID.DOCUMENT) documentEvent.explicitEnd = explicitEnd;
	addPopEvent(state);
	if (!explicitEnd && state.position < state.length && !(state.position === state.lineStart && testDocumentSeparator(state))) throwError(state, "end of the stream or a document separator is expected");
}
/**
* Parses YAML into a flat event stream referencing source text by offsets.
*
* @category Events
*/
function parseEvents(input, options) {
	const length = input.length;
	const state = {
		...DEFAULT_PARSER_OPTIONS,
		...options,
		input: `${input}\0`,
		length,
		position: 0,
		line: 0,
		lineStart: 0,
		lineIndent: 0,
		firstTabInLine: -1,
		depth: 0,
		directives: [],
		tagHandlers: Object.create(null),
		events: []
	};
	const nullpos = input.indexOf("\0");
	if (nullpos !== -1) YAMLException.throwAt(input, nullpos, "null byte is not allowed in input", state.filename);
	if (state.input.charCodeAt(state.position) === 65279) state.position++;
	while (state.position < state.length) {
		skipSeparationSpace(state, true);
		if (state.position >= state.length) break;
		const documentStart = state.position;
		readDocument(state);
		if (state.position === documentStart)
 /* c8 ignore next */
		throwError(state, "can not read a document");
	}
	return state.events;
}
function loadDocuments(input, options = {}) {
	const opts = {
		...DEFAULT_LOAD_OPTIONS,
		...options
	};
	const source = String(input);
	const PARSER_OPT_KEYS = Object.keys(DEFAULT_PARSER_OPTIONS);
	const CONSTRUCTOR_OPT_KEYS = Object.keys(DEFAULT_CONSTRUCTOR_OPTIONS);
	return constructFromEvents(parseEvents(source, pick(opts, PARSER_OPT_KEYS)), {
		...pick(opts, CONSTRUCTOR_OPT_KEYS),
		source
	});
}
/**
* Parses `string` as a single YAML document. Throws {@link YAMLException} on
* error. This function does not understand multi-document or empty sources; it
* throws an exception on those.
*
* > [!NOTE]
* > 1. When processing untrusted input, see the
* >    [security considerations](../docs/safety.md).
* > 2. All exceptions MUST be caught, not just {@link YAMLException}.
* > 3. The default {@link CORE_SCHEMA} comes without the `!!merge` tag. You can
* >    easily enable it if needed.
* > 4. The default {@link mapTag} is `{}`-object based, with known limitations
* >    (see description). For full compatibility use {@link realMapTag}
* >    instead (it uses native JS `Map`).
*
* @example
* Enable {@link mergeTag} and {@link realMapTag}:
*
* ```javascript
* import { load, CORE_SCHEMA, mergeTag, realMapTag } from 'js-yaml'
*
* try {
*   load(data, { schema: CORE_SCHEMA.withTags(mergeTag, realMapTag) })
* } catch (e) {
*   console.error(e)
* }
* ```
*
* @category Main
*/
function load$1(input, options) {
	const documents = loadDocuments(input, options);
	if (documents.length === 0) throw new YAMLException("expected a document, but the input is empty");
	if (documents.length === 1) return documents[0];
	throw new YAMLException("expected a single document in the stream, but found more");
}
function buildRepresentTypes(schema) {
	const defaultTags = new Set([
		schema.defaultScalarTag,
		schema.defaultSequenceTag,
		schema.defaultMappingTag
	].filter((t) => t !== void 0));
	const implicitScalars = schema.implicitScalarTags;
	const explicitTags = schema.tags.filter((t) => !(t.nodeKind === "scalar" && t.implicit) && !defaultTags.has(t));
	const defaultTagsLast = schema.tags.filter((t) => defaultTags.has(t));
	return [
		...implicitScalars.map((tag) => ({
			tag,
			implicitTag: true
		})),
		...explicitTags.map((tag) => ({
			tag,
			implicitTag: false
		})),
		...defaultTagsLast.map((tag) => ({
			tag,
			implicitTag: true
		}))
	];
}
function matchTag(state, object) {
	for (let index = 0, length = state.representTypes.length; index < length; index += 1) {
		const { tag, implicitTag } = state.representTypes[index];
		if (tag.identify(object)) {
			let tagName;
			if (tag.matchByTagPrefix) tagName = tag.representTagName(object);
			else tagName = tag.tagName;
			return {
				tag,
				tagName,
				implicitTag
			};
		}
	}
	return null;
}
function build(state, object) {
	if (!state.noRefs && object !== null && typeof object === "object") {
		const existing = state.refs.get(object);
		if (existing) {
			if (existing.anchor === void 0) existing.anchor = `ref_${state.refCounter++}`;
			return {
				kind: "alias",
				tag: "",
				style: new Style(),
				anchor: existing.anchor
			};
		}
	}
	const matched = matchTag(state, object);
	if (!matched) {
		if (object === void 0) return INVALID;
		if (state.skipInvalid) return INVALID;
		throw new YAMLException(`unacceptable kind of an object to dump ${Object.prototype.toString.call(object)}`);
	}
	const { tag, tagName, implicitTag } = matched;
	const nodeTagName = implicitTag ? tagName : tagNameShort(tagName);
	if (tag.nodeKind === "scalar") {
		const style = new Style();
		style.tagged = !implicitTag;
		return {
			kind: "scalar",
			tag: nodeTagName,
			style,
			value: tag.represent(object)
		};
	}
	if (tag.nodeKind === "sequence") {
		const container = tag.represent(object);
		const style = new Style();
		style.tagged = !implicitTag;
		const node = {
			kind: "sequence",
			tag: nodeTagName,
			style,
			items: []
		};
		if (!state.noRefs) state.refs.set(object, node);
		for (let index = 0, length = container.length; index < length; index += 1) {
			let item = build(state, container[index]);
			if (item === INVALID && container[index] === void 0) item = build(state, null);
			if (item === INVALID) continue;
			node.items.push(item);
		}
		return node;
	}
	const map = tag.represent(object);
	const style = new Style();
	style.tagged = !implicitTag;
	const node = {
		kind: "mapping",
		tag: nodeTagName,
		style,
		items: []
	};
	if (!state.noRefs) state.refs.set(object, node);
	for (const [objectKey, objectValue] of map) {
		const key = build(state, objectKey);
		if (key === INVALID) continue;
		const value = build(state, objectValue);
		if (value === INVALID) continue;
		node.items.push({
			key,
			value
		});
	}
	return node;
}
/**
* Convert JS object to AST. A JS value is one YAML document. An unrepresentable
* root becomes an empty document, which the presenter renders as an empty
* string.
*
* @category AST
*/
function jsToAst(input, schema, options = {}) {
	const root = build({
		representTypes: buildRepresentTypes(schema),
		noRefs: options.noRefs ?? false,
		skipInvalid: options.skipInvalid ?? false,
		refs: /* @__PURE__ */ new Map(),
		refCounter: 0
	}, input);
	return [{
		contents: root === INVALID ? null : root,
		directives: []
	}];
}
function visitNode(node, visitor, ctx) {
	const control = visitor(node, ctx);
	if (control === VISIT_BREAK) return true;
	if (control === VISIT_SKIP) return false;
	const depth = ctx.depth + 1;
	switch (node.kind) {
		case "sequence":
			for (const item of node.items) if (visitNode(item, visitor, {
				depth,
				parent: node,
				isKey: false
			})) return true;
			break;
		case "mapping": for (const { key, value } of node.items) {
			if (visitNode(key, visitor, {
				depth,
				parent: node,
				isKey: true
			})) return true;
			if (visitNode(value, visitor, {
				depth,
				parent: node,
				isKey: false
			})) return true;
		}
	}
	return false;
}
/**
* Walk every node in the documents, calling {@link Visitor} once per
* node (pre-order).
*
* @category AST
*/
function visit(documents, visitor) {
	for (const doc of documents) if (doc.contents && visitNode(doc.contents, visitor, {
		depth: 0,
		parent: null,
		isKey: false
	})) return;
}
function nodeTagShort(node) {
	return node.style.tagged ? node.tag : tagNameShort(node.tag);
}
function createPresenterState(options) {
	const opts = {
		...DEFAULT_PRESENTER_OPTIONS,
		...options
	};
	return {
		...opts,
		defaultScalarTagName: opts.schema.defaultScalarTag.tagName
	};
}
function encodeNonPrintable(character) {
	const string = character.toString(16).toUpperCase();
	const handle = character <= 255 ? "x" : "u";
	const length = character <= 255 ? 2 : 4;
	return `\\${handle}${"0".repeat(length - string.length)}${string}`;
}
function indentString(string, spaces) {
	const ind = " ".repeat(spaces);
	let position = 0;
	let result = "";
	const length = string.length;
	while (position < length) {
		let line;
		const next = string.indexOf("\n", position);
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
	return `\n${" ".repeat(state.indent * level)}`;
}
function scalarLayout(state, level) {
	const indent = state.indent * Math.max(1, level);
	return {
		indent,
		blockIndent: level === 0 ? state.indent + 1 : state.indent,
		lineWidth: state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent)
	};
}
function isWhitespace(c) {
	return c === CHAR_SPACE || c === CHAR_TAB;
}
function startsWithDocumentSeparator(string) {
	const marker = string.charCodeAt(0);
	if (marker !== CHAR_MINUS && marker !== 46 || string.charCodeAt(1) !== marker || string.charCodeAt(2) !== marker) return false;
	if (string.length === 3) return true;
	const following = string.charCodeAt(3);
	return isWhitespace(following) || following === CHAR_CARRIAGE_RETURN || following === CHAR_LINE_FEED;
}
function isPrintable(c) {
	return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
	return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
	const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
	const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
	return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar && (inblock || c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET);
}
function isPlainSafeFirst(c) {
	return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeAtStart(string, inblock) {
	const first = codePointAt(string, 0);
	if (isPlainSafeFirst(first)) return true;
	if (string.length > 1 && (first === CHAR_MINUS || first === CHAR_QUESTION || first === CHAR_COLON)) {
		const second = codePointAt(string, 1);
		return !isWhitespace(second) && isPlainSafe(second, first, inblock);
	}
	return false;
}
function isPlainSafeLast(c) {
	return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
	const first = string.charCodeAt(pos);
	let second;
	if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
		second = string.charCodeAt(pos + 1);
		if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
	}
	return first;
}
function needIndentIndicator(string) {
	return /^\n* /.test(string);
}
function chooseScalarStyle(state, string, layout, singleLineOnly, forceQuote, inblock) {
	const { blockIndent, lineWidth } = layout;
	let i;
	let char = 0;
	let prevChar = -1;
	let hasLineBreak = false;
	let hasFoldableLine = false;
	const shouldTrackWidth = lineWidth !== -1;
	let previousLineBreak = -1;
	let plain = !startsWithDocumentSeparator(string) && isPlainSafeAtStart(string, inblock) && isPlainSafeLast(codePointAt(string, string.length - 1));
	if (singleLineOnly || forceQuote) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
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
					hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && !isMoreIndented(string[previousLineBreak + 1]);
					previousLineBreak = i;
				}
			} else if (!isPrintable(char)) return STYLE_DOUBLE;
			plain = plain && isPlainSafe(char, prevChar, inblock);
			prevChar = char;
		}
		hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && !isMoreIndented(string[previousLineBreak + 1]);
	}
	if (!hasLineBreak && !hasFoldableLine) {
		if (plain && !forceQuote) return STYLE_PLAIN;
		return state.quoteStyle === "double" ? STYLE_DOUBLE : STYLE_SINGLE;
	}
	if (blockIndent > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
	return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
}
function renderScalarStyle(string, style, layout) {
	const { indent, blockIndent, lineWidth } = layout;
	switch (style) {
		case STYLE_PLAIN: return encodeFlowBreaks(string, indent);
		case STYLE_SINGLE: return `'${encodeFlowBreaks(string, indent).replace(/'/g, "''")}'`;
		case STYLE_LITERAL: return "|" + blockHeader(string, blockIndent) + dropEndingNewline(indentString(string, indent));
		case STYLE_FOLDED: return ">" + blockHeader(string, blockIndent) + dropEndingNewline(indentString(foldBlockScalar(string, lineWidth), indent));
		case STYLE_DOUBLE: return `"${escapeString(string)}"`;
	}
}
function resolveScalarStyle(state, node, layout, iskey, inblock) {
	const singleLineOnly = iskey || !inblock;
	if (node.style.singleQuoted) return STYLE_SINGLE;
	if (node.style.doubleQuoted) return STYLE_DOUBLE;
	if (!singleLineOnly) {
		if (node.style.literal) return STYLE_LITERAL;
		if (node.style.folded) return STYLE_FOLDED;
	}
	const string = node.value;
	if (string.length === 0) {
		if (node.style.tagged || state.schema.resolveImplicitScalarTag(string).tag.tagName === node.tag) return STYLE_PLAIN;
		return state.quoteStyle === "double" ? STYLE_DOUBLE : STYLE_SINGLE;
	}
	const style = chooseScalarStyle(state, string, layout, singleLineOnly, state.forceQuotes && !iskey, inblock);
	if (style === STYLE_PLAIN && !node.style.tagged && state.schema.resolveImplicitScalarTag(string).tag.tagName !== node.tag) return state.quoteStyle === "double" ? STYLE_DOUBLE : STYLE_SINGLE;
	return style;
}
function blockHeader(string, indentPerLevel) {
	const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
	const clip = string[string.length - 1] === "\n";
	return `${indentIndicator}${clip && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip ? "" : "-"}\n`;
}
function encodeFlowBreaks(string, indent) {
	let nextLF = string.indexOf("\n");
	if (nextLF === -1) return string;
	const pad = " ".repeat(indent);
	let result = string.slice(0, nextLF);
	const lineRe = /(\n+)([^\n]*)/g;
	lineRe.lastIndex = nextLF;
	let match;
	while (match = lineRe.exec(string)) {
		const breaks = match[1].length;
		const line = match[2];
		result += "\n".repeat(breaks + 1) + pad + line;
	}
	return result;
}
function dropEndingNewline(string) {
	return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function isMoreIndented(char) {
	return char === " " || char === "	";
}
function foldBlockScalar(string, width) {
	const lineRe = /(\n+)([^\n]*)/g;
	let nextLF = string.indexOf("\n");
	if (nextLF === -1) nextLF = string.length;
	lineRe.lastIndex = nextLF;
	let result = foldLine(string.slice(0, nextLF), width);
	let prevMoreIndented = string[0] === "\n" || isMoreIndented(string[0]);
	let moreIndented;
	let match;
	while (match = lineRe.exec(string)) {
		const prefix = match[1];
		const line = match[2];
		moreIndented = line !== "" && isMoreIndented(line[0]);
		result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
		prevMoreIndented = moreIndented;
	}
	return result;
}
function foldLine(line, width) {
	if (line === "" || isMoreIndented(line[0])) return line;
	const breakRe = / [^ \t]/g;
	let match;
	let start = 0;
	let end;
	let curr = 0;
	let next = 0;
	let result = "";
	while (match = breakRe.exec(line)) {
		next = match.index;
		if (next - start > width) {
			end = curr > start ? curr : next;
			result += `\n${line.slice(start, end)}`;
			start = end + 1;
		}
		curr = next;
	}
	result += "\n";
	if (line.length - start > width && curr > start) result += `${line.slice(start, curr)}\n${line.slice(curr + 1)}`;
	else result += line.slice(start);
	return result.slice(1);
}
function escapeString(string) {
	let result = "";
	let char = 0;
	for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
		char = codePointAt(string, i);
		const escapeSeq = ESCAPE_SEQUENCES[char];
		if (escapeSeq) {
			result += escapeSeq;
			continue;
		}
		if (isPrintable(char)) {
			result += string[i];
			if (char >= 65536) result += string[i + 1];
			continue;
		}
		result += encodeNonPrintable(char);
	}
	return result;
}
function writeFlowSequence(state, level, node) {
	let result = "";
	for (let index = 0, length = node.items.length; index < length; index += 1) {
		const item = writeNode(state, level, node.items[index], {});
		if (result !== "") result += `,${!state.flowSkipCommaSpace ? " " : ""}`;
		result += item;
	}
	const pad = state.flowBracketPadding && result !== "" ? " " : "";
	return `[${pad}${result}${pad}]`;
}
function writeBlockSequence(state, level, node, compact) {
	let result = "";
	for (let index = 0, length = node.items.length; index < length; index += 1) {
		const item = writeNode(state, level + 1, node.items[index], {
			block: true,
			compact: state.seqInlineFirst,
			isblockseq: true
		});
		if (!compact || result !== "") result += generateNextLine(state, level);
		if (item === "" || CHAR_LINE_FEED === item.charCodeAt(0)) result += "-";
		else result += "- ";
		result += item;
	}
	return result;
}
function writeFlowMapping(state, level, node) {
	let result = "";
	const items = sortMappingItems(state, node.items);
	for (const { key, value } of items) {
		let pairBuffer = "";
		if (result !== "") pairBuffer += `,${!state.flowSkipCommaSpace ? " " : ""}`;
		const keyText = writeNode(state, level, key, { iskey: true });
		const explicitPair = keyText.length > 1024;
		if (explicitPair) pairBuffer += "? ";
		else if (state.quoteFlowKeys) pairBuffer += "\"";
		const valueText = writeNode(state, level, value, {});
		const sep = state.flowSkipColonSpace || valueText === "" ? "" : " ";
		pairBuffer += `${keyText}${state.quoteFlowKeys && !explicitPair ? "\"" : ""}:${sep}${valueText}`;
		result += pairBuffer;
	}
	const pad = state.flowBracketPadding && result !== "" ? " " : "";
	return `{${pad}${result}${pad}}`;
}
function sortKeyValue(key) {
	return key.kind === "scalar" ? key.value : key;
}
function sortMappingItems(state, items) {
	if (!state.sortKeys) return items;
	const copy = items.slice();
	if (state.sortKeys === true) copy.sort((a, b) => {
		const x = sortKeyValue(a.key);
		const y = sortKeyValue(b.key);
		if (x < y) return -1;
		if (x > y) return 1;
		return 0;
	});
	else {
		const fn = state.sortKeys;
		copy.sort((a, b) => fn(sortKeyValue(a.key), sortKeyValue(b.key)));
	}
	return copy;
}
function writeBlockMapping(state, level, node, compact) {
	let result = "";
	const items = sortMappingItems(state, node.items);
	for (let index = 0, length = items.length; index < length; index += 1) {
		let pairBuffer = "";
		if (!compact || result !== "") pairBuffer += generateNextLine(state, level);
		const { key, value } = items[index];
		const keyIsBlock = (key.kind === "mapping" || key.kind === "sequence") && !key.style.flow && key.items.length !== 0 || key.kind === "scalar" && (key.style.literal || key.style.folded);
		const keyText = keyIsBlock ? writeNode(state, level + 1, key, {
			block: true,
			compact: true,
			isblockseq: !cannotBeCompact(state, key, level + 1)
		}) : writeNode(state, level + 1, key, {
			block: true,
			compact: true,
			iskey: true
		});
		const keyHasLineBreak = key.kind === "scalar" && key.value.indexOf("\n") !== -1;
		const explicitPair = keyIsBlock || keyHasLineBreak || keyText.length > 1024;
		if (explicitPair) if (keyText && CHAR_LINE_FEED === keyText.charCodeAt(0)) pairBuffer += "?";
		else pairBuffer += "? ";
		pairBuffer += keyText;
		if (explicitPair) pairBuffer += generateNextLine(state, level);
		const valueText = writeNode(state, level + 1, value, {
			block: true,
			compact: explicitPair,
			isblockseq: explicitPair && !cannotBeCompact(state, value, level + 1)
		});
		const keyIsBareProps = key.kind === "scalar" && key.value === "" && keyText !== "" && keyText.charCodeAt(keyText.length - 1) !== CHAR_SINGLE_QUOTE && keyText.charCodeAt(keyText.length - 1) !== CHAR_DOUBLE_QUOTE;
		const keyColonSep = !explicitPair && (key.kind === "alias" || keyIsBareProps) ? " " : "";
		if (valueText === "" || CHAR_LINE_FEED === valueText.charCodeAt(0)) pairBuffer += `${keyColonSep}:`;
		else pairBuffer += `${keyColonSep}: `;
		pairBuffer += valueText;
		result += pairBuffer;
	}
	return result;
}
function cannotBeCompact(state, node, level) {
	return node.style.tagged || node.anchor !== void 0 || state.indent < 2 && level > 0;
}
function writeNode(state, level, node, ctx) {
	if (node.kind === "alias") return `*${node.anchor}`;
	const { block = false, iskey = false, isblockseq = false } = ctx;
	let compact = ctx.compact ?? false;
	const hasAnchor = node.anchor !== void 0;
	if (cannotBeCompact(state, node, level)) compact = false;
	let body;
	let shouldPrintTag = node.style.tagged;
	const useBlockCollection = block && (node.kind === "mapping" || node.kind === "sequence") && !node.style.flow && node.items.length !== 0;
	if (node.kind === "mapping") if (useBlockCollection) body = writeBlockMapping(state, level, node, compact);
	else body = writeFlowMapping(state, level, node);
	else if (node.kind === "sequence") if (useBlockCollection) if (state.seqNoIndent && !isblockseq && level > 0) body = writeBlockSequence(state, level - 1, node, compact);
	else body = writeBlockSequence(state, level, node, compact);
	else body = writeFlowSequence(state, level, node);
	else {
		const layout = scalarLayout(state, level);
		const style = resolveScalarStyle(state, node, layout, iskey, block);
		body = renderScalarStyle(node.value, style, layout);
		shouldPrintTag = node.style.tagged || style !== STYLE_PLAIN && node.tag !== state.defaultScalarTagName;
	}
	if (useBlockCollection && compact && level > 0 && state.indent > 2) body = `${" ".repeat(state.indent - 2)}${body}`;
	if (shouldPrintTag || hasAnchor) {
		const props = [];
		const tag = shouldPrintTag ? nodeTagShort(node) : null;
		const anchor = hasAnchor ? `&${node.anchor}` : null;
		if (state.tagBeforeAnchor) {
			if (tag !== null) props.push(tag);
			if (anchor !== null) props.push(anchor);
		} else {
			if (anchor !== null) props.push(anchor);
			if (tag !== null) props.push(tag);
		}
		const sep = body === "" || body.charCodeAt(0) === CHAR_LINE_FEED ? "" : " ";
		body = `${props.join(" ")}${sep}${body}`;
	}
	return body;
}
function rootStartsOwnLine(node) {
	return (node.kind === "sequence" || node.kind === "mapping") && !node.style.flow && node.items.length !== 0 && !node.style.tagged && node.anchor === void 0;
}
function isOpenEnded(node) {
	let leaf = node;
	while ((leaf.kind === "sequence" || leaf.kind === "mapping") && !leaf.style.flow && leaf.items.length !== 0) leaf = leaf.kind === "sequence" ? leaf.items[leaf.items.length - 1] : leaf.items[leaf.items.length - 1].value;
	if (leaf.kind !== "scalar" || !(leaf.style.literal || leaf.style.folded)) return false;
	const { value } = leaf;
	return value.endsWith("\n\n") || value === "\n";
}
function writeDocumentDirectives(doc) {
	let result = "";
	for (const directive of doc.directives) {
		if (directive.kind === "yaml") {
			result += `%YAML ${directive.version}\n`;
			continue;
		}
		const { handle, prefix } = directive;
		result += `%TAG ${handle} ${prefix}\n`;
	}
	return result;
}
/**
* Build YAML from AST.
*
* @category AST
*/
function present(documents, options) {
	const state = createPresenterState(options);
	let result = "";
	let previousEnded = false;
	for (let index = 0; index < documents.length; index += 1) {
		const doc = documents[index];
		const directives = writeDocumentDirectives(doc);
		const hasDirectives = directives !== "";
		const marker = doc.explicitStart || hasDirectives || index > 0 && !previousEnded;
		result += directives;
		if (doc.contents === null) {
			if (marker) result += "---\n";
		} else if (marker) {
			const body = writeNode(state, 0, doc.contents, {
				block: true,
				compact: true
			});
			const sep = body === "" ? "" : hasDirectives || rootStartsOwnLine(doc.contents) ? "\n" : " ";
			result += `---${sep}${body}\n`;
		} else result += writeNode(state, 0, doc.contents, {
			block: true,
			compact: true
		}) + "\n";
		previousEnded = doc.explicitEnd || doc.contents !== null && isOpenEnded(doc.contents);
		if (previousEnded) result += "...\n";
	}
	return result;
}
/**
* Serializes JS object as a YAML document. By default it can dump every
* supported YAML type, so it throws an exception if you try to dump regexps or
* functions. However, you can disable exceptions by setting the
* {@link DumpOptions.skipInvalid} option to `true`.
*
* @category Main
*/
function dump(input, options = {}) {
	const opts = {
		...DEFAULT_DUMP_OPTIONS,
		...options
	};
	const documents = jsToAst(input, opts.schema, {
		noRefs: opts.noRefs,
		skipInvalid: opts.skipInvalid
	});
	if (opts.flowLevel >= 0) visit(documents, (node, ctx) => {
		if (ctx.depth < opts.flowLevel) return;
		node.style.flow = true;
		return VISIT_SKIP;
	});
	opts.transform(documents);
	return present(documents, {
		...pick(opts, Object.keys(DEFAULT_PRESENTER_OPTIONS)),
		schema: opts.schema
	});
}
var NOT_RESOLVED, strTag, NULL_VALUES$1, nullCoreTag, nullJsonTag, NULL_VALUES, nullYaml11Tag, TRUE_VALUES$2, FALSE_VALUES$2, boolCoreTag, TRUE_VALUES$1, FALSE_VALUES$1, boolJsonTag, TRUE_VALUES, FALSE_VALUES, boolYaml11Tag, YAML_INTEGER_IMPLICIT_PATTERN$1, YAML_INTEGER_EXPLICIT_PATTERN$1, intCoreTag, YAML_INTEGER_IMPLICIT_PATTERN, YAML_INTEGER_EXPLICIT_PATTERN, intJsonTag, YAML_INTEGER_PATTERN, intYaml11Tag, YAML_FLOAT_PATTERN$1, YAML_FLOAT_SPECIAL_PATTERN$1, floatCoreTag, YAML_FLOAT_IMPLICIT_PATTERN, YAML_FLOAT_EXPLICIT_PATTERN, floatJsonTag, YAML_FLOAT_PATTERN, YAML_FLOAT_SPECIAL_PATTERN, floatYaml11Tag, mergeTag, BASE64_PATTERN, binaryTag, YAML_DATE_REGEXP, YAML_TIMESTAMP_REGEXP, timestampTag, seqTag, omapTag, pairsTag, mapTag, setTag, Schema, FAILSAFE_SCHEMA, CORE_SCHEMA, YAML11_SCHEMA, DUMP_SCHEMA, DEFAULT_SNIPPET_OPTIONS, YAMLException, EVENT_ID, SCALAR_STYLE, COLLECTION_STYLE, CHOMPING_MODE, NO_RANGE$3, simpleEscapeCheck, simpleEscapeMap, DEFAULT_TAG_HANDLERS, NO_RANGE$2, MERGE_TAG_NAME, DEFAULT_CONSTRUCTOR_OPTIONS, NO_RANGE$1, HAS_OWN, CONTEXT_FLOW_IN, CONTEXT_FLOW_OUT, CONTEXT_BLOCK_IN, CONTEXT_BLOCK_OUT, PATTERN_NON_PRINTABLE, PATTERN_FLOW_INDICATORS, PATTERN_TAG_HANDLE, NS_URI_CHAR, NS_TAG_CHAR, PATTERN_TAG_URI, PATTERN_TAG_SUFFIX, PATTERN_TAG_PREFIX, DEFAULT_PARSER_OPTIONS, DEFAULT_LOAD_OPTIONS, Style, INVALID, VISIT_BREAK, VISIT_SKIP, CHAR_BOM, CHAR_TAB, CHAR_LINE_FEED, CHAR_CARRIAGE_RETURN, CHAR_SPACE, CHAR_EXCLAMATION, CHAR_DOUBLE_QUOTE, CHAR_SHARP, CHAR_PERCENT, CHAR_AMPERSAND, CHAR_SINGLE_QUOTE, CHAR_ASTERISK, CHAR_COMMA, CHAR_MINUS, CHAR_COLON, CHAR_EQUALS, CHAR_GREATER_THAN, CHAR_QUESTION, CHAR_COMMERCIAL_AT, CHAR_LEFT_SQUARE_BRACKET, CHAR_RIGHT_SQUARE_BRACKET, CHAR_GRAVE_ACCENT, CHAR_LEFT_CURLY_BRACKET, CHAR_VERTICAL_LINE, CHAR_RIGHT_CURLY_BRACKET, ESCAPE_SEQUENCES, DEFAULT_PRESENTER_OPTIONS, STYLE_PLAIN, STYLE_SINGLE, STYLE_LITERAL, STYLE_FOLDED, STYLE_DOUBLE, DEFAULT_DUMP_OPTIONS;
var init_js_yaml = __esmMin((() => {
	NOT_RESOLVED = Symbol("NOT_RESOLVED");
	strTag = defineScalarTag("tag:yaml.org,2002:str", {
		resolve: (source) => source,
		identify: (data) => typeof data === "string"
	});
	NULL_VALUES$1 = [
		"",
		"~",
		"null",
		"Null",
		"NULL"
	];
	nullCoreTag = defineScalarTag("tag:yaml.org,2002:null", {
		implicit: true,
		implicitFirstChars: [
			"",
			"~",
			"n",
			"N"
		],
		resolve: (source) => {
			if (NULL_VALUES$1.indexOf(source) !== -1) return null;
			return NOT_RESOLVED;
		},
		identify: (object) => object === null,
		represent: () => "null"
	});
	nullJsonTag = defineScalarTag("tag:yaml.org,2002:null", {
		implicit: true,
		implicitFirstChars: ["n"],
		resolve: (source, isExplicit) => {
			if (source === "null" || isExplicit && source === "") return null;
			return NOT_RESOLVED;
		},
		identify: (object) => object === null,
		represent: () => "null"
	});
	NULL_VALUES = [
		"",
		"~",
		"null",
		"Null",
		"NULL"
	];
	nullYaml11Tag = defineScalarTag("tag:yaml.org,2002:null", {
		implicit: true,
		implicitFirstChars: [
			"",
			"~",
			"n",
			"N"
		],
		resolve: (source) => {
			if (NULL_VALUES.indexOf(source) !== -1) return null;
			return NOT_RESOLVED;
		},
		identify: (object) => object === null,
		represent: () => "null"
	});
	TRUE_VALUES$2 = [
		"true",
		"True",
		"TRUE"
	];
	FALSE_VALUES$2 = [
		"false",
		"False",
		"FALSE"
	];
	boolCoreTag = defineScalarTag("tag:yaml.org,2002:bool", {
		implicit: true,
		implicitFirstChars: [
			"t",
			"T",
			"f",
			"F"
		],
		resolve: (source) => {
			if (TRUE_VALUES$2.indexOf(source) !== -1) return true;
			if (FALSE_VALUES$2.indexOf(source) !== -1) return false;
			return NOT_RESOLVED;
		},
		identify: (object) => Object.prototype.toString.call(object) === "[object Boolean]",
		represent: (object) => object ? "true" : "false"
	});
	TRUE_VALUES$1 = ["true"];
	FALSE_VALUES$1 = ["false"];
	boolJsonTag = defineScalarTag("tag:yaml.org,2002:bool", {
		implicit: true,
		implicitFirstChars: ["t", "f"],
		resolve: (source) => {
			if (TRUE_VALUES$1.indexOf(source) !== -1) return true;
			if (FALSE_VALUES$1.indexOf(source) !== -1) return false;
			return NOT_RESOLVED;
		},
		identify: (object) => Object.prototype.toString.call(object) === "[object Boolean]",
		represent: (object) => object ? "true" : "false"
	});
	TRUE_VALUES = [
		"true",
		"True",
		"TRUE",
		"y",
		"Y",
		"yes",
		"Yes",
		"YES",
		"on",
		"On",
		"ON"
	];
	FALSE_VALUES = [
		"false",
		"False",
		"FALSE",
		"n",
		"N",
		"no",
		"No",
		"NO",
		"off",
		"Off",
		"OFF"
	];
	boolYaml11Tag = defineScalarTag("tag:yaml.org,2002:bool", {
		implicit: true,
		implicitFirstChars: [
			"y",
			"Y",
			"n",
			"N",
			"t",
			"T",
			"f",
			"F",
			"o",
			"O"
		],
		resolve: (source) => {
			if (TRUE_VALUES.indexOf(source) !== -1) return true;
			if (FALSE_VALUES.indexOf(source) !== -1) return false;
			return NOT_RESOLVED;
		},
		identify: (object) => Object.prototype.toString.call(object) === "[object Boolean]",
		represent: (object) => object ? "true" : "false"
	});
	YAML_INTEGER_IMPLICIT_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:0o[0-7]+|0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
	YAML_INTEGER_EXPLICIT_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
	intCoreTag = defineScalarTag("tag:yaml.org,2002:int", {
		implicit: true,
		implicitFirstChars: [
			"-",
			"+",
			..."0123456789"
		],
		resolve: resolveYamlInteger$2,
		identify: (object) => Number.isInteger(object) && !Object.is(object, -0) && object.toString(10).indexOf("e") < 0,
		represent: (object) => object.toString(10)
	});
	YAML_INTEGER_IMPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^-?(?:0|[1-9][0-9]*)$");
	YAML_INTEGER_EXPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
	intJsonTag = defineScalarTag("tag:yaml.org,2002:int", {
		implicit: true,
		implicitFirstChars: ["-", ..."0123456789"],
		resolve: resolveYamlInteger$1,
		identify: (object) => Number.isInteger(object) && !Object.is(object, -0) && object.toString(10).indexOf("e") < 0,
		represent: (object) => object.toString(10)
	});
	YAML_INTEGER_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?0x[0-9a-fA-F_]+|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+|[-+]?(?:0|[1-9][0-9_]*))$");
	intYaml11Tag = defineScalarTag("tag:yaml.org,2002:int", {
		implicit: true,
		implicitFirstChars: [
			"-",
			"+",
			..."0123456789"
		],
		resolve: resolveYamlInteger,
		identify: (object) => Number.isInteger(object) && !Object.is(object, -0) && object.toString(10).indexOf("e") < 0,
		represent: (object) => object.toString(10)
	});
	YAML_FLOAT_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	YAML_FLOAT_SPECIAL_PATTERN$1 = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	floatCoreTag = defineScalarTag("tag:yaml.org,2002:float", {
		implicit: true,
		implicitFirstChars: [
			"-",
			"+",
			".",
			..."0123456789"
		],
		resolve: resolveYamlFloat$2,
		identify: (object) => typeof object === "number" && (!Number.isInteger(object) || Object.is(object, -0) || object.toString(10).indexOf("e") >= 0),
		represent: representYamlFloat$2
	});
	YAML_FLOAT_IMPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$");
	YAML_FLOAT_EXPLICIT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	floatJsonTag = defineScalarTag("tag:yaml.org,2002:float", {
		implicit: true,
		implicitFirstChars: ["-", ..."0123456789"],
		resolve: resolveYamlFloat$1,
		identify: (object) => typeof object === "number" && (!Number.isInteger(object) || Object.is(object, -0) || object.toString(10).indexOf("e") >= 0),
		represent: representYamlFloat$1
	});
	YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:(?:[0-9][0-9_]*)?\\.[0-9_]*)(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	floatYaml11Tag = defineScalarTag("tag:yaml.org,2002:float", {
		implicit: true,
		implicitFirstChars: [
			"-",
			"+",
			".",
			..."0123456789"
		],
		resolve: resolveYamlFloat,
		identify: (object) => typeof object === "number" && (!Number.isInteger(object) || Object.is(object, -0) || object.toString(10).indexOf("e") >= 0),
		represent: representYamlFloat
	});
	mergeTag = defineScalarTag("tag:yaml.org,2002:merge", {
		implicit: true,
		implicitFirstChars: ["<"],
		resolve: (source, isExplicit) => {
			if (source === "<<" || isExplicit && source === "") return "<<";
			return NOT_RESOLVED;
		},
		identify: () => false
	});
	BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
	binaryTag = defineScalarTag("tag:yaml.org,2002:binary", {
		resolve: resolveYamlBinary,
		identify: (object) => Object.prototype.toString.call(object) === "[object Uint8Array]",
		represent: representYamlBinary
	});
	YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
	YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
	timestampTag = defineScalarTag("tag:yaml.org,2002:timestamp", {
		implicit: true,
		implicitFirstChars: [..."0123456789"],
		resolve: resolveYamlTimestamp,
		identify: (object) => object instanceof Date,
		represent: (object) => object.toISOString()
	});
	seqTag = defineSequenceTag("tag:yaml.org,2002:seq", {
		create: () => [],
		addItem: (container, item) => {
			container.push(item);
		},
		identify: Array.isArray
	});
	omapTag = defineSequenceTag("tag:yaml.org,2002:omap", {
		create: () => ({
			list: [],
			seen: /* @__PURE__ */ new Set()
		}),
		addItem: (carrier, item) => {
			let key;
			if (item instanceof Map) {
				if (item.size !== 1) return "cannot resolve an ordered map item";
				key = item.keys().next().value;
			} else if (isPlainObject(item)) {
				const itemKeys = Object.keys(item);
				if (itemKeys.length !== 1) return "cannot resolve an ordered map item";
				key = itemKeys[0];
			} else return "cannot resolve an ordered map item";
			if (carrier.seen.has(key)) return "duplicate key in ordered map";
			carrier.seen.add(key);
			carrier.list.push(item);
			return "";
		},
		finalize: (carrier) => carrier.list,
		identify: () => false
	});
	pairsTag = defineSequenceTag("tag:yaml.org,2002:pairs", {
		create: () => [],
		addItem: (container, item) => {
			if (item instanceof Map) {
				if (item.size !== 1) return "cannot resolve a pairs item";
				container.push(item.entries().next().value);
				return "";
			}
			if (Object.prototype.toString.call(item) !== "[object Object]") return "cannot resolve a pairs item";
			const object = item;
			const keys = Object.keys(object);
			if (keys.length !== 1) return "cannot resolve a pairs item";
			container.push([keys[0], object[keys[0]]]);
			return "";
		},
		identify: () => false
	});
	mapTag = defineMappingTag("tag:yaml.org,2002:map", {
		create: () => ({}),
		identify: isPlainObject,
		represent: (o) => {
			const map = /* @__PURE__ */ new Map();
			for (const key of Object.keys(o)) map.set(key, o[key]);
			return map;
		},
		addPair: (container, key, value) => {
			if (key !== null && typeof key === "object") return "object-based map does not support complex keys";
			const normalizedKey = String(key);
			if (normalizedKey === "__proto__") Object.defineProperty(container, normalizedKey, {
				value,
				enumerable: true,
				configurable: true,
				writable: true
			});
			else container[normalizedKey] = value;
			return "";
		},
		has: (container, key) => {
			if (key !== null && typeof key === "object") return false;
			return Object.prototype.hasOwnProperty.call(container, String(key));
		},
		keys: (container) => Object.keys(container),
		get: (container, key) => {
			const normalizedKey = String(key);
			if (!Object.prototype.hasOwnProperty.call(container, normalizedKey)) return null;
			return container[normalizedKey];
		}
	});
	setTag = defineMappingTag("tag:yaml.org,2002:set", {
		create: () => /* @__PURE__ */ new Set(),
		identify: (data) => data instanceof Set,
		represent: (data) => {
			const map = /* @__PURE__ */ new Map();
			for (const key of data) map.set(key, null);
			return map;
		},
		addPair: (container, key, value) => {
			if (value !== null) return "cannot resolve a set item";
			container.add(key);
			return "";
		},
		has: (container, key) => container.has(key),
		keys: (container) => container.keys(),
		get: () => null
	});
	Schema = class Schema {
		tags;
		/** @internal */
		implicitScalarTags;
		/**
		* Dispatch implicit scalar resolvers by `source.charAt(0)`. Each bucket holds
		* the resolvers that may match that key, in schema order; a key absent from
		* the map uses
		* {@link Schema.implicitScalarAnyFirstChar}
		* (resolvers that declared no first-char constraint, so they apply to any
		* first character).
		*/
		implicitScalarByFirstChar;
		implicitScalarAnyFirstChar;
		/**
		* The default scalar tag (`!!str`), resolved once so the composer's fallback
		* for unresolved plain scalars avoids a keyed lookup per scalar.
		*
		* @internal
		*/
		defaultScalarTag;
		/**
		* The default container tags (`!!seq` / `!!map`), used by the dumper: when a
		* value is identified by its default tag, the tag is implicit and not
		* printed. Undefined if the schema does not define them (then such values
		* can't be dumped).
		*
		* @internal
		*/
		defaultSequenceTag;
		/** @internal */
		defaultMappingTag;
		exact;
		prefix;
		constructor(tags) {
			const compiledTags = compileTags(tags);
			const implicitScalarTags = [];
			const exact = createTagDefinitionMap();
			const prefix = createTagDefinitionListMap();
			for (const tag of compiledTags) {
				if (tag.nodeKind === "scalar" && tag.implicit) {
					if (tag.matchByTagPrefix) throw new Error("Implicit scalar tags cannot match by tag prefix");
					implicitScalarTags.push(tag);
				}
				switch (tag.nodeKind) {
					case "scalar":
						if (tag.matchByTagPrefix) prefix.scalar.push(tag);
						else exact.scalar[tag.tagName] = tag;
						break;
					case "sequence":
						if (tag.matchByTagPrefix) prefix.sequence.push(tag);
						else exact.sequence[tag.tagName] = tag;
						break;
					case "mapping": if (tag.matchByTagPrefix) prefix.mapping.push(tag);
					else exact.mapping[tag.tagName] = tag;
				}
			}
			const implicitScalarAnyFirstChar = implicitScalarTags.filter((tag) => tag.implicitFirstChars === null);
			const keys = /* @__PURE__ */ new Set();
			for (const tag of implicitScalarTags) if (tag.implicitFirstChars !== null) for (const key of tag.implicitFirstChars) keys.add(key);
			const implicitScalarByFirstChar = /* @__PURE__ */ new Map();
			for (const key of keys) implicitScalarByFirstChar.set(key, implicitScalarTags.filter((tag) => tag.implicitFirstChars === null || tag.implicitFirstChars.indexOf(key) !== -1));
			const defaultScalarTag = exact.scalar["tag:yaml.org,2002:str"];
			if (!defaultScalarTag) throw new Error("schema does not define the default scalar tag (tag:yaml.org,2002:str)");
			this.tags = compiledTags;
			this.implicitScalarTags = implicitScalarTags;
			this.implicitScalarByFirstChar = implicitScalarByFirstChar;
			this.implicitScalarAnyFirstChar = implicitScalarAnyFirstChar;
			this.defaultScalarTag = defaultScalarTag;
			this.defaultSequenceTag = exact.sequence["tag:yaml.org,2002:seq"];
			this.defaultMappingTag = exact.mapping["tag:yaml.org,2002:map"];
			this.exact = exact;
			this.prefix = prefix;
		}
		/** @internal */
		lookupScalarTag(tagName) {
			const exactTag = this.exact.scalar[tagName];
			if (exactTag) return exactTag;
			for (const tag of this.prefix.scalar) if (tagName.startsWith(tag.tagName)) return tag;
		}
		/** @internal */
		lookupSequenceTag(tagName) {
			const exactTag = this.exact.sequence[tagName];
			if (exactTag) return exactTag;
			for (const tag of this.prefix.sequence) if (tagName.startsWith(tag.tagName)) return tag;
		}
		/** @internal */
		lookupMappingTag(tagName) {
			const exactTag = this.exact.mapping[tagName];
			if (exactTag) return exactTag;
			for (const tag of this.prefix.mapping) if (tagName.startsWith(tag.tagName)) return tag;
		}
		/** @internal */
		resolveImplicitScalarTag(source) {
			const candidates = this.implicitScalarByFirstChar.get(source.charAt(0)) ?? this.implicitScalarAnyFirstChar;
			for (const tag of candidates) {
				const value = tag.resolve(source, false, tag.tagName);
				if (value !== NOT_RESOLVED) return {
					value,
					tag
				};
			}
			const tag = this.defaultScalarTag;
			return {
				value: tag.resolve(source, false, tag.tagName),
				tag
			};
		}
		/**
		* Creates a new schema with the specified tags added. If a tag already
		* exists, it is replaced by the specified tag.
		*
		* @example
		*
		* ```javascript
		* import { CORE_SCHEMA, mergeTag, realMapTag } from 'js-yaml'
		*
		* const schema = CORE_SCHEMA.withTags(mergeTag, realMapTag)
		* ```
		*/
		withTags(...tags) {
			let flatTags = [];
			for (const tag of tags) flatTags = flatTags.concat(tag);
			return new Schema([...this.tags, ...flatTags]);
		}
	};
	FAILSAFE_SCHEMA = new Schema([
		strTag,
		seqTag,
		mapTag
	]);
	new Schema([
		...FAILSAFE_SCHEMA.tags,
		nullJsonTag,
		boolJsonTag,
		intJsonTag,
		floatJsonTag
	]);
	CORE_SCHEMA = new Schema([
		...FAILSAFE_SCHEMA.tags,
		nullCoreTag,
		boolCoreTag,
		intCoreTag,
		floatCoreTag
	]);
	YAML11_SCHEMA = new Schema([
		...FAILSAFE_SCHEMA.tags,
		nullYaml11Tag,
		boolYaml11Tag,
		intYaml11Tag,
		floatYaml11Tag,
		timestampTag,
		mergeTag,
		binaryTag,
		omapTag,
		pairsTag,
		setTag
	]);
	DUMP_SCHEMA = YAML11_SCHEMA.withTags({
		...intYaml11Tag,
		resolve: (source, isExplicit, tagName) => {
			const result = intYaml11Tag.resolve(source, isExplicit, tagName);
			return result === NOT_RESOLVED ? intCoreTag.resolve(source, isExplicit, tagName) : result;
		}
	}, {
		...floatYaml11Tag,
		resolve: (source, isExplicit, tagName) => {
			const result = floatYaml11Tag.resolve(source, isExplicit, tagName);
			return result === NOT_RESOLVED ? floatCoreTag.resolve(source, isExplicit, tagName) : result;
		}
	});
	defineMappingTag("tag:yaml.org,2002:map", {
		create: () => /* @__PURE__ */ new Map(),
		addPair: (container, key, value) => {
			container.set(key, value);
			return "";
		},
		has: (container, key) => container.has(key),
		keys: (container) => container.keys(),
		get: (container, key) => container.get(key),
		identify: (data) => data instanceof Map || isPlainObject(data),
		represent: (data) => {
			if (data instanceof Map) return data;
			const map = /* @__PURE__ */ new Map();
			const obj = data;
			for (const key of Object.keys(obj)) map.set(key, obj[key]);
			return map;
		}
	});
	defineMappingTag("tag:yaml.org,2002:map", {
		create: () => ({}),
		identify: isPlainObject,
		represent: (o) => {
			const map = /* @__PURE__ */ new Map();
			for (const key of Object.keys(o)) map.set(key, o[key]);
			return map;
		},
		addPair: (container, key, value) => {
			const normalizedKey = normalizeKey(key);
			if (normalizedKey === null) return "nested arrays are not supported inside keys";
			if (normalizedKey === "__proto__") Object.defineProperty(container, normalizedKey, {
				value,
				enumerable: true,
				configurable: true,
				writable: true
			});
			else container[normalizedKey] = value;
			return "";
		},
		has: (container, key) => {
			const normalizedKey = normalizeKey(key);
			return normalizedKey !== null && Object.prototype.hasOwnProperty.call(container, normalizedKey);
		},
		keys: (container) => Object.keys(container),
		get: (container, key) => {
			const normalizedKey = String(key);
			if (!Object.prototype.hasOwnProperty.call(container, normalizedKey)) return null;
			return container[normalizedKey];
		}
	});
	DEFAULT_SNIPPET_OPTIONS = {
		maxLength: 79,
		indent: 1,
		linesBefore: 3,
		linesAfter: 2
	};
	YAMLException = class YAMLException extends Error {
		reason;
		mark;
		/**
		* Optional `mark` contains source snippet data. Usually, use
		* {@link YAMLException.throwAt} instead of passing it directly.
		*/
		constructor(reason, mark) {
			super();
			this.name = "YAMLException";
			this.reason = reason;
			this.mark = mark;
			this.message = formatError(this, false);
			if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
		}
		/**
		* Returns the formatted error, omitting the source snippet in compact mode.
		*/
		toString(compact) {
			return `${this.name}: ${formatError(this, compact)}`;
		}
		/**
		* Builds a YAMLException with a source snippet and throws it. `source` is
		* the raw input text; `position` is an offset into it.
		*/
		static throwAt(source, position, message, filename = "") {
			let line = 0;
			let lineStart = 0;
			for (let index = 0; index < position; index++) {
				const ch = source.charCodeAt(index);
				if (ch === 10) {
					line++;
					lineStart = index + 1;
				} else if (ch === 13) {
					line++;
					if (source.charCodeAt(index + 1) === 10) index++;
					lineStart = index + 1;
				}
			}
			const mark = {
				name: filename,
				buffer: source,
				position,
				line,
				column: position - lineStart
			};
			mark.snippet = makeSnippet(mark);
			throw new YAMLException(message, mark);
		}
	};
	EVENT_ID = {
		DOCUMENT: 1,
		SEQUENCE: 2,
		MAPPING: 3,
		SCALAR: 4,
		ALIAS: 5,
		POP: 6
	};
	SCALAR_STYLE = {
		PLAIN: 1,
		SINGLE_QUOTED: 2,
		DOUBLE_QUOTED: 3,
		LITERAL_BLOCK: 4,
		FOLDED_BLOCK: 5
	};
	COLLECTION_STYLE = {
		BLOCK: 1,
		FLOW: 2
	};
	CHOMPING_MODE = {
		CLIP: 1,
		STRIP: 2,
		KEEP: 3
	};
	NO_RANGE$3 = -1;
	simpleEscapeCheck = new Array(256);
	simpleEscapeMap = new Array(256);
	for (let i = 0; i < 256; i++) {
		simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
		simpleEscapeMap[i] = simpleEscapeSequence(i);
	}
	DEFAULT_TAG_HANDLERS = Object.assign(Object.create(null), {
		"!": "!",
		"!!": "tag:yaml.org,2002:"
	});
	NO_RANGE$2 = -1;
	MERGE_TAG_NAME = "tag:yaml.org,2002:merge";
	DEFAULT_CONSTRUCTOR_OPTIONS = {
		filename: "",
		schema: CORE_SCHEMA,
		json: false,
		maxTotalMergeKeys: 1e4,
		maxAliases: -1
	};
	NO_RANGE$1 = -1;
	HAS_OWN = Object.prototype.hasOwnProperty;
	CONTEXT_FLOW_IN = 1;
	CONTEXT_FLOW_OUT = 2;
	CONTEXT_BLOCK_IN = 3;
	CONTEXT_BLOCK_OUT = 4;
	PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
	PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
	PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
	NS_URI_CHAR = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$,_.!~*'()\[\]])`;
	NS_TAG_CHAR = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$.~*'()_])`;
	PATTERN_TAG_URI = new RegExp(`^(?:${NS_URI_CHAR})*$`);
	PATTERN_TAG_SUFFIX = new RegExp(`^(?:${NS_TAG_CHAR})+$`);
	PATTERN_TAG_PREFIX = new RegExp(`^(?:!(?:${NS_URI_CHAR})*|${NS_TAG_CHAR}(?:${NS_URI_CHAR})*)$`);
	DEFAULT_PARSER_OPTIONS = {
		filename: "",
		maxDepth: 100
	};
	DEFAULT_LOAD_OPTIONS = {
		...DEFAULT_PARSER_OPTIONS,
		...DEFAULT_CONSTRUCTOR_OPTIONS
	};
	Style = class {
		/** Whether to print the node's tag explicitly. */
		tagged = false;
		flow = false;
		singleQuoted = false;
		doubleQuoted = false;
		literal = false;
		folded = false;
	};
	INVALID = Symbol("INVALID");
	VISIT_BREAK = Symbol("visit:break");
	VISIT_SKIP = Symbol("visit:skip");
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
	DEFAULT_PRESENTER_OPTIONS = {
		indent: 2,
		seqNoIndent: false,
		seqInlineFirst: true,
		sortKeys: false,
		lineWidth: 80,
		flowBracketPadding: false,
		flowSkipCommaSpace: false,
		flowSkipColonSpace: false,
		quoteFlowKeys: false,
		quoteStyle: "single",
		forceQuotes: false,
		tagBeforeAnchor: false
	};
	STYLE_PLAIN = 1;
	STYLE_SINGLE = 2;
	STYLE_LITERAL = 3;
	STYLE_FOLDED = 4;
	STYLE_DOUBLE = 5;
	DEFAULT_DUMP_OPTIONS = {
		...DEFAULT_PRESENTER_OPTIONS,
		schema: DUMP_SCHEMA,
		skipInvalid: false,
		noRefs: false,
		flowLevel: -1,
		transform: () => {}
	};
	EVENT_ID.DOCUMENT;
	EVENT_ID.SEQUENCE;
	EVENT_ID.MAPPING;
	EVENT_ID.SCALAR;
	EVENT_ID.ALIAS;
	EVENT_ID.POP;
	SCALAR_STYLE.PLAIN;
	SCALAR_STYLE.SINGLE_QUOTED;
	SCALAR_STYLE.DOUBLE_QUOTED;
	SCALAR_STYLE.LITERAL_BLOCK;
	SCALAR_STYLE.FOLDED_BLOCK;
	COLLECTION_STYLE.BLOCK;
	COLLECTION_STYLE.FLOW;
	CHOMPING_MODE.CLIP;
	CHOMPING_MODE.STRIP;
	CHOMPING_MODE.KEEP;
}));
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
	const home_env = env("FREDDIE_HOME");
	if (home_env) {
		_cached = home_env;
		ensure(home_env);
		return home_env;
	}
	const profile = env("FREDDIE_PROFILE");
	const root = path.join(os.homedir(), ".freddie");
	const home = profile ? path.join(root, "profiles", profile) : root;
	_cached = home;
	ensure(home);
	return home;
}
function displayFreddieHome() {
	const profile = env("FREDDIE_PROFILE");
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
	if (env("FREDDIE_PROFILES_ROOT")) return env("FREDDIE_PROFILES_ROOT");
	if (env("FREDDIE_HOME")) return path.join(env("FREDDIE_HOME"), "profiles");
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
	init_env();
	_cached = null;
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
	const raw = load$1(fs.readFileSync(p, "utf8")) || {};
	return migrate(deepMerge(clone(DEFAULT_CONFIG), raw));
}
function saveConfig(cfg) {
	fs.mkdirSync(path.dirname(configPath()), { recursive: true });
	fs.writeFileSync(configPath(), dump(cfg, { lineWidth: 100 }), "utf8");
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
	return fs.existsSync(p) ? load$1(fs.readFileSync(p, "utf8")) || {} : {};
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
var init_config$1 = __esmMin((() => {
	init_js_yaml();
	init_home();
	DEFAULT_CONFIG = {
		_config_version: 5,
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
			discovered_models: {},
			plan_mode: {
				enabled: true,
				auto_approve: false
			},
			approval_policy: {
				yolo: false,
				afk: false,
				auto_approve: []
			},
			thinking: {
				enabled: false,
				budget: null
			},
			max_context_size: null,
			compaction_trigger_ratio: .85,
			reserved_context_size: 5e4,
			max_steps_per_turn: 1e3,
			max_retries_per_step: 3,
			subagent: {
				default_model: null,
				max_depth: 3
			}
		},
		memory: { provider: null },
		skills: { config: {} },
		hooks: {
			PreToolUse: [],
			PostToolUse: [],
			UserPromptSubmit: [],
			Stop: [],
			SessionStart: [],
			SessionEnd: [],
			SubagentStart: [],
			SubagentStop: [],
			PreCompact: [],
			PostCompact: [],
			Notification: []
		},
		terminal: {
			cwd: null,
			command_prefix: "",
			scrub_provider_env: false
		},
		telemetry: {
			enabled: false,
			endpoint: null
		},
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
		},
		4: (cfg) => {
			if (!cfg.hooks) cfg.hooks = DEFAULT_CONFIG.hooks;
			return cfg;
		}
	};
}));
//#endregion
//#region src/utils.js
init_config$1();
var SECRET_PATTERNS = [
	/sk-[A-Za-z0-9-_]{20,}/g,
	/ghp_[A-Za-z0-9]{36}/g,
	/xox[baprs]-[A-Za-z0-9-]{10,}/g,
	/AKIA[0-9A-Z]{16}/g,
	/[a-zA-Z0-9._%+-]+:[^@\s]+@[a-zA-Z0-9.-]+/g,
	/Bearer\s+[A-Za-z0-9._-]+/gi
];
function redactSecret(s) {
	let out = String(s);
	for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
	return out;
}
function ansiStrip(s) {
	return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}
//#endregion
//#region src/host/tool-middleware.js
init_home();
var DANGEROUS_PARAM_NAMES = /* @__PURE__ */ new Set([
	"eval",
	"exec",
	"__proto__",
	"constructor"
]);
function sanitizeSchema(schema) {
	if (!schema || typeof schema !== "object") return schema;
	const out = JSON.parse(JSON.stringify(schema));
	if (out.parameters?.properties) {
		for (const k of Object.keys(out.parameters.properties)) if (DANGEROUS_PARAM_NAMES.has(k)) delete out.parameters.properties[k];
	}
	return out;
}
function stripAnsi(text) {
	return ansiStrip(text);
}
var HEAP_SHRINK_THRESHOLD_PCT = 80;
var HEAP_SHRINK_FACTOR = .5;
function dynamicLimit(base) {
	const mem = process.memoryUsage();
	if (mem.heapUsed / mem.heapTotal * 100 < HEAP_SHRINK_THRESHOLD_PCT) return base;
	return Math.floor(base * HEAP_SHRINK_FACTOR);
}
function truncate(s, max = null) {
	const limit = dynamicLimit(max ?? getConfigValue("tool.output_limit", 1e5));
	const t = String(s);
	if (t.length <= limit) return t;
	return t.slice(0, limit) + `\n…[truncated ${t.length - limit} chars]`;
}
function resultsDir() {
	const d = path.join(getFreddieHome(), "tool-results");
	fs.mkdirSync(d, { recursive: true });
	return d;
}
function storeToolResult(content) {
	const token = crypto$1.randomBytes(8).toString("hex");
	fs.writeFileSync(path.join(resultsDir(), token + ".txt"), content || "", "utf8");
	return {
		token,
		bytes: (content || "").length
	};
}
function applyPostCall(text) {
	let out = stripAnsi(text);
	const limit = getConfigValue("tool.output_limit", 1e5);
	if (out.length > limit) {
		const { token } = storeToolResult(out);
		out = truncate(out, limit) + `\n…[full output stored: tool_result token=${token}]`;
	}
	return out;
}
function applyToolMiddleware(toolCall, result) {
	return applyPostCall(result);
}
//#endregion
//#region src/host/env-scope.js
function envVarAllowed(name, allowPatterns) {
	if (!allowPatterns || !allowPatterns.length) return true;
	return allowPatterns.includes(name);
}
function makeScopedEnvReader(resources, pluginName, toolName, logger, realEnv) {
	return (name) => {
		if (resources?.env_vars !== void 0 && !envVarAllowed(name, resources.env_vars)) {
			logger?.warn?.(`capability manifest denied env read for tool '${toolName}'`, {
				plugin: pluginName,
				tool: toolName,
				name
			});
			throw new Error(`plugin '${pluginName}' tool '${toolName}': env var '${name}' not in declared env_vars allowlist [${(resources.env_vars || []).join(", ")}]`);
		}
		return realEnv[name];
	};
}
//#endregion
//#region src/host/pii-scan.js
var PII_PATTERNS = [
	{
		kind: "ssn",
		re: /\b\d{3}-\d{2}-\d{4}\b/g
	},
	{
		kind: "email",
		re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g
	},
	{
		kind: "credit_card",
		re: /\b(?:\d[ -]?){13,19}\b/g
	}
];
function luhnValid(digits) {
	let sum = 0, alt = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = digits.charCodeAt(i) - 48;
		if (alt) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
		alt = !alt;
	}
	return digits.length >= 13 && sum % 10 === 0;
}
function scanForPII(text) {
	if (typeof text !== "string" || !text) return [];
	const hits = [];
	for (const { kind, re } of PII_PATTERNS) {
		re.lastIndex = 0;
		let m;
		while (m = re.exec(text)) if (kind === "credit_card") {
			const digits = m[0].replace(/[ -]/g, "");
			if (!luhnValid(digits)) continue;
			hits.push({
				kind,
				sample: `${digits.slice(0, 4)}...${digits.slice(-4)}`
			});
		} else {
			const raw = m[0];
			hits.push({
				kind,
				sample: kind === "email" ? `${raw[0]}***@***` : `***-**-${raw.slice(-4)}`
			});
		}
	}
	return hits;
}
function enforcePII(resources, pluginName, toolName, logger, { argsText, resultText }) {
	const mode = resources?.pii;
	if (mode !== "log" && mode !== "block") return;
	const hits = [...scanForPII(argsText).map((h) => ({
		...h,
		where: "args"
	})), ...scanForPII(resultText).map((h) => ({
		...h,
		where: "result"
	}))];
	if (!hits.length) return;
	logger?.warn?.(`PII-shaped data detected in tool '${toolName}'`, {
		plugin: pluginName,
		tool: toolName,
		hits
	});
	if (mode === "block") throw new Error(`plugin '${pluginName}' tool '${toolName}': PII-shaped data (${hits.map((h) => h.kind).join(", ")}) blocked by capability manifest (resources.pii: 'block')`);
}
//#endregion
//#region src/host/resource-guards.js
var FORBIDDEN_PATH_SUBSTRINGS = [
	"/etc/passwd",
	"/etc/shadow",
	"/.ssh/",
	"/.aws/",
	"C:\\Windows\\System32"
];
function resolveAsFarAsPossible(abs) {
	let cur = abs;
	for (let i = 0; i < 64; i++) try {
		return fs.realpathSync.native ? fs.realpathSync.native(cur) : fs.realpathSync(cur);
	} catch {
		const parent = path.dirname(cur);
		if (parent === cur) return abs;
		cur = parent;
	}
	return abs;
}
function containedIn(abs, root) {
	const rel = path.relative(root, abs);
	return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
}
function pathAllowed(candidate, allowPatterns, { cwd = process.cwd() } = {}) {
	const rawStr = String(candidate ?? "");
	if (rawStr.includes("\0")) return {
		ok: false,
		reason: "null byte in path"
	};
	const abs = path.resolve(cwd, rawStr);
	for (const bad of FORBIDDEN_PATH_SUBSTRINGS) if (abs.includes(bad)) return {
		ok: false,
		reason: `forbidden: ${bad}`
	};
	if (!allowPatterns || !allowPatterns.length) return {
		ok: true,
		abs
	};
	const resolved = resolveAsFarAsPossible(abs);
	for (const pattern of allowPatterns) {
		const root = path.resolve(cwd, pattern.replace(/\/\*\*?$/, ""));
		if (containedIn(abs, root) && containedIn(resolved, root)) return {
			ok: true,
			abs
		};
	}
	return {
		ok: false,
		reason: `path '${abs}' (resolved '${resolved}') not in declared fs_paths allowlist [${allowPatterns.join(", ")}]`
	};
}
function hostAllowed(hostname, allowPatterns) {
	if (!allowPatterns || !allowPatterns.length) return true;
	for (const pattern of allowPatterns) {
		if (pattern === hostname) return true;
		if (pattern.startsWith("*.") && hostname.endsWith(pattern.slice(1))) return true;
	}
	return false;
}
//#endregion
//#region src/host/resource-enforcement.js
var fsCjs = createRequire(import.meta.url)("fs");
async function withResourceEnforcement(resources, pluginName, toolName, logger, fn) {
	if (!resources) return fn();
	const denials = [];
	const deny = (kind, detail) => {
		const entry = {
			kind,
			detail,
			plugin: pluginName,
			tool: toolName
		};
		denials.push(entry);
		logger?.warn?.(`capability manifest denied ${kind} for tool '${toolName}'`, entry);
		throw new Error(`plugin '${pluginName}' tool '${toolName}': ${kind} access denied by capability manifest -- ${detail}`);
	};
	const realFetch = globalThis.fetch;
	const patchedFetch = resources.network_hosts !== void 0 ? async (input, init) => {
		const url = typeof input === "string" ? input : input?.url;
		let hostname;
		try {
			hostname = new URL(url, "http://localhost").hostname;
		} catch {
			hostname = null;
		}
		if (hostname && !hostAllowed(hostname, resources.network_hosts)) deny("network", `host '${hostname}' not in declared network_hosts allowlist [${resources.network_hosts.join(", ")}]`);
		return realFetch(input, init);
	} : null;
	const realWebSocket = globalThis.WebSocket;
	const patchedWebSocket = resources.network_hosts !== void 0 && realWebSocket ? new Proxy(realWebSocket, { construct(target, args) {
		const address = args[0];
		const url = typeof address === "string" ? address : address?.url ?? address?.toString?.();
		let hostname;
		try {
			hostname = new URL(url).hostname;
		} catch {
			hostname = null;
		}
		if (hostname && !hostAllowed(hostname, resources.network_hosts)) deny("network", `WebSocket host '${hostname}' not in declared network_hosts allowlist [${resources.network_hosts.join(", ")}]`);
		return Reflect.construct(target, args);
	} }) : null;
	const realWriteFileSync = fsCjs.writeFileSync;
	const realReadFileSync = fsCjs.readFileSync;
	const patchFs = resources.fs_paths !== void 0;
	const checkPath = (p) => {
		const r = pathAllowed(p, resources.fs_paths);
		if (!r.ok) deny("fs", r.reason);
		return r;
	};
	if (patchedFetch) globalThis.fetch = patchedFetch;
	if (patchedWebSocket) globalThis.WebSocket = patchedWebSocket;
	if (patchFs) {
		fsCjs.writeFileSync = (p, ...rest) => {
			checkPath(p);
			return realWriteFileSync.call(fsCjs, p, ...rest);
		};
		fsCjs.readFileSync = (p, ...rest) => {
			if (typeof p === "string" || p instanceof URL || Buffer.isBuffer(p)) checkPath(p);
			return realReadFileSync.call(fsCjs, p, ...rest);
		};
	}
	try {
		return await fn();
	} finally {
		if (patchedFetch) globalThis.fetch = realFetch;
		if (patchedWebSocket) globalThis.WebSocket = realWebSocket;
		if (patchFs) {
			fsCjs.writeFileSync = realWriteFileSync;
			fsCjs.readFileSync = realReadFileSync;
		}
	}
}
function readManifestResources(dir) {
	const manifestPath = path.join(dir, "plugin.json");
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(manifestPath, "utf8")).resources || null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/auth.js
var auth_exports = /* @__PURE__ */ __exportAll({
	clearProviderAuth: () => clearProviderAuth,
	decodeJwtClaims: () => decodeJwtClaims,
	envForProvider: () => envForProvider,
	extraEnvForProvider: () => extraEnvForProvider,
	getAuthStore: () => getAuthStore,
	getProviderAuthState: () => getProviderAuthState,
	hasUsableSecret: () => hasUsableSecret,
	isExpiring: () => isExpiring,
	isKnownAuthProvider: () => isKnownAuthProvider,
	listAuthProviders: () => listAuthProviders,
	listKnownEnvVars: () => listKnownEnvVars,
	redactSecrets: () => redactSecrets,
	resetAuthStoreForTests: () => resetAuthStoreForTests,
	tokenFingerprint: () => tokenFingerprint
});
function getAuthStore() {
	if (!_store) _store = new FileAuthStore();
	return _store;
}
function resetAuthStoreForTests() {
	_store = null;
}
function isKnownAuthProvider(name) {
	return PROVIDERS.includes(name);
}
function listAuthProviders() {
	return [...PROVIDERS];
}
function envForProvider(name) {
	return ENV_OF[name] || null;
}
function extraEnvForProvider(name) {
	return EXTRA_ENV_OF[name] ? [...EXTRA_ENV_OF[name]] : [];
}
function listKnownEnvVars() {
	return [.../* @__PURE__ */ new Set([...Object.values(ENV_OF), ...Object.values(EXTRA_ENV_OF).flat()])];
}
async function envVarUsable(name) {
	if (process.env[name]) return true;
	const cred = await getAuthStore().getCredential(name);
	return Boolean(cred?.value);
}
async function hasUsableSecret(provider) {
	const env = envForProvider(provider);
	if (!env) return false;
	if (!await envVarUsable(env)) return false;
	for (const extra of extraEnvForProvider(provider)) if (!await envVarUsable(extra)) return false;
	return true;
}
async function clearProviderAuth(provider) {
	const env = envForProvider(provider);
	if (!env) return false;
	await getAuthStore().deleteCredential(env);
	for (const extra of extraEnvForProvider(provider)) await getAuthStore().deleteCredential(extra);
	return true;
}
function isExpiring(token, { skewSeconds = 60 } = {}) {
	if (!token || typeof token !== "object") return true;
	const exp = token.expires_at || token.exp;
	if (!exp) return false;
	const now = Math.floor(Date.now() / 1e3);
	return (typeof exp === "string" ? Math.floor(new Date(exp).getTime() / 1e3) : exp) - now < skewSeconds;
}
function decodeJwtClaims(jwt) {
	if (typeof jwt !== "string") return null;
	const parts = jwt.split(".");
	if (parts.length < 2) return null;
	try {
		return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
	} catch {
		return null;
	}
}
function tokenFingerprint(token) {
	const s = typeof token === "string" ? token : token?.access_token || token?.value || "";
	if (!s) return "";
	return s.slice(0, 4) + "…" + s.slice(-4);
}
async function getProviderAuthState(provider) {
	const extras = extraEnvForProvider(provider);
	return {
		provider,
		env: envForProvider(provider),
		extraEnv: extras.length ? extras : void 0,
		hasSecret: await hasUsableSecret(provider)
	};
}
function redactSecrets(input) {
	const known = [...KNOWN_SECRET_VALUES()];
	const embeddable = known.filter((v) => v.length >= 8);
	const redactEmbedded = (s) => {
		let out = s;
		for (const secret of embeddable) if (out.includes(secret)) out = out.split(secret).join(tokenFingerprint(secret));
		return out;
	};
	const maskAllStrings = (node, depth) => {
		if (depth > MAX_REDACT_DEPTH) return "[redacted: max depth exceeded]";
		if (typeof node === "string") return node ? tokenFingerprint(node) : node;
		if (Array.isArray(node)) return node.map((v) => maskAllStrings(v, depth + 1));
		if (node && typeof node === "object") {
			const out = {};
			for (const [k, v] of Object.entries(node)) out[k] = maskAllStrings(v, depth + 1);
			return out;
		}
		return node;
	};
	const walk = (node, keyHint, depth) => {
		if (depth > MAX_REDACT_DEPTH) return "[redacted: max depth exceeded]";
		if (keyHint && SECRET_FIELD_NAMES.has(String(keyHint).toLowerCase())) return maskAllStrings(node, depth);
		if (typeof node === "string") {
			if (known.includes(node)) return tokenFingerprint(node);
			return redactEmbedded(node);
		}
		if (Array.isArray(node)) return node.map((v) => walk(v, keyHint, depth + 1));
		if (node && typeof node === "object") {
			const out = {};
			for (const [k, v] of Object.entries(node)) out[k] = walk(v, k, depth + 1);
			return out;
		}
		return node;
	};
	return walk(input, null, 0);
}
var FileAuthStore, _store, PROVIDERS, ENV_OF, EXTRA_ENV_OF, SECRET_FIELD_NAMES, KNOWN_SECRET_VALUES, MAX_REDACT_DEPTH;
var init_auth = __esmMin((() => {
	init_home();
	FileAuthStore = class {
		constructor() {
			this.dir = path.join(getFreddieHome(), "auth");
			fs.mkdirSync(this.dir, { recursive: true });
		}
		_path(name) {
			const resolvedPath = path.join(this.dir, name + ".json");
			if (resolvedPath !== this.dir && !resolvedPath.startsWith(this.dir + path.sep)) throw new Error(`Path traversal attempt: resolved path ${resolvedPath} is not within ${this.dir}`);
			return resolvedPath;
		}
		async setCredential(name, value) {
			fs.writeFileSync(this._path(name), JSON.stringify({
				name,
				value,
				updated: Date.now()
			}), {
				encoding: "utf8",
				mode: 384
			});
			return {
				name,
				stored: true
			};
		}
		async getCredential(name) {
			const p = this._path(name);
			if (!fs.existsSync(p)) return null;
			return JSON.parse(fs.readFileSync(p, "utf8"));
		}
		async listCredentials() {
			return fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
		}
		async deleteCredential(name) {
			const p = this._path(name);
			if (fs.existsSync(p)) fs.unlinkSync(p);
			return {
				name,
				deleted: true
			};
		}
	};
	_store = null;
	PROVIDERS = [
		"anthropic",
		"openai",
		"groq",
		"openrouter",
		"xai",
		"gemini",
		"bedrock",
		"codex",
		"kimi",
		"zai",
		"deepseek",
		"mistral",
		"perplexity"
	];
	ENV_OF = {
		anthropic: "ANTHROPIC_API_KEY",
		openai: "OPENAI_API_KEY",
		groq: "GROQ_API_KEY",
		openrouter: "OPENROUTER_API_KEY",
		xai: "XAI_API_KEY",
		gemini: "GEMINI_API_KEY",
		bedrock: "AWS_ACCESS_KEY_ID",
		codex: "OPENAI_API_KEY",
		kimi: "KIMI_API_KEY",
		zai: "ZAI_API_KEY",
		deepseek: "DEEPSEEK_API_KEY",
		mistral: "MISTRAL_API_KEY",
		perplexity: "PERPLEXITY_API_KEY"
	};
	EXTRA_ENV_OF = { bedrock: ["AWS_SECRET_ACCESS_KEY"] };
	SECRET_FIELD_NAMES = /* @__PURE__ */ new Set([
		"value",
		"credential",
		"apikey",
		"api_key",
		"token",
		"secret",
		"password",
		"auth_token"
	]);
	KNOWN_SECRET_VALUES = () => new Set(listKnownEnvVars().map((envVar) => process.env[envVar]).filter(Boolean));
	MAX_REDACT_DEPTH = 64;
}));
//#endregion
//#region src/observability/log.js
function streamFor(name) {
	if (_streams.has(name)) return _streams.get(name);
	const dir = path.join(getFreddieHome(), "logs");
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch {}
	let s;
	if (typeof fs.createWriteStream === "function") s = fs.createWriteStream(path.join(dir, `${name}.log`), { flags: "a" });
	else s = {
		write(line) {
			try {
				console.log("[" + name + "]", line.trim());
			} catch {}
		},
		end() {}
	};
	_streams.set(name, s);
	return s;
}
function log({ subsystem = "app", severity = "info", msg = "", ...rest }) {
	const ts = (/* @__PURE__ */ new Date()).toISOString();
	const redactedRest = redactSecrets(rest);
	const redactedMsg = typeof msg === "string" ? redactSecrets(msg) : msg;
	const rec = {
		ts,
		subsystem,
		severity,
		msg: redactedMsg,
		...redactedRest
	};
	let line;
	try {
		line = JSON.stringify(rec) + "\n";
	} catch (e) {
		line = JSON.stringify({
			ts,
			subsystem,
			severity,
			msg: redactedMsg,
			logSerializationError: String(e?.message || e)
		}) + "\n";
	}
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
var SEVERITIES, _streams;
var init_log = __esmMin((() => {
	init_home();
	init_auth();
	SEVERITIES = {
		debug: 10,
		info: 20,
		warning: 30,
		error: 40
	};
	_streams = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/host/cc-integration.js
init_env();
init_log();
var hookLog = logger("cc-hooks");
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
		off(name, fn) {
			const l = reg2[name];
			if (!l) return false;
			const i = l.indexOf(fn);
			if (i === -1) return false;
			l.splice(i, 1);
			return true;
		},
		async invoke(name, payload) {
			let cur = payload;
			for (const fn of reg2[name] || []) try {
				cur = await fn(cur) ?? cur;
			} catch (e) {
				hookLog.error("hook listener threw, skipping (fail-open)", {
					hook: name,
					err: String(e?.message || e),
					stack: e?.stack || null
				});
			}
			const native = FREDDIE_TO_NATIVE_HOOK[name];
			if (native && ccHost.plugins().length && !env("FREDDIE_DISABLE_CC_HOOKS")) try {
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
			} catch (e) {
				hookLog.error("cc-plugin native hook dispatch threw, skipping (fail-open)", {
					hook: name,
					native,
					err: String(e?.message || e),
					stack: e?.stack || null
				});
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
	const CC_EXCLUDE = /* @__PURE__ */ new Set(["gm-cc"]);
	const isExcludedCc = (base) => CC_EXCLUDE.has(base) || /^\.?gm-cc(-|$)/.test(base);
	async function loadCcFromNodeModules(startDir) {
		const seen = new Set(ccHost.plugins().map((p) => p.root));
		let cur = path.resolve(startDir);
		while (true) {
			const nm = path.join(cur, "node_modules");
			if (fs.existsSync(nm)) for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const dirs = entry.name.startsWith("@") ? fs.readdirSync(path.join(nm, entry.name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(nm, entry.name, e.name)) : [path.join(nm, entry.name)];
				for (const d of dirs) {
					if (seen.has(d) || !isCcPluginDir(d) || isExcludedCc(path.basename(d))) continue;
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
//#region src/host/surface-factories.js
init_env();
function reg(map, kind) {
	return {
		register(spec) {
			if (!spec?.name) throw new Error(`${kind}.name required`);
			if (kind === "tool" && !spec.toolset) throw new Error(`tool '${spec.name}' missing required 'toolset' field (was silently defaulting to 'core', the highest-privilege bundle)`);
			if (map.has(spec.name)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `${kind} name collision: '${spec.name}' registered twice, second registration wins`,
				kind,
				name: spec.name,
				losing_owner: map.get(spec.name).__plugin || null,
				winning_owner: spec.__plugin || null
			}));
			map.set(spec.name, spec);
		},
		get: (n) => map.get(n),
		list: () => [...map.values()],
		has: (n) => map.has(n),
		size: () => map.size,
		unregister: (n) => map.delete(n)
	};
}
function maybeChaosInject(toolName) {
	const pct = Number(env("FREDDIE_CHAOS_INJECT"));
	if (!pct || pct <= 0) return;
	if (Math.random() * 100 < pct) throw new Error(`[FREDDIE_CHAOS_INJECT] synthetic failure injected for tool '${toolName}' (chaos_pct=${pct})`);
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
		async dispatchTool(name, args = {}, ctx = {}, opts = {}) {
			const t = m.tools.get(name);
			if (!t) return JSON.stringify({ error: `unknown tool: ${name}` });
			if (t.checkFn && t.checkFn(t) === false) return JSON.stringify({
				error: `tool unavailable: ${name}`,
				requires: t.requiresEnv || []
			});
			const hooks = opts.hooks;
			const resources = opts.resourcesFor && t.__plugin ? opts.resourcesFor(t.__plugin) : null;
			const scopedEnv = makeScopedEnvReader(resources, t.__plugin, name, opts.logger, process.env);
			const ctxWithProgress = {
				...ctx,
				...hooks ? { onProgress: (partial) => hooks.invoke("onToolProgress", {
					name,
					args,
					partial
				}) } : {},
				env: scopedEnv
			};
			try {
				maybeChaosInject(name);
				enforcePII(resources, t.__plugin, name, opts.logger, {
					argsText: JSON.stringify(args),
					resultText: ""
				});
				const r = await withResourceEnforcement(resources, t.__plugin, name, opts.logger, () => t.handler(args, ctxWithProgress));
				const raw = typeof r === "string" ? r : JSON.stringify(r);
				enforcePII(resources, t.__plugin, name, opts.logger, {
					argsText: "",
					resultText: raw
				});
				return applyToolMiddleware({
					name,
					tool: t,
					args
				}, raw);
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
	const r = [], pages = /* @__PURE__ */ new Map(), nav = [], debugs = /* @__PURE__ */ new Map(), apis = /* @__PURE__ */ new Map(), assets = /* @__PURE__ */ new Map(), wsRoutes = /* @__PURE__ */ new Map();
	return {
		_state: {
			routes: r,
			pages,
			nav,
			debugs,
			apis,
			assets,
			wsRoutes
		},
		route: (method, p, h) => {
			const m = method.toUpperCase();
			if (r.some((x) => x.method === m && x.path === p)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `route collision: '${m} ${p}' registered twice, both remain reachable in registration order`,
				method: m,
				path: p
			}));
			r.push({
				method: m,
				path: p,
				handler: h
			});
		},
		unroute: (method, p) => {
			const i = r.findIndex((x) => x.method === method.toUpperCase() && x.path === p);
			if (i === -1) return false;
			r.splice(i, 1);
			return true;
		},
		wsRoute: (p, onConnection) => {
			if (wsRoutes.has(p)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `wsRoute collision: '${p}' registered twice, second registration wins`,
				path: p
			}));
			wsRoutes.set(p, onConnection);
		},
		unwsRoute: (p) => wsRoutes.delete(p),
		page: (s, d) => {
			if (pages.has(s)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `page collision: '${s}' registered twice, second registration wins`,
				slug: s
			}));
			pages.set(s, d);
		},
		unpage: (s) => pages.delete(s),
		nav: (i) => nav.push(i),
		unnav: (index) => {
			if (index >= 0 && index < nav.length) {
				nav.splice(index, 1);
				return true;
			}
			return false;
		},
		debug: (n, fn) => {
			if (debugs.has(n)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `debug collision: '${n}' registered twice, second registration wins`,
				name: n
			}));
			debugs.set(n, fn);
		},
		undebug: (n) => debugs.delete(n),
		api: (g, d) => {
			if (apis.has(g)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `api collision: '${g}' registered twice, second registration wins`,
				group: g
			}));
			apis.set(g, d);
		},
		unapi: (g) => apis.delete(g),
		asset: (p, c) => {
			if (assets.has(p)) console.error(JSON.stringify({
				ts: Date.now(),
				level: "warn",
				msg: `asset collision: '${p}' registered twice, second registration wins`,
				path: p
			}));
			assets.set(p, c);
		},
		unasset: (p) => assets.delete(p),
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
function guard(surface, allowed, name, verbs, declaredSurfaces) {
	if (allowed) return surface;
	return new Proxy({}, { get(_, key) {
		const k = String(key);
		if (verbs.includes(k) || verbs.includes(k.replace(/s$/, ""))) return () => {
			throw new Error(`plugin ${name}: surface verb '${k}' not allowed (declared surfaces=${declaredSurfaces})`);
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
//#endregion
//#region src/host/plugin-runtime.js
function recordPi(pi, cap, pluginName) {
	return {
		...pi,
		tools: {
			...pi.tools,
			register: (s) => {
				cap.tools.push(s.name);
				return pi.tools.register({
					...s,
					__plugin: pluginName
				});
			}
		},
		commands: {
			...pi.commands,
			register: (s) => {
				cap.commands.push(s.name);
				return pi.commands.register(s);
			}
		},
		crons: {
			...pi.crons,
			register: (s) => {
				cap.crons.push(s.name);
				return pi.crons.register(s);
			}
		}
	};
}
function recordGui(gui, cap) {
	return {
		...gui,
		route: (method, path, h) => {
			cap.routes.push(`${method.toUpperCase()} ${path}`);
			cap._routeDefs.push({
				method: method.toUpperCase(),
				path
			});
			return gui.route(method, path, h);
		},
		wsRoute: (path, onConnection) => {
			cap.wsRoutes.push(path);
			return gui.wsRoute(path, onConnection);
		},
		page: (slug, def) => {
			cap.pages.push(slug);
			return gui.page(slug, def);
		},
		nav: (item) => {
			cap.navItems.push(item);
			return gui.nav(item);
		},
		debug: (name, fn) => {
			cap.debugs.push(name);
			return gui.debug(name, fn);
		},
		api: (group, def) => {
			cap.apis.push(group);
			return gui.api(group, def);
		},
		asset: (path, content) => {
			cap.assets.push(path);
			return gui.asset(path, content);
		}
	};
}
function recordHooks(hooks, cap) {
	return {
		...hooks,
		on: (name, fn) => {
			cap.hooks.push(name);
			cap._hookFns.push({
				name,
				fn
			});
			return hooks.on(name, fn);
		}
	};
}
async function reloadPlugin({ filePath, sourcePaths, capabilities, loaded, pi, gui, hooks, host }) {
	const name = [...sourcePaths.entries()].find(([, f]) => f === filePath)?.[0];
	if (!name) return null;
	const cap = capabilities.get(name);
	if (cap) {
		for (const t of cap.tools) pi.tools.unregister(t);
		for (const c of cap.commands) pi.commands.unregister(c);
		for (const c of cap.crons) pi.crons.unregister(c);
		for (const { method, path: p } of cap._routeDefs || []) gui.unroute(method, p);
		for (const { name: hn, fn } of cap._hookFns || []) hooks.off(hn, fn);
		for (const p of cap.wsRoutes || []) gui.unwsRoute(p);
		for (const s of cap.pages || []) gui.unpage(s);
		for (const item of cap.navItems || []) {
			const idx = gui._state.nav.indexOf(item);
			if (idx !== -1) gui.unnav(idx);
		}
		for (const n of cap.debugs || []) gui.undebug(n);
		for (const g of cap.apis || []) gui.unapi(g);
		for (const p of cap.assets || []) gui.unasset(p);
	}
	const idx = loaded.findIndex((p) => p.name === name);
	if (idx !== -1) loaded.splice(idx, 1);
	capabilities.delete(name);
	const reloadCopy = filePath.replace(/\.m?js$/, `.reload-${Date.now()}.mjs`);
	fs.copyFileSync(filePath, reloadCopy);
	let mod;
	try {
		mod = await import(pathToFileURL(reloadCopy).href);
	} finally {
		fs.unlink(reloadCopy, () => {});
	}
	const fresh = mod.default || mod.plugin;
	if (!fresh) return null;
	fresh.__sourceFile = filePath;
	const newCap = {
		tools: [],
		hooks: [],
		commands: [],
		crons: [],
		routes: [],
		_hookFns: [],
		_routeDefs: [],
		wsRoutes: [],
		pages: [],
		navItems: [],
		debugs: [],
		apis: [],
		assets: []
	};
	const want = fresh.surfaces;
	const ctxPi = want === "pi" || want === "both" ? recordPi(pi, newCap, name) : guard(pi, false, name, PI_VERBS, want);
	const ctxGui = want === "gui" || want === "both" ? recordGui(gui, newCap) : guard(gui, false, name, GUI_VERBS, want);
	const ctxHooks = recordHooks(hooks, newCap);
	await validatePlugin(fresh).register({
		pi: ctxPi,
		gui: ctxGui,
		hooks: ctxHooks,
		log: {
			info() {},
			warn() {},
			error() {}
		},
		config: nullStore(),
		host,
		env: process.env
	});
	loaded.push(fresh);
	capabilities.set(name, newCap);
	sourcePaths.set(name, filePath);
	return name;
}
//#endregion
//#region src/flags.js
init_home();
function flagsPath() {
	return path.join(getFreddieHome(), "flags.json");
}
function loadFlags() {
	try {
		return JSON.parse(fs.readFileSync(flagsPath(), "utf8"));
	} catch {
		return {};
	}
}
function installId() {
	return crypto$1.createHash("sha256").update(getFreddieHome()).digest("hex");
}
function bucketFor(name) {
	const h = crypto$1.createHash("sha256").update(name + ":" + installId()).digest("hex");
	return parseInt(h.slice(0, 8), 16) / 4294967295 * 100;
}
function isFlagEnabled(name) {
	const entry = loadFlags()[name];
	if (entry === void 0) return true;
	if (typeof entry === "boolean") return entry;
	if (typeof entry === "object" && entry !== null && typeof entry.rollout_pct === "number") return bucketFor(name) < entry.rollout_pct;
	return true;
}
//#endregion
//#region src/host/plugin-discovery.js
function isFlagDisabled(dir) {
	const manifestPath = path.join(dir, "plugin.json");
	if (!fs.existsSync(manifestPath)) return false;
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		if (!manifest.feature_flag) return false;
		return !isFlagEnabled(manifest.feature_flag);
	} catch {
		return false;
	}
}
async function discoverPlugins(roots) {
	const found = [];
	for (const root of roots) await scanPluginDir(root, found, 1);
	return found;
}
async function scanPluginDir(root, found, depth) {
	if (!root || !fs.existsSync(root)) return;
	const subDirs = [];
	const imports = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dir = path.join(root, entry.name);
		const file = path.join(dir, "plugin.js");
		if (fs.existsSync(file)) {
			if (isFlagDisabled(dir)) continue;
			const declaredResources = readManifestResources(dir);
			imports.push(import(pathToFileURL(file).href).then((mod) => {
				const p = mod.default || mod.plugin;
				if (p) {
					p.__sourceFile = file;
					p.__resources = declaredResources;
					found.push(p);
				}
			}));
			continue;
		}
		const handlerFile = path.join(dir, "handler.js");
		if (fs.existsSync(handlerFile)) {
			if (isFlagDisabled(dir)) continue;
			const declaredResources = readManifestResources(dir);
			const entryName = entry.name;
			imports.push(import(pathToFileURL(handlerFile).href).then((handlerMod) => {
				const _tool = handlerMod._tool;
				if (!_tool) return;
				found.push({
					name: `tool-${entryName}`,
					surfaces: "pi",
					__sourceFile: handlerFile,
					__resources: declaredResources,
					register({ pi }) {
						pi.tools.register(_tool);
					}
				});
			}));
			continue;
		}
		if (depth > 0) subDirs.push(dir);
	}
	if (imports.length) await Promise.allSettled(imports);
	if (subDirs.length) await Promise.allSettled(subDirs.map((dir) => scanPluginDir(dir, found, depth - 1)));
}
//#endregion
//#region src/host/host.js
function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths, resources }) {
	return async function load(plugins) {
		const sorted = topoSort(plugins.map(validatePlugin));
		for (const p of sorted) {
			const want = p.surfaces;
			const cap = {
				tools: [],
				hooks: [],
				commands: [],
				crons: [],
				routes: [],
				_hookFns: [],
				_routeDefs: []
			};
			const ctxPi = (want === "pi" || want === "both") && surfaces.includes("pi") ? recordPi(pi, cap, p.name) : guard(pi, false, p.name, PI_VERBS, want);
			const ctxGui = (want === "gui" || want === "both") && surfaces.includes("gui") ? recordGui(gui, cap) : guard(gui, false, p.name, GUI_VERBS, want);
			const ctxHooks = recordHooks(hooks, cap);
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
			const logger = {
				info: (m, f) => log("info", m, f),
				warn: (m, f) => log("warn", m, f),
				error: (m, f) => log("error", m, f)
			};
			const ctx = {
				pi: ctxPi,
				gui: ctxGui,
				hooks: ctxHooks,
				log: logger,
				config: scopedCfg(p.name, configStore),
				host,
				env
			};
			try {
				await p.register(ctx);
				loaded.push(p);
				capabilities.set(p.name, cap);
				if (p.__sourceFile) sourcePaths.set(p.name, p.__sourceFile);
				if (p.__resources !== void 0) resources.set(p.name, p.__resources);
			} catch (e) {
				const entry = {
					plugin: p.name,
					name: p.name,
					error: String(e?.message || e),
					stack: e?.stack || null,
					config: scopedCfg(p.name, configStore).all(),
					env_keys_present: Object.keys(process.env).filter((k) => k.startsWith("FREDDIE_")),
					ts: Date.now()
				};
				failed.push(entry);
				logger.error(`plugin register() threw: ${entry.error}`, { stack: entry.stack });
			}
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
	const capabilities = /* @__PURE__ */ new Map();
	const failed = [];
	const sourcePaths = /* @__PURE__ */ new Map();
	const resources = /* @__PURE__ */ new Map();
	const dispatchLogger = (pluginName) => ({ warn: (msg, fields) => {
		const line = JSON.stringify({
			ts: Date.now(),
			plugin: pluginName,
			level: "warn",
			msg,
			...fields || {}
		});
		if (env.FREDDIE_LOG_STDOUT) console.log(line);
	} });
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
		failed: () => failed.slice(),
		get: (n) => loaded.find((p) => p.name === n) || null,
		capabilities: (n) => n ? capabilities.get(n) || null : Object.fromEntries(capabilities),
		resources: (n) => n ? resources.has(n) ? resources.get(n) : null : Object.fromEntries(resources),
		failedPlugins: () => failed.slice(),
		shutdown: () => ccHost.shutdown(),
		reloadPlugin: (filePath) => reloadPlugin({
			filePath,
			sourcePaths,
			capabilities,
			loaded,
			pi,
			gui,
			hooks,
			host
		})
	};
	if (pi.dispatchTool) {
		const rawDispatch = pi.dispatchTool.bind(pi);
		pi.dispatchTool = (name, args, ctx, opts = {}) => rawDispatch(name, args, ctx, {
			...opts,
			resourcesFor: (pluginName) => resources.has(pluginName) ? resources.get(pluginName) : null,
			logger: dispatchLogger(name)
		});
	}
	host.load = makePluginLoader({
		surfaces,
		pi,
		gui,
		hooks,
		configStore,
		env,
		host,
		loaded,
		capabilities,
		failed,
		sourcePaths,
		resources
	});
	const cc = makeCcLoaders(ccHost, env);
	host.loadCcPlugins = cc.loadCcPlugins;
	host.loadCcFromNodeModules = cc.loadCcFromNodeModules;
	return host;
}
//#endregion
//#region src/projects.js
var projects_exports = /* @__PURE__ */ __exportAll({
	applyActiveProjectFromRegistry: () => applyActiveProjectFromRegistry,
	createProject: () => createProject,
	deleteProject: () => deleteProject,
	getActiveProject: () => getActiveProject,
	listProjects: () => listProjects,
	loadRegistry: () => loadRegistry,
	setActiveProject: () => setActiveProject
});
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
function saveRegistry(reg) {
	ensureRegistry();
	fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}
function listProjects() {
	return loadRegistry().projects;
}
function getActiveProject() {
	const reg = loadRegistry();
	return reg.projects.find((p) => p.name === reg.active) || reg.projects[0];
}
function createProject({ name, projectPath }) {
	if (!name || !projectPath) throw new Error("name and path are required");
	if (!path.isAbsolute(projectPath)) throw new Error("path must be absolute");
	const reg = loadRegistry();
	if (reg.projects.find((p) => p.name === name)) throw new Error("project name already exists");
	if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true });
	reg.projects.push({
		name,
		path: projectPath,
		created_at: (/* @__PURE__ */ new Date()).toISOString()
	});
	saveRegistry(reg);
	return reg.projects[reg.projects.length - 1];
}
function deleteProject(name) {
	if (name === "default") throw new Error("cannot delete default project");
	const reg = loadRegistry();
	reg.projects = reg.projects.filter((p) => p.name !== name);
	if (reg.active === name) reg.active = "default";
	saveRegistry(reg);
}
function setActiveProject(name) {
	const reg = loadRegistry();
	const proj = reg.projects.find((p) => p.name === name);
	if (!proj) throw new Error("unknown project: " + name);
	reg.active = name;
	saveRegistry(reg);
	applyHomeOverride(proj.path);
	return proj;
}
function applyActiveProjectFromRegistry() {
	const proj = getActiveProject();
	if (proj) applyHomeOverride(proj.path);
	return proj;
}
var REGISTRY_PATH, DEFAULT_REGISTRY;
var init_projects = __esmMin((() => {
	init_home();
	REGISTRY_PATH = path.join(os.homedir(), ".freddie", "projects.json");
	DEFAULT_REGISTRY = {
		active: "default",
		projects: [{
			name: "default",
			path: path.join(os.homedir(), ".freddie"),
			created_at: (/* @__PURE__ */ new Date()).toISOString()
		}]
	};
}));
//#endregion
//#region src/host/plugin-trust.js
init_projects();
init_home();
function trustFilePath() {
	return path.join(getFreddieHome(), "trust.json");
}
function readTrustFile() {
	try {
		return JSON.parse(fs.readFileSync(trustFilePath(), "utf8"));
	} catch {
		return {};
	}
}
function writeTrustFile(data) {
	fs.writeFileSync(trustFilePath(), JSON.stringify(data, null, 2) + "\n");
}
function getTrustDecision(resolvedRoot) {
	return readTrustFile()[resolvedRoot]?.decision ?? null;
}
function setTrustDecision(resolvedRoot, decision) {
	const trust = readTrustFile();
	trust[resolvedRoot] = {
		decision,
		decided_at: Date.now()
	};
	writeTrustFile(trust);
}
async function promptYesNo(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	return await new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(/^y(es)?$/i.test(answer.trim()));
		});
	});
}
async function checkPluginTrust(resolvedRoot, { approve = null } = {}) {
	if (!fs.existsSync(resolvedRoot)) return false;
	if (approve === true) {
		setTrustDecision(resolvedRoot, "trusted");
		return true;
	}
	if (approve === false) {
		setTrustDecision(resolvedRoot, "untrusted");
		return false;
	}
	const existing = getTrustDecision(resolvedRoot);
	if (existing === "trusted") return true;
	if (existing === "untrusted") return false;
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		if (process.env.FREDDIE_TRUST_CWD_PLUGINS === "1") {
			setTrustDecision(resolvedRoot, "trusted");
			return true;
		}
		return false;
	}
	const trusted = await promptYesNo(`\nThis project has local plugins at ${resolvedRoot}\nLoading them runs their code with full process permissions (same as any freddie plugin).\nTrust this project's plugins? [y/N] `);
	setTrustDecision(resolvedRoot, trusted ? "trusted" : "untrusted");
	return trusted;
}
//#endregion
//#region src/host/index.js
init_home();
init_env();
var _host = null;
var _loadPromise = null;
var _dotenvLoaded = false;
var _pluginWatcher = null;
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var REPO_PLUGINS = path.resolve(__dirname, "..", "..", "plugins");
function loadDotenvOnce() {
	if (_dotenvLoaded) return;
	_dotenvLoaded = true;
	dotenv_browser_stub_default.config();
}
function host() {
	loadDotenvOnce();
	if (!_host) _host = createHost({ surfaces: ["pi", "gui"] });
	return _host;
}
async function bootHost(extraRoots = [], { approveCwdPlugins = null } = {}) {
	if (_loadPromise) return _loadPromise;
	_loadPromise = (async () => {
		const h = host();
		if (!env("FREDDIE_HOME") && !env("FREDDIE_PROFILE")) applyActiveProjectFromRegistry();
		const cwdPluginRoot = path.join(process.cwd(), ".freddie", "plugins");
		const cwdTrusted = await checkPluginTrust(cwdPluginRoot, { approve: approveCwdPlugins });
		const plugins = await discoverPlugins([
			REPO_PLUGINS,
			path.join(getFreddieHome(), "plugins"),
			...cwdTrusted ? [cwdPluginRoot] : [],
			...extraRoots
		]);
		await h.load(plugins);
		const ccRoots = [path.join(getFreddieHome(), "cc-plugins"), path.join(process.cwd(), ".freddie", "cc-plugins")];
		await h.loadCcPlugins(ccRoots);
		const extra = (env("FREDDIE_EXTRA_CC_ROOTS") || "").split(path.delimiter).filter(Boolean);
		for (const r of [
			__dirname,
			process.cwd(),
			...extra
		]) await h.loadCcFromNodeModules(r);
		return h;
	})();
	return _loadPromise;
}
function stopWatchingPlugins() {
	if (_pluginWatcher) {
		_pluginWatcher.close();
		_pluginWatcher = null;
	}
}
function resetHostForTests() {
	_host = null;
	_loadPromise = null;
	_dotenvLoaded = false;
	stopWatchingPlugins();
}
//#endregion
//#region node_modules/@libsql/core/lib-esm/api.js
var LibsqlError, LibsqlBatchError;
var init_api = __esmMin((() => {
	LibsqlError = class extends Error {
		/** Machine-readable error code. */
		code;
		/** Extended error code with more specific information (e.g., SQLITE_CONSTRAINT_PRIMARYKEY). */
		extendedCode;
		/** Raw numeric error code */
		rawCode;
		constructor(message, code, extendedCode, rawCode, cause) {
			if (code !== void 0) message = `${code}: ${message}`;
			super(message, { cause });
			this.code = code;
			this.extendedCode = extendedCode;
			this.rawCode = rawCode;
			this.name = "LibsqlError";
		}
	};
	LibsqlBatchError = class extends LibsqlError {
		/** The zero-based index of the statement that failed in the batch. */
		statementIndex;
		constructor(message, statementIndex, code, extendedCode, rawCode, cause) {
			super(message, code, extendedCode, rawCode, cause);
			this.statementIndex = statementIndex;
			this.name = "LibsqlBatchError";
		}
	};
}));
//#endregion
//#region node_modules/@libsql/core/lib-esm/uri.js
function parseUri(text) {
	const match = URI_RE.exec(text);
	if (match === null) throw new LibsqlError(`The URL '${text}' is not in a valid format`, "URL_INVALID");
	const groups = match.groups;
	return {
		scheme: groups["scheme"],
		authority: groups["authority"] !== void 0 ? parseAuthority(groups["authority"]) : void 0,
		path: percentDecode(groups["path"]),
		query: groups["query"] !== void 0 ? parseQuery(groups["query"]) : void 0,
		fragment: groups["fragment"] !== void 0 ? percentDecode(groups["fragment"]) : void 0
	};
}
function parseAuthority(text) {
	const match = AUTHORITY_RE.exec(text);
	if (match === null) throw new LibsqlError("The authority part of the URL is not in a valid format", "URL_INVALID");
	const groups = match.groups;
	return {
		host: percentDecode(groups["host_br"] ?? groups["host"]),
		port: groups["port"] ? parseInt(groups["port"], 10) : void 0,
		userinfo: groups["username"] !== void 0 ? {
			username: percentDecode(groups["username"]),
			password: groups["password"] !== void 0 ? percentDecode(groups["password"]) : void 0
		} : void 0
	};
}
function parseQuery(text) {
	const sequences = text.split("&");
	const pairs = [];
	for (const sequence of sequences) {
		if (sequence === "") continue;
		let key;
		let value;
		const splitIdx = sequence.indexOf("=");
		if (splitIdx < 0) {
			key = sequence;
			value = "";
		} else {
			key = sequence.substring(0, splitIdx);
			value = sequence.substring(splitIdx + 1);
		}
		pairs.push({
			key: percentDecode(key.replaceAll("+", " ")),
			value: percentDecode(value.replaceAll("+", " "))
		});
	}
	return { pairs };
}
function percentDecode(text) {
	try {
		return decodeURIComponent(text);
	} catch (e) {
		if (e instanceof URIError) throw new LibsqlError(`URL component has invalid percent encoding: ${e}`, "URL_INVALID", void 0, void 0, e);
		throw e;
	}
}
function encodeBaseUrl(scheme, authority, path) {
	if (authority === void 0) throw new LibsqlError(`URL with scheme ${JSON.stringify(scheme + ":")} requires authority (the "//" part)`, "URL_INVALID");
	const schemeText = `${scheme}:`;
	const hostText = encodeHost(authority.host);
	const portText = encodePort(authority.port);
	const authorityText = `//${encodeUserinfo(authority.userinfo)}${hostText}${portText}`;
	let pathText = path.split("/").map(encodeURIComponent).join("/");
	if (pathText !== "" && !pathText.startsWith("/")) pathText = "/" + pathText;
	return new URL(`${schemeText}${authorityText}${pathText}`);
}
function encodeHost(host) {
	return host.includes(":") ? `[${encodeURI(host)}]` : encodeURI(host);
}
function encodePort(port) {
	return port !== void 0 ? `:${port}` : "";
}
function encodeUserinfo(userinfo) {
	if (userinfo === void 0) return "";
	return `${encodeURIComponent(userinfo.username)}${userinfo.password !== void 0 ? `:${encodeURIComponent(userinfo.password)}` : ""}@`;
}
var URI_RE, AUTHORITY_RE;
var init_uri = __esmMin((() => {
	init_api();
	URI_RE = (() => {
		return new RegExp(`^(?<scheme>[A-Za-z][A-Za-z.+-]*):(//(?<authority>[^/?#]*))?(?<path>[^?#]*)(\\?(?<query>[^#]*))?(#(?<fragment>.*))?$`, "su");
	})();
	AUTHORITY_RE = (() => {
		return new RegExp(`^((?<username>[^:]*)(:(?<password>.*))?@)?((?<host>[^:\\[\\]]*)|(\\[(?<host_br>[^\\[\\]]*)\\]))(:(?<port>[0-9]*))?$`, "su");
	})();
}));
//#endregion
//#region node_modules/js-base64/base64.mjs
var version, VERSION, _TD, _TE, b64chs, b64tab, b64re, _fromCC, _U8Afrom, _mkUriSafe, _tidyB64, btoaPolyfill, _btoa, _fromUint8Array, fromUint8Array, cb_utob, re_utob, utob, _encode, encode, encodeURI$1, re_btou, cb_btou, btou, atobPolyfill, _atob, _toUint8Array, toUint8Array, _decode, _unURI, decode, isValid, _noEnum, extendString, extendUint8Array, extendBuiltins, gBase64;
var init_base64 = __esmMin((() => {
	version = "3.9.1";
	VERSION = version;
	_TD = typeof TextDecoder === "function" ? new TextDecoder("utf-8", { ignoreBOM: true }) : void 0;
	_TE = typeof TextEncoder === "function" ? new TextEncoder() : void 0;
	b64chs = Array.prototype.slice.call("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=");
	b64tab = ((a) => {
		let tab = {};
		a.forEach((c, i) => tab[c] = i);
		return tab;
	})(b64chs);
	b64re = /^(?:[A-Za-z\d+\/]{4})*?(?:[A-Za-z\d+\/]{2}(?:==)?|[A-Za-z\d+\/]{3}=?)?$/;
	_fromCC = String.fromCharCode.bind(String);
	_U8Afrom = typeof Uint8Array.from === "function" ? Uint8Array.from.bind(Uint8Array) : (it) => new Uint8Array(Array.prototype.slice.call(it, 0));
	_mkUriSafe = (src) => src.replace(/=/g, "").replace(/[+\/]/g, (m0) => m0 == "+" ? "-" : "_");
	_tidyB64 = (s) => s.replace(/[^A-Za-z0-9\+\/]/g, "");
	btoaPolyfill = (bin) => {
		let u32, c0, c1, c2, asc = "";
		const pad = bin.length % 3;
		for (let i = 0; i < bin.length;) {
			if ((c0 = bin.charCodeAt(i++)) > 255 || (c1 = bin.charCodeAt(i++)) > 255 || (c2 = bin.charCodeAt(i++)) > 255) throw new TypeError("invalid character found");
			u32 = c0 << 16 | c1 << 8 | c2;
			asc += b64chs[u32 >> 18 & 63] + b64chs[u32 >> 12 & 63] + b64chs[u32 >> 6 & 63] + b64chs[u32 & 63];
		}
		return pad ? asc.slice(0, pad - 3) + "===".substring(pad) : asc;
	};
	_btoa = typeof btoa === "function" ? (bin) => btoa(bin) : btoaPolyfill;
	_fromUint8Array = typeof Uint8Array.prototype.toBase64 === "function" ? (u8a) => u8a.toBase64() : (u8a) => {
		const maxargs = 4096;
		let strs = [];
		for (let i = 0, l = u8a.length; i < l; i += maxargs) strs.push(_fromCC.apply(null, u8a.subarray(i, i + maxargs)));
		return _btoa(strs.join(""));
	};
	fromUint8Array = (u8a, urlsafe = false) => urlsafe ? _mkUriSafe(_fromUint8Array(u8a)) : _fromUint8Array(u8a);
	cb_utob = (c) => {
		if (c.length < 2) {
			var cc = c.charCodeAt(0);
			return cc < 128 ? c : cc < 2048 ? _fromCC(192 | cc >>> 6) + _fromCC(128 | cc & 63) : _fromCC(224 | cc >>> 12 & 15) + _fromCC(128 | cc >>> 6 & 63) + _fromCC(128 | cc & 63);
		} else {
			var cc = 65536 + (c.charCodeAt(0) - 55296) * 1024 + (c.charCodeAt(1) - 56320);
			return _fromCC(240 | cc >>> 18 & 7) + _fromCC(128 | cc >>> 12 & 63) + _fromCC(128 | cc >>> 6 & 63) + _fromCC(128 | cc & 63);
		}
	};
	re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g;
	utob = (u) => u.replace(re_utob, cb_utob);
	_encode = _TE ? (s) => _fromUint8Array(_TE.encode(s)) : (s) => _btoa(utob(s));
	encode = (src, urlsafe = false) => urlsafe ? _mkUriSafe(_encode(src)) : _encode(src);
	encodeURI$1 = (src) => encode(src, true);
	re_btou = /[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3}/g;
	cb_btou = (cccc) => {
		switch (cccc.length) {
			case 4:
				var offset = ((7 & cccc.charCodeAt(0)) << 18 | (63 & cccc.charCodeAt(1)) << 12 | (63 & cccc.charCodeAt(2)) << 6 | 63 & cccc.charCodeAt(3)) - 65536;
				return _fromCC((offset >>> 10) + 55296) + _fromCC((offset & 1023) + 56320);
			case 3: return _fromCC((15 & cccc.charCodeAt(0)) << 12 | (63 & cccc.charCodeAt(1)) << 6 | 63 & cccc.charCodeAt(2));
			default: return _fromCC((31 & cccc.charCodeAt(0)) << 6 | 63 & cccc.charCodeAt(1));
		}
	};
	btou = (b) => b.replace(re_btou, cb_btou);
	atobPolyfill = (asc) => {
		asc = asc.replace(/\s+/g, "");
		if (!b64re.test(asc)) throw new TypeError("malformed base64.");
		asc += "==".slice(2 - (asc.length & 3));
		let u24, r1, r2;
		let binArray = [];
		for (let i = 0; i < asc.length;) {
			u24 = b64tab[asc.charAt(i++)] << 18 | b64tab[asc.charAt(i++)] << 12 | (r1 = b64tab[asc.charAt(i++)]) << 6 | (r2 = b64tab[asc.charAt(i++)]);
			if (r1 === 64) binArray.push(_fromCC(u24 >> 16 & 255));
			else if (r2 === 64) binArray.push(_fromCC(u24 >> 16 & 255, u24 >> 8 & 255));
			else binArray.push(_fromCC(u24 >> 16 & 255, u24 >> 8 & 255, u24 & 255));
		}
		return binArray.join("");
	};
	_atob = typeof atob === "function" ? (asc) => atob(_tidyB64(asc)) : atobPolyfill;
	_toUint8Array = typeof Uint8Array.fromBase64 === "function" ? (a) => Uint8Array.fromBase64(a) : (a) => _U8Afrom(_atob(a).split("").map((c) => c.charCodeAt(0)));
	toUint8Array = (a) => _toUint8Array(_unURI(a));
	_decode = _TD ? (a) => _TD.decode(_toUint8Array(a)) : (a) => btou(_atob(a));
	_unURI = (a) => _tidyB64(a.replace(/[-_]/g, (m0) => m0 == "-" ? "+" : "/"));
	decode = (src) => _decode(_unURI(src));
	isValid = (src) => {
		if (typeof src !== "string") return false;
		const s = src.replace(/\s+/g, "").replace(/={0,2}$/, "");
		return !/[^\s0-9a-zA-Z\+/]/.test(s) || !/[^\s0-9a-zA-Z\-_]/.test(s);
	};
	_noEnum = (v) => {
		return {
			value: v,
			enumerable: false,
			writable: true,
			configurable: true
		};
	};
	extendString = function() {
		const _add = (name, body) => Object.defineProperty(String.prototype, name, _noEnum(body));
		_add("fromBase64", function() {
			return decode(this);
		});
		_add("toBase64", function(urlsafe) {
			return encode(this, urlsafe);
		});
		_add("toBase64URI", function() {
			return encode(this, true);
		});
		_add("toBase64URL", function() {
			return encode(this, true);
		});
		_add("toUint8Array", function() {
			return toUint8Array(this);
		});
	};
	extendUint8Array = function() {
		const _add = (name, body) => Object.defineProperty(Uint8Array.prototype, name, _noEnum(body));
		_add("toBase64", function(urlsafe) {
			return fromUint8Array(this, urlsafe);
		});
		_add("toBase64URI", function() {
			return fromUint8Array(this, true);
		});
		_add("toBase64URL", function() {
			return fromUint8Array(this, true);
		});
	};
	extendBuiltins = () => {
		extendString();
		extendUint8Array();
	};
	gBase64 = {
		version,
		VERSION,
		atob: _atob,
		atobPolyfill,
		btoa: _btoa,
		btoaPolyfill,
		fromBase64: decode,
		toBase64: encode,
		encode,
		encodeURI: encodeURI$1,
		encodeURL: encodeURI$1,
		utob,
		btou,
		decode,
		isValid,
		fromUint8Array,
		toUint8Array,
		extendString,
		extendUint8Array,
		extendBuiltins
	};
}));
//#endregion
//#region node_modules/@libsql/core/lib-esm/util.js
function transactionModeToBegin(mode) {
	if (mode === "write") return "BEGIN IMMEDIATE";
	else if (mode === "read") return "BEGIN TRANSACTION READONLY";
	else if (mode === "deferred") return "BEGIN DEFERRED";
	else throw RangeError("Unknown transaction mode, supported values are \"write\", \"read\" and \"deferred\"");
}
function rowToJson(row) {
	return Array.prototype.map.call(row, valueToJson);
}
function valueToJson(value) {
	if (typeof value === "bigint") return "" + value;
	else if (value instanceof ArrayBuffer) return gBase64.fromUint8Array(new Uint8Array(value));
	else return value;
}
var supportedUrlLink, ResultSetImpl;
var init_util$2 = __esmMin((() => {
	init_base64();
	supportedUrlLink = "https://github.com/libsql/libsql-client-ts#supported-urls";
	ResultSetImpl = class {
		columns;
		columnTypes;
		rows;
		rowsAffected;
		lastInsertRowid;
		constructor(columns, columnTypes, rows, rowsAffected, lastInsertRowid) {
			this.columns = columns;
			this.columnTypes = columnTypes;
			this.rows = rows;
			this.rowsAffected = rowsAffected;
			this.lastInsertRowid = lastInsertRowid;
		}
		toJSON() {
			return {
				columns: this.columns,
				columnTypes: this.columnTypes,
				rows: this.rows.map(rowToJson),
				rowsAffected: this.rowsAffected,
				lastInsertRowid: this.lastInsertRowid !== void 0 ? "" + this.lastInsertRowid : null
			};
		}
	};
}));
//#endregion
//#region node_modules/@libsql/core/lib-esm/config.js
function expandConfig(config, preferHttp) {
	if (typeof config !== "object") throw new TypeError(`Expected client configuration as object, got ${typeof config}`);
	let { url, authToken, tls, intMode, concurrency } = config;
	concurrency = Math.max(0, concurrency || 20);
	intMode ??= "number";
	let connectionQueryParams = [];
	if (url === inMemoryMode) url = "file::memory:";
	const uri = parseUri(url);
	const originalUriScheme = uri.scheme.toLowerCase();
	const isInMemoryMode = originalUriScheme === "file" && uri.path === inMemoryMode && uri.authority === void 0;
	let queryParamsDef;
	if (isInMemoryMode) queryParamsDef = { cache: {
		values: ["shared", "private"],
		update: (key, value) => connectionQueryParams.push(`${key}=${value}`)
	} };
	else queryParamsDef = {
		tls: {
			values: ["0", "1"],
			update: (_, value) => tls = value === "1"
		},
		authToken: { update: (_, value) => authToken = value }
	};
	for (const { key, value } of uri.query?.pairs ?? []) {
		if (!Object.hasOwn(queryParamsDef, key)) throw new LibsqlError(`Unsupported URL query parameter ${JSON.stringify(key)}`, "URL_PARAM_NOT_SUPPORTED");
		const queryParamDef = queryParamsDef[key];
		if (queryParamDef.values !== void 0 && !queryParamDef.values.includes(value)) throw new LibsqlError(`Unknown value for the "${key}" query argument: ${JSON.stringify(value)}. Supported values are: [${queryParamDef.values.map((x) => "\"" + x + "\"").join(", ")}]`, "URL_INVALID");
		if (queryParamDef.update !== void 0) queryParamDef?.update(key, value);
	}
	const connectionQueryParamsString = connectionQueryParams.length === 0 ? "" : `?${connectionQueryParams.join("&")}`;
	const path = uri.path + connectionQueryParamsString;
	let scheme;
	if (originalUriScheme === "libsql") if (tls === false) {
		if (uri.authority?.port === void 0) throw new LibsqlError("A \"libsql:\" URL with ?tls=0 must specify an explicit port", "URL_INVALID");
		scheme = preferHttp ? "http" : "ws";
	} else scheme = preferHttp ? "https" : "wss";
	else scheme = originalUriScheme;
	if (scheme === "http" || scheme === "ws") tls ??= false;
	else tls ??= true;
	if (scheme !== "http" && scheme !== "ws" && scheme !== "https" && scheme !== "wss" && scheme !== "file") throw new LibsqlError(`The client supports only "libsql:", "wss:", "ws:", "https:", "http:" and "file:" URLs, got ${JSON.stringify(uri.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
	if (intMode !== "number" && intMode !== "bigint" && intMode !== "string") throw new TypeError(`Invalid value for intMode, expected "number", "bigint" or "string", got ${JSON.stringify(intMode)}`);
	if (uri.fragment !== void 0) throw new LibsqlError(`URL fragments are not supported: ${JSON.stringify("#" + uri.fragment)}`, "URL_INVALID");
	if (isInMemoryMode) return {
		scheme: "file",
		tls: false,
		path,
		intMode,
		concurrency,
		syncUrl: config.syncUrl,
		syncInterval: config.syncInterval,
		readYourWrites: config.readYourWrites,
		offline: config.offline,
		fetch: config.fetch,
		timeout: config.timeout,
		authToken: void 0,
		encryptionKey: void 0,
		remoteEncryptionKey: void 0,
		authority: void 0
	};
	return {
		scheme,
		tls,
		authority: uri.authority,
		path,
		authToken,
		intMode,
		concurrency,
		encryptionKey: config.encryptionKey,
		remoteEncryptionKey: config.remoteEncryptionKey,
		syncUrl: config.syncUrl,
		syncInterval: config.syncInterval,
		readYourWrites: config.readYourWrites,
		offline: config.offline,
		fetch: config.fetch,
		timeout: config.timeout
	};
}
var inMemoryMode;
var init_config = __esmMin((() => {
	init_api();
	init_uri();
	init_util$2();
	inMemoryMode = ":memory:";
}));
//#endregion
//#region node_modules/@libsql/isomorphic-ws/web.mjs
var _WebSocket;
var init_web$1 = __esmMin((() => {
	if (typeof WebSocket !== "undefined") _WebSocket = WebSocket;
	else if (typeof global !== "undefined") _WebSocket = global.WebSocket;
	else if (typeof window !== "undefined") _WebSocket = window.WebSocket;
	else if (typeof self !== "undefined") _WebSocket = self.WebSocket;
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/client.js
var Client;
var init_client$2 = __esmMin((() => {
	Client = class {
		/** @private */
		constructor() {
			this.intMode = "number";
		}
		/** Representation of integers returned from the database. See {@link IntMode}.
		*
		* This value is inherited by {@link Stream} objects created with {@link openStream}, but you can
		* override the integer mode for every stream by setting {@link Stream.intMode} on the stream.
		*/
		intMode;
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/errors.js
var ClientError, ProtoError, ResponseError, ClosedError, WebSocketUnsupportedError, WebSocketError, HttpServerError, ProtocolVersionError, InternalError, MisuseError;
var init_errors = __esmMin((() => {
	ClientError = class extends Error {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "ClientError";
		}
	};
	ProtoError = class extends ClientError {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "ProtoError";
		}
	};
	ResponseError = class extends ClientError {
		code;
		/** @internal */
		proto;
		/** @private */
		constructor(message, protoError) {
			super(message);
			this.name = "ResponseError";
			this.code = protoError.code;
			this.proto = protoError;
			this.stack = void 0;
		}
	};
	ClosedError = class extends ClientError {
		/** @private */
		constructor(message, cause) {
			if (cause !== void 0) {
				super(`${message}: ${cause}`);
				this.cause = cause;
			} else super(message);
			this.name = "ClosedError";
		}
	};
	WebSocketUnsupportedError = class extends ClientError {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "WebSocketUnsupportedError";
		}
	};
	WebSocketError = class extends ClientError {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "WebSocketError";
		}
	};
	HttpServerError = class extends ClientError {
		status;
		/** @private */
		constructor(message, status) {
			super(message);
			this.status = status;
			this.name = "HttpServerError";
		}
	};
	ProtocolVersionError = class extends ClientError {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "ProtocolVersionError";
		}
	};
	InternalError = class extends ClientError {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "InternalError";
		}
	};
	MisuseError = class extends ClientError {
		/** @private */
		constructor(message) {
			super(message);
			this.name = "MisuseError";
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/encoding/json/decode.js
function string(value) {
	if (typeof value === "string") return value;
	throw typeError(value, "string");
}
function stringOpt(value) {
	if (value === null || value === void 0) return;
	else if (typeof value === "string") return value;
	throw typeError(value, "string or null");
}
function number(value) {
	if (typeof value === "number") return value;
	throw typeError(value, "number");
}
function boolean(value) {
	if (typeof value === "boolean") return value;
	throw typeError(value, "boolean");
}
function array(value) {
	if (Array.isArray(value)) return value;
	throw typeError(value, "array");
}
function object(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	throw typeError(value, "object");
}
function arrayObjectsMap(value, fun) {
	return array(value).map((elemValue) => fun(object(elemValue)));
}
function typeError(value, expected) {
	if (value === void 0) return new ProtoError(`Expected ${expected}, but the property was missing`);
	let received = typeof value;
	if (value === null) received = "null";
	else if (Array.isArray(value)) received = "array";
	return new ProtoError(`Expected ${expected}, received ${received}`);
}
function readJsonObject(value, fun) {
	return fun(object(value));
}
var init_decode$1 = __esmMin((() => {
	init_errors();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/encoding/json/encode.js
function writeJsonObject(value, fun) {
	const output = [];
	const writer = new ObjectWriter(output);
	writer.begin();
	fun(writer, value);
	writer.end();
	return output.join("");
}
var ObjectWriter;
var init_encode$1 = __esmMin((() => {
	ObjectWriter = class {
		#output;
		#isFirst;
		constructor(output) {
			this.#output = output;
			this.#isFirst = false;
		}
		begin() {
			this.#output.push("{");
			this.#isFirst = true;
		}
		end() {
			this.#output.push("}");
			this.#isFirst = false;
		}
		#key(name) {
			if (this.#isFirst) {
				this.#output.push("\"");
				this.#isFirst = false;
			} else this.#output.push(",\"");
			this.#output.push(name);
			this.#output.push("\":");
		}
		string(name, value) {
			this.#key(name);
			this.#output.push(JSON.stringify(value));
		}
		stringRaw(name, value) {
			this.#key(name);
			this.#output.push("\"");
			this.#output.push(value);
			this.#output.push("\"");
		}
		number(name, value) {
			this.#key(name);
			this.#output.push("" + value);
		}
		boolean(name, value) {
			this.#key(name);
			this.#output.push(value ? "true" : "false");
		}
		object(name, value, valueFun) {
			this.#key(name);
			this.begin();
			valueFun(this, value);
			this.end();
		}
		arrayObjects(name, values, valueFun) {
			this.#key(name);
			this.#output.push("[");
			for (let i = 0; i < values.length; ++i) {
				if (i !== 0) this.#output.push(",");
				this.begin();
				valueFun(this, values[i]);
				this.end();
			}
			this.#output.push("]");
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/util.js
var init_util$1 = __esmMin((() => {}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/decode.js
function readProtobufMessage(data, def) {
	const msgReader = new MessageReader(data);
	const fieldReader = new FieldReader(msgReader);
	let value = def.default();
	while (!msgReader.eof()) {
		const key = msgReader.varint();
		const tag = key >> 3;
		const wireType = key & 7;
		fieldReader.setup(wireType);
		const tagFun = def[tag];
		if (tagFun !== void 0) {
			const returnedValue = tagFun(fieldReader, value);
			if (returnedValue !== void 0) value = returnedValue;
		}
		fieldReader.maybeSkip();
	}
	return value;
}
var MessageReader, FieldReader;
var init_decode = __esmMin((() => {
	init_errors();
	init_util$1();
	MessageReader = class {
		#array;
		#view;
		#pos;
		constructor(array) {
			this.#array = array;
			this.#view = new DataView(array.buffer, array.byteOffset, array.byteLength);
			this.#pos = 0;
		}
		varint() {
			let value = 0;
			for (let shift = 0;; shift += 7) {
				const byte = this.#array[this.#pos++];
				value |= (byte & 127) << shift;
				if (!(byte & 128)) break;
			}
			return value;
		}
		varintBig() {
			let value = 0n;
			for (let shift = 0n;; shift += 7n) {
				const byte = this.#array[this.#pos++];
				value |= BigInt(byte & 127) << shift;
				if (!(byte & 128)) break;
			}
			return value;
		}
		bytes(length) {
			const array = new Uint8Array(this.#array.buffer, this.#array.byteOffset + this.#pos, length);
			this.#pos += length;
			return array;
		}
		double() {
			const value = this.#view.getFloat64(this.#pos, true);
			this.#pos += 8;
			return value;
		}
		skipVarint() {
			for (;;) if (!(this.#array[this.#pos++] & 128)) break;
		}
		skip(count) {
			this.#pos += count;
		}
		eof() {
			return this.#pos >= this.#array.byteLength;
		}
	};
	FieldReader = class {
		#reader;
		#wireType;
		constructor(reader) {
			this.#reader = reader;
			this.#wireType = -1;
		}
		setup(wireType) {
			this.#wireType = wireType;
		}
		#expect(expectedWireType) {
			if (this.#wireType !== expectedWireType) throw new ProtoError(`Expected wire type ${expectedWireType}, got ${this.#wireType}`);
			this.#wireType = -1;
		}
		bytes() {
			this.#expect(2);
			const length = this.#reader.varint();
			return this.#reader.bytes(length);
		}
		string() {
			return new TextDecoder().decode(this.bytes());
		}
		message(def) {
			return readProtobufMessage(this.bytes(), def);
		}
		int32() {
			this.#expect(0);
			return this.#reader.varint();
		}
		uint32() {
			return this.int32();
		}
		bool() {
			return this.int32() !== 0;
		}
		uint64() {
			this.#expect(0);
			return this.#reader.varintBig();
		}
		sint64() {
			const value = this.uint64();
			return value >> 1n ^ -(value & 1n);
		}
		double() {
			this.#expect(1);
			return this.#reader.double();
		}
		maybeSkip() {
			if (this.#wireType < 0) return;
			else if (this.#wireType === 0) this.#reader.skipVarint();
			else if (this.#wireType === 1) this.#reader.skip(8);
			else if (this.#wireType === 2) {
				const length = this.#reader.varint();
				this.#reader.skip(length);
			} else if (this.#wireType === 5) this.#reader.skip(4);
			else throw new ProtoError(`Unexpected wire type ${this.#wireType}`);
			this.#wireType = -1;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/encode.js
function writeProtobufMessage(value, fun) {
	const w = new MessageWriter();
	fun(w, value);
	return w.data();
}
var MessageWriter;
var init_encode = __esmMin((() => {
	init_util$1();
	MessageWriter = class MessageWriter {
		#buf;
		#array;
		#view;
		#pos;
		constructor() {
			this.#buf = /* @__PURE__ */ new ArrayBuffer(256);
			this.#array = new Uint8Array(this.#buf);
			this.#view = new DataView(this.#buf);
			this.#pos = 0;
		}
		#ensure(extra) {
			if (this.#pos + extra <= this.#buf.byteLength) return;
			let newCap = this.#buf.byteLength;
			while (newCap < this.#pos + extra) newCap *= 2;
			const newBuf = new ArrayBuffer(newCap);
			const newArray = new Uint8Array(newBuf);
			const newView = new DataView(newBuf);
			newArray.set(new Uint8Array(this.#buf, 0, this.#pos));
			this.#buf = newBuf;
			this.#array = newArray;
			this.#view = newView;
		}
		#varint(value) {
			this.#ensure(5);
			value = 0 | value;
			do {
				let byte = value & 127;
				value >>>= 7;
				byte |= value ? 128 : 0;
				this.#array[this.#pos++] = byte;
			} while (value);
		}
		#varintBig(value) {
			this.#ensure(10);
			value = value & 18446744073709551615n;
			do {
				let byte = Number(value & 127n);
				value >>= 7n;
				byte |= value ? 128 : 0;
				this.#array[this.#pos++] = byte;
			} while (value);
		}
		#tag(tag, wireType) {
			this.#varint(tag << 3 | wireType);
		}
		bytes(tag, value) {
			this.#tag(tag, 2);
			this.#varint(value.byteLength);
			this.#ensure(value.byteLength);
			this.#array.set(value, this.#pos);
			this.#pos += value.byteLength;
		}
		string(tag, value) {
			this.bytes(tag, new TextEncoder().encode(value));
		}
		message(tag, value, fun) {
			const writer = new MessageWriter();
			fun(writer, value);
			this.bytes(tag, writer.data());
		}
		int32(tag, value) {
			this.#tag(tag, 0);
			this.#varint(value);
		}
		uint32(tag, value) {
			this.int32(tag, value);
		}
		bool(tag, value) {
			this.int32(tag, value ? 1 : 0);
		}
		sint64(tag, value) {
			this.#tag(tag, 0);
			this.#varintBig(value << 1n ^ value >> 63n);
		}
		double(tag, value) {
			this.#tag(tag, 1);
			this.#ensure(8);
			this.#view.setFloat64(this.#pos, value, true);
			this.#pos += 8;
		}
		data() {
			return new Uint8Array(this.#buf, 0, this.#pos);
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/encoding/index.js
var init_encoding = __esmMin((() => {
	init_decode$1();
	init_encode$1();
	init_decode();
	init_encode();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/id_alloc.js
var IdAlloc;
var init_id_alloc = __esmMin((() => {
	init_errors();
	IdAlloc = class {
		#usedIds;
		#freeIds;
		constructor() {
			this.#usedIds = /* @__PURE__ */ new Set();
			this.#freeIds = /* @__PURE__ */ new Set();
		}
		alloc() {
			for (const freeId of this.#freeIds) {
				this.#freeIds.delete(freeId);
				this.#usedIds.add(freeId);
				if (!this.#usedIds.has(this.#usedIds.size - 1)) this.#freeIds.add(this.#usedIds.size - 1);
				return freeId;
			}
			const freeId = this.#usedIds.size;
			this.#usedIds.add(freeId);
			return freeId;
		}
		free(id) {
			if (!this.#usedIds.delete(id)) throw new InternalError("Freeing an id that is not allocated");
			this.#freeIds.delete(this.#usedIds.size);
			if (id < this.#usedIds.size) this.#freeIds.add(id);
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/util.js
function impossible(value, message) {
	throw new InternalError(message);
}
var init_util = __esmMin((() => {
	init_errors();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/value.js
function valueToProto(value) {
	if (value === null) return null;
	else if (typeof value === "string") return value;
	else if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new RangeError("Only finite numbers (not Infinity or NaN) can be passed as arguments");
		return value;
	} else if (typeof value === "bigint") {
		if (value < minInteger || value > maxInteger) throw new RangeError("This bigint value is too large to be represented as a 64-bit integer and passed as argument");
		return value;
	} else if (typeof value === "boolean") return value ? 1n : 0n;
	else if (value instanceof ArrayBuffer) return new Uint8Array(value);
	else if (value instanceof Uint8Array) return value;
	else if (value instanceof Date) return +value.valueOf();
	else if (typeof value === "object") return "" + value.toString();
	else throw new TypeError("Unsupported type of value");
}
function valueFromProto(value, intMode) {
	if (value === null) return null;
	else if (typeof value === "number") return value;
	else if (typeof value === "string") return value;
	else if (typeof value === "bigint") if (intMode === "number") {
		const num = Number(value);
		if (!Number.isSafeInteger(num)) throw new RangeError("Received integer which is too large to be safely represented as a JavaScript number");
		return num;
	} else if (intMode === "bigint") return value;
	else if (intMode === "string") return "" + value;
	else throw new MisuseError("Invalid value for IntMode");
	else if (value instanceof Uint8Array) return value.slice().buffer;
	else if (value === void 0) throw new ProtoError("Received unrecognized type of Value");
	else throw impossible(value, "Impossible type of Value");
}
var minInteger, maxInteger;
var init_value = __esmMin((() => {
	init_errors();
	init_util();
	minInteger = -9223372036854775808n;
	maxInteger = 9223372036854775807n;
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/result.js
function stmtResultFromProto(result) {
	return {
		affectedRowCount: result.affectedRowCount,
		lastInsertRowid: result.lastInsertRowid,
		columnNames: result.cols.map((col) => col.name),
		columnDecltypes: result.cols.map((col) => col.decltype)
	};
}
function rowsResultFromProto(result, intMode) {
	const stmtResult = stmtResultFromProto(result);
	const rows = result.rows.map((row) => rowFromProto(stmtResult.columnNames, row, intMode));
	return {
		...stmtResult,
		rows
	};
}
function rowResultFromProto(result, intMode) {
	const stmtResult = stmtResultFromProto(result);
	let row;
	if (result.rows.length > 0) row = rowFromProto(stmtResult.columnNames, result.rows[0], intMode);
	return {
		...stmtResult,
		row
	};
}
function valueResultFromProto(result, intMode) {
	const stmtResult = stmtResultFromProto(result);
	let value;
	if (result.rows.length > 0 && stmtResult.columnNames.length > 0) value = valueFromProto(result.rows[0][0], intMode);
	return {
		...stmtResult,
		value
	};
}
function rowFromProto(colNames, values, intMode) {
	const row = {};
	Object.defineProperty(row, "length", { value: values.length });
	for (let i = 0; i < values.length; ++i) {
		const value = valueFromProto(values[i], intMode);
		Object.defineProperty(row, i, { value });
		const colName = colNames[i];
		if (colName !== void 0 && !Object.hasOwn(row, colName)) Object.defineProperty(row, colName, {
			value,
			enumerable: true,
			configurable: true,
			writable: true
		});
	}
	return row;
}
function errorFromProto(error) {
	return new ResponseError(error.message, error);
}
var init_result = __esmMin((() => {
	init_errors();
	init_value();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/sql.js
function sqlToProto(owner, sql) {
	if (sql instanceof Sql) return { sqlId: sql._getSqlId(owner) };
	else return { sql: "" + sql };
}
var Sql;
var init_sql = __esmMin((() => {
	init_errors();
	Sql = class {
		#owner;
		#sqlId;
		#closed;
		/** @private */
		constructor(owner, sqlId) {
			this.#owner = owner;
			this.#sqlId = sqlId;
			this.#closed = void 0;
		}
		/** @private */
		_getSqlId(owner) {
			if (this.#owner !== owner) throw new MisuseError("Attempted to use SQL text opened with other object");
			else if (this.#closed !== void 0) throw new ClosedError("SQL text is closed", this.#closed);
			return this.#sqlId;
		}
		/** Remove the SQL text from the server, releasing resouces. */
		close() {
			this._setClosed(new ClientError("SQL text was manually closed"));
		}
		/** @private */
		_setClosed(error) {
			if (this.#closed === void 0) {
				this.#closed = error;
				this.#owner._closeSql(this.#sqlId);
			}
		}
		/** True if the SQL text is closed (removed from the server). */
		get closed() {
			return this.#closed !== void 0;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/queue.js
var Queue;
var init_queue = __esmMin((() => {
	Queue = class {
		#pushStack;
		#shiftStack;
		constructor() {
			this.#pushStack = [];
			this.#shiftStack = [];
		}
		get length() {
			return this.#pushStack.length + this.#shiftStack.length;
		}
		push(elem) {
			this.#pushStack.push(elem);
		}
		shift() {
			if (this.#shiftStack.length === 0 && this.#pushStack.length > 0) {
				this.#shiftStack = this.#pushStack.reverse();
				this.#pushStack = [];
			}
			return this.#shiftStack.pop();
		}
		first() {
			return this.#shiftStack.length !== 0 ? this.#shiftStack[this.#shiftStack.length - 1] : this.#pushStack[0];
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/stmt.js
function stmtToProto(sqlOwner, stmt, wantRows) {
	let inSql;
	let args = [];
	let namedArgs = [];
	if (stmt instanceof Stmt$2) {
		inSql = stmt.sql;
		args = stmt._args;
		for (const [name, value] of stmt._namedArgs.entries()) namedArgs.push({
			name,
			value
		});
	} else if (Array.isArray(stmt)) {
		inSql = stmt[0];
		if (Array.isArray(stmt[1])) args = stmt[1].map((arg) => valueToProto(arg));
		else namedArgs = Object.entries(stmt[1]).map(([name, value]) => {
			return {
				name,
				value: valueToProto(value)
			};
		});
	} else inSql = stmt;
	const { sql, sqlId } = sqlToProto(sqlOwner, inSql);
	return {
		sql,
		sqlId,
		args,
		namedArgs,
		wantRows
	};
}
var Stmt$2;
var init_stmt = __esmMin((() => {
	init_sql();
	init_value();
	Stmt$2 = class {
		/** The SQL statement text. */
		sql;
		/** @private */
		_args;
		/** @private */
		_namedArgs;
		/** Initialize the statement with given SQL text. */
		constructor(sql) {
			this.sql = sql;
			this._args = [];
			this._namedArgs = /* @__PURE__ */ new Map();
		}
		/** Binds positional parameters from the given `values`. All previous positional bindings are cleared. */
		bindIndexes(values) {
			this._args.length = 0;
			for (const value of values) this._args.push(valueToProto(value));
			return this;
		}
		/** Binds a parameter by a 1-based index. */
		bindIndex(index, value) {
			if (index !== (index | 0) || index <= 0) throw new RangeError("Index of a positional argument must be positive integer");
			while (this._args.length < index) this._args.push(null);
			this._args[index - 1] = valueToProto(value);
			return this;
		}
		/** Binds a parameter by name. */
		bindName(name, value) {
			this._namedArgs.set(name, valueToProto(value));
			return this;
		}
		/** Clears all bindings. */
		unbindAll() {
			this._args.length = 0;
			this._namedArgs.clear();
			return this;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/batch.js
function executeRegular(stream, steps, batch) {
	return stream._batch(batch).then((result) => {
		for (let step = 0; step < steps.length; ++step) {
			const stepResult = result.stepResults.get(step);
			const stepError = result.stepErrors.get(step);
			steps[step].callback(stepResult, stepError);
		}
	});
}
async function executeCursor(stream, steps, batch) {
	const cursor = await stream._openCursor(batch);
	try {
		let nextStep = 0;
		let beginEntry = void 0;
		let rows = [];
		for (;;) {
			const entry = await cursor.next();
			if (entry === void 0) break;
			if (entry.type === "step_begin") {
				if (entry.step < nextStep || entry.step >= steps.length) throw new ProtoError("Server produced StepBeginEntry for unexpected step");
				else if (beginEntry !== void 0) throw new ProtoError("Server produced StepBeginEntry before terminating previous step");
				for (let step = nextStep; step < entry.step; ++step) steps[step].callback(void 0, void 0);
				nextStep = entry.step + 1;
				beginEntry = entry;
				rows = [];
			} else if (entry.type === "step_end") {
				if (beginEntry === void 0) throw new ProtoError("Server produced StepEndEntry but no step is active");
				const stmtResult = {
					cols: beginEntry.cols,
					rows,
					affectedRowCount: entry.affectedRowCount,
					lastInsertRowid: entry.lastInsertRowid
				};
				steps[beginEntry.step].callback(stmtResult, void 0);
				beginEntry = void 0;
				rows = [];
			} else if (entry.type === "step_error") {
				if (beginEntry === void 0) {
					if (entry.step >= steps.length) throw new ProtoError("Server produced StepErrorEntry for unexpected step");
					for (let step = nextStep; step < entry.step; ++step) steps[step].callback(void 0, void 0);
				} else {
					if (entry.step !== beginEntry.step) throw new ProtoError("Server produced StepErrorEntry for unexpected step");
					beginEntry = void 0;
					rows = [];
				}
				steps[entry.step].callback(void 0, entry.error);
				nextStep = entry.step + 1;
			} else if (entry.type === "row") {
				if (beginEntry === void 0) throw new ProtoError("Server produced RowEntry but no step is active");
				rows.push(entry.row);
			} else if (entry.type === "error") throw errorFromProto(entry.error);
			else if (entry.type === "none") throw new ProtoError("Server produced unrecognized CursorEntry");
			else throw impossible(entry, "Impossible CursorEntry");
		}
		if (beginEntry !== void 0) throw new ProtoError("Server closed Cursor before terminating active step");
		for (let step = nextStep; step < steps.length; ++step) steps[step].callback(void 0, void 0);
	} finally {
		cursor.close();
	}
}
function stepIndex(step) {
	if (step._index === void 0) throw new MisuseError("Cannot add a condition referencing a step that has not been added to the batch");
	return step._index;
}
function checkCondBatch(expectedBatch, cond) {
	if (cond._batch !== expectedBatch) throw new MisuseError("Cannot mix BatchCond objects for different Batch objects");
}
var Batch$2, BatchStep$2, BatchCond$2;
var init_batch = __esmMin((() => {
	init_errors();
	init_result();
	init_stmt();
	init_util();
	Batch$2 = class {
		/** @private */
		_stream;
		#useCursor;
		/** @private */
		_steps;
		#executed;
		/** @private */
		constructor(stream, useCursor) {
			this._stream = stream;
			this.#useCursor = useCursor;
			this._steps = [];
			this.#executed = false;
		}
		/** Return a builder for adding a step to the batch. */
		step() {
			return new BatchStep$2(this);
		}
		/** Execute the batch. */
		execute() {
			if (this.#executed) throw new MisuseError("This batch has already been executed");
			this.#executed = true;
			const batch = { steps: this._steps.map((step) => step.proto) };
			if (this.#useCursor) return executeCursor(this._stream, this._steps, batch);
			else return executeRegular(this._stream, this._steps, batch);
		}
	};
	BatchStep$2 = class {
		/** @private */
		_batch;
		#conds;
		/** @private */
		_index;
		/** @private */
		constructor(batch) {
			this._batch = batch;
			this.#conds = [];
			this._index = void 0;
		}
		/** Add the condition that needs to be satisfied to execute the statement. If you use this method multiple
		* times, we join the conditions with a logical AND. */
		condition(cond) {
			this.#conds.push(cond._proto);
			return this;
		}
		/** Add a statement that returns rows. */
		query(stmt) {
			return this.#add(stmt, true, rowsResultFromProto);
		}
		/** Add a statement that returns at most a single row. */
		queryRow(stmt) {
			return this.#add(stmt, true, rowResultFromProto);
		}
		/** Add a statement that returns at most a single value. */
		queryValue(stmt) {
			return this.#add(stmt, true, valueResultFromProto);
		}
		/** Add a statement without returning rows. */
		run(stmt) {
			return this.#add(stmt, false, stmtResultFromProto);
		}
		#add(inStmt, wantRows, fromProto) {
			if (this._index !== void 0) throw new MisuseError("This BatchStep has already been added to the batch");
			const stmt = stmtToProto(this._batch._stream._sqlOwner(), inStmt, wantRows);
			let condition;
			if (this.#conds.length === 0) condition = void 0;
			else if (this.#conds.length === 1) condition = this.#conds[0];
			else condition = {
				type: "and",
				conds: this.#conds.slice()
			};
			const proto = {
				stmt,
				condition
			};
			return new Promise((outputCallback, errorCallback) => {
				const callback = (stepResult, stepError) => {
					if (stepResult !== void 0 && stepError !== void 0) errorCallback(new ProtoError("Server returned both result and error"));
					else if (stepError !== void 0) errorCallback(errorFromProto(stepError));
					else if (stepResult !== void 0) outputCallback(fromProto(stepResult, this._batch._stream.intMode));
					else outputCallback(void 0);
				};
				this._index = this._batch._steps.length;
				this._batch._steps.push({
					proto,
					callback
				});
			});
		}
	};
	BatchCond$2 = class BatchCond$2 {
		/** @private */
		_batch;
		/** @private */
		_proto;
		/** @private */
		constructor(batch, proto) {
			this._batch = batch;
			this._proto = proto;
		}
		/** Create a condition that evaluates to true when the given step executes successfully.
		*
		* If the given step fails error or is skipped because its condition evaluated to false, this
		* condition evaluates to false.
		*/
		static ok(step) {
			return new BatchCond$2(step._batch, {
				type: "ok",
				step: stepIndex(step)
			});
		}
		/** Create a condition that evaluates to true when the given step fails.
		*
		* If the given step succeeds or is skipped because its condition evaluated to false, this condition
		* evaluates to false.
		*/
		static error(step) {
			return new BatchCond$2(step._batch, {
				type: "error",
				step: stepIndex(step)
			});
		}
		/** Create a condition that is a logical negation of another condition.
		*/
		static not(cond) {
			return new BatchCond$2(cond._batch, {
				type: "not",
				cond: cond._proto
			});
		}
		/** Create a condition that is a logical AND of other conditions.
		*/
		static and(batch, conds) {
			for (const cond of conds) checkCondBatch(batch, cond);
			return new BatchCond$2(batch, {
				type: "and",
				conds: conds.map((e) => e._proto)
			});
		}
		/** Create a condition that is a logical OR of other conditions.
		*/
		static or(batch, conds) {
			for (const cond of conds) checkCondBatch(batch, cond);
			return new BatchCond$2(batch, {
				type: "or",
				conds: conds.map((e) => e._proto)
			});
		}
		/** Create a condition that evaluates to true when the SQL connection is in autocommit mode (not inside an
		* explicit transaction). This requires protocol version 3 or higher.
		*/
		static isAutocommit(batch) {
			batch._stream.client()._ensureVersion(3, "BatchCond.isAutocommit()");
			return new BatchCond$2(batch, { type: "is_autocommit" });
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/describe.js
function describeResultFromProto(result) {
	return {
		paramNames: result.params.map((p) => p.name),
		columns: result.cols,
		isExplain: result.isExplain,
		isReadonly: result.isReadonly
	};
}
var init_describe = __esmMin((() => {}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/stream.js
var Stream;
var init_stream$2 = __esmMin((() => {
	init_batch();
	init_describe();
	init_result();
	init_sql();
	init_stmt();
	Stream = class {
		/** @private */
		constructor(intMode) {
			this.intMode = intMode;
		}
		/** Execute a statement and return rows. */
		query(stmt) {
			return this.#execute(stmt, true, rowsResultFromProto);
		}
		/** Execute a statement and return at most a single row. */
		queryRow(stmt) {
			return this.#execute(stmt, true, rowResultFromProto);
		}
		/** Execute a statement and return at most a single value. */
		queryValue(stmt) {
			return this.#execute(stmt, true, valueResultFromProto);
		}
		/** Execute a statement without returning rows. */
		run(stmt) {
			return this.#execute(stmt, false, stmtResultFromProto);
		}
		#execute(inStmt, wantRows, fromProto) {
			const stmt = stmtToProto(this._sqlOwner(), inStmt, wantRows);
			return this._execute(stmt).then((r) => fromProto(r, this.intMode));
		}
		/** Return a builder for creating and executing a batch.
		*
		* If `useCursor` is true, the batch will be executed using a Hrana cursor, which will stream results from
		* the server to the client, which consumes less memory on the server. This requires protocol version 3 or
		* higher.
		*/
		batch(useCursor = false) {
			return new Batch$2(this, useCursor);
		}
		/** Parse and analyze a statement. This requires protocol version 2 or higher. */
		describe(inSql) {
			const protoSql = sqlToProto(this._sqlOwner(), inSql);
			return this._describe(protoSql).then(describeResultFromProto);
		}
		/** Execute a sequence of statements separated by semicolons. This requires protocol version 2 or higher.
		* */
		sequence(inSql) {
			const protoSql = sqlToProto(this._sqlOwner(), inSql);
			return this._sequence(protoSql);
		}
		/** Representation of integers returned from the database. See {@link IntMode}.
		*
		* This value affects the results of all operations on this stream.
		*/
		intMode;
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/cursor.js
var Cursor;
var init_cursor$2 = __esmMin((() => {
	Cursor = class {};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/cursor.js
var fetchChunkSize, fetchQueueSize, WsCursor;
var init_cursor$1 = __esmMin((() => {
	init_errors();
	init_cursor$2();
	init_queue();
	fetchChunkSize = 1e3;
	fetchQueueSize = 10;
	WsCursor = class extends Cursor {
		#client;
		#stream;
		#cursorId;
		#entryQueue;
		#fetchQueue;
		#closed;
		#done;
		/** @private */
		constructor(client, stream, cursorId) {
			super();
			this.#client = client;
			this.#stream = stream;
			this.#cursorId = cursorId;
			this.#entryQueue = new Queue();
			this.#fetchQueue = new Queue();
			this.#closed = void 0;
			this.#done = false;
		}
		/** Fetch the next entry from the cursor. */
		async next() {
			for (;;) {
				if (this.#closed !== void 0) throw new ClosedError("Cursor is closed", this.#closed);
				while (!this.#done && this.#fetchQueue.length < fetchQueueSize) this.#fetchQueue.push(this.#fetch());
				const entry = this.#entryQueue.shift();
				if (this.#done || entry !== void 0) return entry;
				await this.#fetchQueue.shift().then((response) => {
					if (response === void 0) return;
					for (const entry of response.entries) this.#entryQueue.push(entry);
					this.#done ||= response.done;
				});
			}
		}
		#fetch() {
			return this.#stream._sendCursorRequest(this, {
				type: "fetch_cursor",
				cursorId: this.#cursorId,
				maxCount: fetchChunkSize
			}).then((resp) => resp, (error) => {
				this._setClosed(error);
			});
		}
		/** @private */
		_setClosed(error) {
			if (this.#closed !== void 0) return;
			this.#closed = error;
			this.#stream._sendCursorRequest(this, {
				type: "close_cursor",
				cursorId: this.#cursorId
			}).catch(() => void 0);
			this.#stream._cursorClosed(this);
		}
		/** Close the cursor. */
		close() {
			this._setClosed(new ClientError("Cursor was manually closed"));
		}
		/** True if the cursor is closed. */
		get closed() {
			return this.#closed !== void 0;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/stream.js
var WsStream;
var init_stream$1 = __esmMin((() => {
	init_errors();
	init_queue();
	init_stream$2();
	init_cursor$1();
	WsStream = class WsStream extends Stream {
		#client;
		#streamId;
		#queue;
		#cursor;
		#closing;
		#closed;
		/** @private */
		static open(client) {
			const streamId = client._streamIdAlloc.alloc();
			const stream = new WsStream(client, streamId);
			const responseCallback = () => void 0;
			const errorCallback = (e) => stream.#setClosed(e);
			const request = {
				type: "open_stream",
				streamId
			};
			client._sendRequest(request, {
				responseCallback,
				errorCallback
			});
			return stream;
		}
		/** @private */
		constructor(client, streamId) {
			super(client.intMode);
			this.#client = client;
			this.#streamId = streamId;
			this.#queue = new Queue();
			this.#cursor = void 0;
			this.#closing = false;
			this.#closed = void 0;
		}
		/** Get the {@link WsClient} object that this stream belongs to. */
		client() {
			return this.#client;
		}
		/** @private */
		_sqlOwner() {
			return this.#client;
		}
		/** @private */
		_execute(stmt) {
			return this.#sendStreamRequest({
				type: "execute",
				streamId: this.#streamId,
				stmt
			}).then((response) => {
				return response.result;
			});
		}
		/** @private */
		_batch(batch) {
			return this.#sendStreamRequest({
				type: "batch",
				streamId: this.#streamId,
				batch
			}).then((response) => {
				return response.result;
			});
		}
		/** @private */
		_describe(protoSql) {
			this.#client._ensureVersion(2, "describe()");
			return this.#sendStreamRequest({
				type: "describe",
				streamId: this.#streamId,
				sql: protoSql.sql,
				sqlId: protoSql.sqlId
			}).then((response) => {
				return response.result;
			});
		}
		/** @private */
		_sequence(protoSql) {
			this.#client._ensureVersion(2, "sequence()");
			return this.#sendStreamRequest({
				type: "sequence",
				streamId: this.#streamId,
				sql: protoSql.sql,
				sqlId: protoSql.sqlId
			}).then((_response) => {});
		}
		/** Check whether the SQL connection underlying this stream is in autocommit state (i.e., outside of an
		* explicit transaction). This requires protocol version 3 or higher.
		*/
		getAutocommit() {
			this.#client._ensureVersion(3, "getAutocommit()");
			return this.#sendStreamRequest({
				type: "get_autocommit",
				streamId: this.#streamId
			}).then((response) => {
				return response.isAutocommit;
			});
		}
		#sendStreamRequest(request) {
			return new Promise((responseCallback, errorCallback) => {
				this.#pushToQueue({
					type: "request",
					request,
					responseCallback,
					errorCallback
				});
			});
		}
		/** @private */
		_openCursor(batch) {
			this.#client._ensureVersion(3, "cursor");
			return new Promise((cursorCallback, errorCallback) => {
				this.#pushToQueue({
					type: "cursor",
					batch,
					cursorCallback,
					errorCallback
				});
			});
		}
		/** @private */
		_sendCursorRequest(cursor, request) {
			if (cursor !== this.#cursor) throw new InternalError("Cursor not associated with the stream attempted to execute a request");
			return new Promise((responseCallback, errorCallback) => {
				if (this.#closed !== void 0) errorCallback(new ClosedError("Stream is closed", this.#closed));
				else this.#client._sendRequest(request, {
					responseCallback,
					errorCallback
				});
			});
		}
		/** @private */
		_cursorClosed(cursor) {
			if (cursor !== this.#cursor) throw new InternalError("Cursor was closed, but it was not associated with the stream");
			this.#cursor = void 0;
			this.#flushQueue();
		}
		#pushToQueue(entry) {
			if (this.#closed !== void 0) entry.errorCallback(new ClosedError("Stream is closed", this.#closed));
			else if (this.#closing) entry.errorCallback(new ClosedError("Stream is closing", void 0));
			else {
				this.#queue.push(entry);
				this.#flushQueue();
			}
		}
		#flushQueue() {
			for (;;) {
				const entry = this.#queue.first();
				if (entry === void 0 && this.#cursor === void 0 && this.#closing) {
					this.#setClosed(new ClientError("Stream was gracefully closed"));
					break;
				} else if (entry?.type === "request" && this.#cursor === void 0) {
					const { request, responseCallback, errorCallback } = entry;
					this.#queue.shift();
					this.#client._sendRequest(request, {
						responseCallback,
						errorCallback
					});
				} else if (entry?.type === "cursor" && this.#cursor === void 0) {
					const { batch, cursorCallback } = entry;
					this.#queue.shift();
					const cursorId = this.#client._cursorIdAlloc.alloc();
					const cursor = new WsCursor(this.#client, this, cursorId);
					const request = {
						type: "open_cursor",
						streamId: this.#streamId,
						cursorId,
						batch
					};
					const responseCallback = () => void 0;
					const errorCallback = (e) => cursor._setClosed(e);
					this.#client._sendRequest(request, {
						responseCallback,
						errorCallback
					});
					this.#cursor = cursor;
					cursorCallback(cursor);
				} else break;
			}
		}
		#setClosed(error) {
			if (this.#closed !== void 0) return;
			this.#closed = error;
			if (this.#cursor !== void 0) this.#cursor._setClosed(error);
			for (;;) {
				const entry = this.#queue.shift();
				if (entry !== void 0) entry.errorCallback(error);
				else break;
			}
			const request = {
				type: "close_stream",
				streamId: this.#streamId
			};
			const responseCallback = () => this.#client._streamIdAlloc.free(this.#streamId);
			const errorCallback = () => void 0;
			this.#client._sendRequest(request, {
				responseCallback,
				errorCallback
			});
		}
		/** Immediately close the stream. */
		close() {
			this.#setClosed(new ClientError("Stream was manually closed"));
		}
		/** Gracefully close the stream. */
		closeGracefully() {
			this.#closing = true;
			this.#flushQueue();
		}
		/** True if the stream is closed or closing. */
		get closed() {
			return this.#closed !== void 0 || this.#closing;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/shared/json_encode.js
function Stmt$1(w, msg) {
	if (msg.sql !== void 0) w.string("sql", msg.sql);
	if (msg.sqlId !== void 0) w.number("sql_id", msg.sqlId);
	w.arrayObjects("args", msg.args, Value$3);
	w.arrayObjects("named_args", msg.namedArgs, NamedArg$1);
	w.boolean("want_rows", msg.wantRows);
}
function NamedArg$1(w, msg) {
	w.string("name", msg.name);
	w.object("value", msg.value, Value$3);
}
function Batch$1(w, msg) {
	w.arrayObjects("steps", msg.steps, BatchStep$1);
}
function BatchStep$1(w, msg) {
	if (msg.condition !== void 0) w.object("condition", msg.condition, BatchCond$1);
	w.object("stmt", msg.stmt, Stmt$1);
}
function BatchCond$1(w, msg) {
	w.stringRaw("type", msg.type);
	if (msg.type === "ok" || msg.type === "error") w.number("step", msg.step);
	else if (msg.type === "not") w.object("cond", msg.cond, BatchCond$1);
	else if (msg.type === "and" || msg.type === "or") w.arrayObjects("conds", msg.conds, BatchCond$1);
	else if (msg.type === "is_autocommit") {} else throw impossible(msg, "Impossible type of BatchCond");
}
function Value$3(w, msg) {
	if (msg === null) w.stringRaw("type", "null");
	else if (typeof msg === "bigint") {
		w.stringRaw("type", "integer");
		w.stringRaw("value", "" + msg);
	} else if (typeof msg === "number") {
		w.stringRaw("type", "float");
		w.number("value", msg);
	} else if (typeof msg === "string") {
		w.stringRaw("type", "text");
		w.string("value", msg);
	} else if (msg instanceof Uint8Array) {
		w.stringRaw("type", "blob");
		w.stringRaw("base64", gBase64.fromUint8Array(msg));
	} else if (msg === void 0) {} else throw impossible(msg, "Impossible type of Value");
}
var init_json_encode$2 = __esmMin((() => {
	init_base64();
	init_util();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/json_encode.js
function ClientMsg$1(w, msg) {
	w.stringRaw("type", msg.type);
	if (msg.type === "hello") {
		if (msg.jwt !== void 0) w.string("jwt", msg.jwt);
	} else if (msg.type === "request") {
		w.number("request_id", msg.requestId);
		w.object("request", msg.request, Request$1);
	} else throw impossible(msg, "Impossible type of ClientMsg");
}
function Request$1(w, msg) {
	w.stringRaw("type", msg.type);
	if (msg.type === "open_stream") w.number("stream_id", msg.streamId);
	else if (msg.type === "close_stream") w.number("stream_id", msg.streamId);
	else if (msg.type === "execute") {
		w.number("stream_id", msg.streamId);
		w.object("stmt", msg.stmt, Stmt$1);
	} else if (msg.type === "batch") {
		w.number("stream_id", msg.streamId);
		w.object("batch", msg.batch, Batch$1);
	} else if (msg.type === "open_cursor") {
		w.number("stream_id", msg.streamId);
		w.number("cursor_id", msg.cursorId);
		w.object("batch", msg.batch, Batch$1);
	} else if (msg.type === "close_cursor") w.number("cursor_id", msg.cursorId);
	else if (msg.type === "fetch_cursor") {
		w.number("cursor_id", msg.cursorId);
		w.number("max_count", msg.maxCount);
	} else if (msg.type === "sequence") {
		w.number("stream_id", msg.streamId);
		if (msg.sql !== void 0) w.string("sql", msg.sql);
		if (msg.sqlId !== void 0) w.number("sql_id", msg.sqlId);
	} else if (msg.type === "describe") {
		w.number("stream_id", msg.streamId);
		if (msg.sql !== void 0) w.string("sql", msg.sql);
		if (msg.sqlId !== void 0) w.number("sql_id", msg.sqlId);
	} else if (msg.type === "store_sql") {
		w.number("sql_id", msg.sqlId);
		w.string("sql", msg.sql);
	} else if (msg.type === "close_sql") w.number("sql_id", msg.sqlId);
	else if (msg.type === "get_autocommit") w.number("stream_id", msg.streamId);
	else throw impossible(msg, "Impossible type of Request");
}
var init_json_encode$1 = __esmMin((() => {
	init_json_encode$2();
	init_util();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/shared/protobuf_encode.js
function Stmt(w, msg) {
	if (msg.sql !== void 0) w.string(1, msg.sql);
	if (msg.sqlId !== void 0) w.int32(2, msg.sqlId);
	for (const arg of msg.args) w.message(3, arg, Value$2);
	for (const arg of msg.namedArgs) w.message(4, arg, NamedArg);
	w.bool(5, msg.wantRows);
}
function NamedArg(w, msg) {
	w.string(1, msg.name);
	w.message(2, msg.value, Value$2);
}
function Batch(w, msg) {
	for (const step of msg.steps) w.message(1, step, BatchStep);
}
function BatchStep(w, msg) {
	if (msg.condition !== void 0) w.message(1, msg.condition, BatchCond);
	w.message(2, msg.stmt, Stmt);
}
function BatchCond(w, msg) {
	if (msg.type === "ok") w.uint32(1, msg.step);
	else if (msg.type === "error") w.uint32(2, msg.step);
	else if (msg.type === "not") w.message(3, msg.cond, BatchCond);
	else if (msg.type === "and") w.message(4, msg.conds, BatchCondList);
	else if (msg.type === "or") w.message(5, msg.conds, BatchCondList);
	else if (msg.type === "is_autocommit") w.message(6, void 0, Empty);
	else throw impossible(msg, "Impossible type of BatchCond");
}
function BatchCondList(w, msg) {
	for (const cond of msg) w.message(1, cond, BatchCond);
}
function Value$2(w, msg) {
	if (msg === null) w.message(1, void 0, Empty);
	else if (typeof msg === "bigint") w.sint64(2, msg);
	else if (typeof msg === "number") w.double(3, msg);
	else if (typeof msg === "string") w.string(4, msg);
	else if (msg instanceof Uint8Array) w.bytes(5, msg);
	else if (msg === void 0) {} else throw impossible(msg, "Impossible type of Value");
}
function Empty(_w, _msg) {}
var init_protobuf_encode$2 = __esmMin((() => {
	init_util();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/protobuf_encode.js
function ClientMsg(w, msg) {
	if (msg.type === "hello") w.message(1, msg, HelloMsg);
	else if (msg.type === "request") w.message(2, msg, RequestMsg);
	else throw impossible(msg, "Impossible type of ClientMsg");
}
function HelloMsg(w, msg) {
	if (msg.jwt !== void 0) w.string(1, msg.jwt);
}
function RequestMsg(w, msg) {
	w.int32(1, msg.requestId);
	const request = msg.request;
	if (request.type === "open_stream") w.message(2, request, OpenStreamReq);
	else if (request.type === "close_stream") w.message(3, request, CloseStreamReq$1);
	else if (request.type === "execute") w.message(4, request, ExecuteReq);
	else if (request.type === "batch") w.message(5, request, BatchReq);
	else if (request.type === "open_cursor") w.message(6, request, OpenCursorReq);
	else if (request.type === "close_cursor") w.message(7, request, CloseCursorReq);
	else if (request.type === "fetch_cursor") w.message(8, request, FetchCursorReq);
	else if (request.type === "sequence") w.message(9, request, SequenceReq);
	else if (request.type === "describe") w.message(10, request, DescribeReq);
	else if (request.type === "store_sql") w.message(11, request, StoreSqlReq);
	else if (request.type === "close_sql") w.message(12, request, CloseSqlReq);
	else if (request.type === "get_autocommit") w.message(13, request, GetAutocommitReq);
	else throw impossible(request, "Impossible type of Request");
}
function OpenStreamReq(w, msg) {
	w.int32(1, msg.streamId);
}
function CloseStreamReq$1(w, msg) {
	w.int32(1, msg.streamId);
}
function ExecuteReq(w, msg) {
	w.int32(1, msg.streamId);
	w.message(2, msg.stmt, Stmt);
}
function BatchReq(w, msg) {
	w.int32(1, msg.streamId);
	w.message(2, msg.batch, Batch);
}
function OpenCursorReq(w, msg) {
	w.int32(1, msg.streamId);
	w.int32(2, msg.cursorId);
	w.message(3, msg.batch, Batch);
}
function CloseCursorReq(w, msg) {
	w.int32(1, msg.cursorId);
}
function FetchCursorReq(w, msg) {
	w.int32(1, msg.cursorId);
	w.uint32(2, msg.maxCount);
}
function SequenceReq(w, msg) {
	w.int32(1, msg.streamId);
	if (msg.sql !== void 0) w.string(2, msg.sql);
	if (msg.sqlId !== void 0) w.int32(3, msg.sqlId);
}
function DescribeReq(w, msg) {
	w.int32(1, msg.streamId);
	if (msg.sql !== void 0) w.string(2, msg.sql);
	if (msg.sqlId !== void 0) w.int32(3, msg.sqlId);
}
function StoreSqlReq(w, msg) {
	w.int32(1, msg.sqlId);
	w.string(2, msg.sql);
}
function CloseSqlReq(w, msg) {
	w.int32(1, msg.sqlId);
}
function GetAutocommitReq(w, msg) {
	w.int32(1, msg.streamId);
}
var init_protobuf_encode$1 = __esmMin((() => {
	init_protobuf_encode$2();
	init_util();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/shared/json_decode.js
function Error$2(obj) {
	return {
		message: string(obj["message"]),
		code: stringOpt(obj["code"])
	};
}
function StmtResult$1(obj) {
	const cols = arrayObjectsMap(obj["cols"], Col$1);
	const rows = array(obj["rows"]).map((rowObj) => arrayObjectsMap(rowObj, Value$1));
	const affectedRowCount = number(obj["affected_row_count"]);
	const lastInsertRowidStr = stringOpt(obj["last_insert_rowid"]);
	return {
		cols,
		rows,
		affectedRowCount,
		lastInsertRowid: lastInsertRowidStr !== void 0 ? BigInt(lastInsertRowidStr) : void 0
	};
}
function Col$1(obj) {
	return {
		name: stringOpt(obj["name"]),
		decltype: stringOpt(obj["decltype"])
	};
}
function BatchResult$1(obj) {
	const stepResults = /* @__PURE__ */ new Map();
	array(obj["step_results"]).forEach((value, i) => {
		if (value !== null) stepResults.set(i, StmtResult$1(object(value)));
	});
	const stepErrors = /* @__PURE__ */ new Map();
	array(obj["step_errors"]).forEach((value, i) => {
		if (value !== null) stepErrors.set(i, Error$2(object(value)));
	});
	return {
		stepResults,
		stepErrors
	};
}
function CursorEntry$1(obj) {
	const type = string(obj["type"]);
	if (type === "step_begin") return {
		type: "step_begin",
		step: number(obj["step"]),
		cols: arrayObjectsMap(obj["cols"], Col$1)
	};
	else if (type === "step_end") {
		const affectedRowCount = number(obj["affected_row_count"]);
		const lastInsertRowidStr = stringOpt(obj["last_insert_rowid"]);
		return {
			type: "step_end",
			affectedRowCount,
			lastInsertRowid: lastInsertRowidStr !== void 0 ? BigInt(lastInsertRowidStr) : void 0
		};
	} else if (type === "step_error") return {
		type: "step_error",
		step: number(obj["step"]),
		error: Error$2(object(obj["error"]))
	};
	else if (type === "row") return {
		type: "row",
		row: arrayObjectsMap(obj["row"], Value$1)
	};
	else if (type === "error") return {
		type: "error",
		error: Error$2(object(obj["error"]))
	};
	else throw new ProtoError("Unexpected type of CursorEntry");
}
function DescribeResult$1(obj) {
	return {
		params: arrayObjectsMap(obj["params"], DescribeParam$1),
		cols: arrayObjectsMap(obj["cols"], DescribeCol$1),
		isExplain: boolean(obj["is_explain"]),
		isReadonly: boolean(obj["is_readonly"])
	};
}
function DescribeParam$1(obj) {
	return { name: stringOpt(obj["name"]) };
}
function DescribeCol$1(obj) {
	return {
		name: string(obj["name"]),
		decltype: stringOpt(obj["decltype"])
	};
}
function Value$1(obj) {
	const type = string(obj["type"]);
	if (type === "null") return null;
	else if (type === "integer") {
		const value = string(obj["value"]);
		return BigInt(value);
	} else if (type === "float") return number(obj["value"]);
	else if (type === "text") return string(obj["value"]);
	else if (type === "blob") return gBase64.toUint8Array(string(obj["base64"]));
	else throw new ProtoError("Unexpected type of Value");
}
var init_json_decode$2 = __esmMin((() => {
	init_base64();
	init_errors();
	init_decode$1();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/json_decode.js
function ServerMsg$1(obj) {
	const type = string(obj["type"]);
	if (type === "hello_ok") return { type: "hello_ok" };
	else if (type === "hello_error") return {
		type: "hello_error",
		error: Error$2(object(obj["error"]))
	};
	else if (type === "response_ok") return {
		type: "response_ok",
		requestId: number(obj["request_id"]),
		response: Response(object(obj["response"]))
	};
	else if (type === "response_error") return {
		type: "response_error",
		requestId: number(obj["request_id"]),
		error: Error$2(object(obj["error"]))
	};
	else throw new ProtoError("Unexpected type of ServerMsg");
}
function Response(obj) {
	const type = string(obj["type"]);
	if (type === "open_stream") return { type: "open_stream" };
	else if (type === "close_stream") return { type: "close_stream" };
	else if (type === "execute") return {
		type: "execute",
		result: StmtResult$1(object(obj["result"]))
	};
	else if (type === "batch") return {
		type: "batch",
		result: BatchResult$1(object(obj["result"]))
	};
	else if (type === "open_cursor") return { type: "open_cursor" };
	else if (type === "close_cursor") return { type: "close_cursor" };
	else if (type === "fetch_cursor") return {
		type: "fetch_cursor",
		entries: arrayObjectsMap(obj["entries"], CursorEntry$1),
		done: boolean(obj["done"])
	};
	else if (type === "sequence") return { type: "sequence" };
	else if (type === "describe") return {
		type: "describe",
		result: DescribeResult$1(object(obj["result"]))
	};
	else if (type === "store_sql") return { type: "store_sql" };
	else if (type === "close_sql") return { type: "close_sql" };
	else if (type === "get_autocommit") return {
		type: "get_autocommit",
		isAutocommit: boolean(obj["is_autocommit"])
	};
	else throw new ProtoError("Unexpected type of Response");
}
var init_json_decode$1 = __esmMin((() => {
	init_errors();
	init_decode$1();
	init_json_decode$2();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/shared/protobuf_decode.js
var Error$1, StmtResult, Col, Row, BatchResult, BatchResultStepResult, BatchResultStepError, CursorEntry, StepBeginEntry, StepEndEntry, StepErrorEntry, DescribeResult, DescribeParam, DescribeCol, Value;
var init_protobuf_decode$2 = __esmMin((() => {
	Error$1 = {
		default() {
			return {
				message: "",
				code: void 0
			};
		},
		1(r, msg) {
			msg.message = r.string();
		},
		2(r, msg) {
			msg.code = r.string();
		}
	};
	StmtResult = {
		default() {
			return {
				cols: [],
				rows: [],
				affectedRowCount: 0,
				lastInsertRowid: void 0
			};
		},
		1(r, msg) {
			msg.cols.push(r.message(Col));
		},
		2(r, msg) {
			msg.rows.push(r.message(Row));
		},
		3(r, msg) {
			msg.affectedRowCount = Number(r.uint64());
		},
		4(r, msg) {
			msg.lastInsertRowid = r.sint64();
		}
	};
	Col = {
		default() {
			return {
				name: void 0,
				decltype: void 0
			};
		},
		1(r, msg) {
			msg.name = r.string();
		},
		2(r, msg) {
			msg.decltype = r.string();
		}
	};
	Row = {
		default() {
			return [];
		},
		1(r, msg) {
			msg.push(r.message(Value));
		}
	};
	BatchResult = {
		default() {
			return {
				stepResults: /* @__PURE__ */ new Map(),
				stepErrors: /* @__PURE__ */ new Map()
			};
		},
		1(r, msg) {
			const [key, value] = r.message(BatchResultStepResult);
			msg.stepResults.set(key, value);
		},
		2(r, msg) {
			const [key, value] = r.message(BatchResultStepError);
			msg.stepErrors.set(key, value);
		}
	};
	BatchResultStepResult = {
		default() {
			return [0, StmtResult.default()];
		},
		1(r, msg) {
			msg[0] = r.uint32();
		},
		2(r, msg) {
			msg[1] = r.message(StmtResult);
		}
	};
	BatchResultStepError = {
		default() {
			return [0, Error$1.default()];
		},
		1(r, msg) {
			msg[0] = r.uint32();
		},
		2(r, msg) {
			msg[1] = r.message(Error$1);
		}
	};
	CursorEntry = {
		default() {
			return { type: "none" };
		},
		1(r) {
			return r.message(StepBeginEntry);
		},
		2(r) {
			return r.message(StepEndEntry);
		},
		3(r) {
			return r.message(StepErrorEntry);
		},
		4(r) {
			return {
				type: "row",
				row: r.message(Row)
			};
		},
		5(r) {
			return {
				type: "error",
				error: r.message(Error$1)
			};
		}
	};
	StepBeginEntry = {
		default() {
			return {
				type: "step_begin",
				step: 0,
				cols: []
			};
		},
		1(r, msg) {
			msg.step = r.uint32();
		},
		2(r, msg) {
			msg.cols.push(r.message(Col));
		}
	};
	StepEndEntry = {
		default() {
			return {
				type: "step_end",
				affectedRowCount: 0,
				lastInsertRowid: void 0
			};
		},
		1(r, msg) {
			msg.affectedRowCount = r.uint32();
		},
		2(r, msg) {
			msg.lastInsertRowid = r.uint64();
		}
	};
	StepErrorEntry = {
		default() {
			return {
				type: "step_error",
				step: 0,
				error: Error$1.default()
			};
		},
		1(r, msg) {
			msg.step = r.uint32();
		},
		2(r, msg) {
			msg.error = r.message(Error$1);
		}
	};
	DescribeResult = {
		default() {
			return {
				params: [],
				cols: [],
				isExplain: false,
				isReadonly: false
			};
		},
		1(r, msg) {
			msg.params.push(r.message(DescribeParam));
		},
		2(r, msg) {
			msg.cols.push(r.message(DescribeCol));
		},
		3(r, msg) {
			msg.isExplain = r.bool();
		},
		4(r, msg) {
			msg.isReadonly = r.bool();
		}
	};
	DescribeParam = {
		default() {
			return { name: void 0 };
		},
		1(r, msg) {
			msg.name = r.string();
		}
	};
	DescribeCol = {
		default() {
			return {
				name: "",
				decltype: void 0
			};
		},
		1(r, msg) {
			msg.name = r.string();
		},
		2(r, msg) {
			msg.decltype = r.string();
		}
	};
	Value = {
		default() {},
		1(r) {
			return null;
		},
		2(r) {
			return r.sint64();
		},
		3(r) {
			return r.double();
		},
		4(r) {
			return r.string();
		},
		5(r) {
			return r.bytes();
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/protobuf_decode.js
var ServerMsg, HelloErrorMsg, ResponseErrorMsg, ResponseOkMsg, ExecuteResp, BatchResp, FetchCursorResp, DescribeResp, GetAutocommitResp;
var init_protobuf_decode$1 = __esmMin((() => {
	init_protobuf_decode$2();
	ServerMsg = {
		default() {
			return { type: "none" };
		},
		1(r) {
			return { type: "hello_ok" };
		},
		2(r) {
			return r.message(HelloErrorMsg);
		},
		3(r) {
			return r.message(ResponseOkMsg);
		},
		4(r) {
			return r.message(ResponseErrorMsg);
		}
	};
	HelloErrorMsg = {
		default() {
			return {
				type: "hello_error",
				error: Error$1.default()
			};
		},
		1(r, msg) {
			msg.error = r.message(Error$1);
		}
	};
	ResponseErrorMsg = {
		default() {
			return {
				type: "response_error",
				requestId: 0,
				error: Error$1.default()
			};
		},
		1(r, msg) {
			msg.requestId = r.int32();
		},
		2(r, msg) {
			msg.error = r.message(Error$1);
		}
	};
	ResponseOkMsg = {
		default() {
			return {
				type: "response_ok",
				requestId: 0,
				response: { type: "none" }
			};
		},
		1(r, msg) {
			msg.requestId = r.int32();
		},
		2(r, msg) {
			msg.response = { type: "open_stream" };
		},
		3(r, msg) {
			msg.response = { type: "close_stream" };
		},
		4(r, msg) {
			msg.response = r.message(ExecuteResp);
		},
		5(r, msg) {
			msg.response = r.message(BatchResp);
		},
		6(r, msg) {
			msg.response = { type: "open_cursor" };
		},
		7(r, msg) {
			msg.response = { type: "close_cursor" };
		},
		8(r, msg) {
			msg.response = r.message(FetchCursorResp);
		},
		9(r, msg) {
			msg.response = { type: "sequence" };
		},
		10(r, msg) {
			msg.response = r.message(DescribeResp);
		},
		11(r, msg) {
			msg.response = { type: "store_sql" };
		},
		12(r, msg) {
			msg.response = { type: "close_sql" };
		},
		13(r, msg) {
			msg.response = r.message(GetAutocommitResp);
		}
	};
	ExecuteResp = {
		default() {
			return {
				type: "execute",
				result: StmtResult.default()
			};
		},
		1(r, msg) {
			msg.result = r.message(StmtResult);
		}
	};
	BatchResp = {
		default() {
			return {
				type: "batch",
				result: BatchResult.default()
			};
		},
		1(r, msg) {
			msg.result = r.message(BatchResult);
		}
	};
	FetchCursorResp = {
		default() {
			return {
				type: "fetch_cursor",
				entries: [],
				done: false
			};
		},
		1(r, msg) {
			msg.entries.push(r.message(CursorEntry));
		},
		2(r, msg) {
			msg.done = r.bool();
		}
	};
	DescribeResp = {
		default() {
			return {
				type: "describe",
				result: DescribeResult.default()
			};
		},
		1(r, msg) {
			msg.result = r.message(DescribeResult);
		}
	};
	GetAutocommitResp = {
		default() {
			return {
				type: "get_autocommit",
				isAutocommit: false
			};
		},
		1(r, msg) {
			msg.isAutocommit = r.bool();
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/ws/client.js
var subprotocolsV2, subprotocolsV3, WsClient$1;
var init_client$1 = __esmMin((() => {
	init_client$2();
	init_encoding();
	init_errors();
	init_id_alloc();
	init_result();
	init_sql();
	init_util();
	init_stream$1();
	init_json_encode$1();
	init_protobuf_encode$1();
	init_json_decode$1();
	init_protobuf_decode$1();
	subprotocolsV2 = /* @__PURE__ */ new Map([["hrana2", {
		version: 2,
		encoding: "json"
	}], ["hrana1", {
		version: 1,
		encoding: "json"
	}]]);
	subprotocolsV3 = /* @__PURE__ */ new Map([
		["hrana3-protobuf", {
			version: 3,
			encoding: "protobuf"
		}],
		["hrana3", {
			version: 3,
			encoding: "json"
		}],
		["hrana2", {
			version: 2,
			encoding: "json"
		}],
		["hrana1", {
			version: 1,
			encoding: "json"
		}]
	]);
	WsClient$1 = class extends Client {
		#socket;
		#openCallbacks;
		#opened;
		#closed;
		#recvdHello;
		#subprotocol;
		#getVersionCalled;
		#responseMap;
		#requestIdAlloc;
		/** @private */
		_streamIdAlloc;
		/** @private */
		_cursorIdAlloc;
		#sqlIdAlloc;
		/** @private */
		constructor(socket, jwt) {
			super();
			this.#socket = socket;
			this.#openCallbacks = [];
			this.#opened = false;
			this.#closed = void 0;
			this.#recvdHello = false;
			this.#subprotocol = void 0;
			this.#getVersionCalled = false;
			this.#responseMap = /* @__PURE__ */ new Map();
			this.#requestIdAlloc = new IdAlloc();
			this._streamIdAlloc = new IdAlloc();
			this._cursorIdAlloc = new IdAlloc();
			this.#sqlIdAlloc = new IdAlloc();
			this.#socket.binaryType = "arraybuffer";
			this.#socket.addEventListener("open", () => this.#onSocketOpen());
			this.#socket.addEventListener("close", (event) => this.#onSocketClose(event));
			this.#socket.addEventListener("error", (event) => this.#onSocketError(event));
			this.#socket.addEventListener("message", (event) => this.#onSocketMessage(event));
			this.#send({
				type: "hello",
				jwt
			});
		}
		#send(msg) {
			if (this.#closed !== void 0) throw new InternalError("Trying to send a message on a closed client");
			if (this.#opened) this.#sendToSocket(msg);
			else {
				const openCallback = () => this.#sendToSocket(msg);
				const errorCallback = () => void 0;
				this.#openCallbacks.push({
					openCallback,
					errorCallback
				});
			}
		}
		#onSocketOpen() {
			const protocol = this.#socket.protocol;
			if (protocol === void 0) {
				this.#setClosed(new ClientError("The `WebSocket.protocol` property is undefined. This most likely means that the WebSocket implementation provided by the environment is broken. If you are using Miniflare 2, please update to Miniflare 3, which fixes this problem."));
				return;
			} else if (protocol === "") this.#subprotocol = {
				version: 1,
				encoding: "json"
			};
			else {
				this.#subprotocol = subprotocolsV3.get(protocol);
				if (this.#subprotocol === void 0) {
					this.#setClosed(new ProtoError(`Unrecognized WebSocket subprotocol: ${JSON.stringify(protocol)}`));
					return;
				}
			}
			for (const callbacks of this.#openCallbacks) callbacks.openCallback();
			this.#openCallbacks.length = 0;
			this.#opened = true;
		}
		#sendToSocket(msg) {
			const encoding = this.#subprotocol.encoding;
			if (encoding === "json") {
				const jsonMsg = writeJsonObject(msg, ClientMsg$1);
				this.#socket.send(jsonMsg);
			} else if (encoding === "protobuf") {
				const protobufMsg = writeProtobufMessage(msg, ClientMsg);
				this.#socket.send(protobufMsg);
			} else throw impossible(encoding, "Impossible encoding");
		}
		/** Get the protocol version negotiated with the server, possibly waiting until the socket is open. */
		getVersion() {
			return new Promise((versionCallback, errorCallback) => {
				this.#getVersionCalled = true;
				if (this.#closed !== void 0) errorCallback(this.#closed);
				else if (!this.#opened) {
					const openCallback = () => versionCallback(this.#subprotocol.version);
					this.#openCallbacks.push({
						openCallback,
						errorCallback
					});
				} else versionCallback(this.#subprotocol.version);
			});
		}
		/** @private */
		_ensureVersion(minVersion, feature) {
			if (this.#subprotocol === void 0 || !this.#getVersionCalled) throw new ProtocolVersionError(`${feature} is supported only on protocol version ${minVersion} and higher, but the version supported by the WebSocket server is not yet known. Use Client.getVersion() to wait until the version is available.`);
			else if (this.#subprotocol.version < minVersion) throw new ProtocolVersionError(`${feature} is supported on protocol version ${minVersion} and higher, but the WebSocket server only supports version ${this.#subprotocol.version}`);
		}
		/** @private */
		_sendRequest(request, callbacks) {
			if (this.#closed !== void 0) {
				callbacks.errorCallback(new ClosedError("Client is closed", this.#closed));
				return;
			}
			const requestId = this.#requestIdAlloc.alloc();
			this.#responseMap.set(requestId, {
				...callbacks,
				type: request.type
			});
			this.#send({
				type: "request",
				requestId,
				request
			});
		}
		#onSocketError(event) {
			const message = event.message ?? "WebSocket was closed due to an error";
			this.#setClosed(new WebSocketError(message));
		}
		#onSocketClose(event) {
			let message = `WebSocket was closed with code ${event.code}`;
			if (event.reason) message += `: ${event.reason}`;
			this.#setClosed(new WebSocketError(message));
		}
		#setClosed(error) {
			if (this.#closed !== void 0) return;
			this.#closed = error;
			for (const callbacks of this.#openCallbacks) callbacks.errorCallback(error);
			this.#openCallbacks.length = 0;
			for (const [requestId, responseState] of this.#responseMap.entries()) {
				responseState.errorCallback(error);
				this.#requestIdAlloc.free(requestId);
			}
			this.#responseMap.clear();
			this.#socket.close();
		}
		#onSocketMessage(event) {
			if (this.#closed !== void 0) return;
			try {
				let msg;
				const encoding = this.#subprotocol.encoding;
				if (encoding === "json") {
					if (typeof event.data !== "string") {
						this.#socket.close(3003, "Only text messages are accepted with JSON encoding");
						this.#setClosed(new ProtoError("Received non-text message from server with JSON encoding"));
						return;
					}
					msg = readJsonObject(JSON.parse(event.data), ServerMsg$1);
				} else if (encoding === "protobuf") {
					if (!(event.data instanceof ArrayBuffer)) {
						this.#socket.close(3003, "Only binary messages are accepted with Protobuf encoding");
						this.#setClosed(new ProtoError("Received non-binary message from server with Protobuf encoding"));
						return;
					}
					msg = readProtobufMessage(new Uint8Array(event.data), ServerMsg);
				} else throw impossible(encoding, "Impossible encoding");
				this.#handleMsg(msg);
			} catch (e) {
				this.#socket.close(3007, "Could not handle message");
				this.#setClosed(e);
			}
		}
		#handleMsg(msg) {
			if (msg.type === "none") throw new ProtoError("Received an unrecognized ServerMsg");
			else if (msg.type === "hello_ok" || msg.type === "hello_error") {
				if (this.#recvdHello) throw new ProtoError("Received a duplicated hello response");
				this.#recvdHello = true;
				if (msg.type === "hello_error") throw errorFromProto(msg.error);
				return;
			} else if (!this.#recvdHello) throw new ProtoError("Received a non-hello message before a hello response");
			if (msg.type === "response_ok") {
				const requestId = msg.requestId;
				const responseState = this.#responseMap.get(requestId);
				this.#responseMap.delete(requestId);
				if (responseState === void 0) throw new ProtoError("Received unexpected OK response");
				this.#requestIdAlloc.free(requestId);
				try {
					if (responseState.type !== msg.response.type) {
						console.dir({
							responseState,
							msg
						});
						throw new ProtoError("Received unexpected type of response");
					}
					responseState.responseCallback(msg.response);
				} catch (e) {
					responseState.errorCallback(e);
					throw e;
				}
			} else if (msg.type === "response_error") {
				const requestId = msg.requestId;
				const responseState = this.#responseMap.get(requestId);
				this.#responseMap.delete(requestId);
				if (responseState === void 0) throw new ProtoError("Received unexpected error response");
				this.#requestIdAlloc.free(requestId);
				responseState.errorCallback(errorFromProto(msg.error));
			} else throw impossible(msg, "Impossible ServerMsg type");
		}
		/** Open a {@link WsStream}, a stream for executing SQL statements. */
		openStream() {
			return WsStream.open(this);
		}
		/** Cache a SQL text on the server. This requires protocol version 2 or higher. */
		storeSql(sql) {
			this._ensureVersion(2, "storeSql()");
			const sqlId = this.#sqlIdAlloc.alloc();
			const sqlObj = new Sql(this, sqlId);
			const responseCallback = () => void 0;
			const errorCallback = (e) => sqlObj._setClosed(e);
			const request = {
				type: "store_sql",
				sqlId,
				sql
			};
			this._sendRequest(request, {
				responseCallback,
				errorCallback
			});
			return sqlObj;
		}
		/** @private */
		_closeSql(sqlId) {
			if (this.#closed !== void 0) return;
			const responseCallback = () => this.#sqlIdAlloc.free(sqlId);
			const errorCallback = (e) => this.#setClosed(e);
			const request = {
				type: "close_sql",
				sqlId
			};
			this._sendRequest(request, {
				responseCallback,
				errorCallback
			});
		}
		/** Close the client and the WebSocket. */
		close() {
			this.#setClosed(new ClientError("Client was manually closed"));
		}
		/** True if the client is closed. */
		get closed() {
			return this.#closed !== void 0;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/queue_microtask.js
var _queueMicrotask;
var init_queue_microtask = __esmMin((() => {
	if (typeof queueMicrotask !== "undefined") _queueMicrotask = queueMicrotask;
	else {
		const resolved = Promise.resolve();
		_queueMicrotask = (callback) => {
			resolved.then(callback);
		};
	}
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/byte_queue.js
var ByteQueue;
var init_byte_queue = __esmMin((() => {
	ByteQueue = class {
		#array;
		#shiftPos;
		#pushPos;
		constructor(initialCap) {
			this.#array = new Uint8Array(new ArrayBuffer(initialCap));
			this.#shiftPos = 0;
			this.#pushPos = 0;
		}
		get length() {
			return this.#pushPos - this.#shiftPos;
		}
		data() {
			return this.#array.slice(this.#shiftPos, this.#pushPos);
		}
		push(chunk) {
			this.#ensurePush(chunk.byteLength);
			this.#array.set(chunk, this.#pushPos);
			this.#pushPos += chunk.byteLength;
		}
		#ensurePush(pushLength) {
			if (this.#pushPos + pushLength <= this.#array.byteLength) return;
			const filledLength = this.#pushPos - this.#shiftPos;
			if (filledLength + pushLength <= this.#array.byteLength && 2 * this.#pushPos >= this.#array.byteLength) this.#array.copyWithin(0, this.#shiftPos, this.#pushPos);
			else {
				let newCap = this.#array.byteLength;
				do
					newCap *= 2;
				while (filledLength + pushLength > newCap);
				const newArray = new Uint8Array(new ArrayBuffer(newCap));
				newArray.set(this.#array.slice(this.#shiftPos, this.#pushPos), 0);
				this.#array = newArray;
			}
			this.#pushPos = filledLength;
			this.#shiftPos = 0;
		}
		shift(length) {
			this.#shiftPos += length;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/json_decode.js
function PipelineRespBody$1(obj) {
	return {
		baton: stringOpt(obj["baton"]),
		baseUrl: stringOpt(obj["base_url"]),
		results: arrayObjectsMap(obj["results"], StreamResult$1)
	};
}
function StreamResult$1(obj) {
	const type = string(obj["type"]);
	if (type === "ok") return {
		type: "ok",
		response: StreamResponse$1(object(obj["response"]))
	};
	else if (type === "error") return {
		type: "error",
		error: Error$2(object(obj["error"]))
	};
	else throw new ProtoError("Unexpected type of StreamResult");
}
function StreamResponse$1(obj) {
	const type = string(obj["type"]);
	if (type === "close") return { type: "close" };
	else if (type === "execute") return {
		type: "execute",
		result: StmtResult$1(object(obj["result"]))
	};
	else if (type === "batch") return {
		type: "batch",
		result: BatchResult$1(object(obj["result"]))
	};
	else if (type === "sequence") return { type: "sequence" };
	else if (type === "describe") return {
		type: "describe",
		result: DescribeResult$1(object(obj["result"]))
	};
	else if (type === "store_sql") return { type: "store_sql" };
	else if (type === "close_sql") return { type: "close_sql" };
	else if (type === "get_autocommit") return {
		type: "get_autocommit",
		isAutocommit: boolean(obj["is_autocommit"])
	};
	else throw new ProtoError("Unexpected type of StreamResponse");
}
function CursorRespBody$1(obj) {
	return {
		baton: stringOpt(obj["baton"]),
		baseUrl: stringOpt(obj["base_url"])
	};
}
var init_json_decode = __esmMin((() => {
	init_errors();
	init_decode$1();
	init_json_decode$2();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/protobuf_decode.js
var PipelineRespBody, StreamResult, StreamResponse, ExecuteStreamResp, BatchStreamResp, DescribeStreamResp, GetAutocommitStreamResp, CursorRespBody;
var init_protobuf_decode = __esmMin((() => {
	init_protobuf_decode$2();
	PipelineRespBody = {
		default() {
			return {
				baton: void 0,
				baseUrl: void 0,
				results: []
			};
		},
		1(r, msg) {
			msg.baton = r.string();
		},
		2(r, msg) {
			msg.baseUrl = r.string();
		},
		3(r, msg) {
			msg.results.push(r.message(StreamResult));
		}
	};
	StreamResult = {
		default() {
			return { type: "none" };
		},
		1(r) {
			return {
				type: "ok",
				response: r.message(StreamResponse)
			};
		},
		2(r) {
			return {
				type: "error",
				error: r.message(Error$1)
			};
		}
	};
	StreamResponse = {
		default() {
			return { type: "none" };
		},
		1(r) {
			return { type: "close" };
		},
		2(r) {
			return r.message(ExecuteStreamResp);
		},
		3(r) {
			return r.message(BatchStreamResp);
		},
		4(r) {
			return { type: "sequence" };
		},
		5(r) {
			return r.message(DescribeStreamResp);
		},
		6(r) {
			return { type: "store_sql" };
		},
		7(r) {
			return { type: "close_sql" };
		},
		8(r) {
			return r.message(GetAutocommitStreamResp);
		}
	};
	ExecuteStreamResp = {
		default() {
			return {
				type: "execute",
				result: StmtResult.default()
			};
		},
		1(r, msg) {
			msg.result = r.message(StmtResult);
		}
	};
	BatchStreamResp = {
		default() {
			return {
				type: "batch",
				result: BatchResult.default()
			};
		},
		1(r, msg) {
			msg.result = r.message(BatchResult);
		}
	};
	DescribeStreamResp = {
		default() {
			return {
				type: "describe",
				result: DescribeResult.default()
			};
		},
		1(r, msg) {
			msg.result = r.message(DescribeResult);
		}
	};
	GetAutocommitStreamResp = {
		default() {
			return {
				type: "get_autocommit",
				isAutocommit: false
			};
		},
		1(r, msg) {
			msg.isAutocommit = r.bool();
		}
	};
	CursorRespBody = {
		default() {
			return {
				baton: void 0,
				baseUrl: void 0
			};
		},
		1(r, msg) {
			msg.baton = r.string();
		},
		2(r, msg) {
			msg.baseUrl = r.string();
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/cursor.js
var HttpCursor;
var init_cursor = __esmMin((() => {
	init_byte_queue();
	init_cursor$2();
	init_decode$1();
	init_decode();
	init_errors();
	init_util();
	init_json_decode();
	init_protobuf_decode();
	init_json_decode$2();
	init_protobuf_decode$2();
	HttpCursor = class extends Cursor {
		#stream;
		#encoding;
		#reader;
		#queue;
		#closed;
		#done;
		/** @private */
		constructor(stream, encoding) {
			super();
			this.#stream = stream;
			this.#encoding = encoding;
			this.#reader = void 0;
			this.#queue = new ByteQueue(16384);
			this.#closed = void 0;
			this.#done = false;
		}
		async open(response) {
			if (response.body === null) throw new ProtoError("No response body for cursor request");
			this.#reader = response.body[Symbol.asyncIterator]();
			const respBody = await this.#nextItem(CursorRespBody$1, CursorRespBody);
			if (respBody === void 0) throw new ProtoError("Empty response to cursor request");
			return respBody;
		}
		/** Fetch the next entry from the cursor. */
		next() {
			return this.#nextItem(CursorEntry$1, CursorEntry);
		}
		/** Close the cursor. */
		close() {
			this._setClosed(new ClientError("Cursor was manually closed"));
		}
		/** @private */
		_setClosed(error) {
			if (this.#closed !== void 0) return;
			this.#closed = error;
			this.#stream._cursorClosed(this);
			if (this.#reader !== void 0) this.#reader.return();
		}
		/** True if the cursor is closed. */
		get closed() {
			return this.#closed !== void 0;
		}
		async #nextItem(jsonFun, protobufDef) {
			for (;;) {
				if (this.#done) return;
				else if (this.#closed !== void 0) throw new ClosedError("Cursor is closed", this.#closed);
				if (this.#encoding === "json") {
					const jsonData = this.#parseItemJson();
					if (jsonData !== void 0) {
						const jsonText = new TextDecoder().decode(jsonData);
						return readJsonObject(JSON.parse(jsonText), jsonFun);
					}
				} else if (this.#encoding === "protobuf") {
					const protobufData = this.#parseItemProtobuf();
					if (protobufData !== void 0) return readProtobufMessage(protobufData, protobufDef);
				} else throw impossible(this.#encoding, "Impossible encoding");
				if (this.#reader === void 0) throw new InternalError("Attempted to read from HTTP cursor before it was opened");
				const { value, done } = await this.#reader.next();
				if (done && this.#queue.length === 0) this.#done = true;
				else if (done) throw new ProtoError("Unexpected end of cursor stream");
				else this.#queue.push(value);
			}
		}
		#parseItemJson() {
			const data = this.#queue.data();
			const newlinePos = data.indexOf(10);
			if (newlinePos < 0) return;
			const jsonData = data.slice(0, newlinePos);
			this.#queue.shift(newlinePos + 1);
			return jsonData;
		}
		#parseItemProtobuf() {
			const data = this.#queue.data();
			let varintValue = 0;
			let varintLength = 0;
			for (;;) {
				if (varintLength >= data.byteLength) return;
				const byte = data[varintLength];
				varintValue |= (byte & 127) << 7 * varintLength;
				varintLength += 1;
				if (!(byte & 128)) break;
			}
			if (data.byteLength < varintLength + varintValue) return;
			const protobufData = data.slice(varintLength, varintLength + varintValue);
			this.#queue.shift(varintLength + varintValue);
			return protobufData;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/json_encode.js
function PipelineReqBody$1(w, msg) {
	if (msg.baton !== void 0) w.string("baton", msg.baton);
	w.arrayObjects("requests", msg.requests, StreamRequest$1);
}
function StreamRequest$1(w, msg) {
	w.stringRaw("type", msg.type);
	if (msg.type === "close") {} else if (msg.type === "execute") w.object("stmt", msg.stmt, Stmt$1);
	else if (msg.type === "batch") w.object("batch", msg.batch, Batch$1);
	else if (msg.type === "sequence") {
		if (msg.sql !== void 0) w.string("sql", msg.sql);
		if (msg.sqlId !== void 0) w.number("sql_id", msg.sqlId);
	} else if (msg.type === "describe") {
		if (msg.sql !== void 0) w.string("sql", msg.sql);
		if (msg.sqlId !== void 0) w.number("sql_id", msg.sqlId);
	} else if (msg.type === "store_sql") {
		w.number("sql_id", msg.sqlId);
		w.string("sql", msg.sql);
	} else if (msg.type === "close_sql") w.number("sql_id", msg.sqlId);
	else if (msg.type === "get_autocommit") {} else throw impossible(msg, "Impossible type of StreamRequest");
}
function CursorReqBody$1(w, msg) {
	if (msg.baton !== void 0) w.string("baton", msg.baton);
	w.object("batch", msg.batch, Batch$1);
}
var init_json_encode = __esmMin((() => {
	init_json_encode$2();
	init_util();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/protobuf_encode.js
function PipelineReqBody(w, msg) {
	if (msg.baton !== void 0) w.string(1, msg.baton);
	for (const req of msg.requests) w.message(2, req, StreamRequest);
}
function StreamRequest(w, msg) {
	if (msg.type === "close") w.message(1, msg, CloseStreamReq);
	else if (msg.type === "execute") w.message(2, msg, ExecuteStreamReq);
	else if (msg.type === "batch") w.message(3, msg, BatchStreamReq);
	else if (msg.type === "sequence") w.message(4, msg, SequenceStreamReq);
	else if (msg.type === "describe") w.message(5, msg, DescribeStreamReq);
	else if (msg.type === "store_sql") w.message(6, msg, StoreSqlStreamReq);
	else if (msg.type === "close_sql") w.message(7, msg, CloseSqlStreamReq);
	else if (msg.type === "get_autocommit") w.message(8, msg, GetAutocommitStreamReq);
	else throw impossible(msg, "Impossible type of StreamRequest");
}
function CloseStreamReq(_w, _msg) {}
function ExecuteStreamReq(w, msg) {
	w.message(1, msg.stmt, Stmt);
}
function BatchStreamReq(w, msg) {
	w.message(1, msg.batch, Batch);
}
function SequenceStreamReq(w, msg) {
	if (msg.sql !== void 0) w.string(1, msg.sql);
	if (msg.sqlId !== void 0) w.int32(2, msg.sqlId);
}
function DescribeStreamReq(w, msg) {
	if (msg.sql !== void 0) w.string(1, msg.sql);
	if (msg.sqlId !== void 0) w.int32(2, msg.sqlId);
}
function StoreSqlStreamReq(w, msg) {
	w.int32(1, msg.sqlId);
	w.string(2, msg.sql);
}
function CloseSqlStreamReq(w, msg) {
	w.int32(1, msg.sqlId);
}
function GetAutocommitStreamReq(_w, _msg) {}
function CursorReqBody(w, msg) {
	if (msg.baton !== void 0) w.string(1, msg.baton);
	w.message(2, msg.batch, Batch);
}
var init_protobuf_encode = __esmMin((() => {
	init_protobuf_encode$2();
	init_util();
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/stream.js
function handlePipelineResponse(pipeline, respBody) {
	if (respBody.results.length !== pipeline.length) throw new ProtoError("Server returned unexpected number of pipeline results");
	for (let i = 0; i < pipeline.length; ++i) {
		const result = respBody.results[i];
		const entry = pipeline[i];
		if (result.type === "ok") {
			if (result.response.type !== entry.request.type) throw new ProtoError("Received unexpected type of response");
			entry.responseCallback(result.response);
		} else if (result.type === "error") entry.errorCallback(errorFromProto(result.error));
		else if (result.type === "none") throw new ProtoError("Received unrecognized type of StreamResult");
		else throw impossible(result, "Received impossible type of StreamResult");
	}
}
async function decodePipelineResponse(resp, encoding) {
	if (encoding === "json") return readJsonObject(await resp.json(), PipelineRespBody$1);
	if (encoding === "protobuf") {
		const respData = await resp.arrayBuffer();
		return readProtobufMessage(new Uint8Array(respData), PipelineRespBody);
	}
	await resp.body?.cancel();
	throw impossible(encoding, "Impossible encoding");
}
async function errorFromResponse(resp) {
	const respType = resp.headers.get("content-type") ?? "text/plain";
	let message = `Server returned HTTP status ${resp.status}`;
	if (respType === "application/json") {
		const respBody = await resp.json();
		if ("message" in respBody) return errorFromProto(respBody);
		return new HttpServerError(message, resp.status);
	}
	if (respType === "text/plain") {
		const respBody = (await resp.text()).trim();
		if (respBody !== "") message += `: ${respBody}`;
		return new HttpServerError(message, resp.status);
	}
	await resp.body?.cancel();
	return new HttpServerError(message, resp.status);
}
var HttpStream;
var init_stream = __esmMin((() => {
	init_errors();
	init_encoding();
	init_id_alloc();
	init_queue();
	init_queue_microtask();
	init_result();
	init_sql();
	init_stream$2();
	init_util();
	init_cursor();
	init_json_encode();
	init_protobuf_encode();
	init_json_decode();
	init_protobuf_decode();
	HttpStream = class extends Stream {
		#client;
		#baseUrl;
		#jwt;
		#fetch;
		#remoteEncryptionKey;
		#baton;
		#queue;
		#flushing;
		#cursor;
		#closing;
		#closeQueued;
		#closed;
		#sqlIdAlloc;
		/** @private */
		constructor(client, baseUrl, jwt, customFetch, remoteEncryptionKey) {
			super(client.intMode);
			this.#client = client;
			this.#baseUrl = baseUrl.toString();
			this.#jwt = jwt;
			this.#fetch = customFetch;
			this.#remoteEncryptionKey = remoteEncryptionKey;
			this.#baton = void 0;
			this.#queue = new Queue();
			this.#flushing = false;
			this.#closing = false;
			this.#closeQueued = false;
			this.#closed = void 0;
			this.#sqlIdAlloc = new IdAlloc();
		}
		/** Get the {@link HttpClient} object that this stream belongs to. */
		client() {
			return this.#client;
		}
		/** @private */
		_sqlOwner() {
			return this;
		}
		/** Cache a SQL text on the server. */
		storeSql(sql) {
			const sqlId = this.#sqlIdAlloc.alloc();
			this.#sendStreamRequest({
				type: "store_sql",
				sqlId,
				sql
			}).then(() => void 0, (error) => this._setClosed(error));
			return new Sql(this, sqlId);
		}
		/** @private */
		_closeSql(sqlId) {
			if (this.#closed !== void 0) return;
			this.#sendStreamRequest({
				type: "close_sql",
				sqlId
			}).then(() => this.#sqlIdAlloc.free(sqlId), (error) => this._setClosed(error));
		}
		/** @private */
		_execute(stmt) {
			return this.#sendStreamRequest({
				type: "execute",
				stmt
			}).then((response) => {
				return response.result;
			});
		}
		/** @private */
		_batch(batch) {
			return this.#sendStreamRequest({
				type: "batch",
				batch
			}).then((response) => {
				return response.result;
			});
		}
		/** @private */
		_describe(protoSql) {
			return this.#sendStreamRequest({
				type: "describe",
				sql: protoSql.sql,
				sqlId: protoSql.sqlId
			}).then((response) => {
				return response.result;
			});
		}
		/** @private */
		_sequence(protoSql) {
			return this.#sendStreamRequest({
				type: "sequence",
				sql: protoSql.sql,
				sqlId: protoSql.sqlId
			}).then((_response) => {});
		}
		/** Check whether the SQL connection underlying this stream is in autocommit state (i.e., outside of an
		* explicit transaction). This requires protocol version 3 or higher.
		*/
		getAutocommit() {
			this.#client._ensureVersion(3, "getAutocommit()");
			return this.#sendStreamRequest({ type: "get_autocommit" }).then((response) => {
				return response.isAutocommit;
			});
		}
		#sendStreamRequest(request) {
			return new Promise((responseCallback, errorCallback) => {
				this.#pushToQueue({
					type: "pipeline",
					request,
					responseCallback,
					errorCallback
				});
			});
		}
		/** @private */
		_openCursor(batch) {
			return new Promise((cursorCallback, errorCallback) => {
				this.#pushToQueue({
					type: "cursor",
					batch,
					cursorCallback,
					errorCallback
				});
			});
		}
		/** @private */
		_cursorClosed(cursor) {
			if (cursor !== this.#cursor) throw new InternalError("Cursor was closed, but it was not associated with the stream");
			this.#cursor = void 0;
			_queueMicrotask(() => this.#flushQueue());
		}
		/** Immediately close the stream. */
		close() {
			this._setClosed(new ClientError("Stream was manually closed"));
		}
		/** Gracefully close the stream. */
		closeGracefully() {
			this.#closing = true;
			_queueMicrotask(() => this.#flushQueue());
		}
		/** True if the stream is closed. */
		get closed() {
			return this.#closed !== void 0 || this.#closing;
		}
		/** @private */
		_setClosed(error) {
			if (this.#closed !== void 0) return;
			this.#closed = error;
			if (this.#cursor !== void 0) this.#cursor._setClosed(error);
			this.#client._streamClosed(this);
			for (;;) {
				const entry = this.#queue.shift();
				if (entry !== void 0) entry.errorCallback(error);
				else break;
			}
			if ((this.#baton !== void 0 || this.#flushing) && !this.#closeQueued) {
				this.#queue.push({
					type: "pipeline",
					request: { type: "close" },
					responseCallback: () => void 0,
					errorCallback: () => void 0
				});
				this.#closeQueued = true;
				_queueMicrotask(() => this.#flushQueue());
			}
		}
		#pushToQueue(entry) {
			if (this.#closed !== void 0) throw new ClosedError("Stream is closed", this.#closed);
			else if (this.#closing) throw new ClosedError("Stream is closing", void 0);
			else {
				this.#queue.push(entry);
				_queueMicrotask(() => this.#flushQueue());
			}
		}
		#flushQueue() {
			if (this.#flushing || this.#cursor !== void 0) return;
			if (this.#closing && this.#queue.length === 0) {
				this._setClosed(new ClientError("Stream was gracefully closed"));
				return;
			}
			const endpoint = this.#client._endpoint;
			if (endpoint === void 0) {
				this.#client._endpointPromise.then(() => this.#flushQueue(), (error) => this._setClosed(error));
				return;
			}
			const firstEntry = this.#queue.shift();
			if (firstEntry === void 0) return;
			else if (firstEntry.type === "pipeline") {
				const pipeline = [firstEntry];
				for (;;) {
					const entry = this.#queue.first();
					if (entry !== void 0 && entry.type === "pipeline") {
						pipeline.push(entry);
						this.#queue.shift();
					} else if (entry === void 0 && this.#closing && !this.#closeQueued) {
						pipeline.push({
							type: "pipeline",
							request: { type: "close" },
							responseCallback: () => void 0,
							errorCallback: () => void 0
						});
						this.#closeQueued = true;
						break;
					} else break;
				}
				this.#flushPipeline(endpoint, pipeline);
			} else if (firstEntry.type === "cursor") this.#flushCursor(endpoint, firstEntry);
			else throw impossible(firstEntry, "Impossible type of QueueEntry");
		}
		#flushPipeline(endpoint, pipeline) {
			this.#flush(() => this.#createPipelineRequest(pipeline, endpoint), (resp) => decodePipelineResponse(resp, endpoint.encoding), (respBody) => respBody.baton, (respBody) => respBody.baseUrl, (respBody) => handlePipelineResponse(pipeline, respBody), (error) => pipeline.forEach((entry) => entry.errorCallback(error)));
		}
		#flushCursor(endpoint, entry) {
			const cursor = new HttpCursor(this, endpoint.encoding);
			this.#cursor = cursor;
			this.#flush(() => this.#createCursorRequest(entry, endpoint), (resp) => cursor.open(resp), (respBody) => respBody.baton, (respBody) => respBody.baseUrl, (_respBody) => entry.cursorCallback(cursor), (error) => entry.errorCallback(error));
		}
		#flush(createRequest, decodeResponse, getBaton, getBaseUrl, handleResponse, handleError) {
			let promise;
			try {
				const request = createRequest();
				const fetch = this.#fetch;
				promise = fetch(request);
			} catch (error) {
				promise = Promise.reject(error);
			}
			this.#flushing = true;
			promise.then((resp) => {
				if (!resp.ok) return errorFromResponse(resp).then((error) => {
					throw error;
				});
				return decodeResponse(resp);
			}).then((r) => {
				this.#baton = getBaton(r);
				this.#baseUrl = getBaseUrl(r) ?? this.#baseUrl;
				handleResponse(r);
			}).catch((error) => {
				this._setClosed(error);
				handleError(error);
			}).finally(() => {
				this.#flushing = false;
				this.#flushQueue();
			});
		}
		#createPipelineRequest(pipeline, endpoint) {
			return this.#createRequest(new URL(endpoint.pipelinePath, this.#baseUrl), {
				baton: this.#baton,
				requests: pipeline.map((entry) => entry.request)
			}, endpoint.encoding, PipelineReqBody$1, PipelineReqBody);
		}
		#createCursorRequest(entry, endpoint) {
			if (endpoint.cursorPath === void 0) throw new ProtocolVersionError(`Cursors are supported only on protocol version 3 and higher, but the HTTP server only supports version ${endpoint.version}.`);
			return this.#createRequest(new URL(endpoint.cursorPath, this.#baseUrl), {
				baton: this.#baton,
				batch: entry.batch
			}, endpoint.encoding, CursorReqBody$1, CursorReqBody);
		}
		#createRequest(url, reqBody, encoding, jsonFun, protobufFun) {
			let bodyData;
			let contentType;
			if (encoding === "json") {
				bodyData = writeJsonObject(reqBody, jsonFun);
				contentType = "application/json";
			} else if (encoding === "protobuf") {
				bodyData = writeProtobufMessage(reqBody, protobufFun);
				contentType = "application/x-protobuf";
			} else throw impossible(encoding, "Impossible encoding");
			const headers = new Headers();
			headers.set("content-type", contentType);
			if (this.#jwt !== void 0) headers.set("authorization", `Bearer ${this.#jwt}`);
			if (this.#remoteEncryptionKey !== void 0) headers.set("x-turso-encryption-key", this.#remoteEncryptionKey);
			return new Request(url.toString(), {
				method: "POST",
				headers,
				body: bodyData
			});
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/http/client.js
async function findEndpoint(customFetch, clientUrl) {
	const fetch = customFetch;
	for (const endpoint of checkEndpoints) {
		const url = new URL(endpoint.versionPath, clientUrl);
		const response = await fetch(new Request(url.toString(), { method: "GET" }));
		await response.arrayBuffer();
		if (response.ok) return endpoint;
	}
	return fallbackEndpoint;
}
var checkEndpoints, fallbackEndpoint, HttpClient$1;
var init_client = __esmMin((() => {
	init_client$2();
	init_errors();
	init_stream();
	checkEndpoints = [{
		versionPath: "v3-protobuf",
		pipelinePath: "v3-protobuf/pipeline",
		cursorPath: "v3-protobuf/cursor",
		version: 3,
		encoding: "protobuf"
	}];
	fallbackEndpoint = {
		versionPath: "v2",
		pipelinePath: "v2/pipeline",
		cursorPath: void 0,
		version: 2,
		encoding: "json"
	};
	HttpClient$1 = class extends Client {
		#url;
		#jwt;
		#fetch;
		#remoteEncryptionKey;
		#closed;
		#streams;
		/** @private */
		_endpointPromise;
		/** @private */
		_endpoint;
		/** @private */
		constructor(url, jwt, customFetch, remoteEncryptionKey, protocolVersion = 2) {
			super();
			this.#url = url;
			this.#jwt = jwt;
			this.#fetch = customFetch ?? globalThis.fetch;
			this.#remoteEncryptionKey = remoteEncryptionKey;
			this.#closed = void 0;
			this.#streams = /* @__PURE__ */ new Set();
			if (protocolVersion == 3) {
				this._endpointPromise = findEndpoint(this.#fetch, this.#url);
				this._endpointPromise.then((endpoint) => this._endpoint = endpoint, (error) => this.#setClosed(error));
			} else {
				this._endpointPromise = Promise.resolve(fallbackEndpoint);
				this._endpointPromise.then((endpoint) => this._endpoint = endpoint, (error) => this.#setClosed(error));
			}
		}
		/** Get the protocol version supported by the server. */
		async getVersion() {
			if (this._endpoint !== void 0) return this._endpoint.version;
			return (await this._endpointPromise).version;
		}
		/** @private */
		_ensureVersion(minVersion, feature) {
			if (minVersion <= fallbackEndpoint.version) return;
			else if (this._endpoint === void 0) throw new ProtocolVersionError(`${feature} is supported only on protocol version ${minVersion} and higher, but the version supported by the HTTP server is not yet known. Use Client.getVersion() to wait until the version is available.`);
			else if (this._endpoint.version < minVersion) throw new ProtocolVersionError(`${feature} is supported only on protocol version ${minVersion} and higher, but the HTTP server only supports version ${this._endpoint.version}.`);
		}
		/** Open a {@link HttpStream}, a stream for executing SQL statements. */
		openStream() {
			if (this.#closed !== void 0) throw new ClosedError("Client is closed", this.#closed);
			const stream = new HttpStream(this, this.#url, this.#jwt, this.#fetch, this.#remoteEncryptionKey);
			this.#streams.add(stream);
			return stream;
		}
		/** @private */
		_streamClosed(stream) {
			this.#streams.delete(stream);
		}
		/** Close the client and all its streams. */
		close() {
			this.#setClosed(new ClientError("Client was manually closed"));
		}
		/** True if the client is closed. */
		get closed() {
			return this.#closed !== void 0;
		}
		#setClosed(error) {
			if (this.#closed !== void 0) return;
			this.#closed = error;
			for (const stream of Array.from(this.#streams)) stream._setClosed(new ClosedError("Client was closed", error));
		}
	};
}));
//#endregion
//#region node_modules/@libsql/hrana-client/lib-esm/index.js
/** Open a Hrana client over WebSocket connected to the given `url`. */
function openWs(url, jwt, protocolVersion = 2) {
	if (typeof _WebSocket === "undefined") throw new WebSocketUnsupportedError("WebSockets are not supported in this environment");
	var subprotocols = void 0;
	if (protocolVersion == 3) subprotocols = Array.from(subprotocolsV3.keys());
	else subprotocols = Array.from(subprotocolsV2.keys());
	const socket = new _WebSocket(url, subprotocols);
	return new WsClient$1(socket, jwt);
}
/** Open a Hrana client over HTTP connected to the given `url`.
*
* If the `customFetch` argument is passed and not `undefined`, it is used in place of the `fetch` function
* from the global `fetch`. This function is always called with a global `Request` object.
*/
function openHttp(url, jwt, customFetch, remoteEncryptionKey, protocolVersion = 2) {
	return new HttpClient$1(url instanceof URL ? url : new URL(url), jwt, customFetch, remoteEncryptionKey, protocolVersion);
}
var init_lib_esm = __esmMin((() => {
	init_web$1();
	init_client$1();
	init_errors();
	init_client();
	init_client$2();
	init_errors();
	init_batch();
	init_sql();
	init_stmt();
	init_stream$2();
	init_stream();
	init_stream$1();
}));
//#endregion
//#region node_modules/@libsql/client/lib-esm/hrana.js
async function executeHranaBatch(mode, version, batch, hranaStmts, disableForeignKeys = false) {
	if (disableForeignKeys) batch.step().run("PRAGMA foreign_keys=off");
	const beginStep = batch.step();
	const beginPromise = beginStep.run(transactionModeToBegin(mode));
	let lastStep = beginStep;
	const stmtPromises = hranaStmts.map((hranaStmt) => {
		const stmtStep = batch.step().condition(BatchCond$2.ok(lastStep));
		if (version >= 3) stmtStep.condition(BatchCond$2.not(BatchCond$2.isAutocommit(batch)));
		const stmtPromise = stmtStep.query(hranaStmt);
		lastStep = stmtStep;
		return stmtPromise;
	});
	const commitStep = batch.step().condition(BatchCond$2.ok(lastStep));
	if (version >= 3) commitStep.condition(BatchCond$2.not(BatchCond$2.isAutocommit(batch)));
	const commitPromise = commitStep.run("COMMIT");
	batch.step().condition(BatchCond$2.not(BatchCond$2.ok(commitStep))).run("ROLLBACK").catch((_) => void 0);
	if (disableForeignKeys) batch.step().run("PRAGMA foreign_keys=on");
	await batch.execute();
	const resultSets = [];
	await beginPromise;
	for (let i = 0; i < stmtPromises.length; i++) try {
		const hranaRows = await stmtPromises[i];
		if (hranaRows === void 0) throw new LibsqlBatchError("Statement in a batch was not executed, probably because the transaction has been rolled back", i, "TRANSACTION_CLOSED");
		resultSets.push(resultSetFromHrana(hranaRows));
	} catch (e) {
		if (e instanceof LibsqlBatchError) throw e;
		const mappedError = mapHranaError(e);
		if (mappedError instanceof LibsqlError) throw new LibsqlBatchError(mappedError.message, i, mappedError.code, mappedError.extendedCode, mappedError.rawCode, mappedError.cause instanceof Error ? mappedError.cause : void 0);
		throw mappedError;
	}
	await commitPromise;
	return resultSets;
}
function stmtToHrana(stmt) {
	let sql;
	let args;
	if (Array.isArray(stmt)) [sql, args] = stmt;
	else if (typeof stmt === "string") sql = stmt;
	else {
		sql = stmt.sql;
		args = stmt.args;
	}
	const hranaStmt = new Stmt$2(sql);
	if (args) if (Array.isArray(args)) hranaStmt.bindIndexes(args);
	else for (const [key, value] of Object.entries(args)) hranaStmt.bindName(key, value);
	return hranaStmt;
}
function resultSetFromHrana(hranaRows) {
	const columns = hranaRows.columnNames.map((c) => c ?? "");
	const columnTypes = hranaRows.columnDecltypes.map((c) => c ?? "");
	const rows = hranaRows.rows;
	const rowsAffected = hranaRows.affectedRowCount;
	const lastInsertRowid = hranaRows.lastInsertRowid !== void 0 ? hranaRows.lastInsertRowid : void 0;
	return new ResultSetImpl(columns, columnTypes, rows, rowsAffected, lastInsertRowid);
}
function mapHranaError(e) {
	if (e instanceof ClientError) {
		const code = mapHranaErrorCode(e);
		return new LibsqlError(e.message, code, void 0, void 0, e);
	}
	return e;
}
function mapHranaErrorCode(e) {
	if (e instanceof ResponseError && e.code !== void 0) return e.code;
	else if (e instanceof ProtoError) return "HRANA_PROTO_ERROR";
	else if (e instanceof ClosedError) return e.cause instanceof ClientError ? mapHranaErrorCode(e.cause) : "HRANA_CLOSED_ERROR";
	else if (e instanceof WebSocketError) return "HRANA_WEBSOCKET_ERROR";
	else if (e instanceof HttpServerError) return "SERVER_ERROR";
	else if (e instanceof ProtocolVersionError) return "PROTOCOL_VERSION_ERROR";
	else if (e instanceof InternalError) return "INTERNAL_ERROR";
	else return "UNKNOWN";
}
var HranaTransaction;
var init_hrana = __esmMin((() => {
	init_lib_esm();
	init_api();
	init_util$2();
	HranaTransaction = class {
		#mode;
		#version;
		#started;
		/** @private */
		constructor(mode, version) {
			this.#mode = mode;
			this.#version = version;
			this.#started = void 0;
		}
		execute(stmt) {
			return this.batch([stmt]).then((results) => results[0]);
		}
		async batch(stmts) {
			const stream = this._getStream();
			if (stream.closed) throw new LibsqlError("Cannot execute statements because the transaction is closed", "TRANSACTION_CLOSED");
			try {
				const hranaStmts = stmts.map(stmtToHrana);
				let rowsPromises;
				if (this.#started === void 0) {
					this._getSqlCache().apply(hranaStmts);
					const batch = stream.batch(this.#version >= 3);
					const beginStep = batch.step();
					const beginPromise = beginStep.run(transactionModeToBegin(this.#mode));
					let lastStep = beginStep;
					rowsPromises = hranaStmts.map((hranaStmt) => {
						const stmtStep = batch.step().condition(BatchCond$2.ok(lastStep));
						if (this.#version >= 3) stmtStep.condition(BatchCond$2.not(BatchCond$2.isAutocommit(batch)));
						const rowsPromise = stmtStep.query(hranaStmt);
						rowsPromise.catch(() => void 0);
						lastStep = stmtStep;
						return rowsPromise;
					});
					this.#started = batch.execute().then(() => beginPromise).then(() => void 0);
					try {
						await this.#started;
					} catch (e) {
						this.close();
						throw e;
					}
				} else {
					if (this.#version < 3) await this.#started;
					this._getSqlCache().apply(hranaStmts);
					const batch = stream.batch(this.#version >= 3);
					let lastStep = void 0;
					rowsPromises = hranaStmts.map((hranaStmt) => {
						const stmtStep = batch.step();
						if (lastStep !== void 0) stmtStep.condition(BatchCond$2.ok(lastStep));
						if (this.#version >= 3) stmtStep.condition(BatchCond$2.not(BatchCond$2.isAutocommit(batch)));
						const rowsPromise = stmtStep.query(hranaStmt);
						rowsPromise.catch(() => void 0);
						lastStep = stmtStep;
						return rowsPromise;
					});
					await batch.execute();
				}
				const resultSets = [];
				for (let i = 0; i < rowsPromises.length; i++) try {
					const rows = await rowsPromises[i];
					if (rows === void 0) throw new LibsqlBatchError("Statement in a transaction was not executed, probably because the transaction has been rolled back", i, "TRANSACTION_CLOSED");
					resultSets.push(resultSetFromHrana(rows));
				} catch (e) {
					if (e instanceof LibsqlBatchError) throw e;
					const mappedError = mapHranaError(e);
					if (mappedError instanceof LibsqlError) throw new LibsqlBatchError(mappedError.message, i, mappedError.code, mappedError.extendedCode, mappedError.rawCode, mappedError.cause instanceof Error ? mappedError.cause : void 0);
					throw mappedError;
				}
				return resultSets;
			} catch (e) {
				throw mapHranaError(e);
			}
		}
		async executeMultiple(sql) {
			const stream = this._getStream();
			if (stream.closed) throw new LibsqlError("Cannot execute statements because the transaction is closed", "TRANSACTION_CLOSED");
			try {
				if (this.#started === void 0) {
					this.#started = stream.run(transactionModeToBegin(this.#mode)).then(() => void 0);
					try {
						await this.#started;
					} catch (e) {
						this.close();
						throw e;
					}
				} else await this.#started;
				await stream.sequence(sql);
			} catch (e) {
				throw mapHranaError(e);
			}
		}
		async rollback() {
			try {
				const stream = this._getStream();
				if (stream.closed) return;
				if (this.#started !== void 0) {} else return;
				const promise = stream.run("ROLLBACK").catch((e) => {
					throw mapHranaError(e);
				});
				stream.closeGracefully();
				await promise;
			} catch (e) {
				throw mapHranaError(e);
			} finally {
				this.close();
			}
		}
		async commit() {
			try {
				const stream = this._getStream();
				if (stream.closed) throw new LibsqlError("Cannot commit the transaction because it is already closed", "TRANSACTION_CLOSED");
				if (this.#started !== void 0) await this.#started;
				else return;
				const promise = stream.run("COMMIT").catch((e) => {
					throw mapHranaError(e);
				});
				stream.closeGracefully();
				await promise;
			} catch (e) {
				throw mapHranaError(e);
			} finally {
				this.close();
			}
		}
	};
}));
//#endregion
//#region node_modules/@libsql/client/lib-esm/sql_cache.js
var SqlCache, Lru;
var init_sql_cache = __esmMin((() => {
	SqlCache = class {
		#owner;
		#sqls;
		capacity;
		constructor(owner, capacity) {
			this.#owner = owner;
			this.#sqls = new Lru();
			this.capacity = capacity;
		}
		apply(hranaStmts) {
			if (this.capacity <= 0) return;
			const usedSqlObjs = /* @__PURE__ */ new Set();
			for (const hranaStmt of hranaStmts) {
				if (typeof hranaStmt.sql !== "string") continue;
				const sqlText = hranaStmt.sql;
				if (sqlText.length >= 5e3) continue;
				let sqlObj = this.#sqls.get(sqlText);
				if (sqlObj === void 0) {
					while (this.#sqls.size + 1 > this.capacity) {
						const [evictSqlText, evictSqlObj] = this.#sqls.peekLru();
						if (usedSqlObjs.has(evictSqlObj)) break;
						evictSqlObj.close();
						this.#sqls.delete(evictSqlText);
					}
					if (this.#sqls.size + 1 <= this.capacity) {
						sqlObj = this.#owner.storeSql(sqlText);
						this.#sqls.set(sqlText, sqlObj);
					}
				}
				if (sqlObj !== void 0) {
					hranaStmt.sql = sqlObj;
					usedSqlObjs.add(sqlObj);
				}
			}
		}
	};
	Lru = class {
		#cache;
		constructor() {
			this.#cache = /* @__PURE__ */ new Map();
		}
		get(key) {
			const value = this.#cache.get(key);
			if (value !== void 0) {
				this.#cache.delete(key);
				this.#cache.set(key, value);
			}
			return value;
		}
		set(key, value) {
			this.#cache.set(key, value);
		}
		peekLru() {
			for (const entry of this.#cache.entries()) return entry;
		}
		delete(key) {
			this.#cache.delete(key);
		}
		get size() {
			return this.#cache.size;
		}
	};
}));
//#endregion
//#region node_modules/promise-limit/index.js
var require_promise_limit = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function limiter(count) {
		var outstanding = 0;
		var jobs = [];
		function remove() {
			outstanding--;
			if (outstanding < count) dequeue();
		}
		function dequeue() {
			var job = jobs.shift();
			semaphore.queue = jobs.length;
			if (job) run(job.fn).then(job.resolve).catch(job.reject);
		}
		function queue(fn) {
			return new Promise(function(resolve, reject) {
				jobs.push({
					fn,
					resolve,
					reject
				});
				semaphore.queue = jobs.length;
			});
		}
		function run(fn) {
			outstanding++;
			try {
				return Promise.resolve(fn()).then(function(result) {
					remove();
					return result;
				}, function(error) {
					remove();
					throw error;
				});
			} catch (err) {
				remove();
				return Promise.reject(err);
			}
		}
		var semaphore = function(fn) {
			if (outstanding >= count) return queue(fn);
			else return run(fn);
		};
		return semaphore;
	}
	function map(items, mapper) {
		var failed = false;
		var limit = this;
		return Promise.all(items.map(function() {
			var args = arguments;
			return limit(function() {
				if (!failed) return mapper.apply(void 0, args).catch(function(e) {
					failed = true;
					throw e;
				});
			});
		}));
	}
	function addExtras(fn) {
		fn.queue = 0;
		fn.map = map;
		return fn;
	}
	module.exports = function(count) {
		if (count) return addExtras(limiter(count));
		else return addExtras(function(fn) {
			return fn();
		});
	};
}));
//#endregion
//#region node_modules/@libsql/client/lib-esm/ws.js
/** @private */
function _createClient$2(config) {
	if (config.scheme !== "wss" && config.scheme !== "ws") throw new LibsqlError(`The WebSocket client supports only "libsql:", "wss:" and "ws:" URLs, got ${JSON.stringify(config.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
	if (config.encryptionKey !== void 0) throw new LibsqlError("Encryption key is not supported by the remote client.", "ENCRYPTION_KEY_NOT_SUPPORTED");
	if (config.scheme === "ws" && config.tls) throw new LibsqlError(`A "ws:" URL cannot opt into TLS by using ?tls=1`, "URL_INVALID");
	else if (config.scheme === "wss" && !config.tls) throw new LibsqlError(`A "wss:" URL cannot opt out of TLS by using ?tls=0`, "URL_INVALID");
	const url = encodeBaseUrl(config.scheme, config.authority, config.path);
	let client;
	try {
		client = openWs(url, config.authToken);
	} catch (e) {
		if (e instanceof WebSocketUnsupportedError) {
			const suggestedScheme = config.scheme === "wss" ? "https" : "http";
			const suggestedUrl = encodeBaseUrl(suggestedScheme, config.authority, config.path);
			throw new LibsqlError(`This environment does not support WebSockets, please switch to the HTTP client by using a "${suggestedScheme}:" URL (${JSON.stringify(suggestedUrl)}). For more information, please read ${supportedUrlLink}`, "WEBSOCKETS_NOT_SUPPORTED");
		}
		throw mapHranaError(e);
	}
	return new WsClient(client, url, config.authToken, config.intMode, config.concurrency);
}
var import_promise_limit$1, maxConnAgeMillis, sqlCacheCapacity$1, WsClient, WsTransaction;
var init_ws = __esmMin((() => {
	init_lib_esm();
	init_api();
	init_config();
	init_hrana();
	init_sql_cache();
	init_uri();
	init_util$2();
	import_promise_limit$1 = /* @__PURE__ */ __toESM(require_promise_limit(), 1);
	init_api();
	maxConnAgeMillis = 6e4;
	sqlCacheCapacity$1 = 100;
	WsClient = class {
		#url;
		#authToken;
		#intMode;
		#connState;
		#futureConnState;
		closed;
		protocol;
		#isSchemaDatabase;
		#promiseLimitFunction;
		/** @private */
		constructor(client, url, authToken, intMode, concurrency) {
			this.#url = url;
			this.#authToken = authToken;
			this.#intMode = intMode;
			this.#connState = this.#openConn(client);
			this.#futureConnState = void 0;
			this.closed = false;
			this.protocol = "ws";
			this.#promiseLimitFunction = (0, import_promise_limit$1.default)(concurrency);
		}
		async limit(fn) {
			return this.#promiseLimitFunction(fn);
		}
		async execute(stmtOrSql, args) {
			let stmt;
			if (typeof stmtOrSql === "string") stmt = {
				sql: stmtOrSql,
				args: args || []
			};
			else stmt = stmtOrSql;
			return this.limit(async () => {
				const streamState = await this.#openStream();
				try {
					const hranaStmt = stmtToHrana(stmt);
					streamState.conn.sqlCache.apply([hranaStmt]);
					const hranaRowsPromise = streamState.stream.query(hranaStmt);
					streamState.stream.closeGracefully();
					return resultSetFromHrana(await hranaRowsPromise);
				} catch (e) {
					throw mapHranaError(e);
				} finally {
					this._closeStream(streamState);
				}
			});
		}
		async batch(stmts, mode = "deferred") {
			return this.limit(async () => {
				const streamState = await this.#openStream();
				try {
					const hranaStmts = stmts.map((stmt) => {
						if (Array.isArray(stmt)) return {
							sql: stmt[0],
							args: stmt[1] || []
						};
						return stmt;
					}).map(stmtToHrana);
					const version = await streamState.conn.client.getVersion();
					streamState.conn.sqlCache.apply(hranaStmts);
					return await executeHranaBatch(mode, version, streamState.stream.batch(version >= 3), hranaStmts);
				} catch (e) {
					throw mapHranaError(e);
				} finally {
					this._closeStream(streamState);
				}
			});
		}
		async migrate(stmts) {
			return this.limit(async () => {
				const streamState = await this.#openStream();
				try {
					const hranaStmts = stmts.map(stmtToHrana);
					const version = await streamState.conn.client.getVersion();
					return await executeHranaBatch("deferred", version, streamState.stream.batch(version >= 3), hranaStmts, true);
				} catch (e) {
					throw mapHranaError(e);
				} finally {
					this._closeStream(streamState);
				}
			});
		}
		async transaction(mode = "write") {
			return this.limit(async () => {
				const streamState = await this.#openStream();
				try {
					const version = await streamState.conn.client.getVersion();
					return new WsTransaction(this, streamState, mode, version);
				} catch (e) {
					this._closeStream(streamState);
					throw mapHranaError(e);
				}
			});
		}
		async executeMultiple(sql) {
			return this.limit(async () => {
				const streamState = await this.#openStream();
				try {
					const promise = streamState.stream.sequence(sql);
					streamState.stream.closeGracefully();
					await promise;
				} catch (e) {
					throw mapHranaError(e);
				} finally {
					this._closeStream(streamState);
				}
			});
		}
		sync() {
			throw new LibsqlError("sync not supported in ws mode", "SYNC_NOT_SUPPORTED");
		}
		async #openStream() {
			if (this.closed) throw new LibsqlError("The client is closed", "CLIENT_CLOSED");
			if ((/* @__PURE__ */ new Date()).valueOf() - this.#connState.openTime.valueOf() > maxConnAgeMillis && this.#futureConnState === void 0) {
				const futureConnState = this.#openConn();
				this.#futureConnState = futureConnState;
				futureConnState.client.getVersion().then((_version) => {
					if (this.#connState !== futureConnState) {
						if (this.#connState.streamStates.size === 0) this.#connState.client.close();
					}
					this.#connState = futureConnState;
					this.#futureConnState = void 0;
				}, (_e) => {
					this.#futureConnState = void 0;
				});
			}
			if (this.#connState.client.closed) try {
				if (this.#futureConnState !== void 0) this.#connState = this.#futureConnState;
				else this.#connState = this.#openConn();
			} catch (e) {
				throw mapHranaError(e);
			}
			const connState = this.#connState;
			try {
				if (connState.useSqlCache === void 0) {
					connState.useSqlCache = await connState.client.getVersion() >= 2;
					if (connState.useSqlCache) connState.sqlCache.capacity = sqlCacheCapacity$1;
				}
				const stream = connState.client.openStream();
				stream.intMode = this.#intMode;
				const streamState = {
					conn: connState,
					stream
				};
				connState.streamStates.add(streamState);
				return streamState;
			} catch (e) {
				throw mapHranaError(e);
			}
		}
		#openConn(client) {
			try {
				client ??= openWs(this.#url, this.#authToken);
				return {
					client,
					useSqlCache: void 0,
					sqlCache: new SqlCache(client, 0),
					openTime: /* @__PURE__ */ new Date(),
					streamStates: /* @__PURE__ */ new Set()
				};
			} catch (e) {
				throw mapHranaError(e);
			}
		}
		async reconnect() {
			try {
				for (const st of Array.from(this.#connState.streamStates)) try {
					st.stream.close();
				} catch {}
				this.#connState.client.close();
			} catch {}
			if (this.#futureConnState) {
				try {
					this.#futureConnState.client.close();
				} catch {}
				this.#futureConnState = void 0;
			}
			const next = this.#openConn();
			next.useSqlCache = await next.client.getVersion() >= 2;
			if (next.useSqlCache) next.sqlCache.capacity = sqlCacheCapacity$1;
			this.#connState = next;
			this.closed = false;
		}
		_closeStream(streamState) {
			streamState.stream.close();
			const connState = streamState.conn;
			connState.streamStates.delete(streamState);
			if (connState.streamStates.size === 0 && connState !== this.#connState) connState.client.close();
		}
		close() {
			this.#connState.client.close();
			this.closed = true;
			if (this.#futureConnState) {
				try {
					this.#futureConnState.client.close();
				} catch {}
				this.#futureConnState = void 0;
			}
			this.closed = true;
		}
	};
	WsTransaction = class extends HranaTransaction {
		#client;
		#streamState;
		/** @private */
		constructor(client, state, mode, version) {
			super(mode, version);
			this.#client = client;
			this.#streamState = state;
		}
		/** @private */
		_getStream() {
			return this.#streamState.stream;
		}
		/** @private */
		_getSqlCache() {
			return this.#streamState.conn.sqlCache;
		}
		close() {
			this.#client._closeStream(this.#streamState);
		}
		get closed() {
			return this.#streamState.stream.closed;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/client/lib-esm/http.js
/** @private */
function _createClient$1(config) {
	if (config.scheme !== "https" && config.scheme !== "http") throw new LibsqlError(`The HTTP client supports only "libsql:", "https:" and "http:" URLs, got ${JSON.stringify(config.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
	if (config.encryptionKey !== void 0) throw new LibsqlError("Encryption key is not supported by the remote client.", "ENCRYPTION_KEY_NOT_SUPPORTED");
	if (config.scheme === "http" && config.tls) throw new LibsqlError(`A "http:" URL cannot opt into TLS by using ?tls=1`, "URL_INVALID");
	else if (config.scheme === "https" && !config.tls) throw new LibsqlError(`A "https:" URL cannot opt out of TLS by using ?tls=0`, "URL_INVALID");
	const url = encodeBaseUrl(config.scheme, config.authority, config.path);
	return new HttpClient(url, config.authToken, config.intMode, config.fetch, config.concurrency, config.remoteEncryptionKey);
}
var import_promise_limit, sqlCacheCapacity, HttpClient, HttpTransaction;
var init_http = __esmMin((() => {
	init_lib_esm();
	init_api();
	init_config();
	init_hrana();
	init_sql_cache();
	init_uri();
	init_util$2();
	import_promise_limit = /* @__PURE__ */ __toESM(require_promise_limit(), 1);
	init_api();
	sqlCacheCapacity = 30;
	HttpClient = class {
		#client;
		protocol;
		#url;
		#intMode;
		#customFetch;
		#concurrency;
		#authToken;
		#remoteEncryptionKey;
		#promiseLimitFunction;
		/** @private */
		constructor(url, authToken, intMode, customFetch, concurrency, remoteEncryptionKey) {
			this.#url = url;
			this.#authToken = authToken;
			this.#intMode = intMode;
			this.#customFetch = customFetch;
			this.#concurrency = concurrency;
			this.#remoteEncryptionKey = remoteEncryptionKey;
			this.#client = openHttp(this.#url, this.#authToken, this.#customFetch, remoteEncryptionKey);
			this.#client.intMode = this.#intMode;
			this.protocol = "http";
			this.#promiseLimitFunction = (0, import_promise_limit.default)(this.#concurrency);
		}
		async limit(fn) {
			return this.#promiseLimitFunction(fn);
		}
		async execute(stmtOrSql, args) {
			let stmt;
			if (typeof stmtOrSql === "string") stmt = {
				sql: stmtOrSql,
				args: args || []
			};
			else stmt = stmtOrSql;
			return this.limit(async () => {
				try {
					const hranaStmt = stmtToHrana(stmt);
					let rowsPromise;
					const stream = this.#client.openStream();
					try {
						rowsPromise = stream.query(hranaStmt);
					} finally {
						stream.closeGracefully();
					}
					return resultSetFromHrana(await rowsPromise);
				} catch (e) {
					throw mapHranaError(e);
				}
			});
		}
		async batch(stmts, mode = "deferred") {
			return this.limit(async () => {
				try {
					const hranaStmts = stmts.map((stmt) => {
						if (Array.isArray(stmt)) return {
							sql: stmt[0],
							args: stmt[1] || []
						};
						return stmt;
					}).map(stmtToHrana);
					const version = await this.#client.getVersion();
					let resultsPromise;
					const stream = this.#client.openStream();
					try {
						new SqlCache(stream, sqlCacheCapacity).apply(hranaStmts);
						resultsPromise = executeHranaBatch(mode, version, stream.batch(false), hranaStmts);
					} finally {
						stream.closeGracefully();
					}
					return await resultsPromise;
				} catch (e) {
					throw mapHranaError(e);
				}
			});
		}
		async migrate(stmts) {
			return this.limit(async () => {
				try {
					const hranaStmts = stmts.map(stmtToHrana);
					const version = await this.#client.getVersion();
					let resultsPromise;
					const stream = this.#client.openStream();
					try {
						resultsPromise = executeHranaBatch("deferred", version, stream.batch(false), hranaStmts, true);
					} finally {
						stream.closeGracefully();
					}
					return await resultsPromise;
				} catch (e) {
					throw mapHranaError(e);
				}
			});
		}
		async transaction(mode = "write") {
			return this.limit(async () => {
				try {
					const version = await this.#client.getVersion();
					return new HttpTransaction(this.#client.openStream(), mode, version);
				} catch (e) {
					throw mapHranaError(e);
				}
			});
		}
		async executeMultiple(sql) {
			return this.limit(async () => {
				try {
					let promise;
					const stream = this.#client.openStream();
					try {
						promise = stream.sequence(sql);
					} finally {
						stream.closeGracefully();
					}
					await promise;
				} catch (e) {
					throw mapHranaError(e);
				}
			});
		}
		sync() {
			throw new LibsqlError("sync not supported in http mode", "SYNC_NOT_SUPPORTED");
		}
		close() {
			this.#client.close();
		}
		async reconnect() {
			try {
				if (!this.closed) this.#client.close();
			} finally {
				this.#client = openHttp(this.#url, this.#authToken, this.#customFetch, this.#remoteEncryptionKey);
				this.#client.intMode = this.#intMode;
			}
		}
		get closed() {
			return this.#client.closed;
		}
	};
	HttpTransaction = class extends HranaTransaction {
		#stream;
		#sqlCache;
		/** @private */
		constructor(stream, mode, version) {
			super(mode, version);
			this.#stream = stream;
			this.#sqlCache = new SqlCache(stream, sqlCacheCapacity);
		}
		/** @private */
		_getStream() {
			return this.#stream;
		}
		/** @private */
		_getSqlCache() {
			return this.#sqlCache;
		}
		close() {
			this.#stream.close();
		}
		get closed() {
			return this.#stream.closed;
		}
	};
}));
//#endregion
//#region node_modules/@libsql/client/lib-esm/web.js
var web_exports = /* @__PURE__ */ __exportAll({
	LibsqlBatchError: () => LibsqlBatchError,
	LibsqlError: () => LibsqlError,
	_createClient: () => _createClient,
	createClient: () => createClient
});
function createClient(config) {
	return _createClient(expandConfig(config, true));
}
/** @private */
function _createClient(config) {
	if (config.scheme === "ws" || config.scheme === "wss") return _createClient$2(config);
	else if (config.scheme === "http" || config.scheme === "https") return _createClient$1(config);
	else throw new LibsqlError(`The client that uses Web standard APIs supports only "libsql:", "wss:", "ws:", "https:" and "http:" URLs, got ${JSON.stringify(config.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
}
var init_web = __esmMin((() => {
	init_api();
	init_config();
	init_util$2();
	init_ws();
	init_http();
	init_api();
}));
//#endregion
//#region src/db.js
function isBusyError(e) {
	return e?.code === "SQLITE_BUSY" || e?.code === "SQLITE_LOCKED";
}
async function withBusyRetry(fn) {
	let lastErr;
	for (let attempt = 0; attempt <= BUSY_RETRY_ATTEMPTS; attempt++) try {
		return await fn();
	} catch (e) {
		lastErr = e;
		if (!isBusyError(e) || attempt === BUSY_RETRY_ATTEMPTS) throw e;
		await new Promise((r) => setTimeout(r, BUSY_RETRY_BASE_MS * (attempt + 1)));
	}
	throw lastErr;
}
async function db$1() {
	if (_db) return _db;
	if (_dbPromise) return await _dbPromise;
	_dbPromise = (async () => {
		let client;
		let dbPath = null;
		if (USE_MEMORY_DB()) client = createClient({ url: "file::memory:" });
		else {
			const dir = path.join(getFreddieHome(), "state");
			fs.mkdirSync(dir, { recursive: true });
			dbPath = DB_PATH();
			client = createClient({ url: `file:${dbPath}` });
		}
		_db = new DbAdapter(client, dbPath);
		_dbPromise = null;
		return _db;
	})();
	return await _dbPromise;
}
async function closeDb$1() {
	if (_db) {
		await _db.close();
		_db = null;
	}
	_dbPromise = null;
}
async function resetForTests$1() {
	if (_db) await _db.clearAll();
	await closeDb$1();
	_db = null;
	_dbPromise = null;
}
var _db, _dbPromise, DB_PATH, USE_MEMORY_DB, BUSY_RETRY_ATTEMPTS, BUSY_RETRY_BASE_MS, DbAdapter, PreparedStatement;
var init_db = __esmMin((() => {
	init_web();
	init_home();
	init_env();
	_db = null;
	_dbPromise = null;
	DB_PATH = () => path.join(getFreddieHome(), "state", "sessions.db");
	USE_MEMORY_DB = () => env("FREDDIE_TEST_DB") === "memory";
	BUSY_RETRY_ATTEMPTS = 3;
	BUSY_RETRY_BASE_MS = 50;
	DbAdapter = class {
		constructor(client, dbPath) {
			this.client = client;
			this.dbPath = dbPath;
			this._fts5_unavailable = false;
		}
		prepare(sql) {
			return new PreparedStatement(this.client, sql);
		}
		async exec(sql) {
			const statements = sql.split(";").filter((s) => s.trim());
			const results = [];
			for (const stmt of statements) if (stmt.trim()) {
				const result = await withBusyRetry(() => this.client.execute({ sql: stmt.trim() }));
				results.push(result);
			}
			return results;
		}
		async run(...args) {
			const [sql, ...params] = args;
			const result = await withBusyRetry(() => this.client.execute({
				sql,
				args: params
			}));
			return {
				changes: result.rowsAffected,
				lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n
			};
		}
		transaction(fn) {
			return async (...args) => {
				try {
					await this.client.execute("BEGIN TRANSACTION");
					const result = await fn(...args);
					await this.client.execute("COMMIT");
					return result;
				} catch (e) {
					try {
						await this.client.execute("ROLLBACK");
					} catch (_) {}
					throw e;
				}
			};
		}
		async close() {
			if (this.client) {
				await this.client.close();
				this.client = null;
			}
		}
		async clearAll() {
			try {
				const result = await this.client.execute("SELECT name FROM sqlite_master WHERE type='table'");
				if (result.rows && result.rows.length > 0) for (const [tableName] of result.rows) try {
					await this.client.execute(`DROP TABLE IF EXISTS ${tableName}`);
				} catch (e) {}
			} catch (e) {}
		}
	};
	PreparedStatement = class {
		constructor(client, sql) {
			this.client = client;
			this.sql = sql;
		}
		bind(params = []) {
			this.params = params;
			return this;
		}
		async run(...params) {
			const p = Array.isArray(params[0]) ? params[0] : params;
			const result = await withBusyRetry(() => this.client.execute({
				sql: this.sql,
				args: p
			}));
			return {
				changes: result.rowsAffected,
				lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n
			};
		}
		async get(...params) {
			const p = Array.isArray(params[0]) ? params[0] : params;
			const result = await withBusyRetry(() => this.client.execute({
				sql: this.sql,
				args: p
			}));
			if (!result.rows || result.rows.length === 0) return null;
			const row = result.rows[0];
			const obj = {};
			result.columns.forEach((col, i) => {
				obj[col] = row[i];
			});
			return obj;
		}
		async all(...params) {
			const p = Array.isArray(params[0]) ? params[0] : params;
			const result = await withBusyRetry(() => this.client.execute({
				sql: this.sql,
				args: p
			}));
			if (!result.rows || result.rows.length === 0) return [];
			return result.rows.map((row) => {
				const obj = {};
				result.columns.forEach((col, i) => {
					obj[col] = row[i];
				});
				return obj;
			});
		}
	};
}));
//#endregion
//#region src/machines/snapshot-store.js
var snapshot_store_exports = /* @__PURE__ */ __exportAll({
	SNAPSHOT_SCHEMA_VERSION: () => 1,
	clear: () => clear,
	createLibsqlSnapshotStore: () => createLibsqlSnapshotStore,
	list: () => list,
	load: () => load,
	persist: () => persist,
	sweepDone: () => sweepDone
});
function createLibsqlSnapshotStore() {
	return {
		persist,
		load,
		clear,
		list,
		sweepDone
	};
}
async function init$1() {
	const d = await db$1();
	if (!_inited$1) {
		await d.exec(`CREATE TABLE IF NOT EXISTS machine_snapshots (
            kind TEXT NOT NULL,
            key TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            machine_id TEXT,
            snapshot_json TEXT NOT NULL,
            status TEXT NOT NULL,
            updated INTEGER NOT NULL,
            PRIMARY KEY (kind, key)
        )`);
		_inited$1 = true;
	}
	return d;
}
function safeStringify(value) {
	const seen = /* @__PURE__ */ new WeakSet();
	return JSON.stringify(value, (k, v) => {
		if (typeof v === "object" && v !== null) {
			if (seen.has(v)) return "[Circular]";
			seen.add(v);
		}
		return v;
	});
}
async function persist(kind, key, snapshot, { machineId = null } = {}) {
	if (!kind || !key) throw new Error("persist requires kind and key");
	const d = await init$1();
	const status = snapshot?.status || "active";
	let json;
	try {
		json = JSON.stringify(snapshot);
	} catch (e) {
		log$7.error("snapshot has circular structure, persisting with [Circular] markers", {
			kind,
			key,
			err: String(e)
		});
		json = safeStringify(snapshot);
	}
	await d.prepare(`INSERT INTO machine_snapshots (kind, key, schema_version, machine_id, snapshot_json, status, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(kind, key) DO UPDATE SET
            schema_version = excluded.schema_version,
            machine_id = excluded.machine_id,
            snapshot_json = excluded.snapshot_json,
            status = excluded.status,
            updated = excluded.updated`).run(kind, key, 1, machineId, json, status, Date.now());
	return {
		kind,
		key,
		status
	};
}
async function load(kind, key, { machineId = null } = {}) {
	const row = await (await init$1()).prepare(`SELECT * FROM machine_snapshots WHERE kind = ? AND key = ?`).get(kind, key);
	if (!row) return null;
	if (Number(row.schema_version) !== 1) {
		log$7.info("discarding stale snapshot (schema mismatch)", {
			kind,
			key,
			had: row.schema_version,
			want: 1
		});
		await clear(kind, key);
		return null;
	}
	if (machineId && row.machine_id && row.machine_id !== machineId) {
		log$7.info("discarding stale snapshot (machine id mismatch)", {
			kind,
			key,
			had: row.machine_id,
			want: machineId
		});
		await clear(kind, key);
		return null;
	}
	try {
		return JSON.parse(row.snapshot_json);
	} catch (e) {
		log$7.error("unparseable snapshot, discarding", {
			kind,
			key,
			err: String(e)
		});
		await clear(kind, key);
		return null;
	}
}
async function clear(kind, key) {
	await (await init$1()).prepare(`DELETE FROM machine_snapshots WHERE kind = ? AND key = ?`).run(kind, key);
}
async function list({ kind = null, status = "active" } = {}) {
	const d = await init$1();
	let sql = `SELECT kind, key, schema_version, machine_id, status, updated FROM machine_snapshots`;
	const where = [];
	const args = [];
	if (kind) {
		where.push("kind = ?");
		args.push(kind);
	}
	if (status) {
		where.push("status = ?");
		args.push(status);
	}
	if (where.length) sql += " WHERE " + where.join(" AND ");
	sql += " ORDER BY updated DESC";
	return await d.prepare(sql).all(...args);
}
async function sweepDone() {
	return { removed: (await (await init$1()).prepare(`DELETE FROM machine_snapshots WHERE status != 'active'`).run()).changes };
}
var log$7, SNAPSHOT_SCHEMA_VERSION, _inited$1;
var init_snapshot_store = __esmMin((() => {
	init_db();
	init_log();
	log$7 = logger("snapshot-store");
	SNAPSHOT_SCHEMA_VERSION = 1;
	_inited$1 = false;
}));
//#endregion
//#region src/machines/persistent-actor.js
init_snapshot_store();
init_log();
var log$6 = logger("persistent-actor");
function redactSensitive(context) {
	try {
		return JSON.parse(redactSecret(JSON.stringify(context)));
	} catch {
		return null;
	}
}
async function createPersistentActor(machine, { kind, key, input, onTransition, store } = {}) {
	if (!kind || !key) throw new Error("createPersistentActor requires kind and key");
	const persistFn = store?.persist || persist;
	const loadFn = store?.load || load;
	const clearFn = store?.clear || clear;
	const machineId = machine?.id || machine?.config?.id || null;
	const snapshot = await loadFn(kind, key, { machineId });
	const resumed = !!snapshot;
	let lastEventType = null;
	const inspect = (ev) => {
		if (ev.type === "@xstate.event" && ev.event?.type) lastEventType = ev.event.type;
	};
	const actor = snapshot ? createActor$1(machine, {
		snapshot,
		inspect
	}) : createActor$1(machine, {
		input,
		inspect
	});
	let lastValue = null;
	let persisting = Promise.resolve();
	const sub = actor.subscribe((snap) => {
		const from = lastValue;
		const to = snap.value;
		const context = redactSensitive(snap.context);
		if (JSON.stringify(from) !== JSON.stringify(to)) log$6.info("transition", {
			kind,
			key,
			from,
			to,
			trigger: lastEventType,
			context
		});
		lastValue = to;
		persisting = persisting.then(async () => {
			try {
				const ps = actor.getPersistedSnapshot();
				if (snap.status === "active") await persistFn(kind, key, ps, { machineId });
				else await clearFn(kind, key);
				onTransition?.(snap);
			} catch (e) {
				log$6.error("persist failed", {
					kind,
					key,
					err: String(e)
				});
			}
		});
	});
	if (resumed) log$6.info("actor resumed from snapshot", {
		kind,
		key,
		machineId
	});
	actor.start();
	return {
		actor,
		resumed,
		async flush() {
			await persisting;
			try {
				sub.unsubscribe();
			} catch {}
		},
		async forget() {
			await persisting;
			try {
				sub.unsubscribe();
			} catch {}
			await clearFn(kind, key);
		}
	};
}
//#endregion
//#region src/agent/hooks_engine.js
/**
* HookEngine — runs shell commands defined in config at hook trigger points.
* Matches kimi's server-side hook behavior.
*
* Kimi config key names are accepted in the config and mapped to freddie's
* internal HOOK_NAMES via KIMI_TO_FREDDIE_HOOK. The user-facing config and
* environment variables follow kimi convention.
*/
var KIMI_TO_FREDDIE_HOOK = {
	PreToolUse: "preToolCall",
	PostToolUse: "postToolCall",
	UserPromptSubmit: "onMessageInbound",
	Stop: "onMessageOutbound",
	SessionStart: "onSessionStart",
	SessionEnd: "onSessionEnd",
	SubagentStart: "onTurnStart",
	SubagentStop: "onTurnEnd",
	PreCompact: "onPreCompact",
	PostCompact: "onPostCompact",
	Notification: "onMessageOutbound"
};
var FREDDIE_TO_KIMI = Object.fromEntries(Object.entries(KIMI_TO_FREDDIE_HOOK).map(([k, v]) => [v, k]));
var KIMI_HOOK_NAMES = Object.keys(KIMI_TO_FREDDIE_HOOK);
async function defaultBashRunner(command, { timeout = 3e4, env = {}, cwd } = {}) {
	return new Promise((resolve) => {
		const child = spawn("bash", ["-c", command], {
			cwd: cwd || process.cwd(),
			env: {
				...process.env,
				...env
			},
			timeout,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("close", (exitCode) => {
			resolve({
				stdout: stdout.trimEnd(),
				stderr: stderr.trimEnd(),
				exitCode: exitCode ?? -1
			});
		});
		child.on("error", (err) => {
			resolve({
				stdout: stdout.trimEnd(),
				stderr: (stderr + " " + err.message).trim(),
				exitCode: -1
			});
		});
	});
}
var HookEngine = class {
	/**
	* @param {object} opts
	* @param {object} opts.config — the full freddie config (hooks section at config.hooks)
	* @param {function} [opts.bashRunner] — async (command, {timeout, env, cwd}) => {stdout, stderr, exitCode}
	* @param {boolean} [opts.isBrowser] — if true, bashRunner is a no-op and shell hooks are skipped
	*/
	constructor({ config, bashRunner, isBrowser } = {}) {
		this._config = config;
		this._bashRunner = bashRunner || (isBrowser ? null : defaultBashRunner);
		this._isBrowser = !!isBrowser;
		this._runHistory = /* @__PURE__ */ new Set();
	}
	/**
	* Run all hooks matching a trigger.
	* @param {string} hookName — freddie internal hook name (e.g. 'preToolCall')
	* @param {object} context — {name, args, result, sessionKey, ...}
	* @returns {Promise<{results: Array<{command, ok, stdout, stderr, exitCode, error}>}>}
	*/
	async runHooks(hookName, context = {}) {
		const kimiName = FREDDIE_TO_KIMI[hookName];
		if (!kimiName) return { results: [] };
		const hooks = this._config?.hooks?.[kimiName] || [];
		if (!hooks.length) return { results: [] };
		const results = [];
		const hookEnv = this._buildEnv(context);
		for (const hook of hooks) {
			const { matcher, command, timeout = 30 } = hook;
			if (!command) continue;
			const matchTarget = context.name || context.action || "";
			if (matcher && !this._testMatcher(matcher, matchTarget)) continue;
			const dedupKey = `${command}::${hookName}::${matchTarget}`;
			if (this._runHistory.has(dedupKey)) continue;
			this._runHistory.add(dedupKey);
			if (this._isBrowser || !this._bashRunner) {
				results.push({
					command,
					ok: false,
					error: "shell hooks not available in browser"
				});
				continue;
			}
			try {
				const result = await this._bashRunner(command, {
					timeout: timeout * 1e3,
					env: hookEnv,
					cwd: context.cwd || process.cwd()
				});
				results.push({
					command,
					ok: result.exitCode === 0,
					stdout: result.stdout || "",
					stderr: result.stderr || "",
					exitCode: result.exitCode
				});
			} catch (err) {
				results.push({
					command,
					ok: false,
					error: err.message
				});
			}
		}
		return { results };
	}
	/**
	* Test a matcher regex against a target string. Returns false on invalid regex.
	*/
	_testMatcher(matcher, target) {
		try {
			return new RegExp(matcher).test(target);
		} catch {
			return false;
		}
	}
	/**
	* Build environment variables for hook commands.
	*/
	_buildEnv(context) {
		const env = {};
		if (context.name) env.FREDDIE_TOOL_NAME = context.name;
		if (context.args) try {
			env.FREDDIE_TOOL_ARGS = JSON.stringify(context.args);
		} catch {
			env.FREDDIE_TOOL_ARGS = String(context.args);
		}
		if (context.sessionKey) env.FREDDIE_SESSION_ID = context.sessionKey;
		if (context.cwd) env.FREDDIE_CWD = context.cwd;
		else if (typeof process !== "undefined") env.FREDDIE_CWD = process.cwd();
		return env;
	}
	/** Reset dedup history (for tests / new sessions). */
	reset() {
		this._runHistory.clear();
	}
	/** List the kimi hook names that can appear in config. */
	static get KIMI_HOOK_NAMES() {
		return KIMI_HOOK_NAMES;
	}
	/** Map from kimi config key to freddie internal hook name. */
	static get KIMI_TO_FREDDIE_HOOK() {
		return KIMI_TO_FREDDIE_HOOK;
	}
	/** Map from freddie internal hook name to kimi config key. */
	static get FREDDIE_TO_KIMI() {
		return FREDDIE_TO_KIMI;
	}
};
//#endregion
//#region src/agent/wire_hooks.js
/**
* WireHookBridge — enables client-side hook subscriptions.
* Clients subscribe to hook events via wire initialize, and the
* bridge forwards matching events for client-side handling.
*
* The bridge is pure in-memory — no persistence, no I/O. Browser-safe.
* Accessible via `globalThis.__FREDDIE_WIRE_HOOKS__` in browser contexts
* and via import in Node.js.
*/
var WIRE_HOOK_EVENTS = [
	"preToolCall",
	"postToolCall",
	"onSessionStart",
	"onSessionEnd",
	"onMessageInbound",
	"onMessageOutbound",
	"onPreCompact",
	"onPostCompact",
	"postLlmCall",
	"onTurnStart",
	"onTurnEnd"
];
var WireHookBridge = class {
	constructor() {
		this._subscriptions = /* @__PURE__ */ new Map();
		this._idCounter = 0;
	}
	/**
	* Subscribe to a hook event.
	* @param {string} eventName — e.g. 'preToolCall', 'postToolCall'
	* @param {function} callback — called with context, returns {decision, ...}
	* @param {object} [opts]
	* @param {number} [opts.timeout=30000] — max ms to wait for client response
	* @returns {string} subscription id
	*/
	subscribe(eventName, callback, { timeout = 3e4 } = {}) {
		if (!WIRE_HOOK_EVENTS.includes(eventName)) throw new Error(`unknown hook event: ${eventName}. Valid: ${WIRE_HOOK_EVENTS.join(", ")}`);
		const id = `wire-${++this._idCounter}`;
		if (!this._subscriptions.has(eventName)) this._subscriptions.set(eventName, []);
		this._subscriptions.get(eventName).push({
			id,
			callback,
			timeout
		});
		return id;
	}
	/**
	* Unsubscribe from a hook event.
	* @returns {boolean} true if unsubscribed
	*/
	unsubscribe(eventName, id) {
		const subs = this._subscriptions.get(eventName);
		if (!subs) return false;
		const idx = subs.findIndex((s) => s.id === id);
		if (idx === -1) return false;
		subs.splice(idx, 1);
		if (subs.length === 0) this._subscriptions.delete(eventName);
		return true;
	}
	/**
	* Forward a hook event to all subscribed clients.
	* Fail-open: timeout or error allows the operation to proceed.
	* @returns {Promise<Array<{id, ok, result?, error?}>>}
	*/
	async forwardHook(eventName, context) {
		const subs = this._subscriptions.get(eventName);
		if (!subs || subs.length === 0) return [];
		const results = [];
		for (const sub of subs) try {
			const result = await Promise.race([sub.callback(context), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("timeout")), sub.timeout))]);
			results.push({
				id: sub.id,
				ok: true,
				result
			});
		} catch (err) {
			results.push({
				id: sub.id,
				ok: false,
				error: err.message
			});
		}
		return results;
	}
	/**
	* List active subscriptions.
	* @returns {Array<{eventName, id, timeout}>}
	*/
	listSubscriptions() {
		const result = [];
		for (const [eventName, subs] of this._subscriptions) for (const sub of subs) result.push({
			eventName,
			id: sub.id,
			timeout: sub.timeout
		});
		return result;
	}
	/** Reset all subscriptions (for tests / new sessions). */
	reset() {
		this._subscriptions.clear();
		this._idCounter = 0;
	}
	/** Valid hook event names for wire subscriptions. */
	static get EVENTS() {
		return WIRE_HOOK_EVENTS;
	}
};
var wireHookBridge = new WireHookBridge();
if (typeof globalThis !== "undefined") globalThis.__FREDDIE_WIRE_HOOKS__ = wireHookBridge;
//#endregion
//#region src/observability/telemetry.js
var Telemetry, telemetry;
var init_telemetry = __esmMin((() => {
	Telemetry = class {
		constructor({ enabled = false, endpoint = null, freddieHome = null } = {}) {
			this._enabled = enabled;
			this._endpoint = endpoint;
			this._buffer = [];
			this._sessionId = null;
			this._turnId = null;
			this._freddieHome = freddieHome;
		}
		_track(event, data = {}) {
			if (!this._enabled) return;
			const record = {
				event,
				session_id: this._sessionId,
				turn_id: this._turnId,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				...data
			};
			this._buffer.push(record);
			this._flushIfNeeded();
		}
		_flushIfNeeded() {
			if (this._buffer.length >= 50) this._flush();
		}
		async _flush() {
			if (!this._buffer.length) return;
			const batch = this._buffer.splice(0);
			const jsonl = batch.map((r) => JSON.stringify(r)).join("\n") + "\n";
			if (this._freddieHome) try {
				const { appendFileSync } = await import("node:fs");
				const { join } = await import("node:path");
				appendFileSync(join(this._freddieHome, "telemetry.jsonl"), jsonl);
			} catch {}
			if (this._endpoint) try {
				await fetch(this._endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(batch)
				});
			} catch {}
		}
		setSession(sessionId) {
			this._sessionId = sessionId;
		}
		setTurn(turnId) {
			this._turnId = turnId;
		}
		turnStarted(data) {
			this._track("turn_started", data);
		}
		turnEnded(data) {
			this._track("turn_ended", data);
		}
		turnInterrupted(data) {
			this._track("turn_interrupted", data);
		}
		toolCall(data) {
			this._track("tool_call", data);
		}
		toolCallRepeat(data) {
			this._track("tool_call_repeat", data);
		}
		toolApproved(data) {
			this._track("tool_approved", data);
		}
		toolRejected(data) {
			this._track("tool_rejected", data);
		}
		apiError(data) {
			this._track("api_error", data);
		}
		compactionFinished(data) {
			this._track("compaction_finished", data);
		}
		compactionFailed(data) {
			this._track("compaction_failed", data);
		}
		planSubmitted(data) {
			this._track("plan_submitted", data);
		}
		planResolved(data) {
			this._track("plan_resolved", data);
		}
		yoloToggled(data) {
			this._track("yolo_toggle", data);
		}
		afkToggled(data) {
			this._track("afk_toggle", data);
		}
		skillInvoked(data) {
			this._track("skill_invoked", data);
		}
		subagentCreated(data) {
			this._track("subagent_created", data);
		}
		hookTriggered(data) {
			this._track("hook_triggered", data);
		}
		mcpConnected(data) {
			this._track("mcp_connected", data);
		}
		mcpFailed(data) {
			this._track("mcp_failed", data);
		}
		turnForceStopped(data) {
			this._track("turn_force_stopped", data);
		}
		goalCreated(data) {
			this._track("goal_created", data);
		}
		goalCompleted(data) {
			this._track("goal_completed", data);
		}
		goalBlocked(data) {
			this._track("goal_blocked", data);
		}
		async flush() {
			await this._flush();
		}
		reset() {
			this._buffer = [];
			this._sessionId = null;
			this._turnId = null;
		}
	};
	telemetry = new Telemetry();
}));
//#endregion
//#region plugins/gui/gui-events/event-bus.js
function emit(event, data) {
	const arr = listeners$1.get(event);
	if (!arr) return;
	for (const fn of arr) try {
		fn(data);
	} catch (e) {}
}
var listeners$1;
var init_event_bus = __esmMin((() => {
	listeners$1 = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/sessions.js
var sessions_exports = /* @__PURE__ */ __exportAll({
	appendMessage: () => appendMessage,
	closeDb: () => closeDb,
	createSession: () => createSession,
	deleteSession: () => deleteSession,
	getMessages: () => getMessages,
	getSession: () => getSession,
	listSessions: () => listSessions,
	purgeSessionMessages: () => purgeSessionMessages,
	resetForTests: () => resetForTests,
	search: () => search,
	setSessionTitle: () => setSessionTitle
});
async function initDb() {
	const d = await db$1();
	if (_initialized) return d;
	_initialized = true;
	await d.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            platform TEXT, user_id TEXT, chat_id TEXT, thread_id TEXT,
            title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, model TEXT,
            cwd TEXT, skill TEXT, parent_id TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
            tool_calls TEXT, tool_call_id TEXT, ts INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id, ts);
    `);
	for (const col of [
		"cwd",
		"skill",
		"parent_id"
	]) try {
		await d.exec(`ALTER TABLE sessions ADD COLUMN ${col} TEXT`);
	} catch {}
	try {
		await d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, session_id UNINDEXED, content='messages', content_rowid='id')`);
		await d.prepare(`CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content, session_id) VALUES (new.id, new.content, new.session_id); END`).run();
	} catch (e) {
		console.log("[sessions.js] FTS5 creation failed:", e.message);
	}
	return d;
}
async function db() {
	return await initDb();
}
async function createSession({ platform = "cli", userId = null, chatId = null, threadId = null, title = null, model = null, cwd = null, skill = null, parentId = null, id = null } = {}) {
	const d = await db();
	const sid = id || randomUUID();
	const now = Date.now();
	if (id) {
		await d.prepare(`INSERT OR IGNORE INTO sessions (id, platform, user_id, chat_id, thread_id, title, created_at, updated_at, model, cwd, skill, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(sid, platform, userId, chatId, threadId, title, now, now, model, cwd, skill, parentId);
		return sid;
	}
	await d.prepare(`INSERT INTO sessions (id, platform, user_id, chat_id, thread_id, title, created_at, updated_at, model, cwd, skill, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(sid, platform, userId, chatId, threadId, title, now, now, model, cwd, skill, parentId);
	return sid;
}
async function appendMessage(sessionId, { role, content = "", toolCalls = null, toolCallId = null }) {
	const d = await db();
	const now = Date.now();
	const info = await d.prepare(`INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, ts) VALUES (?, ?, ?, ?, ?, ?)`).run(sessionId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolCallId, now);
	await d.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId);
	if (role === "user" && content) {
		const title = content.replace(/\s+/g, " ").trim().slice(0, 60);
		if (title) await d.prepare(`UPDATE sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')`).run(title, sessionId);
	}
	return info.lastInsertRowid;
}
async function getMessages(sessionId) {
	return (await (await db()).prepare(`SELECT id, role, content, tool_calls, tool_call_id, ts FROM messages WHERE session_id = ? ORDER BY ts ASC, id ASC LIMIT ?`).all(sessionId, MAX_SESSION_MESSAGES)).map((r) => {
		let tool_calls = null;
		let tool_calls_corrupted = false;
		if (r.tool_calls) try {
			tool_calls = JSON.parse(r.tool_calls);
		} catch (e) {
			console.error("sessions.js: corrupted tool_calls, treating as null", {
				id: r.id,
				error: String(e)
			});
			tool_calls_corrupted = true;
		}
		return {
			...r,
			tool_calls,
			...tool_calls_corrupted ? { tool_calls_corrupted: true } : {}
		};
	});
}
async function listSessions(limit = 50, { sessionId = null } = {}) {
	const d = await db();
	if (sessionId) return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill, parent_id FROM sessions WHERE id = ? ORDER BY updated_at DESC LIMIT ?`).all(sessionId, limit);
	return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill, parent_id FROM sessions ORDER BY updated_at DESC LIMIT ?`).all(limit);
}
async function getSession(id) {
	return await (await db()).prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill, parent_id FROM sessions WHERE id = ?`).get(id) || null;
}
async function deleteSession(id) {
	const d = await db();
	const info = await d.transaction(async () => {
		await d.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id);
		try {
			await d.prepare(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`).run();
		} catch {}
		return await d.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
	})();
	return {
		id,
		deleted: (info.changes ?? info.rowsAffected ?? 0) > 0
	};
}
async function purgeSessionMessages(id) {
	const d = await db();
	const info = await d.transaction(async () => {
		const info = await d.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id);
		try {
			await d.prepare(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`).run();
		} catch {}
		return info;
	})();
	return {
		id,
		deleted: info.changes ?? info.rowsAffected ?? 0
	};
}
async function setSessionTitle(id, title) {
	await (await db()).prepare(`UPDATE sessions SET title = ? WHERE id = ?`).run(title, id);
	return {
		id,
		title
	};
}
function escapeFtsQuery(query) {
	return "\"" + String(query).replace(/"/g, "\"\"") + "\"";
}
async function search(query, { sessionId = null, limit = 20 } = {}) {
	const d = await db();
	const likePattern = `%${query}%`;
	const ftsQuery = escapeFtsQuery(query);
	try {
		const ftsResult = sessionId ? await d.prepare(`SELECT m.id, m.session_id, m.content FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? AND m.session_id = ? ORDER BY rank LIMIT ?`).all(ftsQuery, sessionId, limit) : await d.prepare(`SELECT m.id, m.session_id, m.content FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`).all(ftsQuery, limit);
		if (ftsResult && ftsResult.length > 0) {
			ftsResult.searchMode = "fts";
			return ftsResult;
		}
	} catch (e) {}
	const likeResult = sessionId ? await d.prepare(`SELECT id, session_id, content FROM messages WHERE content LIKE ? AND session_id = ? ORDER BY ts DESC LIMIT ?`).all(likePattern, sessionId, limit) : await d.prepare(`SELECT id, session_id, content FROM messages WHERE content LIKE ? ORDER BY ts DESC LIMIT ?`).all(likePattern, limit);
	likeResult.searchMode = "like";
	return likeResult;
}
function closeDb() {
	return closeDb$1();
}
function resetForTests() {
	return resetForTests$1();
}
var _initialized, MAX_SESSION_MESSAGES;
var init_sessions = __esmMin((() => {
	init_db();
	_initialized = false;
	MAX_SESSION_MESSAGES = 5e4;
}));
//#endregion
//#region src/agent/events.js
var events_exports = /* @__PURE__ */ __exportAll({
	WIRE_EVENTS: () => WIRE_EVENTS,
	WIRE_VERSION: () => 1,
	emitTurnEvent: () => emitTurnEvent,
	forkWireLog: () => forkWireLog,
	lastTurnStartIndex: () => lastTurnStartIndex,
	offTurnEvent: () => offTurnEvent,
	onTurnEvent: () => onTurnEvent,
	readWireLog: () => readWireLog,
	searchWireLogs: () => searchWireLogs,
	transcriptFromWire: () => transcriptFromWire,
	truncateWireLog: () => truncateWireLog,
	wireLogDir: () => wireLogDir,
	wireLogPath: () => wireLogPath
});
function wireLogDir() {
	return path.join(getFreddieHome(), "wire");
}
function wireLogPath(sessionId) {
	return path.join(wireLogDir(), String(sessionId).replace(/[:<>"/\\|?*]/g, "_") + ".jsonl");
}
function emitTurnEvent(sessionId, event, data = {}) {
	const envelope = {
		v: 1,
		event,
		sessionId: sessionId ?? null,
		ts: (/* @__PURE__ */ new Date()).toISOString(),
		data
	};
	try {
		emit(event, {
			sessionId,
			...data
		});
	} catch {}
	if (sessionId) try {
		const p = wireLogPath(sessionId);
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.appendFileSync(p, JSON.stringify(envelope) + "\n");
	} catch {}
	for (const key of [sessionId, "*"]) {
		const set = listeners.get(key);
		if (!set) continue;
		for (const fn of [...set]) try {
			fn(envelope);
		} catch {}
	}
	return envelope;
}
function onTurnEvent(sessionId, fn) {
	const key = sessionId ?? "*";
	if (!listeners.has(key)) listeners.set(key, /* @__PURE__ */ new Set());
	listeners.get(key).add(fn);
	return () => offTurnEvent(key, fn);
}
function offTurnEvent(sessionId, fn) {
	const set = listeners.get(sessionId ?? "*");
	if (set) set.delete(fn);
}
function readWireLog(sessionId, { limit = 0 } = {}) {
	let text;
	try {
		text = fs.readFileSync(wireLogPath(sessionId), "utf8");
	} catch {
		return [];
	}
	const out = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			out.push(JSON.parse(line));
		} catch (e) {
			console.error("events.js: corrupted wire-log line, skipping", {
				sessionId,
				error: String(e)
			});
		}
	}
	return limit > 0 ? out.slice(-limit) : out;
}
function readWireLogTail(sessionId, maxBytes) {
	const p = wireLogPath(sessionId);
	let fd;
	try {
		const stat = fs.statSync(p);
		const start = Math.max(0, stat.size - maxBytes);
		fd = fs.openSync(p, "r");
		const buf = Buffer.alloc(stat.size - start);
		fs.readSync(fd, buf, 0, buf.length, start);
		let text = buf.toString("utf8");
		if (start > 0) {
			const nl = text.indexOf("\n");
			text = nl >= 0 ? text.slice(nl + 1) : "";
		}
		const out = [];
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			try {
				out.push(JSON.parse(line));
			} catch {}
		}
		return out;
	} catch {
		return [];
	} finally {
		if (fd !== void 0) try {
			fs.closeSync(fd);
		} catch {}
	}
}
function searchWireLogs(query, { limit = 5, maxFiles = 50, maxSpan = 400, maxBytesPerFile = 262144 } = {}) {
	const terms = String(query || "").toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 3);
	if (!terms.length) return [];
	let files;
	try {
		files = fs.readdirSync(wireLogDir()).filter((f) => f.endsWith(".jsonl")).map((f) => ({
			f,
			mtime: fs.statSync(path.join(wireLogDir(), f)).mtimeMs
		})).sort((a, b) => b.mtime - a.mtime).slice(0, maxFiles);
	} catch {
		return [];
	}
	const hits = [];
	for (const { f } of files) {
		const sid = f.slice(0, -6);
		for (const env of readWireLogTail(sid, maxBytesPerFile)) {
			if (env.event !== "message.append" && env.event !== "steer.append") continue;
			const text = String(env.data?.content ?? env.data?.text ?? "");
			const lower = text.toLowerCase();
			const matched = terms.filter((t) => lower.includes(t));
			if (!matched.length) continue;
			hits.push({
				sessionId: sid,
				ts: env.ts,
				role: env.data?.role || "user",
				text: text.slice(0, maxSpan),
				matched: matched.length
			});
			if (hits.length >= limit * 4) break;
		}
		if (hits.length >= limit * 4) break;
	}
	return hits.sort((a, b) => b.matched - a.matched || (a.ts < b.ts ? 1 : -1)).slice(0, limit);
}
function transcriptFromWire(sessionId, { limit = 1e3 } = {}) {
	const msgs = [];
	for (const env of readWireLog(sessionId, { limit })) {
		const { event, data } = env;
		if (event === "message.append") {
			if (data.role === "user") msgs.push({
				role: "user",
				content: data.content
			});
			else if (data.role === "assistant") msgs.push({
				role: "assistant",
				content: data.content || "",
				tool_calls: data.tool_calls || []
			});
		} else if (event === "steer.append" || event === "queue.append") msgs.push({
			role: "user",
			content: data.text
		});
		else if (event === "tool.end") msgs.push({
			role: "tool",
			tool_call_id: data.toolCallId,
			content: data.denied ? JSON.stringify({ error: "tool call denied by user" }) : typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? "")
		});
	}
	return msgs;
}
async function forkWireLog(sessionId, { atIndex = null, newSessionId = null } = {}) {
	const events = readWireLog(sessionId);
	if (!events.length) return null;
	const sid = newSessionId || randomUUID();
	const slice = atIndex != null ? events.slice(0, Math.max(0, Math.min(atIndex, events.length))) : events;
	const p = wireLogPath(sid);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, slice.map((e) => JSON.stringify({
		...e,
		sessionId: sid
	})).join("\n") + "\n");
	try {
		const { createSession, getSession, appendMessage } = await Promise.resolve().then(() => (init_sessions(), sessions_exports));
		const source = await getSession(sessionId).catch(() => null);
		if (!await getSession(sid).catch(() => null)) await createSession({
			id: sid,
			platform: source?.platform || "web",
			title: "fork of " + (source?.title || sessionId.slice(0, 8)),
			cwd: source?.cwd || null,
			model: source?.model || null,
			parentId: sessionId
		});
		for (const m of transcriptFromWire(sid)) await appendMessage(sid, {
			role: m.role,
			content: m.content,
			toolCalls: m.tool_calls || null,
			toolCallId: m.tool_call_id || null
		});
	} catch {}
	return sid;
}
function truncateWireLog(sessionId, keepCount) {
	const events = readWireLog(sessionId);
	if (!events.length) return null;
	const keep = Math.max(0, Math.min(keepCount, events.length));
	const p = wireLogPath(sessionId);
	fs.writeFileSync(p, events.slice(0, keep).map((e) => JSON.stringify(e)).join("\n") + (keep ? "\n" : ""));
	return keep;
}
function lastTurnStartIndex(sessionId) {
	const events = readWireLog(sessionId);
	for (let i = events.length - 1; i >= 0; i--) if (events[i].event === "session.start") return i;
	return events.length;
}
var WIRE_EVENTS, listeners;
var init_events = __esmMin((() => {
	init_event_bus();
	init_home();
	WIRE_EVENTS = [
		"session.created",
		"session.start",
		"message.append",
		"assistant.delta",
		"tool.start",
		"tool.end",
		"status.update",
		"approval.request",
		"approval.resolved",
		"question.request",
		"question.resolved",
		"steer.append",
		"queue.append",
		"session.end",
		"session.error",
		"subagent.spawn",
		"subagent.progress",
		"subagent.end"
	];
	listeners = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/agent/turn-registry.js
init_telemetry();
init_events();
var turns = /* @__PURE__ */ new Map();
var toolCounts = /* @__PURE__ */ new Map();
function claimTurn(sessionKey, partialEntry = {}) {
	if (turns.has(sessionKey)) return null;
	const entry = {
		actor: null,
		control: null,
		pendingApproval: null,
		pendingQuestion: null,
		startedAt: Date.now(),
		...partialEntry
	};
	turns.set(sessionKey, entry);
	return entry;
}
function mergeTurnEntry(sessionKey, fields) {
	const entry = turns.get(sessionKey);
	if (!entry) return null;
	Object.assign(entry, fields);
	return entry;
}
function unregisterTurn(sessionKey) {
	const t = turns.get(sessionKey);
	if (t) {
		const q = t.pendingQuestion;
		if (q) {
			t.pendingQuestion = null;
			emitTurnEvent(sessionKey, "question.resolved", {
				id: q.id,
				answers: {},
				rejected: true,
				unregistered: true
			});
			try {
				q.reject(/* @__PURE__ */ new Error("turn ended"));
			} catch {}
		}
		const a = t.pendingApproval;
		if (a) {
			t.pendingApproval = null;
			emitTurnEvent(sessionKey, "approval.resolved", {
				id: a.id,
				name: a.name,
				approved: false,
				unregistered: true,
				feedback: "turn ended"
			});
			try {
				a.resolve({
					approved: false,
					feedback: "turn ended"
				});
			} catch {}
		}
	}
	turns.delete(sessionKey);
}
function noteToolCall(sessionKey, name) {
	if (!toolCounts.has(sessionKey)) toolCounts.set(sessionKey, /* @__PURE__ */ new Map());
	const m = toolCounts.get(sessionKey);
	const n = (m.get(name) || 0) + 1;
	m.set(name, n);
	return n;
}
//#endregion
//#region src/agent/turn-steering.js
init_events();
init_auth();
//#endregion
//#region plugins/core/approval_state.js
var approval_state_exports = /* @__PURE__ */ __exportAll({
	addAutoApprovedAction: () => addAutoApprovedAction,
	getAutoApprovedActions: () => getAutoApprovedActions,
	isAfk: () => isAfk,
	isAutoApproved: () => isAutoApproved,
	isYolo: () => isYolo,
	setAfk: () => setAfk,
	setYolo: () => setYolo
});
function isYolo(sessionId) {
	return _yolo.get(sessionId) === true;
}
function setYolo(sessionId, enabled) {
	if (enabled) _yolo.set(sessionId, true);
	else _yolo.delete(sessionId);
	telemetry.yoloToggled({
		session_id: sessionId,
		enabled: !!enabled
	});
}
function isAfk(sessionId) {
	return _afk.get(sessionId) === true;
}
function setAfk(sessionId, enabled) {
	if (enabled) _afk.set(sessionId, true);
	else _afk.delete(sessionId);
	telemetry.afkToggled({
		session_id: sessionId,
		enabled: !!enabled
	});
}
function getAutoApprovedActions(sessionId) {
	return _autoApproved.get(sessionId) || /* @__PURE__ */ new Set();
}
function addAutoApprovedAction(sessionId, action) {
	if (!_autoApproved.has(sessionId)) _autoApproved.set(sessionId, /* @__PURE__ */ new Set());
	_autoApproved.get(sessionId).add(action);
}
/**
* Returns true when the action should be auto-approved for this session —
* either YOLO/AFK is active (blanket), or the specific action was previously
* approved for the session.
*/
function isAutoApproved(sessionId, action) {
	if (!sessionId) return false;
	if (isYolo(sessionId) || isAfk(sessionId)) return true;
	const set = _autoApproved.get(sessionId);
	return set ? set.has(action) : false;
}
var _yolo, _afk, _autoApproved;
var init_approval_state = __esmMin((() => {
	_yolo = /* @__PURE__ */ new Map();
	_afk = /* @__PURE__ */ new Map();
	_autoApproved = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/agent/turn-approval.js
init_events();
init_auth();
init_log();
var log$5 = logger("approval");
var GRANTS_GLOBAL = "global";
var _grantsCache = null;
async function grantsFile() {
	const { getFreddieHome } = await Promise.resolve().then(() => (init_home(), home_exports));
	return (await import("node:path")).join(getFreddieHome(), "approval-grants.json");
}
async function loadApprovalGrants(cwd) {
	try {
		if (!_grantsCache) {
			const fs = await import("node:fs");
			_grantsCache = JSON.parse(fs.readFileSync(await grantsFile(), "utf8"));
		}
	} catch {
		_grantsCache = _grantsCache || {};
	}
	return [..._grantsCache[GRANTS_GLOBAL] || [], ...cwd && _grantsCache[cwd] ? _grantsCache[cwd] : []];
}
function requestApproval(sessionKey, { name, args, cwd }) {
	const t = turns.get(sessionKey);
	if (!t) {
		log$5.warn("approval gate bypassed: no registered turn for session", {
			sessionKey,
			tool: name
		});
		return Promise.resolve({ approved: true });
	}
	return new Promise((resolve) => {
		const id = randomUUID();
		const timer = Number.isFinite(t.control.approvalTimeoutMs) ? setTimeout(() => {
			if (t.pendingApproval?.id !== id) return;
			t.pendingApproval = null;
			emitTurnEvent(sessionKey, "approval.resolved", {
				id,
				name,
				approved: false,
				timedOut: true,
				feedback: "approval timed out"
			});
			resolve({
				approved: false,
				feedback: "approval timed out"
			});
		}, t.control.approvalTimeoutMs) : null;
		if (timer && typeof timer.unref === "function") timer.unref();
		t.pendingApproval = {
			id,
			name,
			cwd: cwd ?? null,
			resolve: (d) => {
				if (timer) clearTimeout(timer);
				resolve(d);
			}
		};
		emitTurnEvent(sessionKey, "approval.request", {
			id,
			name,
			args: redactSecrets(args),
			cwd: cwd ?? null
		});
	});
}
//#endregion
//#region src/agent/turn-question.js
init_events();
init_auth();
//#endregion
//#region src/machines/step-journal.js
var step_journal_exports = /* @__PURE__ */ __exportAll({
	clearSteps: () => clearSteps,
	createLibsqlStepStore: () => createLibsqlStepStore,
	isStepDone: () => isStepDone,
	listSteps: () => listSteps,
	runStep: () => runStep
});
async function init() {
	const d = await db$1();
	if (!_inited) {
		await d.exec(`CREATE TABLE IF NOT EXISTS step_results (
            session_key TEXT NOT NULL,
            step_id TEXT NOT NULL,
            status TEXT NOT NULL,
            result_json TEXT,
            started INTEGER NOT NULL,
            done INTEGER,
            PRIMARY KEY (session_key, step_id)
        )`);
		_inited = true;
	}
	return d;
}
async function runStep(sessionKey, stepId, fn, { serialize = JSON.stringify, deserialize = JSON.parse, store = null } = {}) {
	if (store) return await store.runStep(sessionKey, stepId, fn, {
		serialize,
		deserialize
	});
	if (!sessionKey || !stepId) return await fn();
	const d = await init();
	const lockKey = sessionKey + " " + stepId;
	if (_inflight.has(lockKey)) return await _inflight.get(lockKey);
	const exec = (async () => {
		const row = await d.prepare(`SELECT status, result_json FROM step_results WHERE session_key = ? AND step_id = ?`).get(sessionKey, stepId);
		if (row && row.status === "done") try {
			return deserialize(row.result_json);
		} catch (e) {
			log$4.error("cached step result unparseable, re-running", {
				sessionKey,
				stepId,
				err: String(e)
			});
			await d.prepare(`DELETE FROM step_results WHERE session_key = ? AND step_id = ?`).run(sessionKey, stepId);
		}
		const claimTs = Date.now();
		await d.prepare(`INSERT INTO step_results (session_key, step_id, status, started, done)
            VALUES (?, ?, 'started', ?, NULL)
            ON CONFLICT(session_key, step_id) DO UPDATE SET status='started', started=excluded.started, done=NULL`).run(sessionKey, stepId, claimTs);
		const claimCheck = await d.prepare(`SELECT started FROM step_results WHERE session_key = ? AND step_id = ?`).get(sessionKey, stepId);
		if (claimCheck && Number(claimCheck.started) !== claimTs) throw new Error(`runStep: lost cross-process claim race for ${sessionKey}/${stepId} -- another process's concurrent runStep call is executing this step`);
		const result = await fn();
		let json;
		try {
			json = serialize(result);
		} catch (e) {
			log$4.error("step result not serializable; not journaled (resume will re-run)", {
				sessionKey,
				stepId,
				err: String(e)
			});
			return result;
		}
		await d.prepare(`UPDATE step_results SET status='done', result_json=?, done=? WHERE session_key = ? AND step_id = ?`).run(json, Date.now(), sessionKey, stepId);
		return result;
	})();
	_inflight.set(lockKey, exec);
	try {
		return await exec;
	} finally {
		_inflight.delete(lockKey);
	}
}
async function isStepDone(sessionKey, stepId, { store = null } = {}) {
	if (store) return await store.isStepDone(sessionKey, stepId);
	if (!sessionKey || !stepId) return false;
	return (await (await init()).prepare(`SELECT status FROM step_results WHERE session_key = ? AND step_id = ?`).get(sessionKey, stepId))?.status === "done";
}
async function listSteps(sessionKey) {
	return await (await init()).prepare(`SELECT step_id, status, started, done FROM step_results WHERE session_key = ? ORDER BY started`).all(sessionKey);
}
async function clearSteps(sessionKey, { store = null } = {}) {
	if (store) return await store.clearSteps(sessionKey);
	if (!sessionKey) return;
	await (await init()).prepare(`DELETE FROM step_results WHERE session_key = ?`).run(sessionKey);
}
function createLibsqlStepStore() {
	return {
		runStep,
		isStepDone,
		clearSteps,
		listSteps
	};
}
var log$4, _inited, _inflight;
var init_step_journal = __esmMin((() => {
	init_db();
	init_log();
	log$4 = logger("step-journal");
	_inited = false;
	_inflight = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/agent/turn-revert.js
init_events();
//#endregion
//#region src/toolsets.js
function available(host) {
	return host.pi.tools.list().filter((t) => !t.checkFn || t.checkFn(t) !== false);
}
async function getEnabledToolSchemas(enabled = ["core"], disabled = []) {
	const h = await bootHost();
	const enabledSet = new Set(enabled);
	const disabledSet = new Set(disabled);
	return available(h).filter((t) => enabledSet.has(t.toolset || "core") && !disabledSet.has(t.name)).map((t) => sanitizeSchema(t.schema));
}
//#endregion
//#region src/agent/acptoapi_config.js
function getAcptoapiUrl() {
	return envVal("FREDDIE_LLM_URL") || null;
}
function getAcptoapiModel(defaultModel = null) {
	return envVal("FREDDIE_LLM_MODEL") || defaultModel || null;
}
async function getAcptoapi() {
	if (!_acptoapi) {
		const mod = await import("acptoapi");
		_acptoapi = mod.default && typeof mod.default === "object" ? mod.default : mod;
	}
	return _acptoapi;
}
function isConfiguredChainSyntax(model) {
	if (typeof model !== "string") return false;
	return model.includes(",") || model.startsWith("queue/") || model.startsWith("chain/");
}
async function resolveChainLinks(acptoapi, useModel) {
	if (isConfiguredChainSyntax(useModel)) return useModel;
	try {
		const links = acptoapi.buildAutoChain(useModel);
		return Array.isArray(links) && links.length ? links.map((l) => l.model || l) : useModel;
	} catch {
		return useModel;
	}
}
async function isReachable(timeoutMs = REACHABILITY_PROBE_TIMEOUT_MS, model = null) {
	try {
		const acptoapi = await getAcptoapi();
		const useModel = model || getAcptoapiModel();
		if (!useModel) return false;
		const chainModel = await resolveChainLinks(acptoapi, useModel);
		const probeChain = Array.isArray(chainModel) ? chainModel.slice(0, 3) : chainModel;
		const probe = {
			messages: [{
				role: "user",
				content: "ping"
			}],
			max_tokens: 32
		};
		const result = await Promise.race([Array.isArray(probeChain) ? acptoapi.chatChain(probeChain, probe) : acptoapi.chat({
			model: probeChain,
			...probe
		}), new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error("reachability probe timeout")), timeoutMs))]);
		return !!(result && result.choices && result.choices.length);
	} catch {
		return false;
	}
}
var log$3, envVal, ACPTOAPI_TIMEOUT_MS, _acptoapi, REACHABILITY_PROBE_TIMEOUT_MS;
var init_acptoapi_config = __esmMin((() => {
	init_log();
	log$3 = logger("acptoapi");
	envVal = (k) => {
		try {
			return typeof process !== "undefined" && process.env ? process.env[k] : void 0;
		} catch {
			return;
		}
	};
	ACPTOAPI_TIMEOUT_MS = Number(envVal("FREDDIE_LLM_TIMEOUT_MS")) || 24e4;
	_acptoapi = null;
	REACHABILITY_PROBE_TIMEOUT_MS = Number(envVal("ACPTOAPI_REACHABILITY_PROBE_TIMEOUT_MS")) || 45e3;
}));
//#endregion
//#region src/agent/tool_call_text.js
function randId() {
	return "call_" + Math.random().toString(36).slice(2, 10);
}
function parseKimiSection(content) {
	if (!content.includes("<|tool_call_begin|>")) return [];
	const re = /<\|tool_call_begin\|>\s*([\s\S]*?)\s*<\|tool_call_argument_begin\|>\s*([\s\S]*?)\s*<\|tool_call_end\|>/g;
	const out = [];
	let m;
	while ((m = re.exec(content)) !== null) {
		const name = (m[1] || "").replace(/^functions\./, "").replace(/:\d+\s*$/, "").trim();
		let args;
		try {
			args = JSON.parse((m[2] || "").trim());
		} catch {
			args = {};
		}
		if (name) out.push({
			id: randId(),
			name,
			arguments: args
		});
	}
	return out;
}
function parsePythonTag(content) {
	if (!content.includes("<|python_tag|>")) return [];
	const after = content.slice(content.indexOf("<|python_tag|>") + 14).trim().split("\n")[0];
	const mc = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(([\s\S]*?)\)\s*$/.exec(after);
	if (!mc) return [];
	const name = mc[1].split(".")[0];
	const inner = mc[2].trim();
	let args = {};
	if (/^\{[\s\S]*\}$/.test(inner)) try {
		args = JSON.parse(inner);
	} catch {
		args = {};
	}
	else if (/^"[\s\S]*"$/.test(inner)) {
		const s = inner.slice(1, -1);
		args = {
			query: s,
			input: s
		};
	} else if (/=/.test(inner)) {
		const kwRe = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[\d.]+|true|false|null)/g;
		let mm;
		while ((mm = kwRe.exec(inner)) !== null) {
			let v = mm[2];
			if (/^["']/.test(v)) v = v.slice(1, -1);
			else if (/^[\d.]+$/.test(v)) v = Number(v);
			else if (v === "true") v = true;
			else if (v === "false") v = false;
			else if (v === "null") v = null;
			args[mm[1]] = v;
		}
	} else if (inner) args = {
		query: inner,
		input: inner
	};
	return name ? [{
		id: randId(),
		name,
		arguments: args
	}] : [];
}
function parseMinicpmFunctionTags(content) {
	if (!content.includes("<function ")) return [];
	const fnRe = /<function\s+name="([^"]+)">([\s\S]*?)<\/function>/g;
	const paramRe = /<param\s+name="([^"]+)">(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/param>/g;
	const out = [];
	let m;
	while ((m = fnRe.exec(content)) !== null) {
		const name = m[1];
		const body = m[2];
		const args = {};
		let pm;
		paramRe.lastIndex = 0;
		while ((pm = paramRe.exec(body)) !== null) args[pm[1]] = pm[2] !== void 0 && pm[2] !== "" ? pm[2] : pm[3];
		if (name) out.push({
			id: randId(),
			name,
			arguments: args
		});
	}
	return out;
}
function parseBareJsonArray(content) {
	const trimmed = content.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed) || !parsed.length) return [];
	const out = [];
	for (const item of parsed) {
		if (!item || typeof item !== "object") return [];
		const name = item.name;
		if (typeof name !== "string" || !name) return [];
		const args = item.parameters ?? item.arguments ?? {};
		if (typeof args !== "object" || args === null) return [];
		out.push({
			id: randId(),
			name,
			arguments: args
		});
	}
	return out;
}
function parseBareFunctionCallObject(content) {
	const trimmed = content.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
	const name = parsed.name ?? parsed.function?.name;
	if (typeof name !== "string" || !name) return [];
	const args = parsed.parameters ?? parsed.arguments ?? parsed.function?.arguments ?? {};
	if (typeof args !== "object" || args === null) return [];
	return [{
		id: randId(),
		name,
		arguments: args
	}];
}
function findBalancedJsonObjectEnd(text, startIndex) {
	let depth = 0, inString = false, escaped = false;
	for (let i = startIndex; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") {
			inString = true;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}
function parseNameFollowedByJsonObject(content) {
	const trimmed = content.trim();
	const match = /^([A-Za-z_][A-Za-z0-9_]*)\{/.exec(trimmed);
	if (!match) return [];
	const name = match[1];
	const jsonStart = name.length;
	const jsonEnd = findBalancedJsonObjectEnd(trimmed, jsonStart);
	if (jsonEnd === -1) return [];
	let args;
	try {
		args = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
	} catch {
		return [];
	}
	if (typeof args !== "object" || args === null) return [];
	return [{
		id: randId(),
		name,
		arguments: args
	}];
}
function parseTextToolCalls(content) {
	if (typeof content !== "string" || !content) return [];
	const kimi = parseKimiSection(content);
	if (kimi.length) return kimi;
	const pythonTag = parsePythonTag(content);
	if (pythonTag.length) return pythonTag;
	const minicpm = parseMinicpmFunctionTags(content);
	if (minicpm.length) return minicpm;
	const bareArray = parseBareJsonArray(content);
	if (bareArray.length) return bareArray;
	const bareObject = parseBareFunctionCallObject(content);
	if (bareObject.length) return bareObject;
	return parseNameFollowedByJsonObject(content);
}
var init_tool_call_text = __esmMin((() => {}));
//#endregion
//#region src/agent/acptoapi_format.js
function forcedToolChoiceMissed(tool_choice, hasTools, adapted) {
	return (tool_choice === "required" || tool_choice?.type === "required") && hasTools && !adapted.tool_calls.length;
}
function isLikelyToolRefusal(text) {
	if (!text) return false;
	const norm = String(text).toLowerCase().replace(/\s+/g, " ").trim();
	return TOOL_REFUSAL_MARKERS.some((m) => norm.includes(m));
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
	const choice = r?.choices?.[0]?.message || {};
	const content = typeof choice.content === "string" ? choice.content : "";
	const tool_calls = Array.isArray(choice.tool_calls) ? choice.tool_calls.map((tc) => ({
		id: tc.id,
		name: tc.function?.name,
		arguments: tryParseJson(tc.function?.arguments)
	})) : [];
	if (!tool_calls.length) {
		const textTC = parseTextToolCalls(content);
		if (textTC.length) return {
			content: "",
			tool_calls: textTC,
			raw: r
		};
	}
	return {
		content,
		tool_calls,
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
var TOOL_REFUSAL_MARKERS;
var init_acptoapi_format = __esmMin((() => {
	init_tool_call_text();
	TOOL_REFUSAL_MARKERS = [
		"don't have the tools",
		"do not have the tools",
		"don't have access to",
		"do not have access to",
		"unable to access the",
		"i cannot call",
		"i can't call",
		"no tool available",
		"lack the necessary tools"
	];
}));
//#endregion
//#region src/agent/acptoapi-bridge.js
async function callLLM({ messages, tools = [], model, tool_choice, cwd = null } = {}) {
	const acptoapi = await getAcptoapi();
	const useModel = model || getAcptoapiModel();
	const chainModel = await resolveChainLinks(acptoapi, useModel);
	const hasTools = Array.isArray(tools) && tools.length > 0;
	const adaptedMessages = messages.map(adaptMessage);
	if (hasTools && cwd) {
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
	let _timeoutHandle;
	const _timeout = new Promise((_, reject) => {
		_timeoutHandle = setTimeout(() => reject(/* @__PURE__ */ new Error("acptoapi call timeout")), ACPTOAPI_TIMEOUT_MS);
	});
	const chatOpts = {
		messages: adaptedMessages,
		...hasTools ? { tools: tools.map(adaptTool) } : {},
		...hasTools && tool_choice ? { tool_choice } : {},
		max_tokens: 4096
	};
	let json;
	try {
		json = await Promise.race([Array.isArray(chainModel) ? acptoapi.chatChain(chainModel, chatOpts) : acptoapi.chat({
			model: chainModel,
			...chatOpts
		}), _timeout]);
	} finally {
		clearTimeout(_timeoutHandle);
	}
	const servedModel = Array.isArray(chainModel) ? (Array.isArray(json.__chainAttempted) ? json.__chainAttempted.filter((a) => a.ok).slice(-1)[0]?.model : null) || json.model || null : useModel;
	log$3.info("completed", {
		model: useModel,
		servedModel,
		usage: json.usage
	});
	const adapted = adaptResponse(json);
	adapted.model = servedModel;
	if (forcedToolChoiceMissed(tool_choice, hasTools, adapted) && servedModel) {
		const uselessMiss = !adapted.content || isLikelyToolRefusal(adapted.content);
		log$3.warn("tool_choice required but no tool call returned", {
			model: servedModel,
			uselessMiss,
			hadContent: !!adapted.content
		});
		if (uselessMiss) try {
			const mod = await getAcptoapi();
			if (mod && typeof mod.recordModelFailure === "function") mod.recordModelFailure(servedModel);
		} catch {}
	}
	return adapted;
}
var init_acptoapi_bridge = __esmMin((() => {
	init_acptoapi_config();
	init_acptoapi_format();
}));
//#endregion
//#region src/models/discovery.js
var discovery_exports = /* @__PURE__ */ __exportAll({
	MATRIX_FILE: () => MATRIX_FILE,
	clearModelsDevCache: () => clearModelsDevCache,
	contextLengthForModel: () => contextLengthForModel,
	discoverAndPersist: () => discoverAndPersist,
	discoverModels: () => discoverModels,
	fetchModelsDev: () => fetchModelsDev,
	findModelDev: () => findModelDev,
	flattenForOpenAI: () => flattenForOpenAI,
	listKnownProviders: () => listKnownProviders,
	loadMatrix: () => loadMatrix,
	matrixUsable: () => matrixUsable
});
function listKnownProviders() {
	const cached = getConfigValue("agent.discovered_models", {}) || {};
	return [.../* @__PURE__ */ new Set([
		...Object.keys(cached),
		...Object.keys(_sdk.PROVIDER_KEYS || {}),
		...NON_KEY_PROVIDERS
	])];
}
async function discoverModels({ provider } = {}) {
	const url = getAcptoapiUrl();
	if (!url) throw new Error("FREDDIE_LLM_URL must be set for this adapter (acptoapi is in-process only otherwise)");
	const base = url.replace(/\/v1\/?$/, "");
	try {
		const r = await fetch(base + "/v1/models", {
			headers: { authorization: "Bearer none" },
			signal: AbortSignal.timeout(1e4)
		});
		if (!r.ok) {
			const text = await r.text();
			log$2.warn("discover failed", {
				status: r.status,
				body: text.slice(0, 200)
			});
			return {};
		}
		const json = await r.json();
		const byProvider = {};
		for (const m of json.data || []) {
			const id = m.id || "";
			const slash = id.indexOf("/");
			if (slash <= 0) continue;
			const p = id.slice(0, slash);
			const modelName = id.slice(slash + 1);
			if (provider && p !== provider) continue;
			byProvider[p] = byProvider[p] || {
				provider: p,
				models: [],
				last_ok_at: Date.now()
			};
			byProvider[p].models.push(modelName);
		}
		log$2.info("discovered", { count: Object.keys(byProvider).length });
		return byProvider;
	} catch (e) {
		log$2.warn("discover error", { error: e.message });
		return {};
	}
}
async function discoverAndPersist({ provider } = {}) {
	const result = await discoverModels({ provider });
	const merged = { ...getConfigValue("agent.discovered_models", {}) || {} };
	for (const [p, r] of Object.entries(result)) if (!r.error) merged[p] = {
		models: r.models,
		last_ok_at: r.last_ok_at
	};
	saveConfigValue("agent.discovered_models", merged);
	return result;
}
function flattenForOpenAI() {
	const cached = getConfigValue("agent.discovered_models", {}) || {};
	const queues = getConfigValue("agent.model_queues", {}) || {};
	const data = [];
	for (const [provider, info] of Object.entries(cached)) for (const model of info.models || []) data.push({
		id: `${provider}/${model}`,
		object: "model",
		created: Math.floor((info.last_ok_at || Date.now()) / 1e3),
		owned_by: provider
	});
	for (const name of Object.keys(queues)) data.push({
		id: `queue/${name}`,
		object: "model",
		created: Math.floor(Date.now() / 1e3),
		owned_by: "queue"
	});
	return data;
}
function loadMatrix() {
	if (_matrixCache && Date.now() - _matrixCache.loadedAt < 6e4) return _matrixCache.data;
	if (!fs.existsSync(MATRIX_PATH)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
		if (Date.now() - new Date(data.timestamp).getTime() > MATRIX_TTL_MS) return null;
		_matrixCache = {
			data,
			loadedAt: Date.now()
		};
		return data;
	} catch {
		return null;
	}
}
function matrixUsable(provider, model) {
	const m = loadMatrix();
	if (!m) return null;
	const p = m.providers.find((x) => x.id === provider);
	if (!p) return null;
	if (!model) return p.models.some((mm) => mm.usable_in_any_mode);
	const mm = p.models.find((x) => x.id === model || x.id === model.replace(/^[^/]+\//, ""));
	return mm ? mm.usable_in_any_mode : null;
}
async function fetchModelsDev({ refresh = false } = {}) {
	if (_modelsDevCache && !refresh) return _modelsDevCache;
	try {
		_modelsDevCache = await (await fetch(MODELS_DEV_ENDPOINT)).json();
		return _modelsDevCache;
	} catch {
		return _modelsDevCache || {};
	}
}
async function findModelDev(slug) {
	const data = await fetchModelsDev();
	if (!data || typeof data !== "object") return null;
	for (const provider of Object.values(data)) {
		const models = provider?.models;
		if (!models || typeof models !== "object") continue;
		if (models[slug]) return models[slug];
		const hit = Object.values(models).find((m) => m.id === slug);
		if (hit) return hit;
	}
	return null;
}
function clearModelsDevCache() {
	_modelsDevCache = null;
}
async function contextLengthForModel(modelString) {
	if (!modelString || typeof modelString !== "string") return null;
	const slug = modelString.includes("/") ? modelString.slice(modelString.lastIndexOf("/") + 1) : modelString;
	try {
		const ctx = (await findModelDev(slug))?.limit?.context;
		return Number.isFinite(ctx) && ctx > 0 ? ctx : null;
	} catch {
		return null;
	}
}
var _sdk, log$2, NON_KEY_PROVIDERS, MATRIX_PATH, MATRIX_TTL_MS, _matrixCache, MATRIX_FILE, _modelsDevCache, MODELS_DEV_ENDPOINT;
var init_discovery = __esmMin((() => {
	init_acptoapi_bridge();
	init_config$1();
	init_log();
	_sdk = _sdkNs && (_sdkNs.default || _sdkNs) || {};
	log$2 = logger("model-discovery");
	NON_KEY_PROVIDERS = [
		"claude-cli",
		"kilo",
		"opencode",
		"ollama"
	];
	MATRIX_PATH = path.resolve(new URL(".", "" + import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..", "..", ".gm", "model-availability.json");
	MATRIX_TTL_MS = 864e5;
	_matrixCache = null;
	MATRIX_FILE = MATRIX_PATH;
	_modelsDevCache = null;
	MODELS_DEV_ENDPOINT = "https://models.dev/api.json";
}));
//#endregion
//#region src/agent/llm_provider_warmup.js
init_discovery();
init_acptoapi_bridge();
init_config$1();
var _req = createRequire(import.meta.url);
function preferredModel() {
	try {
		const pref = getConfigValue("agent.model_preference", []);
		const first = Array.isArray(pref) ? pref[0] : null;
		if (!first || !first.provider) return null;
		return (first.model ? `${first.provider}/${first.model}` : DEFAULTS[first.provider] ? `${first.provider}/${DEFAULTS[first.provider]}` : null) || null;
	} catch {
		return null;
	}
}
function createResolverState() {
	return {
		warmExtraPromise: null,
		lastReachable: {
			at: 0,
			ok: false
		}
	};
}
var _state = null;
function state() {
	if (!_state) _state = createResolverState();
	return _state;
}
async function warmExtraProviders() {
	const s = state();
	if (!s.warmExtraPromise) try {
		const extra = _req("acptoapi/lib/extra-providers");
		if (extra && typeof extra.loadAndRegisterAsync === "function") s.warmExtraPromise = extra.loadAndRegisterAsync();
		else s.warmExtraPromise = Promise.resolve();
	} catch {
		s.warmExtraPromise = Promise.resolve();
	}
	await s.warmExtraPromise;
}
var sdk = _sdkNs && (_sdkNs.default || _sdkNs) || {};
var PROVIDER_KEYS = sdk.PROVIDER_KEYS || {};
var DEFAULTS = sdk.PROVIDER_DEFAULTS || {};
async function cachedReachable() {
	const s = state();
	const now = Date.now();
	if (now - s.lastReachable.at < 5e3) return s.lastReachable.ok;
	const ok = await isReachable(void 0, preferredModel());
	s.lastReachable = {
		at: now,
		ok
	};
	return ok;
}
//#endregion
//#region src/agent/llm_resolver.js
init_config$1();
init_acptoapi_bridge();
init_tool_call_text();
init_env();
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
function flattenContent(c) {
	if (typeof c === "string") return {
		text: c,
		toolUses: []
	};
	if (Array.isArray(c)) return {
		text: c.filter((p) => p && (p.type === "text" || typeof p.text === "string")).map((p) => p.text || "").join(""),
		toolUses: c.filter((p) => p && p.type === "tool_use")
	};
	return {
		text: "",
		toolUses: []
	};
}
function adapt(result) {
	const c = result?.choices?.[0]?.message || {};
	const flat = flattenContent(c.content);
	const openaiTC = Array.isArray(c.tool_calls) ? c.tool_calls.map((tc) => ({
		id: tc.id,
		name: tc.function?.name,
		arguments: tryJson(tc.function?.arguments)
	})) : [];
	const anthropicTC = flat.toolUses.map((t) => ({
		id: t.id,
		name: t.name,
		arguments: t.input || {}
	}));
	const tool_calls = openaiTC.concat(anthropicTC);
	if (!tool_calls.length) {
		const textTC = parseTextToolCalls(flat.text);
		if (textTC.length) return {
			content: "",
			tool_calls: textTC,
			raw: result,
			recoveredFromText: true
		};
	}
	return {
		content: flat.text,
		tool_calls,
		raw: result
	};
}
var NAMED_CHAIN_NAMES = /* @__PURE__ */ new Set([
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
	let chain = [];
	try {
		chain = typeof sdk.buildAutoChain === "function" ? sdk.buildAutoChain(void 0, { hasTools: true }) : [];
	} catch {}
	const pref = getConfigValue("agent.model_preference", []);
	const prefModels = Array.isArray(pref) && pref.length ? pref.map((p) => `${p.provider}/${p.model || DEFAULTS[p.provider] || ""}`.replace(/\/$/, "")).filter((s) => s.includes("/")) : [];
	if (prefModels.length) {
		const status = typeof sdk.getStatus === "function" ? sdk.getStatus() : [];
		const blocked = new Set(status.filter((s) => s.ok === false).map((s) => s.provider));
		const seen = /* @__PURE__ */ new Set();
		const ordered = [];
		for (const m of [...prefModels, ...chain.map((l) => l.model)]) {
			if (seen.has(m)) continue;
			seen.add(m);
			if (blocked.has(m.split("/")[0])) continue;
			ordered.push(m);
		}
		if (ordered.length) return ordered.join(", ");
	}
	const keyed = Array.isArray(chain) ? chain.filter((l) => {
		const env = PROVIDER_KEYS[l.model.split("/")[0]];
		return env && process.env[env];
	}) : [];
	const status = typeof sdk.getStatus === "function" ? sdk.getStatus() : [];
	if (status.length && keyed.length) {
		const blocked = new Set(status.filter((s) => s.ok === false).map((s) => s.provider));
		const filtered = keyed.filter((l) => !blocked.has(l.model.split("/")[0]));
		if (filtered.length) return filtered.map((l) => l.model).join(", ");
	}
	if (keyed.length) return keyed.map((l) => l.model).join(", ");
	if (await cachedReachable()) return env("FREDDIE_LLM_MODEL") || "auto";
	return null;
}
function raceAbort(promise, signal) {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(signal.reason || /* @__PURE__ */ new Error("aborted"));
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason || /* @__PURE__ */ new Error("aborted"));
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then((v) => {
			signal.removeEventListener("abort", onAbort);
			resolve(v);
		}, (e) => {
			signal.removeEventListener("abort", onAbort);
			reject(e);
		});
	});
}
function resolveCallLLM({ provider, model } = {}) {
	warmExtraProviders();
	return async (input) => {
		if (input.signal?.aborted) throw new Error("aborted: " + (input.signal.reason?.message || input.signal.reason || "turn aborted before LLM call started"));
		const m = await buildModel({
			provider,
			model,
			inputModel: input.model
		});
		if (!m) {
			const status = typeof sdk.getStatus === "function" ? sdk.getStatus().map((s) => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(", ") : "";
			throw new Error("no LLM backend reachable: set a provider API key or FREDDIE_LLM_MODEL" + (status ? " | sampler: " + status : ""));
		}
		try {
			if (typeof m === "string" && !m.includes(",") && !/^queue\//.test(m) && await cachedReachable()) return await raceAbort(callLLM({
				...input,
				model: m
			}), input.signal);
			const opts = {
				model: m,
				messages: toMsgs(input.messages),
				tools: toTools(input.tools),
				max_tokens: input.max_tokens || 4096,
				onFallback: input.onFallback,
				output: "openai",
				fallbackOn: [
					"error",
					"rate_limit",
					"timeout",
					"empty"
				]
			};
			if (/^queue\//.test(m)) opts.queuesMap = getConfigValue("agent.model_queues", {}) || {};
			if (m.includes(",") || /^queue\//.test(m)) opts.matrixSource = env("FREDDIE_MATRIX_URL") || MATRIX_FILE;
			if (typeof sdk.chat !== "function") return await raceAbort(callLLM({
				...input,
				model: m
			}), input.signal);
			if (!m.split(",").some((link) => /^extra-[0-9a-f]+\//.test(link.trim())) && typeof input.onChunk === "function" && typeof sdk.sdkStream === "function") try {
				let text = "";
				const tool_calls = [];
				for await (const ev of sdk.sdkStream({
					...opts,
					output: "events"
				})) {
					if (input.signal?.aborted) throw input.signal.reason || /* @__PURE__ */ new Error("aborted");
					if (ev?.type === "text-delta" && ev.textDelta) {
						text += ev.textDelta;
						input.onChunk(ev.textDelta);
					} else if (ev?.type === "tool-call") {
						const args = ev.args ?? ev.input ?? {};
						tool_calls.push({
							id: ev.toolCallId || "call_" + tool_calls.length,
							type: "function",
							function: {
								name: ev.toolName,
								arguments: typeof args === "string" ? args : JSON.stringify(args)
							}
						});
					} else if (ev?.type === "finish-step" || ev?.type === "finish") break;
				}
				return adapt({
					choices: [{ message: {
						content: text,
						tool_calls
					} }],
					provider: m.split("/")[0],
					model: m
				});
			} catch (e) {
				if (input.signal?.aborted) throw input.signal.reason || e;
			}
			return adapt(await raceAbort(sdk.chat(opts), input.signal));
		} catch (e) {
			if (/queue not found or empty/i.test(e.message)) throw e;
			if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) throw new Error(`chain exhausted: ${(e.attempted || []).map((a) => `${a.model}:${a.reason || "ok"}`).join("; ") || e.message}`);
			throw e;
		}
	};
}
//#endregion
//#region src/agent/approval_classifier.js
init_step_journal();
init_auth();
var ARGS_PROMPT_CAP = 4e3;
function buildPrompt(name, args) {
	let argsJson;
	try {
		argsJson = JSON.stringify(redactSecrets(args) ?? {});
	} catch {
		argsJson = "\"<unserializable>\"";
	}
	if (argsJson.length > ARGS_PROMPT_CAP) argsJson = argsJson.slice(0, ARGS_PROMPT_CAP) + "…[truncated]";
	return `You are a tool-call safety classifier for an autonomous coding agent. You see ONLY the tool name and its JSON arguments — never the conversation, the user's messages, or the agent's reasoning. Judge the call on its own.

ALLOW calls that are clearly safe to run without asking a human:
- reading, searching, or listing files; fetching public data
- creating or editing files inside the working directory as ordinary coding work
- local, reversible commands (echo, build, test, lint, git status/diff/log)

DENY calls that are destructive, irreversible, expose secrets, or touch shared state:
- deleting or overwriting data broadly (rm -rf, dropping tables, truncating files)
- reading or transmitting credentials, keys, tokens, or .env contents
- pushing code, publishing packages, sending messages to third parties
- modifying system state outside the working directory, installing or running untrusted code
- anything you cannot confidently classify as safe — when unsure, DENY (a human can still approve)

Tool: ${name}
Arguments (JSON): ${argsJson}

Answer with exactly one word: ALLOW or DENY.`;
}
function parseVerdict(raw) {
	const text = String(raw || "").trim();
	if (!text) return {
		decision: "escalate",
		reason: "classifier returned an empty answer"
	};
	const upper = text.toUpperCase();
	const hasAllow = /\bALLOW\b/.test(upper);
	const hasDeny = /\bDENY\b/.test(upper);
	if (hasAllow && hasDeny) return {
		decision: "escalate",
		reason: "contradictory classifier answer (both ALLOW and DENY present): " + text.slice(0, 80)
	};
	const lead = upper.replace(/^[^A-Z]+/, "").match(/^(ALLOW|DENY)\b/);
	if (lead) {
		if (lead[1] === "ALLOW") return {
			decision: "allow",
			reason: null
		};
		return {
			decision: "deny",
			reason: text.split("\n")[0].replace(/^[^A-Za-z]*deny\b[^A-Za-z]*/i, "").trim() || null
		};
	}
	if (hasAllow) return {
		decision: "allow",
		reason: null
	};
	if (hasDeny) return {
		decision: "deny",
		reason: null
	};
	return {
		decision: "escalate",
		reason: "unparseable classifier answer: " + text.slice(0, 80)
	};
}
async function classifyToolCall({ name, args, callLLM, signal }) {
	let out;
	try {
		out = await callLLM({
			messages: [{
				role: "user",
				content: buildPrompt(name, args)
			}],
			max_tokens: 16,
			signal
		});
	} catch (e) {
		return {
			decision: "escalate",
			reason: "classifier LLM call failed: " + String(e?.message || e)
		};
	}
	return parseVerdict(out?.content);
}
//#endregion
//#region src/agent/turn_helpers.js
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
function pairDanglingToolCalls(messages, reasonText) {
	const out = [...messages];
	const pairedIds = new Set(out.filter((m) => m && m.role === "tool" && m.tool_call_id).map((m) => m.tool_call_id));
	const lastAssistant = [...out].reverse().find((m) => m && m.role === "assistant" && Array.isArray(m.tool_calls));
	if (lastAssistant) for (const tc of lastAssistant.tool_calls) {
		const tcid = tc?.id || tc?.tool_call_id;
		if (tcid && !pairedIds.has(tcid)) out.push({
			role: "tool",
			tool_call_id: tcid,
			content: JSON.stringify({ error: reasonText }),
			synthetic: true
		});
	}
	return out;
}
function timeoutResult(actor, timeoutMs) {
	const ctx = actor.getSnapshot()?.context || {};
	const messages = pairDanglingToolCalls(Array.isArray(ctx.messages) ? ctx.messages : [], "timeout: tool_call interrupted");
	messages.push({
		role: "system",
		content: `Agent turn interrupted by ${timeoutMs / 1e3}s timeout. Any tool calls above without paired results were cut short and did not complete.`,
		synthetic: true
	});
	return {
		messages,
		result: null,
		error: "agent turn timeout",
		iterations: ctx.iterations || 0
	};
}
//#endregion
//#region src/agent/compact_hooks.js
init_config$1();
async function invokeCompactHooks({ trigger = "auto", messages = [] } = {}) {
	const h = await bootHost();
	const hookEngine = new HookEngine({ config: loadConfig() });
	const pre = await h.hooks.invoke("onPreCompact", {
		trigger,
		messages
	});
	hookEngine.runHooks("onPreCompact", { trigger }).catch(() => {});
	wireHookBridge.forwardHook("onPreCompact", { trigger }).catch(() => {});
	if (pre?.behavior === "block") return {
		skipped: true,
		reason: pre.reason || "blocked"
	};
	return {
		pre,
		post: async (summary) => {
			await h.hooks.invoke("onPostCompact", {
				trigger,
				messages,
				summary
			});
			hookEngine.runHooks("onPostCompact", { trigger }).catch(() => {});
			wireHookBridge.forwardHook("onPostCompact", { trigger }).catch(() => {});
		}
	};
}
//#endregion
//#region src/agent/compress/tokens.js
function contentLengthForBudget(content) {
	if (typeof content === "string") return content.length;
	if (!Array.isArray(content)) return String(content || "").length;
	let total = 0;
	for (const part of content) {
		if (typeof part === "string") {
			total += part.length;
			continue;
		}
		if (!part || typeof part !== "object") {
			total += String(part || "").length;
			continue;
		}
		if (IMAGE_TYPES.has(part.type)) {
			total += IMAGE_CHAR_EQUIVALENT;
			continue;
		}
		if (typeof part.text === "string") {
			total += part.text.length;
			continue;
		}
		total += JSON.stringify(part).length;
	}
	return total;
}
function estimateMessageTokens(message) {
	const contentChars = contentLengthForBudget(message?.content);
	const toolCallsChars = message?.tool_calls ? JSON.stringify(message.tool_calls).length : 0;
	return Math.ceil((contentChars + toolCallsChars + 8) / 4);
}
function estimateMessagesTokens(messages = []) {
	let total = 0;
	for (const m of messages) total += estimateMessageTokens(m);
	return total;
}
function estimateToolSchemaTokens(tools = []) {
	if (!Array.isArray(tools) || !tools.length) return 0;
	return Math.ceil(JSON.stringify(tools).length / 4);
}
var IMAGE_TOKEN_ESTIMATE, IMAGE_CHAR_EQUIVALENT, IMAGE_TYPES;
var init_tokens = __esmMin((() => {
	IMAGE_TOKEN_ESTIMATE = 1600;
	IMAGE_CHAR_EQUIVALENT = IMAGE_TOKEN_ESTIMATE * 4;
	IMAGE_TYPES = /* @__PURE__ */ new Set([
		"image_url",
		"input_image",
		"image"
	]);
}));
//#endregion
//#region src/agent/compress/blocks.js
function isSafeCut(messages, i) {
	const prev = messages[i - 1];
	if (messages[i]?.role === "tool") return false;
	if (prev?.role === "assistant" && Array.isArray(prev.tool_calls) && prev.tool_calls.length) return false;
	return true;
}
function splitMiddleIntoBlocks(middle, blockSourceTokens = BLOCK_SOURCE_TOKENS) {
	if (!Array.isArray(middle) || middle.length === 0) return [];
	const blocks = [];
	let start = 0;
	let used = 0;
	for (let i = 0; i < middle.length; i++) {
		used += estimateMessageTokens(middle[i]);
		if (used >= blockSourceTokens && i + 1 < middle.length && isSafeCut(middle, i + 1)) {
			blocks.push(middle.slice(start, i + 1));
			start = i + 1;
			used = 0;
		}
	}
	if (start < middle.length) blocks.push(middle.slice(start));
	return blocks;
}
function allocateBlockBudgets(blocks, summaryBudget) {
	if (!blocks.length) return [];
	const sizes = blocks.map((b) => estimateMessagesTokens(b));
	const total = sizes.reduce((a, b) => a + b, 0) || 1;
	return sizes.map((s) => Math.max(200, Math.floor(summaryBudget * s / total)));
}
function enforceTokenBudget(text, budgetTokens) {
	if (typeof text !== "string") return "";
	const maxChars = Math.max(0, Math.floor(budgetTokens * 4));
	if (text.length <= maxChars) return text;
	let cut = maxChars;
	const lastNewline = text.lastIndexOf("\n", maxChars);
	if (lastNewline >= Math.floor(maxChars * .8)) cut = lastNewline;
	return text.slice(0, cut);
}
async function mapWithConcurrency(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	const controller = new AbortController();
	const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		while (next < items.length) {
			const i = next++;
			try {
				results[i] = await fn(items[i], i, controller.signal);
			} catch (e) {
				controller.abort(e);
				throw e;
			}
		}
	});
	await Promise.all(workers);
	return results;
}
var BLOCK_SOURCE_TOKENS;
var init_blocks = __esmMin((() => {
	init_tokens();
	BLOCK_SOURCE_TOKENS = 8e3;
}));
//#endregion
//#region src/agent/compress/policy.js
function usableContextLength(modelContextLength, tools) {
	const overhead = estimateToolSchemaTokens(tools);
	return Math.max(MINIMUM_CONTEXT_LENGTH, modelContextLength - overhead);
}
function compressionTier({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, tools = [], threshold = COMPRESSION_THRESHOLD, hardThreshold = HARD_COMPRESSION_THRESHOLD } = {}) {
	if (!Array.isArray(messages) || messages.length < 4) return null;
	const used = estimateMessagesTokens(messages);
	const usable = usableContextLength(modelContextLength, tools);
	if (used >= usable * hardThreshold) return "hard";
	if (used >= usable * threshold) return "soft";
	return null;
}
function shouldCompress({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, tools = [], threshold = COMPRESSION_THRESHOLD } = {}) {
	if (!Array.isArray(messages) || messages.length < 4) return false;
	return estimateMessagesTokens(messages) >= usableContextLength(modelContextLength, tools) * threshold;
}
function computeCompressionPlan(messages, modelContextLength = MINIMUM_CONTEXT_LENGTH) {
	const total = messages.length;
	if (total < 4) return {
		head: messages,
		middle: [],
		tail: [],
		summaryBudget: 0
	};
	const headCount = headCutoff(messages);
	const tailCount = tailCutoffByTokens(messages, headCount, modelContextLength);
	const head = messages.slice(0, headCount);
	const tail = messages.slice(total - tailCount);
	const middle = messages.slice(headCount, total - tailCount);
	const middleTokens = estimateMessagesTokens(middle);
	const rawBudget = Math.floor(middleTokens * SUMMARY_RATIO);
	return {
		head,
		middle,
		tail,
		summaryBudget: Math.min(SUMMARY_TOKENS_CEILING, Math.max(MIN_SUMMARY_TOKENS, rawBudget))
	};
}
function headCutoff(messages) {
	let i = 0;
	while (i < messages.length && messages[i].role === "system") i++;
	if (i + 1 < messages.length && messages[i].role === "user") i++;
	return Math.min(i, messages.length);
}
function tailCutoffByTokens(messages, minIndex, contextLen) {
	const tailBudgetTokens = Math.floor(Math.max(MINIMUM_CONTEXT_LENGTH, contextLen) * .2);
	let used = 0;
	let count = 0;
	for (let i = messages.length - 1; i >= minIndex; i--) {
		const t = estimateMessagesTokens([messages[i]]);
		if (used + t > tailBudgetTokens && count >= 2 && isSafeCut(messages, i + 1)) break;
		used += t;
		count++;
	}
	while (count < messages.length - minIndex && !isSafeCut(messages, messages.length - count)) count++;
	return Math.max(2, count);
}
var MINIMUM_CONTEXT_LENGTH, SUMMARY_RATIO, MIN_SUMMARY_TOKENS, SUMMARY_TOKENS_CEILING, COMPRESSION_THRESHOLD, HARD_COMPRESSION_THRESHOLD;
var init_policy = __esmMin((() => {
	init_tokens();
	init_blocks();
	MINIMUM_CONTEXT_LENGTH = 8e3;
	SUMMARY_RATIO = .2;
	MIN_SUMMARY_TOKENS = 2e3;
	SUMMARY_TOKENS_CEILING = 12e3;
	COMPRESSION_THRESHOLD = .85;
	HARD_COMPRESSION_THRESHOLD = .95;
}));
//#endregion
//#region src/agent/compress/prune.js
function pruneOldToolResults(messages, keepLast = 5) {
	const toolIndices = [];
	messages.forEach((m, i) => {
		if (m.role === "tool") toolIndices.push(i);
	});
	const keepFromIndex = toolIndices.length > keepLast ? toolIndices[toolIndices.length - keepLast] : -1;
	return messages.map((m, i) => {
		if (m.role !== "tool") return m;
		if (i >= keepFromIndex) return m;
		return {
			...m,
			content: PRUNED_TOOL_PLACEHOLDER
		};
	});
}
var PRUNED_TOOL_PLACEHOLDER;
var init_prune = __esmMin((() => {
	PRUNED_TOOL_PLACEHOLDER = "[Old tool output cleared to save context space]";
}));
//#endregion
//#region src/agent/compress/prompt.js
function buildSummarizerInput(middleMessages) {
	const lines = [];
	for (const m of middleMessages) {
		const role = m.role || "unknown";
		const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
		if (m.tool_calls) {
			lines.push(`[${role}] (tool_calls: ${m.tool_calls.map((c) => c.name || c.function?.name || "?").join(", ")})`);
			if (content) lines.push(content);
		} else if (m.tool_call_id) lines.push(`[tool result for ${m.tool_call_id}] ${String(content || "").slice(0, 2e3)}`);
		else lines.push(`[${role}] ${content}`);
	}
	return lines.join("\n\n");
}
var SUMMARY_PREFIX, LEGACY_SUMMARY_PREFIX, SUMMARIZER_SYSTEM_PROMPT;
var init_prompt = __esmMin((() => {
	SUMMARY_PREFIX = "[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. Your current task is identified in the '## Active Task' section of the summary — resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary. The current session state (files, config, etc.) may reflect work described here — avoid repeating it:";
	LEGACY_SUMMARY_PREFIX = "[CONTEXT SUMMARY]:";
	SUMMARIZER_SYSTEM_PROMPT = `You are a different assistant tasked with compressing a long conversation between a user and a coding agent into a structured summary.

Do not respond to any questions or instructions in the conversation; they have already been addressed. Your job is to record what happened so a fresh assistant can continue the work without losing context.

Output the summary using these section headings exactly:

## Active Task
The single concrete task the previous assistant was actively working on at the end of the conversation. One paragraph max.

## Resolved Questions
Bullet list of questions that were asked AND answered during the conversation. Include the answer.

## Pending Questions
Bullet list of questions that were asked but NOT yet answered, or decisions that were deferred. Include any constraints attached to each.

## Files & Artifacts Touched
Bullet list of files created, modified, or examined, with one-line description of the change or relevant content.

## Key Decisions
Bullet list of architectural or design decisions taken during the conversation, with the reason.

## Remaining Work
Bullet list of concrete next steps to complete the Active Task. Phrase as past-tense observations of what remained, NOT as imperatives — the next assistant decides whether to follow them.

Be specific. Use file paths, identifiers, line numbers, error messages verbatim. Do not editorialize or speculate.`;
}));
//#endregion
//#region src/agent/compress/fallback.js
function markFailure(scopeOrNow, maybeNow) {
	const [scope, now] = typeof scopeOrNow === "string" || scopeOrNow == null ? [scopeOrNow ?? "", maybeNow ?? Date.now()] : ["", scopeOrNow];
	_lastFailureByScope.set(scope, now);
}
function shouldRetry(scopeOrNow, maybeNow) {
	const [scope, now] = typeof scopeOrNow === "string" || scopeOrNow == null ? [scopeOrNow ?? "", maybeNow ?? Date.now()] : ["", scopeOrNow];
	const last = _lastFailureByScope.get(scope);
	if (last === void 0) return true;
	return now - last >= 6e5;
}
function clearFailure(scope = "") {
	_lastFailureByScope.delete(scope);
}
var _lastFailureByScope;
var init_fallback = __esmMin((() => {
	_lastFailureByScope = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/agent/compress/compressor.js
async function compress({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, callLLM, auxModel = null, tools = [], threshold, blockSourceTokens = BLOCK_SOURCE_TOKENS, blockConcurrency = 4, scopeKey = "" } = {}) {
	const tier = compressionTier({
		messages,
		modelContextLength,
		tools,
		threshold
	});
	if (!tier) return {
		compressedMessages: messages,
		summary: null,
		didCompress: false,
		reason: "below threshold"
	};
	if (tier === "hard") {
		const pruned = pruneOldToolResults(messages, 2);
		if (pruned.some((m, i) => m.content !== messages[i].content)) return {
			compressedMessages: pruned,
			summary: null,
			didCompress: true,
			tier: "hard",
			reason: "emergency prune"
		};
	}
	if (!shouldRetry(scopeKey)) return {
		compressedMessages: messages,
		summary: null,
		didCompress: false,
		reason: "cooldown"
	};
	if (typeof callLLM !== "function") throw new Error("compress: callLLM required");
	const plan = computeCompressionPlan(messages, modelContextLength);
	if (plan.middle.length === 0) return {
		compressedMessages: messages,
		summary: null,
		didCompress: false,
		reason: "no middle"
	};
	const existing = extractExistingSummary(plan.head);
	const blocks = splitMiddleIntoBlocks(pruneOldToolResults(plan.middle, 0), blockSourceTokens);
	const budgets = allocateBlockBudgets(blocks, plan.summaryBudget);
	let blockSummaries;
	try {
		blockSummaries = await mapWithConcurrency(blocks, blockConcurrency, async (block, i, signal) => {
			const budget = budgets[i];
			const budgetLine = `Length limit: this block's summary MUST be under ${budget} tokens (≈${budget * 4} characters). Shorter is better — this is a hard cap, anything past it is discarded.`;
			const preamble = i === 0 && existing ? `Previous summary:\n${existing}\n\nNew turns to fold in:\n` : "";
			const blockLabel = blocks.length > 1 ? `This is block ${i + 1} of ${blocks.length} from the same conversation; summarize only what is in this block.\n\n` : "";
			const raw = ((await callLLM({
				messages: [{
					role: "system",
					content: SUMMARIZER_SYSTEM_PROMPT
				}, {
					role: "user",
					content: budgetLine + "\n\n" + blockLabel + preamble + buildSummarizerInput(block)
				}],
				tools: [],
				model: auxModel,
				maxTokens: budget,
				max_tokens: budget,
				signal
			}))?.content || "").trim();
			if (!raw) throw new Error("empty summary");
			return enforceTokenBudget(raw, budget);
		});
	} catch (e) {
		markFailure(scopeKey);
		log$1.error("summarization failed", { err: String(e) });
		return {
			compressedMessages: messages,
			summary: null,
			didCompress: false,
			error: String(e)
		};
	}
	const summary = blockSummaries.join("\n\n");
	const headWithoutOldSummary = stripExistingSummary(plan.head);
	const summaryMsg = {
		role: "user",
		content: `${SUMMARY_PREFIX}\n\n${summary}`
	};
	const compressedMessages = [
		...headWithoutOldSummary,
		summaryMsg,
		...plan.tail
	];
	const blockInfo = blocks.map((b, i) => ({
		index: i,
		messages: b.length,
		sourceTokens: estimateMessagesTokens(b),
		budget: budgets[i],
		summaryChars: blockSummaries[i].length
	}));
	log$1.info("compressed", {
		in: messages.length,
		out: compressedMessages.length,
		blocks: blocks.length,
		summary_chars: summary.length
	});
	return {
		compressedMessages,
		summary,
		didCompress: true,
		plan,
		blocks: blockInfo
	};
}
function extractExistingSummary(head) {
	for (const m of head) {
		const c = typeof m.content === "string" ? m.content : "";
		if (c.startsWith("[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. Your current task is identified in the '## Active Task' section of the summary — resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary. The current session state (files, config, etc.) may reflect work described here — avoid repeating it:")) return c.slice(SUMMARY_PREFIX.length).trim();
		if (c.startsWith("[CONTEXT SUMMARY]:")) return c.slice(LEGACY_SUMMARY_PREFIX.length).trim();
	}
	return null;
}
function stripExistingSummary(head) {
	return head.filter((m) => {
		const c = typeof m.content === "string" ? m.content : "";
		return !c.startsWith("[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. Your current task is identified in the '## Active Task' section of the summary — resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary. The current session state (files, config, etc.) may reflect work described here — avoid repeating it:") && !c.startsWith("[CONTEXT SUMMARY]:");
	});
}
var log$1;
var init_compressor = __esmMin((() => {
	init_policy();
	init_prune();
	init_prompt();
	init_fallback();
	init_blocks();
	init_tokens();
	init_log();
	log$1 = logger("compressor");
}));
//#endregion
//#region src/agent/compress/index.js
var compress_exports = /* @__PURE__ */ __exportAll({
	BLOCK_CONCURRENCY: () => 4,
	BLOCK_SOURCE_TOKENS: () => BLOCK_SOURCE_TOKENS,
	CHARS_PER_TOKEN: () => 4,
	COMPRESSION_THRESHOLD: () => COMPRESSION_THRESHOLD,
	HARD_COMPRESSION_THRESHOLD: () => HARD_COMPRESSION_THRESHOLD,
	IMAGE_TOKEN_ESTIMATE: () => IMAGE_TOKEN_ESTIMATE,
	LEGACY_SUMMARY_PREFIX: () => LEGACY_SUMMARY_PREFIX,
	MINIMUM_CONTEXT_LENGTH: () => MINIMUM_CONTEXT_LENGTH,
	MIN_BLOCK_SUMMARY_TOKENS: () => 200,
	PRUNED_TOOL_PLACEHOLDER: () => PRUNED_TOOL_PLACEHOLDER,
	SUMMARIZER_SYSTEM_PROMPT: () => SUMMARIZER_SYSTEM_PROMPT,
	SUMMARY_FAILURE_COOLDOWN_SECONDS: () => 600,
	SUMMARY_PREFIX: () => SUMMARY_PREFIX,
	SUMMARY_RATIO: () => SUMMARY_RATIO,
	allocateBlockBudgets: () => allocateBlockBudgets,
	buildSummarizerInput: () => buildSummarizerInput,
	clearFailure: () => clearFailure,
	compress: () => compress,
	compressionTier: () => compressionTier,
	computeCompressionPlan: () => computeCompressionPlan,
	contentLengthForBudget: () => contentLengthForBudget,
	enforceTokenBudget: () => enforceTokenBudget,
	estimateMessageTokens: () => estimateMessageTokens,
	estimateMessagesTokens: () => estimateMessagesTokens,
	estimateToolSchemaTokens: () => estimateToolSchemaTokens,
	mapWithConcurrency: () => mapWithConcurrency,
	markFailure: () => markFailure,
	pruneOldToolResults: () => pruneOldToolResults,
	shouldCompress: () => shouldCompress,
	shouldRetry: () => shouldRetry,
	splitMiddleIntoBlocks: () => splitMiddleIntoBlocks
});
var init_compress = __esmMin((() => {
	init_compressor();
	init_policy();
	init_prompt();
	init_prune();
	init_tokens();
	init_fallback();
	init_blocks();
}));
//#endregion
//#region src/agent/machine_builder.js
init_config$1();
init_telemetry();
init_events();
init_auth();
init_log();
function looksLikeStructuredDataNotProse(text) {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
	try {
		JSON.parse(trimmed);
		return true;
	} catch {
		return false;
	}
}
var COMPLETION_CLAIM_RE = /\b(i(?:'ve| have)\s+(?:successfully\s+)?(?:created|written|wrote|built|completed|finished|updated|generated|added|implemented)|(?:has|have)\s+been\s+(?:successfully\s+)?(?:created|written|completed|updated)|✅|task\s+(?:is\s+)?(?:complete|done)|all\s+set)\b/i;
function claimsCompletionWithNoEvidence(content, toolCallsUsedThisTurn) {
	if (toolCallsUsedThisTurn > 0) return false;
	if (typeof content !== "string" || !content.trim()) return false;
	return COMPLETION_CLAIM_RE.test(content);
}
function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ["core"], disabledToolsets = [], events, sessionKey, toolCtx = null, tool_choice, store, control = null, h = null, hookEngine = null, wireHookBridge = null, signal = null } = {}) {
	const baseLLM = callLLM || resolveCallLLM({
		provider,
		model
	});
	const llm = events ? async (input) => {
		const t0 = Date.now();
		try {
			if (h?.hooks) await h.hooks.invoke("preLlmCall", {
				provider,
				model,
				messages_count: input.messages?.length || 0,
				tool_count: input.tools?.length || 0
			}).catch(() => {});
			if (hookEngine) hookEngine.runHooks("preLlmCall", {
				sessionKey,
				cwd: toolCtx?.cwd,
				provider,
				model,
				messages_count: input.messages?.length || 0
			}).catch(() => {});
			if (wireHookBridge) wireHookBridge.forwardHook("preLlmCall", {
				sessionKey,
				provider,
				model,
				messages_count: input.messages?.length || 0
			}).catch(() => {});
			const out = await baseLLM({
				...input,
				signal: input.signal ?? signal,
				onChunk: (text) => {
					events.push({
						type: "llm_chunk",
						text,
						ts: (/* @__PURE__ */ new Date()).toISOString()
					});
					emitTurnEvent(sessionKey, "assistant.delta", { text: redactSecrets(text) });
				}
			});
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
			emitTurnEvent(sessionKey, "message.append", {
				role: "assistant",
				content: redactSecrets(out?.content || ""),
				tool_calls: redactSecrets(out?.tool_calls || [])
			});
			if (h?.hooks) await h.hooks.invoke("postLlmCall", {
				provider: out?.raw?.provider || provider,
				model: out?.raw?.model || model,
				content_length: (out?.content || "").length
			});
			if (hookEngine) hookEngine.runHooks("postLlmCall", {
				sessionKey,
				cwd: toolCtx?.cwd,
				provider: out?.raw?.provider || provider,
				model: out?.raw?.model || model
			}).catch(() => {});
			if (wireHookBridge) wireHookBridge.forwardHook("postLlmCall", {
				sessionKey,
				provider: out?.raw?.provider || provider,
				model: out?.raw?.model || model
			}).catch(() => {});
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
		on: {
			INTERRUPT: { actions: assign$1({ interrupt: true }) },
			REVERT: { actions: assign$1({ messages: ({ event }) => [...event.messages || []] }) }
		},
		context: ({ input }) => ({
			messages: input?.messages ? [...input.messages] : [],
			iterations: 0,
			maxIterations,
			interrupt: false,
			lastResult: null,
			error: null,
			emptyResponseStreak: 0,
			textRecoveredStreak: 0,
			toolCallsUsedThisTurn: 0,
			completionClaimStreak: 0,
			provider,
			model,
			enabledToolsets,
			disabledToolsets,
			sessionKey,
			control,
			tool_choice,
			toolCtx,
			store,
			signal
		}),
		states: {
			idle: { on: { SUBMIT: {
				target: "prompting",
				actions: assign$1({
					messages: ({ context, event }) => [...context.messages, {
						role: "user",
						content: event.prompt
					}],
					iterations: 0,
					interrupt: false,
					error: null,
					toolCallsUsedThisTurn: 0,
					completionClaimStreak: 0
				})
			} } },
			prompting: { invoke: {
				src: fromPromise$1(async ({ input }) => {
					const schemas = await getEnabledToolSchemas(input.enabledToolsets, input.disabledToolsets).then((all) => input.toolCtx?.askUser ? all : all.filter((s) => (s.name || s.function?.name) !== "ask_user_question"));
					const tc = typeof input.tool_choice === "function" ? input.tool_choice(input.iterations) : input.iterations === 0 ? input.tool_choice : void 0;
					let callMessages = input.messages;
					let compressedMessages = null;
					const { isStepDone } = await Promise.resolve().then(() => (init_step_journal(), step_journal_exports));
					if (await isStepDone(input.sessionKey, "llm:" + input.iterations, { store: input.store }).catch(() => false)) {
						if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] llm:" + input.iterations + " already journaled done, skipping compress() on resume");
					} else try {
						if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] before compress import, msgcount", input.messages.length);
						const { post, skipped } = await invokeCompactHooks({
							trigger: "auto",
							messages: input.messages
						});
						if (!skipped) {
							if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] before compress() call");
							const { compress } = await Promise.resolve().then(() => (init_compress(), compress_exports));
							const { contextLengthForModel } = await Promise.resolve().then(() => (init_discovery(), discovery_exports));
							const modelContextLength = await contextLengthForModel(input.model).catch(() => null) || void 0;
							const r = await compress({
								messages: input.messages,
								callLLM: resolveCallLLM({}),
								tools: schemas,
								scopeKey: input.sessionKey || "",
								...modelContextLength ? { modelContextLength } : {}
							});
							if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] after compress() call, didCompress=", r.didCompress);
							if (r.didCompress) {
								compressedMessages = r.compressedMessages;
								callMessages = r.compressedMessages;
								await post(r.compressedMessages);
							}
						}
					} catch (e) {
						emitTurnEvent(input.sessionKey, "status.update", {
							kind: "compression_error",
							error: redactSecrets(String(e?.message || e))
						});
						if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] compress threw", e.message);
					}
					if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] before llm() call, iteration", input.iterations);
					const out = await runStep(input.sessionKey, "llm:" + input.iterations, () => llm({
						messages: callMessages,
						tools: schemas,
						model: input.model,
						provider: input.provider,
						tool_choice: tc,
						signal: input.signal
					}), { store: input.store });
					if (process.env.FREDDIE_DEBUG_TRACE) console.error("[trace] after llm() call");
					return {
						out,
						compressedMessages,
						startMessages: input.messages
					};
				}),
				input: ({ context }) => ({
					messages: context.messages,
					model: context.model,
					provider: context.provider,
					enabledToolsets: context.enabledToolsets,
					disabledToolsets: context.disabledToolsets,
					sessionKey: context.sessionKey,
					iterations: context.iterations,
					tool_choice: context.tool_choice,
					store: context.store,
					toolCtx: context.toolCtx,
					control: context.control,
					signal: context.signal
				}),
				onDone: [
					{
						guard: ({ context, event }) => context.messages !== event.output.startMessages,
						target: "prompting"
					},
					{
						guard: ({ event }) => Array.isArray(event.output?.out?.tool_calls) && event.output.out.tool_calls.length > 0,
						target: "tool_calls",
						actions: assign$1({
							messages: ({ context, event }) => {
								const base = [...event.output.compressedMessages ?? context.messages, {
									role: "assistant",
									content: event.output.out.content || "",
									tool_calls: event.output.out.tool_calls
								}];
								if (event.output.out.recoveredFromText && (context.textRecoveredStreak || 0) < 3) base.push({
									role: "system",
									content: `<system-reminder>Your last tool call was recovered from plain-text output, not a native tool_calls response. It worked this time, but use the real structured tool-calling format going forward — do not write the call as text.</system-reminder>`
								});
								return base;
							},
							textRecoveredStreak: ({ context, event }) => event.output.out.recoveredFromText ? (context.textRecoveredStreak || 0) + 1 : 0,
							toolCallsUsedThisTurn: ({ context, event }) => (context.toolCallsUsedThisTurn || 0) + event.output.out.tool_calls.length
						})
					},
					{
						guard: ({ context, event }) => !(event.output?.out?.content || "").trim() && (context.emptyResponseStreak || 0) < 2,
						target: "prompting",
						actions: assign$1({
							emptyResponseStreak: ({ context }) => (context.emptyResponseStreak || 0) + 1,
							messages: ({ context, event }) => [...event.output.compressedMessages ?? context.messages, {
								role: "system",
								content: `<system-reminder>Your last response had no content and called no tool — the turn cannot end this way. Either call a real tool to make progress, or answer directly in plain text.</system-reminder>`
							}]
						})
					},
					{
						guard: ({ context, event }) => claimsCompletionWithNoEvidence(event.output?.out?.content, context.toolCallsUsedThisTurn || 0) && (context.completionClaimStreak || 0) < 2,
						target: "prompting",
						actions: assign$1({
							completionClaimStreak: ({ context }) => (context.completionClaimStreak || 0) + 1,
							messages: ({ context, event }) => [...event.output.compressedMessages ?? context.messages, {
								role: "system",
								content: `<system-reminder>Your response claims work was completed, but you made no tool calls this turn — nothing was actually created or changed. If the task requires creating/editing files or running commands, call the real tool now. If the work was genuinely already done in an earlier turn, say so without re-claiming it as just-completed.</system-reminder>`
							}]
						})
					},
					{
						target: "done",
						actions: assign$1({
							messages: ({ context, event }) => [...event.output.compressedMessages ?? context.messages, {
								role: "assistant",
								content: event.output.out.content || ""
							}],
							lastResult: ({ context, event }) => {
								if (event.output.out.content && event.output.out.content.trim()) return event.output.out.content;
								for (let i = context.messages.length - 1; i >= 0; i--) {
									const m = context.messages[i];
									if (m.role !== "assistant" || typeof m.content !== "string" || !m.content.trim()) continue;
									if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) continue;
									if (looksLikeStructuredDataNotProse(m.content)) continue;
									return m.content;
								}
								return event.output.out.content || "";
							}
						})
					}
				],
				onError: {
					target: "done",
					actions: assign$1({ error: ({ event }) => String(event.error?.message || event.error) })
				}
			} },
			tool_calls: { always: [
				{
					guard: ({ context }) => context.iterations >= context.maxIterations,
					target: "done",
					actions: assign$1({
						error: "iteration budget exhausted",
						messages: ({ context }) => pairDanglingToolCalls(context.messages, "iteration budget exhausted: tool_call not dispatched")
					})
				},
				{
					guard: ({ context }) => context.interrupt,
					target: "done",
					actions: assign$1({
						error: "interrupted",
						messages: ({ context }) => pairDanglingToolCalls(context.messages, "interrupted: tool_call not dispatched")
					})
				},
				{ target: "executing_tools" }
			] },
			executing_tools: { invoke: {
				src: fromPromise$1(async ({ input }) => {
					const h = await bootHost();
					const hookEngine = new HookEngine({ config: loadConfig() });
					const calls = input.messages[input.messages.length - 1].tool_calls || [];
					const results = [];
					const extras = [];
					const control = input.control;
					let forceStop = null;
					let enabledToolNames = null;
					for (const call of calls) {
						const tname = call.name || call.function?.name;
						const targs = call.arguments || call.function?.arguments || {};
						const tcid = call.id || call.tool_call_id;
						if (control) {
							const budget = control.toolBudgets?.[tname];
							if (Number.isFinite(budget) && noteToolCall(input.sessionKey, tname) > budget) {
								emitTurnEvent(input.sessionKey, "tool.end", {
									name: tname,
									toolCallId: tcid,
									budgetExceeded: true
								});
								results.push({
									tool_call_id: tcid,
									content: JSON.stringify({
										error: "tool session budget exceeded",
										tool: tname,
										budget
									})
								});
								extras.push({
									role: "system",
									content: `<system-reminder>Tool ${tname} has exceeded its session budget of ${budget} calls. Do not call it again this session — answer with what you have or state the blocker.</system-reminder>`
								});
								continue;
							}
							const sig = tname + ":" + JSON.stringify(targs);
							if (sig === control.lastSig) control.streak += 1;
							else {
								control.lastSig = sig;
								control.streak = 1;
							}
							if (control.streak >= 12) {
								results.push({
									tool_call_id: tcid,
									content: JSON.stringify({
										error: "tool call repeat limit reached — turn force-stopped",
										tool: tname
									})
								});
								for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
									const rid = remaining.id || remaining.tool_call_id;
									const rname = remaining.name || remaining.function?.name;
									if (rid) results.push({
										tool_call_id: rid,
										content: JSON.stringify({
											error: "turn force-stopped before this call was dispatched",
											tool: rname
										})
									});
								}
								forceStop = "tool_call_repeat";
								break;
							}
							if ([
								3,
								5,
								8
							].includes(control.streak)) extras.push({
								role: "system",
								content: `<system-reminder>You have repeated the identical tool call (${tname}) with identical arguments ${control.streak} times consecutively without gaining new information. Do not call it again with the same arguments — change approach or report the blocker.</system-reminder>`
							});
							let gated = false;
							let classifierGate = false;
							{
								const { isYolo, isAfk } = await Promise.resolve().then(() => (init_approval_state(), approval_state_exports));
								if (!isYolo(input.sessionKey) && !isAfk(input.sessionKey)) {
									const policy = control.approvalPolicy || "off";
									gated = policy === "all" || policy === "mutating" && control.mutatingTools.has(tname);
									classifierGate = policy === "classifier";
								}
							}
							if (classifierGate && !control.approvedTools.has(tname)) {
								let verdict;
								if (control.classifierEscalated) verdict = {
									decision: "escalate",
									reason: "classifier denial threshold reached — human adjudicates the rest of this turn"
								};
								else {
									if (!control.classifierCallLLM) control.classifierCallLLM = resolveCallLLM({ model: getConfigValue("agent.approval_classifier_model", "cheap") });
									verdict = await classifyToolCall({
										name: tname,
										args: targs,
										callLLM: control.classifierCallLLM,
										signal: input.signal
									});
								}
								if (verdict.decision === "allow") control.classifierConsecDenials = 0;
								else if (verdict.decision === "deny") {
									control.classifierDenials = (control.classifierDenials || 0) + 1;
									control.classifierConsecDenials = (control.classifierConsecDenials || 0) + 1;
									if (control.classifierConsecDenials >= 3 || control.classifierDenials >= 20) control.classifierEscalated = true;
									emitTurnEvent(input.sessionKey, "tool.end", {
										name: tname,
										toolCallId: tcid,
										denied: true,
										via: "classifier"
									});
									results.push({
										tool_call_id: tcid,
										content: JSON.stringify({
											error: "tool call denied by policy classifier",
											tool: tname,
											reason: verdict.reason || null
										})
									});
									continue;
								} else {
									emitTurnEvent(input.sessionKey, "status.update", {
										kind: "classifier_escalation",
										name: tname,
										reason: verdict.reason ? redactSecrets(verdict.reason) : null
									});
									const decision = await requestApproval(input.sessionKey, {
										name: tname,
										args: targs,
										cwd: input.toolCtx?.cwd
									});
									if (!decision.approved) {
										emitTurnEvent(input.sessionKey, "tool.end", {
											name: tname,
											toolCallId: tcid,
											denied: true,
											via: "classifier-escalation"
										});
										results.push({
											tool_call_id: tcid,
											content: JSON.stringify({
												error: "tool call denied by user",
												tool: tname,
												feedback: decision.feedback || null
											})
										});
										continue;
									}
								}
							}
							if (gated && !control.approvedTools.has(tname)) {
								const decision = await requestApproval(input.sessionKey, {
									name: tname,
									args: targs,
									cwd: input.toolCtx?.cwd
								});
								if (!decision.approved) {
									emitTurnEvent(input.sessionKey, "tool.end", {
										name: tname,
										toolCallId: tcid,
										denied: true
									});
									results.push({
										tool_call_id: tcid,
										content: JSON.stringify({
											error: "tool call denied by user",
											tool: tname,
											feedback: decision.feedback || null
										})
									});
									continue;
								}
							}
						}
						const redactedTargs = redactSecrets(targs);
						telemetry.toolCall({
							name: tname,
							args: redactedTargs
						});
						emitTurnEvent(input.sessionKey, "tool.start", {
							name: tname,
							args: redactedTargs,
							toolCallId: tcid
						});
						let ret;
						try {
							ret = await runStep(input.sessionKey, "tool:" + input.iterations + ":" + tcid, async () => {
								const callExtras = [];
								const pushExtras = (r) => {
									if (r?.systemMessage) callExtras.push({
										role: "system",
										content: "[hook] " + r.systemMessage
									});
									if (r?.additionalContext) callExtras.push({
										role: "system",
										content: r.additionalContext
									});
								};
								hookEngine.runHooks("preToolCall", {
									name: tname,
									args: targs,
									sessionKey: input.sessionKey,
									cwd: input.toolCtx?.cwd
								}).catch(() => {});
								wireHookBridge.forwardHook("preToolCall", {
									name: tname,
									args: targs,
									sessionKey: input.sessionKey
								}).catch(() => {});
								const pre = await h.hooks.invoke("preToolCall", {
									name: tname,
									args: targs
								});
								pushExtras(pre);
								if (pre?.behavior === "block") return {
									content: JSON.stringify({
										error: "tool call denied by plugsdk hook",
										tool: tname,
										reason: pre.reason || "denied"
									}),
									extras: callExtras
								};
								const res = await h.pi.dispatchTool(tname, pre && pre.args || targs, input.toolCtx || {}, { hooks: h.hooks });
								pushExtras(await h.hooks.invoke("postToolCall", {
									name: tname,
									args: targs,
									result: res
								}));
								hookEngine.runHooks("postToolCall", {
									name: tname,
									args: targs,
									result: res,
									sessionKey: input.sessionKey,
									cwd: input.toolCtx?.cwd
								}).catch(() => {});
								wireHookBridge.forwardHook("postToolCall", {
									name: tname,
									args: targs,
									result: res,
									sessionKey: input.sessionKey
								}).catch(() => {});
								return {
									content: res,
									extras: callExtras
								};
							}, { store: input.store });
						} catch (e) {
							ret = {
								content: JSON.stringify({
									error: String(e?.message || e),
									tool: tname
								}),
								extras: []
							};
						}
						results.push({
							tool_call_id: tcid,
							content: ret.content
						});
						emitTurnEvent(input.sessionKey, "tool.end", {
							name: tname,
							toolCallId: tcid,
							result: redactSecrets(ret.content)
						});
						extras.push(...ret.extras);
						if (control && typeof ret.content === "string") {
							let unknownName = null;
							try {
								const parsed = JSON.parse(ret.content);
								if (typeof parsed?.error === "string" && parsed.error.startsWith("unknown tool: ")) unknownName = parsed.error.slice(14);
							} catch {}
							if (unknownName) {
								control.unknownToolStreak = (control.unknownToolStreak || 0) + 1;
								if (control.unknownToolStreak >= 5) {
									results.push({
										tool_call_id: tcid,
										content: JSON.stringify({
											error: "unknown-tool retry limit reached — turn force-stopped",
											tool: unknownName
										})
									});
									for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
										const rid = remaining.id || remaining.tool_call_id;
										const rname = remaining.name || remaining.function?.name;
										if (rid) results.push({
											tool_call_id: rid,
											content: JSON.stringify({
												error: "turn force-stopped before this call was dispatched",
												tool: rname
											})
										});
									}
									forceStop = "unknown_tool_repeat";
									break;
								}
								if (control.unknownToolStreak === 2) {
									if (!enabledToolNames) enabledToolNames = (await getEnabledToolSchemas(input.enabledToolsets, input.disabledToolsets)).map((s) => s.name || s.function?.name).filter(Boolean);
									extras.push({
										role: "system",
										content: `<system-reminder>The tool "${unknownName}" does not exist. Stop calling it. Available tools this turn: ${enabledToolNames.join(", ") || "(none)"}. Pick a real tool from that list, or answer directly if none fits.</system-reminder>`
									});
								}
							} else control.unknownToolStreak = 0;
						}
					}
					return {
						results,
						extras,
						forceStop
					};
				}),
				input: ({ context }) => ({
					messages: context.messages,
					sessionKey: context.sessionKey,
					iterations: context.iterations,
					toolCtx: context.toolCtx,
					store: context.store,
					control: context.control,
					enabledToolsets: context.enabledToolsets,
					disabledToolsets: context.disabledToolsets,
					signal: context.signal
				}),
				onDone: [{
					guard: ({ event }) => !!event.output?.forceStop,
					target: "done",
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
						error: ({ event }) => "turn force-stopped: " + event.output.forceStop
					})
				}, {
					target: "prompting",
					actions: assign$1({
						messages: ({ context, event }) => {
							const drained = context.control?.steers ? context.control.steers.splice(0) : [];
							return [
								...context.messages,
								...event.output.results.map((r) => ({
									role: "tool",
									tool_call_id: r.tool_call_id,
									content: r.content
								})),
								...event.output.extras,
								...drained.map((t) => ({
									role: "user",
									content: t
								}))
							];
						},
						iterations: ({ context }) => context.iterations + 1
					})
				}],
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
//#endregion
//#region src/learn/gm-learn-backend.js
function findBrowserBridge() {
	const g = typeof globalThis !== "undefined" ? globalThis : null;
	if (!g) return null;
	if (typeof g.__GM_DISPATCH__ === "function") return { dispatch: g.__GM_DISPATCH__ };
	const gm = g.__gm || g.__debug && g.__debug.gm;
	if (gm && typeof gm.dispatch === "function") return { dispatch: (v, b) => gm.dispatch(v, b) };
	return null;
}
async function ensureNodeBackend() {
	const fs = await import("node:fs");
	const os = await import("node:os");
	const path = await import("node:path");
	const runner = path.join(os.homedir(), ".gm-tools", process.platform === "win32" ? "agentplug-runner.exe" : "agentplug-runner");
	if (!fs.existsSync(runner)) throw new Error("agentplug-runner not installed at " + runner);
	const embed = async (text) => {
		const { stdout } = await execFileAsync(runner, [
			"dispatch",
			"bert",
			"embed",
			JSON.stringify({ text })
		], {
			timeout: 2e4,
			maxBuffer: 8388608
		});
		const r = JSON.parse(stdout);
		if (!Array.isArray(r.embedding) || !r.embedding.length) throw new Error("bert embed failed: " + String(stdout).slice(0, 160));
		return r.embedding;
	};
	const dbDir = path.join(process.cwd(), ".gm");
	fs.mkdirSync(dbDir, { recursive: true });
	const { createClient } = await Promise.resolve().then(() => (init_web(), web_exports));
	const db = createClient({ url: "file:" + path.join(dbDir, "gm.db") });
	await db.execute("CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, namespace TEXT, text TEXT, ts INTEGER, embedding F32_BLOB(384))");
	try {
		await db.execute("CREATE INDEX IF NOT EXISTS memories_vec ON memories (libsql_vector_idx(embedding))");
	} catch (_) {}
	await embed("probe");
	return {
		_node: true,
		embed,
		db
	};
}
function learnAvailable() {
	return Boolean(_pk) || Boolean(_isBrowser && findBrowserBridge());
}
async function ensurePlugkit() {
	if (_pk) return _pk;
	if (_isBrowser) {
		const bridge = findBrowserBridge();
		if (!bridge) return null;
		_pk = {
			dispatch: bridge.dispatch,
			version: () => "browser-bridge"
		};
		return _pk;
	}
	if (_failed && Date.now() - _failed < 6e4) return null;
	if (_failed) _failed = false;
	if (_initPromise) return _initPromise;
	_initPromise = (async () => {
		try {
			_pk = await ensureNodeBackend();
			return _pk;
		} catch (e) {
			_failed = Date.now();
			try {
				console.error("[gm-learn] disabled (gm rs-learn unavailable):", e && e.message);
			} catch (_) {}
			return null;
		} finally {
			_initPromise = null;
		}
	})();
	return _initPromise;
}
function normalizeHits(resp) {
	return (resp && resp.data && Array.isArray(resp.data.hits) ? resp.data.hits : resp && Array.isArray(resp.hits) ? resp.hits : []).map((h) => ({
		text: h.text != null ? String(h.text) : "",
		score: typeof h.score === "number" ? h.score : typeof h.cos === "number" ? h.cos : 0,
		key: h.key || null,
		namespace: h.namespace || "default"
	})).filter((h) => h.text);
}
var execFileAsync, _initPromise, _failed, _pk, _isBrowser, vecSql;
var init_gm_learn_backend = __esmMin((() => {
	execFileAsync = promisify(execFile);
	_initPromise = null;
	_failed = false;
	_pk = null;
	_isBrowser = typeof window !== "undefined" || typeof importScripts === "function";
	vecSql = (emb) => "[" + emb.map((n) => Number(n).toPrecision(7)).join(",") + "]";
}));
//#endregion
//#region src/learn/gm-learn.js
var gm_learn_exports = /* @__PURE__ */ __exportAll({
	autoRecall: () => autoRecall,
	learnAvailable: () => learnAvailable,
	memorize: () => memorize,
	projectNamespace: () => projectNamespace,
	prune: () => prune,
	recall: () => recall
});
async function projectNamespace() {
	if (_isBrowser) try {
		const g = globalThis;
		const ns = typeof g.__GM_NAMESPACE__ === "function" ? g.__GM_NAMESPACE__() : g.__GM_NAMESPACE__;
		return (ns == null ? "" : String(ns)).trim() || "default";
	} catch (_) {
		return "default";
	}
	try {
		const mod = await Promise.resolve().then(() => (init_projects(), projects_exports));
		const p = mod.getActiveProject && mod.getActiveProject();
		return p && p.name || "default";
	} catch (_) {
		return "default";
	}
}
async function memorize(text, { namespace = "default", key = null } = {}) {
	const t = (text || "").toString().trim();
	if (!t) return null;
	const pk = await ensurePlugkit();
	if (!pk) return null;
	try {
		if (pk._node) {
			const emb = await pk.embed(t);
			const r = await pk.db.execute({
				sql: "INSERT INTO memories (namespace, text, ts, embedding) VALUES (?, ?, ?, vector(?))",
				args: [
					namespace,
					t,
					Date.now(),
					vecSql(emb)
				]
			});
			return String(r.lastInsertRowid ?? key ?? "");
		}
		const body = {
			text: t,
			namespace
		};
		if (key) body.key = key;
		const r = await pk.dispatch("memorize-fire", body);
		if (r && r.ok === false) return null;
		return r && r.data && r.data.key || r && r.key || null;
	} catch (e) {
		try {
			console.error("[gm-learn] memorize failed:", e && e.message);
		} catch (_) {}
		return null;
	}
}
async function recall(query, { limit = 5, namespace = "default" } = {}) {
	const q = (query || "").toString().trim();
	if (!q) return [];
	const pk = await ensurePlugkit();
	if (!pk) return [];
	try {
		if (pk._node) {
			const emb = await pk.embed(q);
			const vec = vecSql(emb);
			const total = (await pk.db.execute("SELECT COUNT(*) AS n FROM memories")).rows[0]?.n ?? 0;
			let k = Math.min(Math.max(limit * 4, 20), Number(total) || limit * 4);
			let rows = [];
			for (let attempt = 0; attempt < 4; attempt++) {
				rows = (await pk.db.execute({
					sql: `SELECT m.id AS id, m.text AS text, m.namespace AS namespace,
                                 vector_distance_cos(m.embedding, vector(?)) AS dist
                          FROM vector_top_k('memories_vec', vector(?), ?) AS v
                          JOIN memories AS m ON m.rowid = v.id
                          WHERE m.namespace = ?
                          ORDER BY dist ASC`,
					args: [
						vec,
						vec,
						k,
						namespace
					]
				})).rows;
				if (rows.length >= limit || k >= Number(total)) break;
				k = Math.min(k * 2, Number(total) || k * 2);
			}
			return rows.map((row) => ({
				text: String(row.text || ""),
				score: 1 - Number(row.dist ?? 1),
				key: String(row.id),
				namespace: row.namespace || "default"
			})).filter((h) => h.text).slice(0, limit);
		}
		const r = await pk.dispatch("recall", {
			query: q,
			limit,
			namespace
		});
		if (r && r.ok === false) return [];
		return normalizeHits(r).slice(0, limit);
	} catch (e) {
		try {
			console.error("[gm-learn] recall failed:", e && e.message);
		} catch (_) {}
		return [];
	}
}
async function autoRecall(prompt, { limit = 5, namespace = "default" } = {}) {
	const p = (prompt || "").toString().trim();
	if (!p) return [];
	const pk = await ensurePlugkit();
	if (!pk) return [];
	if (pk._node) return recall(p, {
		limit,
		namespace
	});
	try {
		let hits = normalizeHits(await pk.dispatch("auto-recall", p));
		if (!hits.length) hits = await recall(p, {
			limit,
			namespace
		});
		return hits.slice(0, limit);
	} catch (_) {
		return recall(p, {
			limit,
			namespace
		});
	}
}
async function prune(keys) {
	const list = Array.isArray(keys) ? keys.filter(Boolean) : keys ? [keys] : [];
	if (!list.length) return { pruned: 0 };
	const pk = await ensurePlugkit();
	if (!pk) return { pruned: 0 };
	try {
		if (pk._node) {
			let pruned = 0;
			for (const k of list) {
				const r = await pk.db.execute({
					sql: "DELETE FROM memories WHERE id = ?",
					args: [Number(k)]
				});
				pruned += Number(r.rowsAffected ?? 0);
			}
			return { pruned };
		}
		const r = await pk.dispatch("memorize-prune", { keys: list });
		return r && r.data || r || { pruned: list.length };
	} catch (e) {
		try {
			console.error("[gm-learn] prune failed:", e && e.message);
		} catch (_) {}
		return { pruned: 0 };
	}
}
var init_gm_learn = __esmMin((() => {
	init_gm_learn_backend();
}));
//#endregion
//#region src/agent/turn_trajectory.js
async function writeTrajectory(out, { prompt, provider, model, skill, cwd, events = [], errorStack = null, witnessPath = null }) {
	try {
		const { getConfigValue } = await Promise.resolve().then(() => (init_config$1(), config_exports));
		if (!getConfigValue("agent.save_trajectories", false) && !witnessPath) return;
		const { getFreddieHome } = await Promise.resolve().then(() => (init_home(), home_exports));
		const { redactSecrets } = await Promise.resolve().then(() => (init_auth(), auth_exports));
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
					arguments: redactSecrets(tc.arguments || tc.function?.arguments || {}),
					id: tc.id
				});
			} else if (m.role === "user") states.push("PLAN");
			else if (m.role === "assistant") states.push("COMPLETE");
			else if (m.role === "tool") {
				states.push("VERIFY");
				toolResults.push({
					tool_call_id: m.tool_call_id,
					content: typeof m.content === "string" ? redactSecrets(m.content) : JSON.stringify(redactSecrets(m.content))
				});
			}
			if (m.role === "system" && typeof m.content === "string" && /\[trajectory\.compressed\]/.test(m.content)) compressorInvocations += 1;
		}
		const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
		const slug = (prompt || "turn").slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
		const redactedEvents = redactSecrets(events);
		const llmCalls = redactedEvents.filter((e) => e.type === "llm_call");
		const streamChunks = redactedEvents.filter((e) => e.type === "llm_chunk");
		const redactedMessages = redactSecrets(out.messages || []);
		const redactedPrompt = redactSecrets(prompt);
		const payload = {
			schema_version: 2,
			ts,
			prompt: redactedPrompt,
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
			events: redactedEvents,
			messages: redactedMessages
		};
		const file = path.join(dir, `${ts}-${slug}.json`);
		fs.writeFileSync(file, JSON.stringify(payload, null, 2));
		if (witnessPath) {
			const jsonl = [
				JSON.stringify({
					event: "session_start",
					ts,
					prompt: redactedPrompt,
					provider,
					model,
					skill,
					cwd
				}),
				...redactedMessages.map((m, i) => JSON.stringify({
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
			const absWitnessPath = path.resolve(witnessPath);
			const witnessDir = path.dirname(absWitnessPath);
			try {
				fs.mkdirSync(witnessDir, { recursive: true });
			} catch (e) {
				if (e?.code !== "EEXIST") throw e;
			}
			fs.writeFileSync(absWitnessPath, jsonl);
		}
	} catch (e) {
		if (process.env.FREDDIE_DEBUG_TRAJECTORY) console.error("[writeTrajectory]", e);
	}
}
var AUTOLEARN_TIMEOUT_MS = 8e3;
async function autoLearnTurn({ prompt, out }) {
	try {
		if (!out || out.error) return;
		const result = (out.result || "").toString().trim();
		if (result.length < 40) return;
		const { memorize, recall, projectNamespace } = await Promise.resolve().then(() => (init_gm_learn(), gm_learn_exports));
		const namespace = await projectNamespace();
		const fact = `Q: ${(prompt || "").toString().trim().slice(0, 200)}\nA: ${result.slice(0, 600)}`;
		let autolearnTimer;
		await Promise.race([(async () => {
			const existing = await recall(fact, {
				limit: 1,
				namespace
			});
			if (existing.length && existing[0].score >= .92) return;
			await memorize(fact, { namespace });
		})().finally(() => clearTimeout(autolearnTimer)), new Promise((_, reject) => {
			autolearnTimer = setTimeout(() => reject(/* @__PURE__ */ new Error("autoLearnTurn timeout")), AUTOLEARN_TIMEOUT_MS);
		})]);
	} catch (_) {}
}
//#endregion
//#region src/agent/turn_driver.js
init_step_journal();
init_telemetry();
init_events();
init_auth();
init_config$1();
var HOOK_CLEANUP_TIMEOUT_MS = 5e3;
function boundedHookInvoke(h, name, data) {
	if (!h?.hooks) return Promise.resolve(null);
	let timer;
	return Promise.race([h.hooks.invoke(name, data).finally(() => clearTimeout(timer)), new Promise((_, reject) => {
		timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`hook ${name} timed out after ${HOOK_CLEANUP_TIMEOUT_MS}ms`)), HOOK_CLEANUP_TIMEOUT_MS);
	})]).catch(() => null);
}
async function driveAgentActor({ pa, h, hookEngine, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey, store, abortController }) {
	const { actor } = pa;
	return await new Promise((resolve, reject) => {
		let sub;
		const cleanup = () => {
			try {
				sub?.unsubscribe();
			} catch {}
			try {
				unregisterTurn(sessionKey);
			} catch {}
			pa.flush().catch(() => {}).finally(() => {
				try {
					actor.stop();
				} catch {}
			});
		};
		let settled = false;
		const t = setTimeout(() => {
			if (settled) return;
			settled = true;
			telemetry.turnForceStopped({
				reason: "timeout",
				timeoutMs
			});
			emitTurnEvent(sessionKey, "session.error", {
				reason: "timeout",
				timeoutMs
			});
			const out = timeoutResult(actor, timeoutMs);
			try {
				abortController?.abort(/* @__PURE__ */ new Error("agent turn timeout"));
			} catch {}
			cleanup();
			(async () => {
				try {
					await (store?.clear || (await Promise.resolve().then(() => (init_snapshot_store(), snapshot_store_exports))).clear)("agent", sessionKey);
				} catch {}
				try {
					await clearSteps(sessionKey, { store });
				} catch {}
				await boundedHookInvoke(h, "onTurnEnd", {
					reason: "timeout",
					iterations: out.iterations
				});
				try {
					new HookEngine({ config: loadConfig() }).runHooks("onTurnEnd", {
						sessionKey,
						cwd,
						reason: "timeout",
						iterations: out.iterations
					}).catch(() => {});
				} catch {}
				try {
					wireHookBridge.forwardHook("onTurnEnd", {
						sessionKey,
						reason: "timeout",
						iterations: out.iterations
					}).catch(() => {});
				} catch {}
				await boundedHookInvoke(h, "onSessionEnd", {
					reason: "timeout",
					iterations: out.iterations
				});
				try {
					hookEngine.runHooks("onSessionEnd", {
						sessionKey,
						cwd,
						reason: "timeout",
						iterations: out.iterations
					}).catch(() => {});
				} catch {}
				try {
					wireHookBridge.forwardHook("onSessionEnd", {
						sessionKey,
						cwd,
						reason: "timeout",
						iterations: out.iterations
					}).catch(() => {});
				} catch {}
				try {
					await writeTrajectory(out, {
						prompt,
						provider,
						model,
						skill,
						cwd,
						events,
						errorStack: null,
						witnessPath
					});
				} catch {}
			})().catch(() => {}).finally(() => resolve(out));
		}, timeoutMs);
		if (typeof t?.unref === "function") t.unref();
		sub = actor.subscribe((snap) => {
			if (snap.status !== "done") return;
			if (settled) return;
			settled = true;
			clearTimeout(t);
			(async () => {
				const out = snap.output;
				telemetry.turnEnded({
					iterations: out.iterations,
					result: out.result ? "ok" : out.error ? "error" : "empty",
					error: out.error || null
				});
				if (out.error) emitTurnEvent(sessionKey, "session.error", {
					error: redactSecrets(out.error),
					iterations: out.iterations
				});
				emitTurnEvent(sessionKey, "session.end", {
					result: out.result ? "ok" : out.error ? "error" : "empty",
					error: out.error ? redactSecrets(out.error) : null,
					iterations: out.iterations
				});
				await boundedHookInvoke(h, "onTurnEnd", {
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				});
				hookEngine.runHooks("onTurnEnd", {
					sessionKey,
					cwd,
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				}).catch(() => {});
				wireHookBridge.forwardHook("onTurnEnd", {
					sessionKey,
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				}).catch(() => {});
				const outbound = await boundedHookInvoke(h, "onMessageOutbound", { content: out?.result || "" });
				hookEngine.runHooks("onMessageOutbound", {
					sessionKey,
					cwd
				}).catch(() => {});
				wireHookBridge.forwardHook("onMessageOutbound", {
					sessionKey,
					cwd,
					content: out?.result || ""
				}).catch(() => {});
				if (outbound?.systemMessage || outbound?.additionalContext) out.messages = mergeHookExtras(out.messages || [], outbound, "onMessageOutbound");
				await boundedHookInvoke(h, "onSessionEnd", {
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				});
				hookEngine.runHooks("onSessionEnd", {
					sessionKey,
					cwd,
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				}).catch(() => {});
				wireHookBridge.forwardHook("onSessionEnd", {
					sessionKey,
					cwd,
					reason: out?.error ? "error" : "ok",
					iterations: out?.iterations
				}).catch(() => {});
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
				await autoLearnTurn({
					prompt,
					out
				});
				await clearSteps(sessionKey, { store });
				cleanup();
				resolve(out);
			})().catch((e) => {
				cleanup();
				reject(e);
			});
		});
	});
}
//#endregion
//#region plugins/task/store.js
async function _loadFs() {
	if (_fs) return true;
	try {
		const { createRequire } = await import("node:module");
		const require = createRequire(import.meta.url);
		_fs = require("node:fs");
		_path = require("node:path");
		return true;
	} catch {
		return false;
	}
}
async function _resolveStorePath() {
	if (_storePath) return _storePath;
	if (!_getFreddieHome) try {
		const { getFreddieHome } = await Promise.resolve().then(() => (init_home(), home_exports));
		_getFreddieHome = getFreddieHome;
	} catch {
		return null;
	}
	const home = _getFreddieHome();
	_storePath = _path.join(home, "tasks", "tasks.jsonl");
	return _storePath;
}
async function _ensureDir(dir) {
	try {
		_fs.mkdirSync(dir, { recursive: true });
	} catch {}
}
function _toStorable(task) {
	return {
		id: task.id,
		status: task.status,
		description: task.description || null,
		started: task.started,
		stopped: task.stopped || null,
		exit_code: task.exitCode ?? null,
		error: task.error || null,
		output_preview: (task.output || "").slice(0, 2e3) || null,
		session_id: task.sessionId || null,
		pid: task.pid ?? null
	};
}
async function persistTask(task) {
	if (!await _loadFs()) {
		_memFallback.set(task.id, _toStorable(task));
		return;
	}
	const sp = await _resolveStorePath();
	if (!sp) return;
	await _ensureDir(_path.dirname(sp));
	try {
		const line = JSON.stringify(_toStorable(task)) + "\n";
		_fs.appendFileSync(sp, line, "utf8");
	} catch {}
}
async function _rewriteAll(tasks) {
	if (!await _loadFs()) return;
	const sp = await _resolveStorePath();
	if (!sp) return;
	await _ensureDir(_path.dirname(sp));
	try {
		const lines = [];
		for (const t of tasks) lines.push(JSON.stringify(_toStorable(t)) + "\n");
		_fs.writeFileSync(sp, lines.join(""), "utf8");
	} catch {}
}
async function loadTasks() {
	if (!await _loadFs()) return [..._memFallback.values()];
	const sp = await _resolveStorePath();
	if (!sp) return [];
	try {
		if (!_fs.existsSync(sp)) return [];
		const lines = _fs.readFileSync(sp, "utf8").trim().split("\n").filter(Boolean);
		const map = /* @__PURE__ */ new Map();
		for (const line of lines) try {
			const obj = JSON.parse(line);
			if (obj.id) map.set(obj.id, obj);
		} catch {}
		return [...map.values()];
	} catch {
		return [];
	}
}
async function cleanCompleted$1(tasks) {
	if (!await _loadFs()) {
		for (const [id, t] of _memFallback) if (t.status === "completed" || t.status === "failed" || t.status === "timed_out" || t.status === "stopped") _memFallback.delete(id);
		return;
	}
	await _rewriteAll(tasks);
}
var _fs, _path, _getFreddieHome, _storePath, _memFallback;
var init_store = __esmMin((() => {
	_fs = null;
	_path = null;
	_getFreddieHome = null;
	_storePath = null;
	_memFallback = /* @__PURE__ */ new Map();
}));
//#endregion
//#region src/agent/notifications.js
var NotificationManager, notificationManager;
var init_notifications = __esmMin((() => {
	NotificationManager = class {
		constructor() {
			this._queue = [];
			this._delivered = /* @__PURE__ */ new Set();
		}
		/**
		* Push a notification to the queue.
		* @param {string} type - notification type (e.g. 'task_complete', 'subagent_complete')
		* @param {string} message - human-readable message
		* @param {'info'|'warning'|'error'} [severity='info'] - severity level
		* @returns {string} notification id
		*/
		notify(type, message, severity = "info") {
			const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			this._queue.push({
				id,
				type,
				message,
				severity,
				timestamp: Date.now(),
				delivered: false
			});
			return id;
		}
		/**
		* Deliver pending notifications (up to 4 per call).
		* Marks delivered notifications so they are not returned again.
		* @returns {{ id: string, type: string, message: string }[]}
		*/
		deliverPending() {
			const pending = this._queue.filter((n) => !n.delivered).slice(0, 4);
			for (const n of pending) n.delivered = true;
			return pending.map((n) => ({
				id: n.id,
				type: n.type,
				message: n.message
			}));
		}
		/**
		* Check if any undelivered notifications exist.
		* @returns {boolean}
		*/
		hasPending() {
			return this._queue.some((n) => !n.delivered);
		}
		/**
		* Remove all delivered notifications from the queue to prevent unbounded
		* growth. Call periodically (e.g. on session end).
		*/
		clearDelivered() {
			this._queue = this._queue.filter((n) => !n.delivered);
		}
		/**
		* Reset to empty state (for testing).
		*/
		reset() {
			this._queue = [];
			this._delivered = /* @__PURE__ */ new Set();
		}
		/**
		* Return all notifications (most recent first).
		* @returns {{ id: string, type: string, message: string, severity: string, timestamp: number }[]}
		*/
		getAll() {
			return [...this._queue].reverse();
		}
		/**
		* Dismiss a single notification by id.
		* @param {string} id
		* @returns {boolean} true if a notification was removed
		*/
		dismiss(id) {
			const idx = this._queue.findIndex((n) => n.id === id);
			if (idx < 0) return false;
			this._queue.splice(idx, 1);
			return true;
		}
		/**
		* Dismiss all delivered notifications.
		*/
		dismissAll() {
			this._queue = this._queue.filter((n) => !n.delivered);
		}
	};
	notificationManager = new NotificationManager();
}));
//#endregion
//#region plugins/task/state.js
function generateId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
var _tasks, _reconcileState;
var init_state = __esmMin((() => {
	_tasks = /* @__PURE__ */ new Map();
	_reconcileState = { interval: null };
}));
//#endregion
//#region plugins/task/crud.js
function createTask(meta = {}) {
	const id = generateId();
	const task = {
		id,
		status: "running",
		started: Date.now(),
		output: "",
		stderr: "",
		exitCode: null,
		error: null,
		description: null,
		pid: null,
		sessionId: null,
		_kill: null,
		...meta
	};
	_tasks.set(id, task);
	persistTask(task);
	return id;
}
function getTask(id) {
	return _tasks.get(id) || null;
}
function listTasks() {
	return [..._tasks.values()].filter((t) => t.status === "running").map(({ id, status, started, description }) => ({
		id,
		status,
		started,
		description: description || null
	}));
}
function listAllTasks() {
	return [..._tasks.values()].map(({ id, status, started, stopped, description, exitCode, error }) => ({
		id,
		status,
		started,
		stopped: stopped || null,
		description: description || null,
		exit_code: exitCode ?? null,
		error: error || null
	}));
}
function updateTask(id, updates) {
	const t = _tasks.get(id);
	if (t) {
		Object.assign(t, updates);
		persistTask(t);
		if (updates.status && updates.status !== "running") notificationManager.notify("task_complete", `Background task ${id} completed: ${t.description || "unnamed task"}`);
	}
}
function stopTask(id) {
	const t = _tasks.get(id);
	if (!t) return { error: `unknown task_id: ${id}` };
	if (typeof t._kill === "function") try {
		t._kill();
	} catch {}
	t.status = "stopped";
	t.stopped = Date.now();
	persistTask(t);
	return {
		task_id: id,
		stopped: true
	};
}
function getTaskOutput(id) {
	const t = _tasks.get(id);
	if (!t) return { error: `unknown task_id: ${id}` };
	return {
		task_id: id,
		status: t.status,
		output: t.output || "",
		stderr: t.stderr || "",
		exit_code: t.exitCode ?? null,
		error: t.error || null
	};
}
function awaitTask(id, timeoutMs) {
	const t = _tasks.get(id);
	if (!t) return Promise.resolve({ error: `unknown task_id: ${id}` });
	if (t.status !== "running") return Promise.resolve(getTaskOutput(id));
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(getTaskOutput(id)), timeoutMs);
		const check = () => {
			if (t.status !== "running") {
				clearTimeout(timer);
				resolve(getTaskOutput(id));
			} else setTimeout(check, 100);
		};
		setTimeout(check, 100);
	});
}
var init_crud = __esmMin((() => {
	init_store();
	init_notifications();
	init_state();
}));
//#endregion
//#region plugins/task/lifecycle.js
async function restoreTasks(sessionId) {
	const stored = await loadTasks();
	const filtered = sessionId ? stored.filter((s) => s.session_id === sessionId) : stored;
	for (const s of filtered) {
		if (_tasks.has(s.id)) continue;
		if (s.status !== "running") continue;
		_tasks.set(s.id, {
			id: s.id,
			status: "stopped",
			started: s.started,
			stopped: Date.now(),
			output: s.output_preview || "",
			stderr: "",
			exitCode: s.exit_code,
			error: s.error || "task was interrupted by freddie restart",
			description: s.description,
			sessionId: s.session_id || null,
			pid: null,
			_kill: null
		});
	}
	reconcileTasks();
}
function reconcileTasks() {
	const now = Date.now();
	const MAX_RUNNING_MS = 864e5;
	let reconciled = 0;
	let lost = 0;
	let timedOut = 0;
	for (const [id, t] of _tasks) {
		if (t.status !== "running") continue;
		let processDead = false;
		if (t.pid != null) try {
			process.kill(t.pid, 0);
		} catch {
			processDead = true;
		}
		const isTimedOut = now - t.started > MAX_RUNNING_MS;
		if (processDead) {
			t.status = "lost";
			t.stopped = now;
			t.error = "process died unexpectedly";
			persistTask(t);
			notificationManager.notify("task_lost", `Background task ${id.slice(0, 8)} (${t.description || "unnamed"}) was lost: the underlying process died.`);
			reconciled++;
			lost++;
		} else if (isTimedOut) {
			t.status = "timed_out";
			t.stopped = now;
			t.error = "task exceeded 24 hour maximum runtime";
			persistTask(t);
			notificationManager.notify("task_timed_out", `Background task ${id.slice(0, 8)} (${t.description || "unnamed"}) timed out after 24 hours.`);
			reconciled++;
			timedOut++;
		}
	}
	return {
		reconciled,
		lost,
		timed_out: timedOut
	};
}
function cleanupStaleTasks(maxAgeHours = 168) {
	const now = Date.now();
	const maxAgeMs = maxAgeHours * 60 * 60 * 1e3;
	const terminalStates = /* @__PURE__ */ new Set([
		"completed",
		"failed",
		"lost",
		"timed_out",
		"stopped"
	]);
	let cleaned = 0;
	for (const [id, t] of _tasks) {
		if (!terminalStates.has(t.status)) continue;
		if (now - t.started > maxAgeMs) {
			_tasks.delete(id);
			cleaned++;
		}
	}
	return { cleaned };
}
function startPeriodicReconciliation(intervalMs = 3e5) {
	if (_reconcileState.interval) return;
	_reconcileState.interval = setInterval(() => {
		reconcileTasks();
	}, intervalMs);
	if (typeof _reconcileState.interval?.unref === "function") _reconcileState.interval.unref();
}
function stopPeriodicReconciliation() {
	if (_reconcileState.interval) {
		clearInterval(_reconcileState.interval);
		_reconcileState.interval = null;
	}
}
function reset() {
	_tasks.clear();
	stopPeriodicReconciliation();
}
async function cleanCompleted() {
	const kept = [];
	for (const [id, t] of _tasks) if (t.status === "completed" || t.status === "failed" || t.status === "timed_out" || t.status === "stopped") _tasks.delete(id);
	else kept.push(t);
	await cleanCompleted$1(kept);
}
var init_lifecycle = __esmMin((() => {
	init_store();
	init_notifications();
	init_state();
}));
//#endregion
//#region plugins/task/registry.js
var registry_exports = /* @__PURE__ */ __exportAll({
	awaitTask: () => awaitTask,
	cleanCompleted: () => cleanCompleted,
	cleanupStaleTasks: () => cleanupStaleTasks,
	createTask: () => createTask,
	getTask: () => getTask,
	getTaskOutput: () => getTaskOutput,
	listAllTasks: () => listAllTasks,
	listTasks: () => listTasks,
	reconcileTasks: () => reconcileTasks,
	reset: () => reset,
	restoreTasks: () => restoreTasks,
	startPeriodicReconciliation: () => startPeriodicReconciliation,
	stopPeriodicReconciliation: () => stopPeriodicReconciliation,
	stopTask: () => stopTask,
	updateTask: () => updateTask
});
var init_registry = __esmMin((() => {
	init_crud();
	init_lifecycle();
}));
//#endregion
//#region src/agent/machine.js
init_config$1();
init_telemetry();
init_events();
init_auth();
var DEFAULT_APPROVAL_TOOLS = [
	"bash",
	"write",
	"edit",
	"file_operations",
	"code_execution",
	"process_registry",
	"cronjob",
	"terminal",
	"skills_hub",
	"skills_sync",
	"credential_files"
];
async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 3e4, cwd, skill, witnessPath, sessionKey, toolCtx = null, tool_choice, store, approvalMode = null, approvalTimeoutMs = null } = {}) {
	const events = [];
	let claimed = null;
	if (sessionKey) {
		claimed = claimTurn(sessionKey);
		if (!claimed) return {
			messages,
			result: null,
			error: `turn already live for session ${sessionKey}`,
			iterations: 0
		};
	}
	const cfg = loadConfig();
	if (cfg.telemetry?.enabled) {
		telemetry._enabled = true;
		telemetry._endpoint = cfg.telemetry.endpoint || null;
		telemetry._freddieHome = (await Promise.resolve().then(() => (init_home(), home_exports))).getFreddieHome();
		telemetry.setSession(sessionKey || "");
		telemetry.setTurn(sessionKey || "");
		telemetry.turnStarted({
			prompt,
			model,
			provider
		});
	}
	const h = await bootHost();
	const hookEngine = new HookEngine({ config: loadConfig() });
	await h.hooks.invoke("onSessionStart", {
		prompt,
		model,
		provider,
		skill,
		cwd
	});
	hookEngine.runHooks("onSessionStart", {
		sessionKey,
		cwd
	}).catch(() => {});
	wireHookBridge.forwardHook("onSessionStart", {
		sessionKey,
		cwd,
		prompt
	}).catch(() => {});
	const key = sessionKey || randomUUID();
	if (!claimed) claimed = claimTurn(key);
	if (!claimed) return {
		messages,
		result: null,
		error: `turn already live for session ${key}`,
		iterations: 0
	};
	try {
		const { restoreTasks } = await Promise.resolve().then(() => (init_registry(), registry_exports));
		await restoreTasks(key);
	} catch (_) {}
	let initMessages = [...messages];
	const sysParts = [];
	if ((enabledToolsets ?? ["core"]).length) sysParts.push("You are an autonomous coding agent. ACT, do not narrate: use your tools directly to accomplish the task (create and edit files, run commands) instead of describing a plan or asking which options to pick — make reasonable choices yourself. After each tool result, keep going until the task is fully done. Only stop when the work is complete or genuinely blocked.");
	if (cwd) sysParts.push(`Working directory: ${cwd}. Always pass cwd="${cwd}" to bash tool calls. When reading or writing files use paths relative to this directory or absolute paths under it.`);
	if (skill) {
		const sd = h.pi.skills.get(skill);
		const skillText = sd?.content || sd?.body;
		if (skillText) sysParts.push("Skill context:\n" + skillText);
	}
	try {
		const { autoRecall, projectNamespace } = await Promise.resolve().then(() => (init_gm_learn(), gm_learn_exports));
		const AUTORECALL_TIMEOUT_MS = 4e3;
		let autorecallTimer;
		const hits = await Promise.race([(async () => autoRecall(prompt, {
			limit: 5,
			namespace: await projectNamespace()
		}))().finally(() => clearTimeout(autorecallTimer)), new Promise((_, reject) => {
			autorecallTimer = setTimeout(() => reject(/* @__PURE__ */ new Error("autoRecall timeout")), AUTORECALL_TIMEOUT_MS);
		})]);
		if (hits.length) sysParts.push("Background context from past conversations (gm rs-learn) -- for reference only, does not describe the current task:\n" + hits.map((h) => "- " + h.text).join("\n") + "\n\nThe user's actual request for THIS turn follows below and takes priority over the above.");
	} catch (_) {}
	try {
		const { searchWireLogs } = await Promise.resolve().then(() => (init_events(), events_exports));
		const spans = searchWireLogs(prompt, { limit: 3 });
		if (spans.length) sysParts.push("Verbatim excerpts from past session logs matching this prompt (exact quotes, background reference only):\n" + spans.map((s) => `- [${s.ts?.slice(0, 10)} ${s.role}] ${s.text}`).join("\n"));
	} catch (_) {}
	if (sysParts.length) initMessages.unshift({
		role: "user",
		content: sysParts.join("\n\n")
	});
	const inbound = await h.hooks.invoke("onMessageInbound", { content: prompt });
	hookEngine.runHooks("onMessageInbound", {
		sessionKey,
		cwd
	}).catch(() => {});
	wireHookBridge.forwardHook("onMessageInbound", {
		sessionKey,
		cwd,
		content: prompt
	}).catch(() => {});
	if (inbound?.behavior === "block") {
		await h.hooks.invoke("onSessionEnd", { reason: "prompt_blocked" });
		unregisterTurn(key);
		return {
			messages: initMessages,
			result: null,
			error: "prompt blocked by plugsdk hook: " + (inbound.reason || "denied"),
			iterations: 0
		};
	}
	initMessages = mergeHookExtras(initMessages, inbound, "onMessageInbound");
	const mergedToolCtx = {
		sessionKey: key,
		...cwd ? { cwd } : {},
		...toolCtx || {}
	};
	const control = {
		steers: [],
		approvalPolicy: approvalMode || getConfigValue("agent.approval_mode", "off"),
		approvalTimeoutMs: approvalTimeoutMs ?? getConfigValue("agent.approval_timeout_ms", 12e4),
		mutatingTools: new Set(getConfigValue("agent.approval_tools", DEFAULT_APPROVAL_TOOLS)),
		approvedTools: /* @__PURE__ */ new Set([...getConfigValue("agent.approval_policy", {})?.auto_approve || [], ...await loadApprovalGrants(cwd)]),
		toolBudgets: getConfigValue("agent.tool_budgets", {}),
		lastSig: null,
		streak: 0,
		classifierDenials: 0,
		classifierConsecDenials: 0,
		classifierEscalated: false,
		classifierCallLLM: null
	};
	const abortController = new AbortController();
	mergedToolCtx.signal = abortController.signal;
	const pa = await createPersistentActor(createAgentMachine({
		model,
		provider,
		callLLM,
		enabledToolsets,
		disabledToolsets,
		maxIterations,
		events,
		sessionKey: key,
		toolCtx: mergedToolCtx,
		tool_choice,
		store,
		control,
		h,
		hookEngine,
		wireHookBridge,
		signal: abortController.signal
	}), {
		kind: "agent",
		key,
		input: { messages: initMessages },
		store
	});
	if (!mergeTurnEntry(key, {
		actor: pa.actor,
		control,
		abortController
	})) return {
		messages,
		result: null,
		error: `turn no longer live for session ${key}`,
		iterations: 0
	};
	await h.hooks.invoke("onTurnStart", {
		sessionKey: key,
		prompt,
		model,
		provider
	});
	hookEngine.runHooks("onTurnStart", {
		sessionKey: key,
		cwd
	}).catch(() => {});
	wireHookBridge.forwardHook("onTurnStart", {
		sessionKey: key,
		prompt
	}).catch(() => {});
	pa.actor.send({
		type: "SUBMIT",
		prompt
	});
	if (!sessionKey) emitTurnEvent(key, "session.created", redactSecrets({
		prompt,
		model,
		provider
	}));
	emitTurnEvent(key, "session.start", redactSecrets({
		prompt,
		model,
		provider
	}));
	emitTurnEvent(key, "message.append", {
		role: "user",
		content: redactSecrets(prompt)
	});
	return await driveAgentActor({
		pa,
		h,
		hookEngine,
		events,
		prompt,
		provider,
		model,
		skill,
		cwd,
		witnessPath,
		timeoutMs,
		sessionKey: key,
		store,
		abortController
	});
}
async function resumeTurn({ sessionKey, model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 3e4, cwd, skill, witnessPath, toolCtx = null, store } = {}) {
	if (!sessionKey) throw new Error("resumeTurn requires sessionKey");
	if (!claimTurn(sessionKey)) return null;
	const events = [];
	const h = await bootHost();
	const hookEngine = new HookEngine({ config: loadConfig() });
	wireHookBridge.forwardHook("onSessionStart", {
		sessionKey,
		cwd
	}).catch(() => {});
	const control = {
		steers: [],
		approvalPolicy: getConfigValue("agent.approval_mode", "off"),
		approvalTimeoutMs: getConfigValue("agent.approval_timeout_ms", 12e4),
		mutatingTools: new Set(getConfigValue("agent.approval_tools", DEFAULT_APPROVAL_TOOLS)),
		approvedTools: /* @__PURE__ */ new Set([...getConfigValue("agent.approval_policy", {})?.auto_approve || [], ...await loadApprovalGrants(cwd)]),
		toolBudgets: getConfigValue("agent.tool_budgets", {}),
		lastSig: null,
		streak: 0,
		classifierDenials: 0,
		classifierConsecDenials: 0,
		classifierEscalated: false,
		classifierCallLLM: null
	};
	const abortController = new AbortController();
	const pa = await createPersistentActor(createAgentMachine({
		model,
		provider,
		callLLM,
		enabledToolsets,
		disabledToolsets,
		maxIterations,
		events,
		sessionKey,
		toolCtx: {
			...toolCtx || {},
			signal: abortController.signal
		},
		store,
		control,
		h,
		hookEngine,
		wireHookBridge,
		signal: abortController.signal
	}), {
		kind: "agent",
		key: sessionKey,
		input: { messages: [] },
		store
	});
	if (!pa.resumed) {
		unregisterTurn(sessionKey);
		await pa.forget();
		return null;
	}
	if (!mergeTurnEntry(sessionKey, {
		actor: pa.actor,
		control,
		abortController
	})) {
		await pa.forget();
		return null;
	}
	await h.hooks.invoke("onTurnStart", {
		sessionKey,
		model,
		provider
	});
	hookEngine.runHooks("onTurnStart", {
		sessionKey,
		cwd
	}).catch(() => {});
	wireHookBridge.forwardHook("onTurnStart", { sessionKey }).catch(() => {});
	return await driveAgentActor({
		pa,
		h,
		hookEngine,
		events,
		prompt: "",
		provider,
		model,
		skill,
		cwd,
		witnessPath,
		timeoutMs,
		sessionKey,
		store,
		abortController
	});
}
//#endregion
//#region src/browser/config.js
init_config$1();
var FREDDIE_DEFAULT_CONFIG = DEFAULT_CONFIG;
//#endregion
//#region src/skills/index.js
init_js_yaml();
init_home();
var FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
var MAX_FRONTMATTER_BYTES = 16384;
function skillRootsByPrecedence(extraDirs = []) {
	const home = os.homedir();
	return [
		path.join(getFreddieHome(), "skills"),
		path.join(process.cwd(), "skills"),
		path.join(home, ".claude", "skills"),
		path.join(home, ".agents", "skills"),
		...extraDirs
	];
}
var LIST_CACHE_TTL_MS = 2e3;
var _listCache = null;
function listSkills(extraDirs = []) {
	const cacheKey = extraDirs.join(" ");
	const now = Date.now();
	if (_listCache && _listCache.cacheKey === cacheKey && now - _listCache.ts < LIST_CACHE_TTL_MS) return _listCache.result;
	const seenRoots = /* @__PURE__ */ new Set();
	const out = [];
	for (const d of skillRootsByPrecedence(extraDirs)) {
		const resolved = path.resolve(d);
		if (seenRoots.has(resolved) || !fs.existsSync(resolved)) continue;
		seenRoots.add(resolved);
		walk(resolved, out);
	}
	const result = dedupeByFirstOccurrence(out.filter(platformOk));
	_listCache = {
		cacheKey,
		ts: now,
		result
	};
	return result;
}
function dedupeByFirstOccurrence(skills) {
	const seenNames = /* @__PURE__ */ new Set();
	const out = [];
	for (const s of skills) {
		if (seenNames.has(s.name)) continue;
		seenNames.add(s.name);
		out.push(s);
	}
	return out;
}
function walk(d, out) {
	for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
		const full = path.join(d, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.name === "SKILL.md") try {
			out.push(loadSkill(full));
		} catch (e) {
			console.error(`[skills] failed to load ${full}: ${e.message}`);
		}
	}
}
var TOP_LEVEL_KV = /^([A-Za-z0-9_-]+):[ \t]+(.*)$/;
function repairPlainScalarColons(block) {
	return block.split("\n").map((line) => {
		const m = TOP_LEVEL_KV.exec(line);
		if (!m) return line;
		const [, key, value] = m;
		if (/^['"[{|>]/.test(value)) return line;
		if (!/: /.test(value)) return line;
		return `${key}: ${JSON.stringify(value)}`;
	}).join("\n");
}
function loadFrontmatter(block) {
	try {
		return load$1(block) || {};
	} catch (e) {
		try {
			return load$1(repairPlainScalarColons(block)) || {};
		} catch {
			throw e;
		}
	}
}
function loadSkill(file) {
	const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
	const dirName = path.basename(path.dirname(file));
	const m = FRONTMATTER.exec(raw);
	if (!m) return {
		file,
		name: dirName,
		description: "",
		body: raw,
		frontmatter: {}
	};
	if (Buffer.byteLength(m[1], "utf8") > MAX_FRONTMATTER_BYTES) {
		console.warn(`[skills] frontmatter in ${file} exceeds ${MAX_FRONTMATTER_BYTES} bytes, skipping parse`);
		return {
			file,
			name: dirName,
			description: "",
			body: raw,
			frontmatter: {}
		};
	}
	const fm = loadFrontmatter(m[1]);
	return {
		file,
		name: fm.name || dirName,
		description: fm.description || "",
		frontmatter: fm,
		body: m[2],
		platforms: fm.platforms,
		license: fm.license,
		allowedTools: fm["allowed-tools"] || fm.allowedTools,
		metadata: fm.metadata,
		nameMismatch: !!fm.name && fm.name !== dirName ? {
			frontmatterName: fm.name,
			dirName
		} : null
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
//#region src/context/agents_md_merge.js
/**
* Merge AGENTS.md files from the current directory up to the filesystem root.
* Matches kimi's behavior: root→leaf merging, .kimi/AGENTS.md support.
*
* Each file's content is wrapped with a source annotation:
* <!-- From: <path> -->
* <content>
*
* Files are collected from root→leaf (parent first), so the most specific
* (deepest) file is last and takes precedence for conflicting instructions.
*
* @param {string} cwd - starting directory
* @param {object} [opts]
* @param {number} [opts.maxDepth=10] - max directories to walk up
* @returns {string} merged content, or empty string
*/
function mergeAgentsMd(cwd, { maxDepth = 10 } = {}) {
	const parts = [];
	const seen = /* @__PURE__ */ new Set();
	let dir = resolve(cwd);
	let depth = 0;
	while (dir && depth < maxDepth) {
		for (const name of [
			".kimi/AGENTS.md",
			"AGENTS.md",
			"CLAUDE.md",
			".claude/CLAUDE.md"
		]) {
			const filePath = join(dir, name);
			if (seen.has(filePath)) continue;
			try {
				if (existsSync(filePath)) {
					const content = readFileSync(filePath, "utf-8");
					if (content.trim()) {
						parts.unshift(`<!-- From: ${filePath} -->\n${content}`);
						seen.add(filePath);
					}
				}
			} catch {}
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
		depth++;
	}
	return parts.join("\n\n");
}
//#endregion
//#region src/context/engine.js
var ContextPlugins = {
	file: async ({ cwd = process.cwd() } = {}) => {
		const blocks = [];
		const fcPath = path.join(cwd, ".freddie-context");
		if (fs.existsSync(fcPath)) blocks.push({
			name: "file:.freddie-context",
			body: fs.readFileSync(fcPath, "utf8")
		});
		const merged = mergeAgentsMd(cwd);
		if (merged) blocks.push({
			name: "file:AGENTS.md",
			body: merged
		});
		return blocks;
	},
	skills: async () => {
		return listSkills().map((s) => ({
			name: "skill:" + s.name,
			body: s.description
		}));
	},
	memory: async ({ message = "", namespace = null } = {}) => {
		try {
			const { recall, projectNamespace } = await Promise.resolve().then(() => (init_gm_learn(), gm_learn_exports));
			const ns = namespace || await projectNamespace();
			return (await recall((message || "").toString().trim() || "project notes facts decisions", {
				limit: 5,
				namespace: ns
			})).map((h, i) => ({
				name: "memory:" + i,
				body: h.text
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
//#region src/browser/adapter-guards.js
var FreddieAdapterError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "FreddieAdapterError";
	}
};
function required(name, why) {
	throw new FreddieAdapterError(`bootHostBrowser: adapters.${name} is required (${why})`);
}
function guardStorage(storage) {
	if (storage && typeof storage.getConfig === "function" && typeof storage.setConfig === "function") return storage;
	return {
		getConfig() {
			required("storage.getConfig", "called to read persisted freddie config (model/agent/skills/etc) — pass adapters.storage.getConfig()");
		},
		setConfig() {
			required("storage.setConfig", "called to persist freddie config — pass adapters.storage.setConfig(value)");
		}
	};
}
function guardFs(fsAdapter) {
	const missing = (method, why) => () => required(`fs.${method}`, why);
	return {
		readFile: fsAdapter?.readFile || missing("readFile", "a plugin or embedder tool tried to read a file through the adapter fs"),
		writeFile: fsAdapter?.writeFile || missing("writeFile", "a plugin or embedder tool tried to write a file through the adapter fs"),
		exists: fsAdapter?.exists || missing("exists", "a plugin or embedder tool tried to check file existence through the adapter fs"),
		mkdir: fsAdapter?.mkdir || missing("mkdir", "a plugin or embedder tool tried to create a directory through the adapter fs"),
		readdir: fsAdapter?.readdir || missing("readdir", "a plugin or embedder tool tried to list a directory through the adapter fs"),
		stat: fsAdapter?.stat || missing("stat", "a plugin or embedder tool tried to stat a path through the adapter fs")
	};
}
async function resolvePlugins(list, validatePlugin) {
	const out = [];
	for (const entry of list) {
		const p = typeof entry === "function" ? await entry() : entry;
		if (!p) continue;
		out.push(validatePlugin(p));
	}
	return out;
}
//#endregion
//#region src/browser/boot.js
/**
* bootHostBrowser(adapters) — adapter-parameterized host boot for browser /
* non-Node embedders. See the FreddieBrowserAdapters typedef above for the
* full field-by-field contract and justification.
*
* Does NOT call dotenv.config(), process.cwd(), or any real node:fs — every
* one of those Node CLI bootHost operations is routed through `adapters`
* instead, or (for plugin discovery, which has no browser equivalent)
* replaced outright by the embedder supplying a pre-resolved plugin list.
*
* Independent from the module-level `_host`/`_loadPromise` singleton in
* ../host/index.js — every call creates its own host instance, so multiple
* concurrent calls (thebird's per-tab/per-instance model: instance A's host
* vs instance B's host) never collide or share state.
*
* @param {FreddieBrowserAdapters} adapters
* @returns {Promise<object>} a host object (pi/hooks/plugins()/get()/...)
*   plus `storage` and `callLLM` for direct embedder use.
*/
async function bootHostBrowser(adapters = {}) {
	if (!adapters || typeof adapters !== "object") throw new FreddieAdapterError("bootHostBrowser: adapters object is required");
	if (typeof adapters.callLLM !== "function") required("callLLM", "the agent loop has no way to call an LLM without it");
	const host = createHost({
		surfaces: ["pi", "gui"],
		env: adapters.env && typeof adapters.env === "object" ? adapters.env : {}
	});
	const plugins = Array.isArray(adapters.plugins) ? await resolvePlugins(adapters.plugins, validatePlugin) : [];
	await host.load(plugins);
	host.storage = guardStorage(adapters.storage);
	host.fsAdapter = guardFs(adapters.fs);
	host.callLLM = adapters.callLLM;
	return host;
}
//#endregion
//#region src/browser/index.js
init_snapshot_store();
init_step_journal();
init_tool_call_text();
init_log();
init_config$1();
//#endregion
export { ContextPlugins, DEFAULT_CONFIG, FREDDIE_DEFAULT_CONFIG, FreddieAdapterError, SNAPSHOT_SCHEMA_VERSION, assign, blocksToSystemMessage, bootHost, bootHostBrowser, buildContext, createActor, createAgentMachine, createLibsqlSnapshotStore, createLibsqlStepStore, createMachine, createPersistentActor, findSkill, fromPromise, host, listSkills, log, logger, parseTextToolCalls, resetHostForTests, resumeTurn, runTurn, skillAsUserMessage, waitFor };

//# sourceMappingURL=freddie.js.map