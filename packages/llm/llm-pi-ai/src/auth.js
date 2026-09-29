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

export const RECORD_SCOPE = 'llm-pi-ai'

export function recordKeyFor(providerId) {
  return credentialKey(RECORD_SCOPE, providerId)
}

function jsonImage(value) {
  if (Array.isArray(value)) return value.map(entry => entry === undefined ? null : jsonImage(entry))
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const image = {}
    for (const [key, member] of Object.entries(value)) {
      if (member !== undefined) image[key] = jsonImage(member)
    }
    return image
  }
  return value
}

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

async function isAccessible(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
