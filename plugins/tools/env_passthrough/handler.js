import { getConfigValue } from '../../../src/config.js'

export function buildBashEnv() {
    const allow = getConfigValue('terminal.env_passthrough', ['HOME', 'USER', 'LANG', 'PATH', 'SHELL']) || []
    const out = {}
    for (const k of allow) if (process.env[k]) out[k] = process.env[k]
    return out
}
export const _tool = ({
    name: 'env_passthrough',
    toolset: 'core',
    schema: { name: 'env_passthrough', description: 'Compute the env-var subset that should be passed through to spawned shells.', parameters: { type: 'object', properties: {} } },
    handler: async () => ({ env: buildBashEnv() }),
})
