import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
export { PermissionRow } from './PermissionRow.js'
import {
  accessEn, en,
} from './locales.js'
import {
  displayPermissionPreset, FULL_ACCESS_PRESET,
} from './presentation.js'
import { PermissionPresetSettingsController } from './settings-store.js'

export const inject = ['commandUi', 'sessions', 'slots', 'locale', 'connection', 'remote', 'settingsScope', 'settingsSchema']

const ACCESS_NS = 'permission.access'

function selectOf(session) {
  return session?.projections.faceOf('permissions').getSnapshot()
}

function optionsOf(value, t) {
  return value.options
    .filter(option => option.value !== 'custom')
    .map(option => ({
      id: option.value,
      label: displayPermissionPreset(option.value, option.name),
      ...(option.description !== undefined ? { detail: option.description } : {}),
      ...(option.value === value.currentValue ? { active: true } : {}),
      ...(option.value === FULL_ACCESS_PRESET
        ? {
          confirmation: {
            title: t('confirm.title'),
            description: t('confirm.description'),
            acknowledgeLabel: t('confirm.acknowledge'),
            cancelLabel: t('confirm.cancel'),
            confirmLabel: t('confirm.enable'),
          },
        }
        : {}),
    }))
}

export function apply(ctx) {
  const command = ctx.get('commandUi')
  const sessions = ctx.sessions
  ctx.effect(() => ctx.locale.register(ACCESS_NS, 'en', {
    'confirm.title': accessEn['confirm.title'],
    'confirm.description': accessEn['confirm.description'],
    'confirm.acknowledge': accessEn['confirm.acknowledge'],
    'confirm.cancel': accessEn['confirm.cancel'],
    'confirm.enable': accessEn['confirm.enable'],
  }), 'ui-permission: Full access confirmation dictionaries')
  const t = ctx.locale.bind(ACCESS_NS)
  const sessionFor = session =>
    sessions.binding(session.sessionId)?.session

  ctx.effect(() => ctx.locale.register('settings.permission', { en }), 'ui-permission: settings row dictionaries')

  const connection = ctx.get('connection')
  const controller = new PermissionPresetSettingsController(
    ctx.settingsScope.describe(), connection.api, ctx.settingsSchema)
  const load = () => controller.load()
  const select = preset => controller.select(preset)
  const injected = () => ({
    hooks: { permission: controller.store },
    load,
    select,
  })

  ctx.effect(() => () => { controller.dispose() }, 'ui-permission: settings row directory')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'permission',
    order: -20,
    locale: 'settings.permission',
    inject: injected,
  }, webjsxSlot('freddie-permission-row')))

  ctx.effect(() => command.decorate({
    name: 'permission',
    available: session => selectOf(sessionFor(session)) !== undefined,
    ui: {
      kind: 'popupSelect',
      options: (session) => {
        const value = selectOf(sessionFor(session))
        if (value === undefined) throw new Error('permission presets are not available on this host')
        return Promise.resolve(optionsOf(value, t))
      },
      onSelect: async (option, session) => {
        const live = sessionFor(session)
        if (live === undefined) throw new Error('this session is not materialized yet')
        const result = await live.command(`/permission ${option.id}`)
        if (!result.ok) throw new Error(`permission switch failed: ${result.error.code}: ${result.error.message}`)
        if (!result.value.matched) throw new Error('the host offers no /permission command')
      },
    },
  }), 'ui-permission: /permission decoration')
}
