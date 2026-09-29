import { ModelsSection } from './ModelsSection.js'
import { ModelsSettingsStore } from './store.js'
import { createSettingsSchemaOperations } from './schema-operations.js'
import { en } from './locales.js'

const NS = 'settings.models'

export function refreshIfLoaded(controller) {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope', 'settingsSchema']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-settings-models: copy dictionaries')

  const connection = ctx.get('connection')
  const schema = createSettingsSchemaOperations(ctx.settingsSchema)
  const controller = new ModelsSettingsStore(connection.api, schema, ctx.settingsScope.describe())
  const t = ctx.locale.bind(NS)
  const injected = () => ({
    controller,
    hooks: { snapshot: controller.store },
    api: connection.api,
    schema,
    t,
  })
  ctx.effect(() => {
    const refreshModels = () => { refreshIfLoaded(controller) }
    const disposers = [
      ctx.remote.$on('settings/document-updated', () => { refreshModels() }),
      ctx.remote.$on('credentials/reference-updated', refreshModels),
      ctx.remote.$on('llm/adapters-updated', refreshModels),
      ctx.on('connection/reset', refreshModels),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'ui-settings-models: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'models',
    order: 10,
    label: () => t('nav'),
    inject: injected,
  }, ModelsSection))
}
