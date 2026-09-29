import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { SANDBOX_MODES, effectiveSandboxMode, setSandboxMode } from '@freddie/freddie-sandbox-policy'
import { APPROVAL_POLICIES, effectiveApprovalPolicy, setApprovalPolicy } from '@freddie/freddie-user-approval'
import { installSettingsSection, settingsNamespace } from '@freddie/freddie-settings'

export function effectivePermissionPreset(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'permission/preset') return event.data.preset
  }
  return undefined
}

export const CUSTOM_PRESET = 'custom'

export const PERMISSION_SETTINGS_NAMESPACE = settingsNamespace('permission')

const EMPTY_KNOBS = { preset: null, sandbox: null, approval: null }

export function applyKnobEvent(state, event) {
  switch (event.type) {
    case 'permission/preset':
      return { ...state, preset: event.data.preset }
    case 'sandbox/mode':
      return { ...state, sandbox: event.data.mode }
    case 'approval/policy':
      return { ...state, approval: event.data.policy }
    default:
      return state
  }
}

function foldKnobs(events) {
  let state = EMPTY_KNOBS
  for (const event of events) state = applyKnobEvent(state, event)
  return state
}

export class PermissionPresetService extends Service {
  static Config = z.object({
    presets: z.dict(z.object({
      sandbox: z.union(SANDBOX_MODES).required(),
      approval: z.union(APPROVAL_POLICIES).required(),
      name: z.string(),
      description: z.string(),
    })).default({
      'workspace-write': {
        sandbox: 'workspace-write', approval: 'ask',
        name: 'workspace-write', description: 'Write inside the workspace and permitted temporary directories; wider retries require approval.',
      },
      'danger-full-access': {
        sandbox: 'danger-full-access', approval: 'never',
        name: 'danger-full-access', description: 'Full file access without approval prompts.',
      },
    }),
    defaultPreset: z.string(),
  })

  static inject = ['shell', 'approval', 'sessions']

  presets
  defaultSettings

  constructor(ctx, config) {
    super(ctx, 'permissionPresets')
    this.presets = config.presets
    if (CUSTOM_PRESET in this.presets) {
      throw new Error(`permission: "${CUSTOM_PRESET}" is reserved for the derived not-a-preset state and cannot name a table entry`)
    }
    if (ctx.shell.sandboxMode === undefined) {
      throw new Error('permission: the mounted bash executor does not confine (no sandboxMode) — presets bundle a sandbox mode, so composing this plugin over an unconfined executor is a misconfiguration')
    }
    const inferredDefault = this.derive(EMPTY_KNOBS)
    const defaultPreset = config.defaultPreset ?? inferredDefault
    if (defaultPreset === CUSTOM_PRESET) {
      throw new Error('permission: composed sandbox and approval defaults match no preset; configure defaultPreset explicitly')
    }
    this.resolve(defaultPreset)
    const baseSettings = { defaultPreset }
    this.defaultSettings = () => baseSettings
    const presetChoices = this.names.map((name) => {
      const choice = z.const(name)
      const label = this.presets[name]?.name
      return label === undefined ? choice : choice.description(label)
    })
    const settingsSchema = z.object({
      defaultPreset: z.union(presetChoices).required(),
    })
    installSettingsSection(ctx, PERMISSION_SETTINGS_NAMESPACE, settingsSchema, baseSettings, {
      setSource: (current) => {
        this.defaultSettings = current
      },
      onChange: () => {},
    })

    ctx.on('session/created', (session) => {
      this.pinInitialPermission(session)
    })
    for (const session of ctx.sessions.list()) {
      this.pinInitialPermission(session)
    }

    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register({
        key: 'permissions',
        init: () => EMPTY_KNOBS,
        apply: applyKnobEvent,
        wire: { view: state => this.selectFor(state) },
        stateVersion: 1,
      })
    })

    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        name: 'permission',
        description: 'Switch the permission preset (sandbox mode + approval policy)',
        input: { hint: '<preset>' },
        handler: ({ agent, rawInput }) => {
          const name = rawInput.trim()
          if (name === '') {
            return { kind: 'success', text: `current preset ${this.current(agent.session.events)} (available: ${this.names.join(', ')})` }
          }
          if (!this.names.includes(name)) {
            return { kind: 'error', text: `unknown preset "${name}" (available: ${this.names.join(', ')})` }
          }
          this.apply(agent.session, name, (policy) => { this.ctx.approval.setPolicy(agent, policy) })
          return { kind: 'success', text: `preset ${name}` }
        },
      })
    })
  }

  get names() {
    return Object.keys(this.presets)
  }

  get defaultPreset() {
    return this.defaultSettings().defaultPreset
  }

  current(events) {
    return this.derive(foldKnobs(events))
  }

  derive(state) {
    const sandbox = state.sandbox ?? this.ctx.shell.sandboxMode
    const approval = state.approval ?? this.ctx.approval.config.policy ?? 'ask'
    const matches = (spec) => spec.sandbox === sandbox && spec.approval === approval
    if (state.preset !== null) {
      const spec = this.presets[state.preset]
      if (spec !== undefined && matches(spec)) return state.preset
    }
    for (const [name, spec] of Object.entries(this.presets)) {
      if (matches(spec)) return name
    }
    return CUSTOM_PRESET
  }

  selectFor(state) {
    const currentValue = this.derive(state)
    return {
      options: [
        ...this.names.map(name => this.optionOf(name)),
        ...currentValue === CUSTOM_PRESET ? [this.optionOf(CUSTOM_PRESET)] : [],
      ],
      currentValue,
    }
  }

  resolve(name) {
    const spec = this.presets[name]
    if (spec === undefined) {
      throw new Error(`permission: unknown preset "${name}" (known: ${Object.keys(this.presets).join(', ')})`)
    }
    return spec
  }

  optionOf(name) {
    if (name === CUSTOM_PRESET) {
      return { value: CUSTOM_PRESET, name: 'Custom', description: 'Current sandbox and approval settings do not match a preset.' }
    }
    const spec = this.resolve(name)
    return { value: name, name: spec.name ?? name, ...spec.description !== undefined ? { description: spec.description } : {} }
  }

  set(session, name) {
    this.apply(session, name, (policy) => { setApprovalPolicy(session, policy) })
  }

  apply(session, name, setApproval) {
    const spec = this.resolve(name)
    if (this.current(session.events) !== name) {
      session.append('permission/preset', { preset: name })
    }
    const events = session.events
    if (spec.sandbox !== (effectiveSandboxMode(events) ?? this.ctx.shell.sandboxMode)) {
      setSandboxMode(session, spec.sandbox)
    }
    if (spec.approval !== (effectiveApprovalPolicy(events) ?? this.ctx.approval.config.policy ?? 'ask')) {
      setApproval(spec.approval)
    }
  }

  pinInitialPermission(session) {
    const events = session.events
    const selected = effectivePermissionPreset(events)
    const sandbox = effectiveSandboxMode(events)
    const approval = effectiveApprovalPolicy(events)
    const seeded = events.some(event => event.type === 'session/end-seed')
    if (selected === undefined && sandbox === undefined && approval === undefined && !seeded) {
      const name = this.defaultPreset
      const spec = this.resolve(name)
      session.append('permission/preset', { preset: name })
      setSandboxMode(session, spec.sandbox)
      setApprovalPolicy(session, spec.approval)
      return
    }

    const state = {
      preset: selected ?? null,
      sandbox: sandbox ?? null,
      approval: approval ?? null,
    }
    const effective = this.derive(state)
    if (selected === undefined && effective !== CUSTOM_PRESET) {
      session.append('permission/preset', { preset: effective })
    }
    if (sandbox === undefined) {
      setSandboxMode(session, this.ctx.shell.sandboxMode)
    }
    if (approval === undefined) {
      setApprovalPolicy(session, this.ctx.approval.config.policy ?? 'ask')
    }
  }
}

export default PermissionPresetService
