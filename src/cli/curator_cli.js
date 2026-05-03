import { add, list, clear } from '../agent/curator.js'
export const CURATOR_KINDS = ['favourite-prompt', 'pinned-session', 'shortcut', 'snippet']
export function curatorAdd(kind, key, value) { return add(kind, key, value) }
export function curatorList(kind) { return list(kind) }
export function curatorClear(kind) { return clear(kind) }
