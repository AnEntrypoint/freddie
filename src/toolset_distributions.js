import { saveConfigValue } from './config.js'

export const DEFAULT_DISTRIBUTIONS = {
    coder: { enabledToolsets: ['core', 'browse'], disabledToolsets: [] },
    researcher: { enabledToolsets: ['core', 'browse', 'creative'], disabledToolsets: [] },
    ops: { enabledToolsets: ['core'], disabledToolsets: ['creative', 'browse'] },
    minimal: { enabledToolsets: ['core'], disabledToolsets: ['browse', 'creative'] },
    full: { enabledToolsets: ['core', 'browse', 'creative'], disabledToolsets: [] },
}
export function listDistributions() { return Object.keys(DEFAULT_DISTRIBUTIONS) }
export function getDistribution(name) { return DEFAULT_DISTRIBUTIONS[name] || null }
export function applyDistribution(name) {
    const d = getDistribution(name)
    if (!d) throw new Error('unknown distribution: ' + name)
    saveConfigValue('toolsets.enabled', d.enabledToolsets)
    saveConfigValue('toolsets.disabled', d.disabledToolsets)
    return d
}
