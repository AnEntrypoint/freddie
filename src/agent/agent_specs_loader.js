/**
 * Agent Specs Loader — YAML-based agent spec loading
 *
 * Loads agent type definitions from YAML files with layered priority:
 *   1. ~/.freddie/agent_specs/*.yaml  (user overrides — highest priority)
 *   2. skills/agent_specs/*.yaml      (repo-bundled built-in specs)
 *   3. Built-in hardcoded defaults    (fallback when no YAML file exists)
 *
 * Browser-compatible: when node:fs is unavailable (e.g. thebird on gh-pages),
 * gracefully degrades to built-in defaults only. js-yaml is already a project
 * dependency and works in both Node and browser environments.
 */

import * as yaml from 'js-yaml'
import { AgentTypeDefinition } from './agent_specs.js'

// ---------------------------------------------------------------------------
// Built-in hardcoded defaults — the fallback when no YAML file is found.
// Keep these in sync with skills/agent_specs/*.yaml.
// ---------------------------------------------------------------------------

const BUILTIN_DEFAULTS = {
    coder: {
        name: 'coder',
        description: 'General software engineering agent',
        whenToUse: 'Use for non-trivial coding tasks that require reading, writing, and editing files.',
        defaultModel: null,
        toolPolicy: {
            mode: 'allowlist',
            tools: [
                'bash', 'read', 'write', 'edit', 'glob', 'grep',
                'web_search', 'web_fetch',
                'task', 'task_output', 'task_stop',
            ],
        },
        systemPromptAddition: 'You are a subagent. Work autonomously and return a complete result. Do not ask the user questions directly — resolve ambiguities yourself.',
        supportsBackground: true,
    },
    explore: {
        name: 'explore',
        description: 'Fast codebase exploration with read-only behavior',
        whenToUse: 'Use for searching files, finding code patterns, and answering codebase questions.',
        defaultModel: null,
        toolPolicy: {
            mode: 'allowlist',
            tools: [
                'read', 'glob', 'grep',
                'web_search', 'web_fetch',
                'bash',
            ],
        },
        systemPromptAddition: 'You are a read-only exploration subagent. You can search, read, and report findings but must NOT write or edit any files. Do not ask the user questions — return your findings directly.',
        supportsBackground: false,
    },
    plan: {
        name: 'plan',
        description: 'Read-only implementation planning and architecture design',
        whenToUse: 'Use for planning implementation steps, identifying key files, and analyzing trade-offs before code changes.',
        defaultModel: null,
        toolPolicy: {
            mode: 'allowlist',
            tools: [
                'read', 'glob', 'grep',
                'web_search', 'web_fetch',
            ],
        },
        systemPromptAddition: 'You are a read-only planning subagent. You can read files, search the codebase, and produce a plan. You must NOT run shell commands, write files, or make any changes. Do not ask the user questions — produce the best plan you can from available context.',
        supportsBackground: false,
    },
}

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

const _isNode = typeof process !== 'undefined' && process.versions && process.versions.node

// ---------------------------------------------------------------------------
// YAML loading helpers
// ---------------------------------------------------------------------------

/**
 * Load a single YAML spec file and return its parsed data, or null on failure.
 * @param {string} filePath
 * @param {object} fs — node:fs module
 * @returns {object|null}
 */
function loadYamlFile(filePath, fs) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8')
        const data = yaml.load(raw)
        if (!data || typeof data !== 'object' || !data.name) return null
        return data
    } catch {
        return null
    }
}

/**
 * Load all YAML spec files from a directory into the specs map.
 * Files with a `name` key override any existing entry with the same name.
 * @param {string} dir
 * @param {Map<string, object>} specs — mutated in place
 * @param {object} fs — node:fs module
 * @param {object} path — node:path module
 */
function loadDir(dir, specs, fs, path) {
    if (!fs.existsSync(dir)) return
    let entries
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return
    }
    for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue
        const filePath = path.join(dir, entry.name)
        const data = loadYamlFile(filePath, fs)
        if (data) specs.set(data.name, data)
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all agent specs from YAML files, merged with built-in defaults.
 *
 * Priority (highest wins):
 *   1. ~/.freddie/agent_specs/*.yaml
 *   2. skills/agent_specs/*.yaml
 *   3. Built-in hardcoded defaults
 *
 * In browser environments, only built-in defaults are returned (no filesystem access).
 *
 * @returns {Promise<Map<string, object>>} Map of spec name → raw spec data
 */
export async function loadAgentSpecs() {
    const specs = new Map()

    // Start with built-in hardcoded defaults as the fallback layer.
    for (const [name, data] of Object.entries(BUILTIN_DEFAULTS)) {
        specs.set(name, { ...data })
    }

    if (_isNode) {
        // Dynamic imports keep node:fs/node:path out of the browser bundle parse path.
        const fs = await import('node:fs')
        const path = (await import('node:path')).default

        // Layer 1: repo-bundled specs in skills/agent_specs/
        const cwd = process.cwd()
        const skillsDir = path.join(cwd, 'skills', 'agent_specs')
        loadDir(skillsDir, specs, fs, path)

        // Layer 2: user overrides in ~/.freddie/agent_specs/
        const { getFreddieHome } = await import('../home.js')
        const homeDir = path.join(getFreddieHome(), 'agent_specs')
        loadDir(homeDir, specs, fs, path)
    }

    return specs
}

/**
 * Load agent specs from all sources and register them into a LaborMarket instance.
 * Call this once during boot (or lazily before first delegate) to populate the
 * LaborMarket with YAML-loaded specs, falling back to built-in defaults.
 *
 * @param {import('./agent_specs.js').LaborMarket} market
 * @returns {Promise<void>}
 */
export async function loadAgentSpecsIntoMarket(market) {
    const specs = await loadAgentSpecs()
    for (const [, data] of specs) {
        market.registerType(new AgentTypeDefinition(data))
    }
}