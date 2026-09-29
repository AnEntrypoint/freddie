import { isCredentialKeySegment } from '@freddie/freddie-credentials'
import { catalogProvider, catalogProviderIds } from './catalog.js'
import { recordKeyFor } from './auth.js'
import { createModels } from './models.js'

function loginMethods(provider) {
  const methods = []
  const oauth = provider?.auth.oauth
  if (oauth !== undefined) methods.push({ id: 'oauth', label: oauth.loginLabel ?? oauth.name })
  const apiKey = provider?.auth.apiKey
  if (apiKey?.login !== undefined) methods.push({ id: 'api-key', label: apiKey.name })
  return methods
}

function unrecognizedEventNotice() {
  return { message: 'Signing in…' }
}

function relay(event, session) {
  switch (event.type) {
    case 'info': {
      const link = event.links?.[0]
      session.notify({ message: event.message, ...link === undefined ? {} : { url: link.url } })
      return
    }
    case 'auth_url':
      session.notify({
        message: event.instructions ?? 'Open this page to continue signing in.',
        url: event.url,
      })
      return
    case 'device_code':
      session.notify({
        message: 'Enter this code on the verification page to finish signing in.',
        url: event.verificationUri,
        code: event.userCode,
      })
      return
    case 'progress':
      session.notify({ message: event.message })
      return
    default:
      session.notify(unrecognizedEventNotice())
  }
}

function restate(prompt) {
  const signal = prompt.signal === undefined ? {} : { signal: prompt.signal }
  switch (prompt.type) {
    case 'select':
      return { ...signal, kind: 'select', message: prompt.message, options: prompt.options }
    case 'secret':
      return {
        ...signal,
        kind: 'secret',
        message: prompt.message,
        ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
      }
    default:
      return {
        ...signal,
        kind: 'text',
        message: prompt.message,
        ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
      }
  }
}

export function registerPiAiFlows(ctx, auth) {
  for (const providerId of catalogProviderIds()) {
    const provider = catalogProvider(providerId)
    const [first, ...rest] = loginMethods(provider)
    if (provider === undefined || first === undefined) continue
    const recordKeyForWouldThrow = !isCredentialKeySegment(providerId)
    if (recordKeyForWouldThrow) {
      ctx.logger.warn(
        'llm-pi-ai: catalog provider "%s" cannot address a credential record; its sign-in is not offered',
        providerId,
      )
      continue
    }
    ctx.authorization.registerFlow({
      key: recordKeyFor(providerId),
      label: provider.name,
      methods: [first, ...rest],
      async run(session) {
        const signInOnlyModels = createModels(auth)
        signInOnlyModels.setProvider(provider)
        const credentialType = session.method === 'oauth' ? 'oauth' : 'api_key'
        await signInOnlyModels.login(providerId, credentialType, {
          signal: session.signal,
          notify: (event) => { relay(event, session) },
          prompt: prompt => session.prompt(restate(prompt)),
        })
      },
    })
  }
}
