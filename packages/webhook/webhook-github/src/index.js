import { credentialRef } from '@freddie/freddie-credentials'
import z from '@freddie/schemastery'
import { createGitHubWebhookHandler } from './handler.js'

export const name = 'webhook-github'
export const inject = ['webServer', 'webhookRuntime', 'credentials']


export const Config = z.object({
  source: z.string().required(),
  path: z.string().required(),
  secretEnv: z.string().role('credential-ref').required(),
  maxBodyBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
})

function assertConfig(config) {
  if (config.source.trim() !== config.source || config.source === '') {
    throw new Error('webhook-github source must be a non-empty trimmed string')
  }
  if (!config.path.startsWith('/') || config.path === '/' || config.path.endsWith('/')
    || config.path.includes('?') || config.path.includes('#')) {
    throw new Error('webhook-github path must be an absolute non-root pathname without a trailing slash, query, or fragment')
  }
}

export function apply(ctx, config) {
  assertConfig(config)
  const route = {
    kind: 'exact',
    path: config.path,
    handler: createGitHubWebhookHandler(ctx, {
      source: config.source,
      secretEnv: credentialRef(config.secretEnv),
      maxBodyBytes: config.maxBodyBytes,
    }),
  }
  ctx.effect(
    () => ctx.webServer.register(route),
    `webhook-github: ${config.path}`,
  )
}
