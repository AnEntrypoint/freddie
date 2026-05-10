import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { getFreddieHome } from './home.js'

export const DEFAULT_CONFIG = {
    _config_version: 2,
    display: { skin: 'default', tool_progress_command: false, background_process_notifications: 'all' },
    agent: { provider: 'anthropic', model: '', max_iterations: 90, fallback_model: null, save_trajectories: false, model_preference: [] },
    memory: { provider: null },
    skills: { config: {} },
    terminal: { cwd: null },
    gateway: { timeout: 60, platforms: {} },
    plugins: { enabled: [] },
    toolsets: { enabled: ['core'], disabled: [] },
}

const MIGRATIONS = {
    1: cfg => cfg,
    2: cfg => { if (!cfg.agent) cfg.agent = {}; if (!Array.isArray(cfg.agent.model_preference)) cfg.agent.model_preference = []; return cfg },
}

export function configPath() { return path.join(getFreddieHome(), 'config.yaml') }

export function loadConfig() {
    const p = configPath()
    if (!fs.existsSync(p)) return clone(DEFAULT_CONFIG)
    const raw = yaml.load(fs.readFileSync(p, 'utf8')) || {}
    const merged = deepMerge(clone(DEFAULT_CONFIG), raw)
    return migrate(merged)
}

export function saveConfig(cfg) {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true })
    fs.writeFileSync(configPath(), yaml.dump(cfg, { lineWidth: 100 }), 'utf8')
}

export function saveConfigValue(dotpath, value) {
    const cfg = loadConfig()
    setDot(cfg, dotpath, value)
    saveConfig(cfg)
    return cfg
}

export function getConfigValue(dotpath, fallback = undefined) {
    const cfg = loadConfig()
    return getDot(cfg, dotpath, fallback)
}

function setDot(obj, dotpath, value) {
    const keys = dotpath.split('.')
    let cur = obj
    for (let i = 0; i < keys.length - 1; i++) {
        if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {}
        cur = cur[keys[i]]
    }
    cur[keys[keys.length - 1]] = value
}

function getDot(obj, dotpath, fallback) {
    return dotpath.split('.').reduce((c, k) => (c && k in c) ? c[k] : undefined, obj) ?? fallback
}

function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return target
    for (const k of Object.keys(src)) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
            deepMerge(target[k], src[k])
        } else {
            target[k] = src[k]
        }
    }
    return target
}

function migrate(cfg) {
    const cur = cfg._config_version || 0
    const target = DEFAULT_CONFIG._config_version
    let work = cfg
    for (let v = cur + 1; v <= target; v++) if (MIGRATIONS[v]) work = MIGRATIONS[v](work)
    work._config_version = target
    return work
}

function clone(o) { return JSON.parse(JSON.stringify(o)) }

export function validateConfigStructure(cfg) {
    const issues = []
    if (!cfg || typeof cfg !== 'object') return [{ path: '', message: 'config must be an object' }]
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
        if (!(k in cfg)) issues.push({ path: k, severity: 'info', message: 'missing key (will use default)' })
        else if (typeof v === 'object' && !Array.isArray(v) && (typeof cfg[k] !== 'object' || Array.isArray(cfg[k]))) {
            issues.push({ path: k, severity: 'warn', message: 'expected object, got ' + (Array.isArray(cfg[k]) ? 'array' : typeof cfg[k]) })
        }
    }
    if (cfg.agent && typeof cfg.agent.max_iterations !== 'undefined' && (typeof cfg.agent.max_iterations !== 'number' || cfg.agent.max_iterations < 1)) {
        issues.push({ path: 'agent.max_iterations', severity: 'error', message: 'must be a positive integer' })
    }
    if (cfg.toolsets && cfg.toolsets.enabled && !Array.isArray(cfg.toolsets.enabled)) {
        issues.push({ path: 'toolsets.enabled', severity: 'error', message: 'must be an array' })
    }
    return issues
}

export function expandEnvVars(value) {
    if (typeof value === 'string') return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => process.env[name] || '')
    if (Array.isArray(value)) return value.map(expandEnvVars)
    if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = expandEnvVars(v); return out }
    return value
}

export function readRawConfig() {
    const p = configPath()
    return fs.existsSync(p) ? (yaml.load(fs.readFileSync(p, 'utf8')) || {}) : {}
}

export function checkConfigVersion() {
    const raw = readRawConfig()
    return { current: raw._config_version || 0, target: DEFAULT_CONFIG._config_version, needsMigration: (raw._config_version || 0) < DEFAULT_CONFIG._config_version }
}

export function getMissingConfigFields(cfg = loadConfig()) {
    const missing = []
    if (!cfg.agent?.provider) missing.push('agent.provider')
    return missing
}
