import { Service } from '@freddie/cordis'

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/

export function credentialRef(value) {
  if (!isCredentialRefName(value)) {
    throw new TypeError(`credential ref "${value}" must match ${String(REF_PATTERN)}`)
  }
  return value
}

export function isCredentialRefName(value) {
  return typeof value === 'string' && REF_PATTERN.test(value)
}

export function isCredentialKeySegment(value) {
  return typeof value === 'string' && KEY_SEGMENT_PATTERN.test(value)
}

export function credentialKey(scope, id) {
  for (const segment of [scope, id]) {
    if (!KEY_SEGMENT_PATTERN.test(segment)) {
      throw new TypeError(`credential key segment "${segment}" must match ${String(KEY_SEGMENT_PATTERN)}`)
    }
  }
  return `${scope}/${id}`
}

export function parseCredentialKey(value) {
  const segments = value.split('/')
  const [scope, id] = segments
  if (segments.length !== 2 || scope === undefined || id === undefined) {
    throw new TypeError(`credential key "${value}" must be "<scope>/<id>"`)
  }
  return credentialKey(scope, id)
}

export function credentialKeyScope(key) {
  return key.slice(0, key.indexOf('/'))
}

export function credentialKeyId(key) {
  return key.slice(key.indexOf('/') + 1)
}

export class CredentialProvider extends Service {
  constructor(ctx) {
    super(ctx, 'credentials')
  }

  async resolve(ref) {
    throw new Error('not implemented')
  }

  async describe(ref) {
    throw new Error('not implemented')
  }

  async set(ref, value) {
    throw new Error('not implemented')
  }

  async unset(ref) {
    throw new Error('not implemented')
  }

  async readRecord(key) {
    throw new Error('not implemented')
  }

  async describeRecord(key) {
    throw new Error('not implemented')
  }

  async listRecords() {
    throw new Error('not implemented')
  }

  async modifyRecord(key, mutate) {
    throw new Error('not implemented')
  }

  async deleteRecord(key) {
    throw new Error('not implemented')
  }

  notifyUpdated(ref) {
    this.fanOut('credentials/reference-updated', ref)
  }

  notifyRecordUpdated(key) {
    this.fanOut('credentials/record-updated', key)
  }

  /* jscpd:ignore-start -- deliberate symmetry with the settings seam's commit
     fan-out: the contained-dispatch shape is the reviewed listener-lifecycle
     contract, and extracting it would couple the two seams' event semantics. */
  fanOut(event, subject) {
    let invariantFailure
    const args = [event, subject]
    for (const listener of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = listener(subject)
        if (returned != null && typeof returned.then === 'function') {
          void Promise.resolve(returned).then(undefined, (error) => {
            this.warnListenerFailure(event, subject, error)
          })
        }
      } catch (error) {
        if (error?.code === 'INVARIANT') {
          invariantFailure ??= error
          continue
        }
        this.warnListenerFailure(event, subject, error)
      }
    }
    if (invariantFailure !== undefined) throw invariantFailure
  }
  /* jscpd:ignore-end */

  warnListenerFailure(event, subject, error) {
    this.ctx.logger.warn('credentials: a %s listener for "%s" failed', event, subject)
    this.ctx.logger.warn(error)
  }
}

export default CredentialProvider
