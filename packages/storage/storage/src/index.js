import { Service } from '@freddie/cordis'
import { StorageError } from './error.js'
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

export default Storage
