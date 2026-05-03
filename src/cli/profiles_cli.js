export { createProfile, deleteProfile, switchProfile, listAllProfiles } from '../commands/profile.js'
import { listAllProfiles } from '../commands/profile.js'
import { applyProfileOverride, getProfilesRoot, listProfiles } from '../home.js'
export function activeProfile() { return process.env.FREDDIE_PROFILE || 'default' }
export function listAll() { return { active: activeProfile(), all: listAllProfiles(), root: getProfilesRoot() } }
export function setActive(name) { applyProfileOverride(name); return { active: name || 'default' } }
