import { getConfigValue, saveConfigValue } from '../config.js'
export function getSkillsConfig() { return getConfigValue('skills.config', {}) || {} }
export function setSkillConfig(name, opts) { const cfg = getSkillsConfig(); cfg[name] = { ...(cfg[name] || {}), ...opts }; saveConfigValue('skills.config', cfg); return cfg[name] }
export function disableSkill(name) { return setSkillConfig(name, { disabled: true }) }
export function enableSkill(name) { const cfg = getSkillsConfig(); delete cfg[name]?.disabled; saveConfigValue('skills.config', cfg); return cfg[name] }
export function isSkillEnabled(name) { return !getSkillsConfig()[name]?.disabled }
