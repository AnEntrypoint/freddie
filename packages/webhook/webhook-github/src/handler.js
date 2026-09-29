import { Webhooks } from '@octokit/webhooks'
import { snapshotJsonValue } from '@freddie/freddie-values'
import { WebhookDeliveryId, WebhookSourceId } from '@freddie/freddie-webhook'
import { readBoundedUtf8Body, WebhookHttpError } from './body.js'

/**
 * @typedef {{ readonly source: string; readonly secretEnv: string; readonly maxBodyBytes: number }} GitHubWebhookHandlerConfig
 *   Handler values validated once at plugin load. `secretEnv` is an already-branded `CredentialRef`.
 */

function requiredHeader(request, name) {
  const values = request.headersDistinct[name]
  const value = values?.[0]
  if (values?.length !== 1 || value === undefined || value.trim() === '') {
    throw new WebhookHttpError(400, `missing ${name} header`)
  }
  return value
}

function isJsonContentType(value) {
  if (value === undefined) return false
  const parts = value.split(';').map(part => part.trim())
  const [mediaType, parameter, ...extra] = parts
  if (mediaType?.toLowerCase() !== 'application/json') return false
  if (parameter === undefined) return true
  return extra.length === 0 && /^charset=(?:utf-8|"utf-8")$/i.test(parameter)
}

function respond(response, status, message) {
  if (message === undefined) {
    response.writeHead(status)
    response.end()
    return
  }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(message)
}

function parsePayload(body) {
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new WebhookHttpError(400, 'request body is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WebhookHttpError(400, 'GitHub webhook payload must be a JSON object')
  }
  const snapshot = snapshotJsonValue(parsed)
  if (snapshot === undefined) throw new WebhookHttpError(400, 'GitHub webhook payload is not lossless JSON')
  return snapshot
}

/**
 * Create one exact-route GitHub handler.
 * @param {import('@freddie/cordis').Context} ctx - adapter context carrying credentials and webhook runtime.
 * @param {GitHubWebhookHandlerConfig} config - validated source, credential reference, and body ceiling.
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>} an HTTP handler that answers after in-memory dispatch, never rule settlement.
 */
export function createGitHubWebhookHandler(ctx, config) {
  return async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST')
        throw new WebhookHttpError(405, 'method not allowed')
      }
      if (!isJsonContentType(request.headers['content-type'])) {
        throw new WebhookHttpError(415, 'content type must be application/json')
      }
      const body = await readBoundedUtf8Body(request, config.maxBodyBytes)
      const signature = requiredHeader(request, 'x-hub-signature-256')
      const deliveryId = requiredHeader(request, 'x-github-delivery')
      const eventName = requiredHeader(request, 'x-github-event')
      const credential = await ctx.credentials.resolve(config.secretEnv)
      if (credential === undefined || credential.value === '') {
        throw new WebhookHttpError(503, 'GitHub webhook secret is unavailable')
      }
      let verified = false
      try {
        verified = await new Webhooks({ secret: credential.value }).verify(body, signature)
      } catch {
      }
      if (!verified) throw new WebhookHttpError(401, 'invalid webhook signature')
      const payload = parsePayload(body)
      const delivery = {
        kind: 'github',
        source: WebhookSourceId(config.source),
        deliveryId: WebhookDeliveryId(deliveryId),
        event: { name: eventName, payload },
        receivedAt: Date.now(),
      }
      try {
        ctx.webhookRuntime.dispatch(delivery)
      } catch {
        ctx.logger.warn('webhook-github: dispatch unavailable')
        throw new WebhookHttpError(503, 'webhook runtime is unavailable')
      }
      respond(response, 202)
    } catch (error) {
      if (error instanceof WebhookHttpError) {
        respond(response, error.status, error.message)
        return
      }
      ctx.logger.warn('webhook-github: request failed')
      respond(response, 503, 'webhook ingress is unavailable')
    }
  }
}
