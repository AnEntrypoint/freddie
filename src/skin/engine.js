import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'js-yaml'
import { getFreddieHome } from '../home.js'
import { getConfigValue, saveConfigValue } from '../config.js'

const _BUILTIN_SKINS = {
    default: {
        name: 'default', description: 'Classic gold/kawaii',
        colors: { banner_border: '#FFD700', banner_title: '#FFD700', banner_accent: '#FFA500', banner_dim: '#666666', banner_text: '#FFFFFF', response_border: '#FFD700' },
        spinner: { waiting_faces: ['(◡‿◡)', '(◕‿◕)'], thinking_faces: ['(¬‿¬)', '(◔‿◔)'], thinking_verbs: ['thinking', 'pondering'], wings: [['', '']] },
        branding: { agent_name: 'Freddie', welcome: 'Welcome to Freddie.', response_label: ' ✨ Freddie ', prompt_symbol: '> ' },
        tool_prefix: '┊', tool_emojis: {},
    },
    ares: {
        name: 'ares', description: 'Crimson/bronze war-god',
        colors: { banner_border: '#C0392B', banner_title: '#E67E22', banner_accent: '#922B21', banner_dim: '#444444', banner_text: '#ECE0D1', response_border: '#922B21' },
        spinner: { waiting_faces: ['⚔️ ', '🛡️ '], thinking_faces: ['🔥', '💢'], thinking_verbs: ['marshalling', 'forging'], wings: [['⟨⚔', '⚔⟩']] },
        branding: { agent_name: 'Ares', welcome: 'Forge with Ares.', response_label: ' 🔥 Ares ', prompt_symbol: '⚔ ' },
        tool_prefix: '▏',
    },
    mono: {
        name: 'mono', description: 'Grayscale monochrome',
        colors: { banner_border: '#999999', banner_title: '#FFFFFF', banner_accent: '#CCCCCC', banner_dim: '#555555', banner_text: '#EEEEEE', response_border: '#999999' },
        spinner: { waiting_faces: ['…'], thinking_faces: ['·'], thinking_verbs: ['thinking'], wings: [['', '']] },
        branding: { agent_name: 'Freddie', welcome: 'Mono.', response_label: ' Freddie ', prompt_symbol: '> ' },
        tool_prefix: '|',
    },
    slate: {
        name: 'slate', description: 'Cool blue developer',
        colors: { banner_border: '#3498DB', banner_title: '#5DADE2', banner_accent: '#2874A6', banner_dim: '#566573', banner_text: '#D6EAF8', response_border: '#3498DB' },
        spinner: { waiting_faces: ['◆'], thinking_faces: ['◇'], thinking_verbs: ['compiling'], wings: [['', '']] },
        branding: { agent_name: 'Freddie', welcome: 'Slate ready.', response_label: ' ◆ Freddie ', prompt_symbol: '◆ ' },
        tool_prefix: '┊',
    },
}

let _active = null

export function loadSkin(name) {
    const userPath = path.join(getFreddieHome(), 'skins', `${name}.yaml`)
    if (fs.existsSync(userPath)) {
        const fromYaml = yaml.load(fs.readFileSync(userPath, 'utf8')) || {}
        return mergeWithDefault(fromYaml)
    }
    if (_BUILTIN_SKINS[name]) return mergeWithDefault(_BUILTIN_SKINS[name])
    return _BUILTIN_SKINS.default
}

function mergeWithDefault(skin) {
    const base = JSON.parse(JSON.stringify(_BUILTIN_SKINS.default))
    return deepMerge(base, skin)
}

function deepMerge(t, s) {
    for (const k of Object.keys(s)) {
        if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], s[k])
        else t[k] = s[k]
    }
    return t
}

export function initSkinFromConfig() {
    const name = getConfigValue('display.skin', 'default')
    _active = loadSkin(name)
    return _active
}

export function getActiveSkin() {
    if (!_active) initSkinFromConfig()
    return _active
}

export function setActiveSkin(name) {
    _active = loadSkin(name)
    saveConfigValue('display.skin', name)
    return _active
}

export function listBuiltinSkins() { return Object.keys(_BUILTIN_SKINS) }
export function resetForTests() { _active = null }
