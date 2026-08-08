import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPABILITY_ENUM = new Set(['tool', 'env', 'command', 'cron', 'platform', 'memory', 'skill', 'context', 'agentExt', 'cli', 'route', 'page', 'nav', 'debug', 'api', 'asset'])
const SAFETY_RATING_ENUM = new Set(['community', 'certified', 'experimental'])
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

// Hand-rolled against src/host/plugin-manifest-schema.json's real constraints
// -- no ajv/jsonschema dep for a 6-field object; keep both files in sync by
// hand (schema is the human-readable doc, this is what actually runs).
export function validatePluginManifest(manifest) {
    const errors = []
    if (!manifest || typeof manifest !== 'object') return { valid: false, errors: ['manifest: object required'] }
    if (!manifest.name || typeof manifest.name !== 'string') errors.push('name: string required')
    else if (!NAME_RE.test(manifest.name)) errors.push(`name: must match ${NAME_RE} (kebab-case), got '${manifest.name}'`)
    if (!manifest.version || typeof manifest.version !== 'string') errors.push('version: string required')
    else if (!VERSION_RE.test(manifest.version)) errors.push(`version: must be semver (X.Y.Z), got '${manifest.version}'`)
    if (manifest.capabilities !== undefined) {
        if (!Array.isArray(manifest.capabilities)) errors.push('capabilities: must be an array')
        else for (const c of manifest.capabilities) if (!CAPABILITY_ENUM.has(c)) errors.push(`capabilities: unknown capability '${c}'`)
    }
    if (manifest.dependencies !== undefined && !Array.isArray(manifest.dependencies)) errors.push('dependencies: must be an array')
    if (manifest.safety_rating !== undefined && !SAFETY_RATING_ENUM.has(manifest.safety_rating)) errors.push(`safety_rating: must be one of ${[...SAFETY_RATING_ENUM].join(',')}`)
    if (manifest.feature_flag !== undefined && typeof manifest.feature_flag !== 'string') errors.push('feature_flag: must be a string')
    if (manifest.registry_url !== undefined && typeof manifest.registry_url !== 'string') errors.push('registry_url: must be a string')
    if (manifest.resources !== undefined) {
        if (!manifest.resources || typeof manifest.resources !== 'object' || Array.isArray(manifest.resources)) errors.push('resources: must be an object')
        else {
            const { fs_paths, network_hosts, env_vars, ...rest } = manifest.resources
            if (fs_paths !== undefined && !(Array.isArray(fs_paths) && fs_paths.every(x => typeof x === 'string'))) errors.push('resources.fs_paths: must be an array of strings')
            if (network_hosts !== undefined && !(Array.isArray(network_hosts) && network_hosts.every(x => typeof x === 'string'))) errors.push('resources.network_hosts: must be an array of strings')
            if (env_vars !== undefined && !(Array.isArray(env_vars) && env_vars.every(x => typeof x === 'string'))) errors.push('resources.env_vars: must be an array of strings')
            if (Object.keys(rest).length) errors.push(`resources: unknown field(s) ${Object.keys(rest).join(',')}`)
        }
    }
    return { valid: errors.length === 0, errors }
}

export function loadPluginManifestSchema() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin-manifest-schema.json'), 'utf8'))
}
