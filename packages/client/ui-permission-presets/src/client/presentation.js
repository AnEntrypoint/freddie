export const FULL_ACCESS_PRESET = 'danger-full-access'

export function displayPresetName(name) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function displayPermissionPreset(value, name) {
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}
