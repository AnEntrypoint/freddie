import { SettingsSchemaService } from './schema.js'
import { SettingsScopeBinder } from './settings-scope.js'
import { SettingsDescribeMirror } from './settings-mirror.js'

export const inject = ['connection', 'remote']

export function apply(ctx) {
  const schema = new SettingsSchemaService(ctx)
  const connection = ctx.get('connection')
  const mirror = new SettingsDescribeMirror(
    connection.api,
    connection.isLoopback ? 'host' : 'memory',
  )
  ctx.effect(() => {
    const disposers = [
      ctx.get('remote').$on('settings/document-updated', () => { void mirror.load() }),
      ctx.on('connection/reset', () => { void mirror.load() }),
    ]
    void mirror.ensure()
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-settings: describe mirror invalidations')
  new SettingsScopeBinder(ctx, { mirror, schema })
}
