import { getConfigValue, saveConfigValue } from '../config.js'
export function voiceState() { return Boolean(getConfigValue('voice.enabled')) }
export function enable() { saveConfigValue('voice.enabled', true); return { enabled: true } }
export function disable() { saveConfigValue('voice.enabled', false); return { enabled: false } }
export function setBackend(name) { saveConfigValue('voice.backend', name); return { backend: name } }
export function getBackend() { return getConfigValue('voice.backend', 'openai') }
