/**
 * Authorization flows for the pi-ai providers that ship a login. This is the
 * whole of the translation between the harness's neutral notice/prompt
 * vocabulary and pi-ai's `AuthInteraction`; nothing above it knows which
 * library ran the conversation.
 * @module @freddie/freddie-llm-pi-ai/login
 */

import { isCredentialKeySegment } from '@freddie/freddie-credentials'
import { catalogProvider, catalogProviderIds } from './catalog.js'
import { recordKeyFor } from './auth.js'
import { createModels } from './models.js'

/**
 * The login methods one catalog provider offers.
 *
 * A method appears only when pi-ai can actually run it: `oauth` always carries
 * a `login`, while an api-key method has one only when the provider collects
 * its key interactively — which every installed one currently does, so a key is
 * typed into pi-ai's own prompt rather than into the settings form.
 * @param {object | undefined} provider - the installed catalog provider, if pi-ai ships one.
 * @returns {object[]} its methods, most preferred first; empty when it offers no login.
 */
function loginMethods(provider) {
  /** @type {object[]} */
  const methods = []
  const oauth = provider?.auth.oauth
  if (oauth !== undefined) methods.push({ id: 'oauth', label: oauth.loginLabel ?? oauth.name })
  const apiKey = provider?.auth.apiKey
  if (apiKey?.login !== undefined) methods.push({ id: 'api-key', label: apiKey.name })
  return methods
}

/**
 * The notice for a login event this build does not recognize, so the human
 * still sees progress instead of silence.
 * @returns {object} a neutral notice.
 */
function unrecognizedEventNotice() {
  return { message: 'Signing in…' }
}

/**
 * Restate one pi-ai login event in the seam's vocabulary.
 *
 * A device-code grant is the one event carrying two things the human needs at
 * once — where to go and what to type there — which is why the neutral notice
 * has a `code` beside its `url` rather than folding the code into the message.
 * @param {object} event - what pi-ai reported.
 * @param {object} session - the attempt to report it to.
 * @returns {void}
 */
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

/**
 * Restate one pi-ai prompt in the seam's vocabulary.
 *
 * `manual_code` becomes a plain text question because the difference pi-ai
 * draws — a code the human copies from a browser rather than a value they know
 * — changes nothing a surface renders. Its own `signal` is carried through, and
 * that is the part which matters: it is how a flow racing a typed code against
 * a browser callback withdraws the losing question.
 * @param {object} prompt - what pi-ai asked.
 * @returns {object} the neutral prompt to put to the human.
 */
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

/**
 * Register one authorization flow per installed provider that ships a login.
 *
 * Registration is unconditional on configuration: a provider has to be signed
 * into before a route for it is worth adding, so the flow exists from the
 * moment the plugin mounts rather than appearing once a profile does.
 * @param {object} ctx - the plugin context carrying `ctx.authorization`.
 * @param {object} auth - the injectables every collection here is built with.
 * @returns {void}
 */
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
