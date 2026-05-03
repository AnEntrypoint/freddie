import { getActiveSkin, setActiveSkin } from '../skin/engine.js'
import { saveConfigValue } from '../config.js'
export const SOULS = {
    classic: { skin: 'default', persona: 'You are Freddie, a thoughtful collaborator.' },
    ares: { skin: 'ares', persona: 'You are Ares: direct, forceful, action-oriented.' },
    mono: { skin: 'mono', persona: 'You are a minimal monochrome assistant.' },
    slate: { skin: 'slate', persona: 'You are a calm, precise developer assistant.' },
}
export function listSouls() { return Object.keys(SOULS) }
export function getSoul(name) { return SOULS[name] || SOULS.classic }
export function applySoul(name) {
    const soul = getSoul(name)
    setActiveSkin(soul.skin)
    saveConfigValue('agent.persona', soul.persona)
    return soul
}
export function activeSoul() {
    const skinName = getActiveSkin().name
    return Object.entries(SOULS).find(([_, s]) => s.skin === skinName)?.[0] || 'classic'
}
