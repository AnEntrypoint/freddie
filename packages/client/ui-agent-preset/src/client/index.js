
import { AgentPresetLabel } from './AgentPresetLabel.js'
import { AgentPresetRow } from './AgentPresetRow.js'
import { AgentPresetSeat } from './AgentPresetSeat.js'
import { AgentPresetSection } from './AgentPresetSection.js'
import { AgentPresetSeatController } from './seat-store.js'
import { AgentPresetSectionController } from './section-store.js'
import { en } from './locales.js'
import { AGENT_PRESET_SETTINGS_NS, AgentPresetSettingsController } from './settings-store.js'

export { draftBlocker } from './section-store.js'
export { AGENT_PRESET_SETTINGS_NS, writeDefaultPreset } from './settings-store.js'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

export function apply(ctx) {
  const { api } = ctx.get('connection')
  const controller = new AgentPresetSettingsController(api, ctx.settingsScope.describe())
  const rosterReaders = new Set()
  const section = new AgentPresetSectionController(api, () => {
    void controller.load()
    for (const read of rosterReaders) read()
  })

  ctx.effect(() => ctx.locale.register('settings.agentPreset', { en }), 'ui-agent-preset: settings row dictionaries')

  const injected = () => ({
    hooks: { agentPreset: controller.store },
    load: () => controller.load(),
    select: (id) => controller.select(id),
  })

  ctx.effect(() => {
    const refresh = () => {
      void controller.load()
      if (section.store.getSnapshot().status !== 'idle') void section.load()
    }
    const disposers = [
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns !== AGENT_PRESET_SETTINGS_NS) return
        refresh()
      }),
      ctx.on('connection/reset', () => { refresh() }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-agent-preset: settings refresh')

  let creatorDraft

  ctx.inject(['slots', 'conversation', 'sessions', 'workspaces'], (scope) => {
    const api = scope.get('connection').api
    const seat = new AgentPresetSeatController(api, () => {
      const state = scope.sessions.list.getSnapshot()
      const summary = state.current === undefined ? undefined : state.byId[state.current]
      return summary === undefined
        ? undefined
        : {
          id: summary.id,
          blank: summary.blank,
          ...summary.agentPreset === undefined ? {} : { agentPreset: summary.agentPreset },
        }
    }, (sessionId, agentPreset) => {
      scope.sessions.noteAgentPreset(sessionId, agentPreset)
    })

    const seatInjected = () => ({
      hooks: { agentPresetSeat: seat.store },
      load: () => seat.load(),
      select: (id) => seat.select(id),
      introduced: () => { seat.introduced() },
    })

    const labelInjected = () => ({
      hooks: { agentPresets: controller.store },
      load: () => controller.load(),
    })

    scope.effect(function* () {
      yield scope.sessions.list.subscribe(() => { void seat.apply() })
      yield scope.remote.$on('settings/document-updated', (ns) => {
        if (ns !== AGENT_PRESET_SETTINGS_NS) return
        void seat.load()
      })
      yield scope.remote.$on('agent-preset/selected', (sessionId, agentPreset) => {
        scope.sessions.noteAgentPreset(sessionId, agentPreset)
      })
      const readRoster = () => { void seat.load() }
      rosterReaders.add(readRoster)
      yield () => { rosterReaders.delete(readRoster) }
      creatorDraft = () => {
        seat.stage('cordis', true)
        scope.workspaces.startSession()
      }
      yield () => { creatorDraft = undefined }
      yield scope.slots.inject('conversation.hero.agentPreset', () => scope.slots.register({
        name: 'conversation.hero.agentPreset',
        locale: 'settings.agentPreset',
        inject: seatInjected,
      }, AgentPresetSeat))
      yield scope.slots.inject('conversation.session.header.actions', () => scope.slots.register({
        name: 'conversation.session.header.actions',
        id: 'agent-preset',
        order: -10,
        locale: 'settings.agentPreset',
        inject: labelInjected,
      }, AgentPresetLabel))
    }, 'ui-agent-preset: new-session chip and header label')
  })

  const sectionInjected = () => ({
    hooks: { agentPresetSection: section.store },
    load: () => section.load(),
    view: (id) => section.view(id),
    closeView: () => { section.closeView() },
    beginCopy: (from) => { section.beginCopy(from) },
    cancelCopy: () => { section.cancelCopy() },
    setCopyId: (id) => { section.setCopyId(id) },
    setCopyName: (name) => { section.setCopyName(name) },
    confirmCopy: () => section.confirmCopy(),
    openLocation: (id) => section.openLocation(id),
    ...creatorDraft === undefined ? {} : { startCreatorDraft: creatorDraft },
    confirmDelete: (id) => { section.confirmDelete(id) },
    remove: () => section.remove(),
    makeDefault: (id) => section.makeDefault(id),
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'agent-preset',
    order: -25,
    locale: 'settings.agentPreset',
    inject: injected,
  }, AgentPresetRow))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'agent-presets',
    order: 20,
    label: () => ctx.locale.bind('settings.agentPreset')('nav'),
    locale: 'settings.agentPreset',
    inject: sectionInjected,
  }, AgentPresetSection))
}
