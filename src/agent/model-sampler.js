import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
const _sdk = _require('acptoapi')

export const isAvailable = _sdk.isAvailable
export const markFailed = _sdk.markFailed
export const markOk = _sdk.markOk
export const resetAvailability = _sdk.resetAvailability
export const getStatus = _sdk.getStatus
export const probe = _sdk.probe
export const startSampler = _sdk.startSampler
export const stopSampler = _sdk.stopSampler
export const createSampler = _sdk.createSampler
