import { StorageError } from './error.js'

export class BackendRegistry {
  backends = new Map()

  register(name, backend) {
    if (this.backends.has(name)) {
      throw new StorageError('duplicate-backend', `storage backend '${name}' is already registered`)
    }
    this.backends.set(name, backend)
    return () => {
      if (this.backends.get(name) === backend) {
        this.backends.delete(name)
      }
    }
  }

  get(name) {
    const backend = this.backends.get(name)
    if (!backend) {
      throw new StorageError(
        'backend-not-found',
        `storage backend '${name}' is not registered (registered: ${[...this.backends.keys()].join(', ') || 'none'})`,
      )
    }
    return backend
  }

  names() {
    return [...this.backends.keys()]
  }
}
