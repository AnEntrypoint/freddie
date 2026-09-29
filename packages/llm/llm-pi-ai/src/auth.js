/**
 * The three adapters between pi-ai's auth model and the harness credential
 * plane. Every pi-ai-specific concept stays on this side of them: the harness
 * seams they consume — `ctx.credentials` records and `ctx.authorization` flows
 * — name nothing from this library, so another adapter family can arrive with a
 * different auth model and share the same two seams.
 * @module @freddie/freddie-llm-pi-ai/auth
 */

import { homedir } from 'node:os'
import { access } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import {
  credentialKey,
  credentialKeyId,
  credentialKeyScope,
  credentialRef,
  isCredentialKeySegment,
  isCredentialRefName,
} from '@freddie/freddie-credentials'
import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import { LlmError } from '@freddie/freddie-llm'

/**
 * The record scope every credential this adapter family stores is written
 * under. It is the plugin's registered name, which is what tells a later reader
 * that this plugin owns the format inside the record.
 */
export const RECORD_SCOPE = 'llm-pi-ai'

/**
 * The record address for one pi-ai provider id.
 * @param {string} providerId - pi-ai's own provider id, which is also the harness route key.
 * @returns {string} the scoped credential key this adapter family reads and writes.
 */
export function recordKeyFor(providerId) {
  return credentialKey(RECORD_SCOPE, providerId)
}

/**
 * The JSON image of one grant payload: plain objects lose their
 * explicitly-undefined members and array entries JSON cannot hold become null,
 * exactly as `JSON.stringify` would render them. pi-ai credentials
 * idiomatically carry optional members as explicit `undefined`, which the
 * credential store's strict validator refuses as unrepresentable.
 * @param {unknown} value - the value to render.
 * @returns {unknown} the value's JSON image.
 */
function jsonImage(value) {
  if (Array.isArray(value)) return value.map(entry => entry === undefined ? null : jsonImage(entry))
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    /** @type {Record<string, unknown>} */
    const image = {}
    for (const [key, member] of Object.entries(value)) {
      if (member !== undefined) image[key] = jsonImage(member)
    }
    return image
  }
  return value
}

/**
 * Translate a stored record into the credential pi-ai expects. A `grant`
 * payload is pi-ai's own OAuth credential, stored verbatim.
 * @param {object | undefined} record - the stored record, or undefined when nothing is stored.
 * @returns {object | undefined} the pi-ai credential, or undefined for an absent record.
 */
function toPiCredential(record) {
  if (record === undefined) return undefined
  if (record.kind === 'api-key') {
    return {
      type: 'api_key',
      ...record.key === undefined ? {} : { key: record.key },
      ...record.env === undefined ? {} : { env: { ...record.env } },
    }
  }
  return record.payload
}

/**
 * Translate a pi-ai credential into the record to store.
 * @param {object} credential - what a login or refresh produced.
 * @returns {object} the record to commit, in the union the credential seam stores.
 */
function toRecord(credential) {
  if (credential.type === 'api_key') {
    return {
      kind: 'api-key',
      ...credential.key === undefined ? {} : { key: credential.key },
      ...credential.env === undefined ? {} : { env: { ...credential.env } },
    }
  }
  return { kind: 'grant', payload: jsonImage(credential) }
}

/**
 * The credential service, or the failure that names what is missing. Reads
 * answer "nothing stored" without a service, because a composition with no
 * credential plane genuinely holds no credential; writes refuse, because a
 * login whose grant silently evaporated would report success and then fail
 * every request.
 * @param {object} ctx - the plugin context.
 * @returns {object} the live service.
 * @throws {LlmError} code `NO_CREDENTIAL_STORE` when none is mounted.
 */
function writableStore(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    throw new LlmError(
      'llm-pi-ai: this composition mounts no credentials service, so there is nowhere to store the'
      + ' credential a sign-in produces; mount one (freddie-credentials-local) to sign in',
      'NO_CREDENTIAL_STORE',
    )
  }
  return credentials
}

/**
 * A pi-ai `CredentialStore` over the harness credential records.
 *
 * pi-ai asks this store about every provider in the collection, hand-declared
 * routes included, and a route key is an arbitrary settings dict key while a
 * record id is not. An id outside the record grammar can never have stored a
 * record, so reads answer "nothing stored" and a delete has nothing to remove;
 * only `modify` refuses it, because a write that cannot land must not report
 * that it did.
 * @param {object} ctx - the plugin context carrying the optional `ctx.credentials`.
 * @returns {object} the store to hand `createModels()`.
 */
export function credentialStoreFrom(ctx) {
  return {
    async read(providerId) {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) return undefined
      if (!isCredentialKeySegment(providerId)) return undefined
      return toPiCredential(await credentials.readRecord(recordKeyFor(providerId)))
    },
    async list() {
      const stored = await ctx.get('credentials')?.listRecords() ?? []
      /** @type {object[]} */
      const mine = []
      for (const entry of stored) {
        const ownedByAnotherPlugin = credentialKeyScope(entry.key) !== RECORD_SCOPE
        if (ownedByAnotherPlugin) continue
        mine.push({
          providerId: credentialKeyId(entry.key),
          type: entry.kind === 'api-key' ? 'api_key' : 'oauth',
        })
      }
      return mine
    },
    async modify(providerId, mutate) {
      if (!isCredentialKeySegment(providerId)) {
        throw new LlmError(
          `llm-pi-ai: provider id "${providerId}" cannot address a stored credential record (a record id is a`
          + ' lowercase hyphenated identifier); authenticate this route through apiKeyEnv instead of a stored'
          + ' credential',
          'UNSTORABLE_PROVIDER_ID',
        )
      }
      const stored = await writableStore(ctx).modifyRecord(recordKeyFor(providerId), async (current) => {
        const next = await mutate(toPiCredential(current))
        return next === undefined ? undefined : toRecord(next)
      })
      return toPiCredential(stored)
    },
    async delete(providerId) {
      if (!isCredentialKeySegment(providerId)) return
      await writableStore(ctx).deleteRecord(recordKeyFor(providerId))
    },
  }
}

/**
 * A pi-ai `AuthContext` over the harness credential plane and the host
 * filesystem.
 *
 * `env()` answers from the credential seam first, so a value a deployment
 * stored through the harness is found by a provider's own ambient discovery —
 * without this, that discovery reads only the process environment.
 * `fileExists()` answers about the host process's own filesystem rather than
 * the workspace `ctx.fs` seam, because the paths it is asked about are facts
 * about where this process runs.
 * @param {object} ctx - the plugin context carrying the optional `ctx.credentials`.
 * @returns {object} the auth context to hand `createModels()`.
 */
export function authContextFrom(ctx) {
  return {
    async env(name) {
      if (isCredentialRefName(name)) {
        const credentials = ctx.get('credentials')
        const hit = await credentials?.resolve(credentialRef(name))
        if (hit !== undefined) return hit.value
      }
      return launchEnvironmentOf(ctx).get(name)?.value
    },
    async fileExists(path) {
      const expanded = path.startsWith('~/') || path === '~'
        ? resolvePath(homedir(), path.slice(1).replace(/^\//, ''))
        : path
      return isAccessible(expanded)
    },
  }
}

/**
 * Whether the process can access `path`; absent, unreadable, and broken-symlink
 * paths all mean an ambient credential source cannot be used.
 * @param {string} path - the expanded filesystem path.
 * @returns {Promise<boolean>} true when access succeeds.
 */
async function isAccessible(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
