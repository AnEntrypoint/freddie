import { snapshotJsonValue } from '@freddie/freddie-session'

export const SUBAGENT_DESCRIPTOR_VERSION = 2

/**
 * Fields shared by every supported `subagent/descriptor` payload.
 * @typedef {object} SubagentDescriptorBase
 * @property {number} version
 * @property {'one-shot' | 'continuable'} mode
 * @property {string} provider
 * @property {string} [label]
 */

/**
 * A session-backed subagent that cannot be cold-resumed after its run.
 * @typedef {object} SubagentOneShotDescriptor
 * @property {number} version
 * @property {'one-shot'} mode
 * @property {string} provider
 * @property {string} [label]
 */

/**
 * A session-backed subagent whose declared composition supports cold resume.
 * @typedef {object} SubagentContinuableDescriptor
 * @property {number} version
 * @property {'continuable'} mode
 * @property {string} provider
 * @property {string} label
 * @property {string} [agentProvider]
 * @property {string} [agentModel]
 * @property {string} [persona]
 * @property {{ allow?: string[], deny?: string[] }} [toolFilter]
 */

/**
 * The supported durable subagent identity and optional continuation composition.
 * @typedef {SubagentOneShotDescriptor | SubagentContinuableDescriptor} SubagentDescriptor
 */

/**
 * Fields shared by descriptor snapshot inputs.
 * @typedef {object} SubagentDescriptorSnapshotInputBase
 * @property {'one-shot' | 'continuable'} mode
 * @property {string} provider
 * @property {string} [label]
 */

/**
 * Input for a one-shot child's durable identity.
 * @typedef {object} SubagentOneShotSnapshotInput
 * @property {'one-shot'} mode
 * @property {string} provider
 * @property {string} [label]
 */

/**
 * Input for a continuable child's durable identity and resumable composition.
 * @typedef {object} SubagentContinuableSnapshotInput
 * @property {'continuable'} mode
 * @property {string} provider
 * @property {string} label
 * @property {string} [agentProvider]
 * @property {string} [agentModel]
 * @property {string} [persona]
 * @property {{ allow?: string[], deny?: string[] }} [toolFilter]
 */

/**
 * Inputs {@link snapshotSubagentDescriptor} validates and detaches.
 * @typedef {SubagentOneShotSnapshotInput | SubagentContinuableSnapshotInput} SubagentDescriptorSnapshotInput
 */

const DESCRIPTOR_BASE_KEYS = [
  'version',
  'mode',
  'provider',
  'label',
]
const ONE_SHOT_DESCRIPTOR_KEYS = new Set(DESCRIPTOR_BASE_KEYS)
const CONTINUABLE_DESCRIPTOR_KEYS = new Set([
  ...DESCRIPTOR_BASE_KEYS,
  'agentProvider',
  'agentModel',
  'persona',
  'toolFilter',
])
const TOOL_FILTER_KEYS = new Set(['allow', 'deny'])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertKnownKeys(value, keys, path) {
  const unknown = Object.keys(value).find(key => !keys.has(key))
  if (unknown !== undefined) {
    throw new Error(`persisted subagent descriptor ${path} has unknown field "${unknown}"`)
  }
}

function optionalString(value, key) {
  if (!Object.hasOwn(value, key)) return undefined
  const field = value[key]
  if (typeof field !== 'string') {
    throw new Error(`persisted subagent descriptor ${key} must be a string`)
  }
  return field
}

function optionalStringArray(value, key) {
  if (!Object.hasOwn(value, key)) return undefined
  const field = value[key]
  if (!Array.isArray(field)) {
    throw new Error(`persisted subagent descriptor toolFilter.${key} must be an array of strings`)
  }
  const items = field
  if (items.some(item => typeof item !== 'string')) {
    throw new Error(`persisted subagent descriptor toolFilter.${key} must be an array of strings`)
  }
  return items
}

function parseToolFilter(value) {
  if (!isRecord(value)) {
    throw new Error('persisted subagent descriptor toolFilter must be an object')
  }
  assertKnownKeys(value, TOOL_FILTER_KEYS, 'toolFilter')
  const allow = optionalStringArray(value, 'allow')
  const deny = optionalStringArray(value, 'deny')
  if (allow === undefined && deny === undefined) {
    throw new Error('persisted subagent descriptor toolFilter must declare allow and/or deny')
  }
  return {
    ...allow !== undefined ? { allow } : {},
    ...deny !== undefined ? { deny } : {},
  }
}

function parseSubagentDescriptor(value) {
  if (!isRecord(value)) {
    throw new Error('persisted subagent descriptor payload must be an object')
  }
  const version = value['version']
  if (typeof version !== 'number') {
    throw new Error('persisted subagent descriptor version must be a number')
  }
  if (version !== SUBAGENT_DESCRIPTOR_VERSION) return undefined

  const mode = value['mode']
  if (mode !== 'one-shot' && mode !== 'continuable') {
    throw new Error('persisted subagent descriptor mode must be "one-shot" or "continuable"')
  }
  assertKnownKeys(
    value,
    mode === 'one-shot' ? ONE_SHOT_DESCRIPTOR_KEYS : CONTINUABLE_DESCRIPTOR_KEYS,
    'payload',
  )
  const provider = value['provider']
  if (typeof provider !== 'string') {
    throw new Error('persisted subagent descriptor provider must be a string')
  }
  if (mode === 'one-shot') {
    const label = optionalString(value, 'label')
    return {
      version: SUBAGENT_DESCRIPTOR_VERSION,
      mode,
      provider,
      ...label !== undefined ? { label } : {},
    }
  }
  const label = value['label']
  if (typeof label !== 'string') {
    throw new Error('persisted subagent descriptor label must be a string')
  }
  const agentProvider = optionalString(value, 'agentProvider')
  const agentModel = optionalString(value, 'agentModel')
  const persona = optionalString(value, 'persona')
  const toolFilter = Object.hasOwn(value, 'toolFilter')
    ? parseToolFilter(value['toolFilter'])
    : undefined
  return {
    version: SUBAGENT_DESCRIPTOR_VERSION,
    mode,
    provider,
    label,
    ...agentProvider !== undefined ? { agentProvider } : {},
    ...agentModel !== undefined ? { agentModel } : {},
    ...persona !== undefined ? { persona } : {},
    ...toolFilter !== undefined ? { toolFilter } : {},
  }
}

export function snapshotSubagentDescriptor(input) {
  const candidate = input.mode === 'one-shot'
    ? {
      version: SUBAGENT_DESCRIPTOR_VERSION,
      mode: input.mode,
      provider: input.provider,
      ...input.label !== undefined ? { label: input.label } : {},
    }
    : {
      version: SUBAGENT_DESCRIPTOR_VERSION,
      mode: input.mode,
      provider: input.provider,
      label: input.label,
      ...input.agentProvider !== undefined ? { agentProvider: input.agentProvider } : {},
      ...input.agentModel !== undefined ? { agentModel: input.agentModel } : {},
      ...input.persona !== undefined ? { persona: input.persona } : {},
      ...input.toolFilter !== undefined ? { toolFilter: input.toolFilter } : {},
    }
  const snapshot = snapshotJsonValue(candidate)
  if (snapshot === undefined) {
    throw new Error('subagent descriptor is not losslessly JSON-serializable')
  }
  return snapshot
}

export function foldSubagentDescriptor(events) {
  const event = events.find(
    candidate => candidate.type === 'subagent/descriptor',
  )
  if (event === undefined) return undefined
  return parseSubagentDescriptor(event.data)
}
