import { credentialRef } from '@freddie/freddie-credentials'
import { SettingsConflictError, settingsNamespace } from '@freddie/freddie-settings'
import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'

const MAX_DESCRIBE_REFS = 64

function success(value) {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function rejected(code, message, details = {}) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message, ...details }) })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function settingsUnavailable() {
  return rejected(
    'settings/unavailable',
    'settings service is absent: this deployment mounts no settings provider',
  )
}

function credentialsUnavailable() {
  return rejected(
    'credentials/unavailable',
    'credentials service is absent: this deployment mounts no credential provider',
  )
}

function namespaceView(descriptor) {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...descriptor.base === undefined ? {} : { base: descriptor.base },
    ...descriptor.user === undefined ? {} : { user: descriptor.user },
    applies: descriptor.applies,
    secrets: (descriptor.secrets ?? []).map(secret => ({ path: [...secret.path], set: secret.set })),
    revision: descriptor.revision,
  }
}

export class SettingsController extends TypertRemoteService {
  static inject = []

  constructor(ctx) {
    super(ctx, 'settingsController', { namespace: 'settings' })
    ctx.plugin(CredentialsController)
  }

  describe() {
    const settings = this.ctx.get('settings')
    if (settings === undefined) return Promise.resolve(settingsUnavailable())
    return Promise.resolve(success({
      writable: settings.writable === true,
      hasDocument: settings.documentPath !== undefined,
      namespaces: settings.describe({ redactSecrets: true }).map(namespaceView),
    }))
  }

  update(request) {
    return this.write(request, 'update')
  }

  replace(request) {
    return this.write(request, 'replace')
  }

  mutate(request) {
    return this.write(request, 'mutate')
  }

  async write(request, mode) {
    const settings = this.ctx.get('settings')
    if (settings === undefined) return settingsUnavailable()
    let ns
    try {
      ns = settingsNamespace(request.ns)
    } catch (error) {
      return rejected('settings/rejected', messageOf(error), { ns: request.ns })
    }
    try {
      if (mode === 'update') await settings.update(ns, request.patch, request.expectedRevision)
      else if (mode === 'replace') await settings.replace(ns, request.section, request.expectedRevision)
      else await settings.mutate(ns, request.ops, request.expectedRevision)
    } catch (error) {
      if (error instanceof SettingsConflictError) {
        return rejected(
          'settings/conflict',
          messageOf(error),
          { ns: request.ns, expected: error.expected, actual: error.actual },
        )
      }
      return rejected('settings/rejected', messageOf(error), { ns: request.ns })
    }
    const descriptor = settings.describe({ redactSecrets: true }).find(candidate => candidate.ns === ns)
    if (descriptor === undefined) {
      return rejected(
        'settings/rejected',
        `settings namespace ${JSON.stringify(request.ns)} was disposed by the ${mode}`,
        { ns: request.ns },
      )
    }
    return success(namespaceView(descriptor))
  }
}

export class CredentialsController extends TypertRemoteService {
  static inject = []

  constructor(ctx) {
    super(ctx, 'credentialsController', { namespace: 'credentials' })
  }

  async describe(request) {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return credentialsUnavailable()
    if (request.refs.length > MAX_DESCRIBE_REFS) {
      return rejected(
        'credential/rejected',
        `credentials.describe resolves at most ${MAX_DESCRIBE_REFS} references at a time`,
        { count: request.refs.length, max: MAX_DESCRIBE_REFS },
      )
    }
    const entries = new Map()
    for (const ref of request.refs) {
      let branded
      try {
        branded = credentialRef(ref)
      } catch (error) {
        return rejected('credential/rejected', messageOf(error), { ref })
      }
      const info = await credentials.describe(branded)
      entries.set(ref, {
        configured: info.configured,
        ...info.source === undefined ? {} : { source: info.source },
        writable: info.writable,
      })
    }
    return success({ credentials: Object.fromEntries(entries) })
  }

  async set(request) {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return credentialsUnavailable()
    let ref
    try {
      ref = credentialRef(request.ref)
    } catch (error) {
      return rejected('credential/rejected', messageOf(error), { ref: request.ref })
    }
    try {
      await credentials.set(ref, request.value)
    } catch (error) {
      return rejected('credential/rejected', messageOf(error), { ref: request.ref })
    }
    return success({})
  }

  async unset(request) {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return credentialsUnavailable()
    let ref
    try {
      ref = credentialRef(request.ref)
    } catch (error) {
      return rejected('credential/rejected', messageOf(error), { ref: request.ref })
    }
    try {
      await credentials.unset(ref)
    } catch (error) {
      return rejected('credential/rejected', messageOf(error), { ref: request.ref })
    }
    return success({})
  }
}

const marker = (prototype, method) => ({
  name: method,
  private: false,
  static: false,
  addInitializer: fn => {
    fn.call(Object.create(prototype))
  },
})

Remote('describe')(SettingsController.prototype.describe, marker(SettingsController.prototype, 'describe'))
Remote('update')(SettingsController.prototype.update, marker(SettingsController.prototype, 'update'))
Remote('replace')(SettingsController.prototype.replace, marker(SettingsController.prototype, 'replace'))
Remote('mutate')(SettingsController.prototype.mutate, marker(SettingsController.prototype, 'mutate'))
Remote('describe')(CredentialsController.prototype.describe, marker(CredentialsController.prototype, 'describe'))
Remote('set')(CredentialsController.prototype.set, marker(CredentialsController.prototype, 'set'))
Remote('unset')(CredentialsController.prototype.unset, marker(CredentialsController.prototype, 'unset'))

export default SettingsController
