/**
 * Agent Specs — Subagent Type Definitions
 *
 * Defines agent type definitions (coder, explore, plan) with tool allowlists
 * and system prompt additions. Used by the delegate tool to constrain subagent
 * capabilities.
 *
 * Specs are loaded from three layers (highest priority wins):
 *   1. ~/.freddie/agent_specs/*.yaml  (user overrides)
 *   2. skills/agent_specs/*.yaml      (repo-bundled)
 *   3. Hardcoded built-in defaults    (fallback)
 *
 * Call `LaborMarket.instance.init()` once before first use to load YAML specs.
 * Browser-compatible: built-in defaults work without filesystem access.
 */

// ---------------------------------------------------------------------------
// AgentTypeDefinition
// ---------------------------------------------------------------------------

export class AgentTypeDefinition {
    /**
     * @param {object} opts
     * @param {string} opts.name
     * @param {string} opts.description
     * @param {string} opts.whenToUse
     * @param {string|null} [opts.defaultModel=null] — null = inherit from parent
     * @param {{ mode: 'allowlist', tools: string[] }} opts.toolPolicy
     * @param {string} [opts.systemPromptAddition='']
     * @param {boolean} [opts.supportsBackground=true]
     */
    constructor({ name, description, whenToUse, defaultModel = null, toolPolicy, systemPromptAddition = '', supportsBackground = true }) {
        this.name = name
        this.description = description
        this.whenToUse = whenToUse
        this.defaultModel = defaultModel
        this.toolPolicy = toolPolicy
        this.systemPromptAddition = systemPromptAddition
        this.supportsBackground = supportsBackground
    }

    /**
     * Check whether a given tool name is allowed under this type's policy.
     * @param {string} toolName
     * @returns {boolean}
     */
    isToolAllowed(toolName) {
        if (!this.toolPolicy || this.toolPolicy.mode !== 'allowlist') return true
        return this.toolPolicy.tools.includes(toolName)
    }

    /**
     * Filter a list of tool schemas to only those allowed by this type's policy.
     * @param {object[]} schemas — array of tool schema objects with a `name` property
     * @returns {object[]}
     */
    filterTools(schemas) {
        if (!this.toolPolicy || this.toolPolicy.mode !== 'allowlist') return schemas
        return schemas.filter(s => this.toolPolicy.tools.includes(s.name))
    }
}

// ---------------------------------------------------------------------------
// Built-in type definitions
// ---------------------------------------------------------------------------

const BUILTIN_TYPES = [
    new AgentTypeDefinition({
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
                'run_flow',
            ],
        },
        systemPromptAddition: 'You are a subagent. Work autonomously and return a complete result. Do not ask the user questions directly — resolve ambiguities yourself. Preferred mechanism for multi-step tool graphs is run_flow — use it spontaneously; it reduces turns.',
        supportsBackground: true,
    }),

    new AgentTypeDefinition({
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
                'run_flow',
            ],
        },
        systemPromptAddition: 'You are a read-only exploration subagent. You can search, read, and report findings but must NOT write or edit any files. Do not ask the user questions — return your findings directly. Preferred mechanism for multi-step tool graphs is run_flow — use it spontaneously; it reduces turns.',
        supportsBackground: false,
    }),

    new AgentTypeDefinition({
        name: 'plan',
        description: 'Read-only implementation planning and architecture design',
        whenToUse: 'Use for planning implementation steps, identifying key files, and analyzing trade-offs before code changes.',
        defaultModel: null,
        toolPolicy: {
            mode: 'allowlist',
            tools: [
                'read', 'glob', 'grep',
                'web_search', 'web_fetch',
                'run_flow',
            ],
        },
        systemPromptAddition: 'You are a read-only planning subagent. You can read files, search the codebase, and produce a plan. You must NOT run shell commands, write files, or make any changes. Do not ask the user questions — produce the best plan you can from available context. Preferred mechanism for multi-step tool graphs is run_flow — use it spontaneously; it reduces turns.',
        supportsBackground: false,
    }),
]

// ---------------------------------------------------------------------------
// LaborMarket — singleton registry of agent type definitions
// ---------------------------------------------------------------------------

let _instance = null

export class LaborMarket {
    /** @type {Map<string, AgentTypeDefinition>} */
    #types = new Map()

    constructor() {
        if (_instance) return _instance
        // Register built-in types on first construction.
        for (const def of BUILTIN_TYPES) {
            this.#types.set(def.name, def)
        }
        _instance = this
    }

    /**
     * Register an agent type definition.
     * @param {AgentTypeDefinition} def
     */
    registerType(def) {
        if (!(def instanceof AgentTypeDefinition)) {
            throw new Error('def must be an instance of AgentTypeDefinition')
        }
        this.#types.set(def.name, def)
    }

    /**
     * Get a type definition by name.
     * @param {string} name
     * @returns {AgentTypeDefinition|undefined}
     */
    getType(name) {
        return this.#types.get(name)
    }

    /**
     * List all registered type definitions.
     * @returns {AgentTypeDefinition[]}
     */
    listTypes() {
        return [...this.#types.values()]
    }

    /** Get the singleton instance. */
    static get instance() {
        if (!_instance) _instance = new LaborMarket()
        return _instance
    }

    /** Reset the singleton (for testing). */
    static reset() {
        _instance = null
    }

    // -----------------------------------------------------------------------
    // YAML spec loading
    // -----------------------------------------------------------------------

    /** @type {Promise<void>|null} */
    static #initPromise = null

    /**
     * Load agent specs from YAML files and merge them into the registry.
     * Built-in hardcoded defaults are registered during construction; this
     * call overrides them with YAML-loaded definitions (where available).
     *
     * Idempotent — subsequent calls return the same promise.
     * Safe to call in browser environments (degrades to built-in defaults).
     *
     * @returns {Promise<void>}
     */
    async init() {
        if (LaborMarket.#initPromise) return LaborMarket.#initPromise
        LaborMarket.#initPromise = (async () => {
            const { loadAgentSpecsIntoMarket } = await import('./agent_specs_loader.js')
            await loadAgentSpecsIntoMarket(this)
        })()
        return LaborMarket.#initPromise
    }
}