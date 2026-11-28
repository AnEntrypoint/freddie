import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { StorageError } from './error.js'
import { JsonStorageBackend } from './json-backend.js'
import { BackendRegistry } from './registry.js'

export { BackendRegistry } from './registry.js'
export { StorageError } from './error.js'
export { UNIT_NAME_RE } from './backend.js'

export function storageBackendServiceKey(name) {
  return `storage.backend.${name}`
}


export class Storage extends Service {
  backend = new BackendRegistry()

  forms = new Map()

  constructor(ctx) {
    super(ctx, 'storage')
  }

  mount(form, facility) {
    if (this.forms.has(form)) {
      throw new StorageError('duplicate-mount', `storage form '${String(form)}' is already mounted`)
    }
    this.forms.set(form, facility)
    return () => {
      if (this.forms.get(form) === facility) {
        this.forms.delete(form)
      }
    }
  }

  form(form) {
    if (!this.forms.has(form)) {
      throw new StorageError('form-not-mounted', `storage form '${String(form)}' is not mounted`)
    }
    return this.forms.get(form)
  }

  get domain() {
    return this.form('domain')
  }
}

export const name = 'storage'

export const Config = z.object({
  root: z.string().required(),
})

export function apply(ctx, config) {
  const storage = new Storage(ctx)
  const backend = new JsonStorageBackend(config.root)
  ctx.effect(() => {
    const unregister = storage.backend.register('json', backend)
    return async () => {
      unregister()
      await backend.close()
    }
  })
  ctx.provide(storageBackendServiceKey('json'), backend)
}
