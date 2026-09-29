/**
 * Strict wire codecs for the Session command endpoints, shared by the Host and
 * Client manifests so both faces of one endpoint can never drift apart.
 *
 * None declares cancellation: the gateway command surface has no cancellation
 * channel, and a declared one that did nothing would misreport what a Client
 * can stop.
 *
 * @module @freddie/freddie-session-controller/command-codecs
 */
import { z } from 'zod'

const promptContentPart = z.looseObject({
  'type': z.string(),
  'text': z.string().optional(),
})

const queueAction = z.union([
  z.object({ 'kind': z.literal('remove') }),
  z.object({ 'kind': z.literal('steer') }),
  z.object({ 'kind': z.literal('edit'), 'content': z.array(promptContentPart) }),
])

const accepted = z.object({ 'accepted': z.boolean() })

const selection = z.object({
  'provider': z.string(),
  'model': z.string(),
  'reasoningEffort': z.string().optional(),
})

/** One row per command endpoint, in declaration order. */
export const COMMAND_CODECS = [
  {
    method: 'create',
    request: z.object({
      'sessionId': z.string().optional(),
      'workspaceId': z.string().optional(),
      'cwd': z.string().optional(),
      'agentPreset': z.string().optional(),
    }),
    result: z.object({ 'sessionId': z.string(), 'agentPreset': z.string().optional() }),
  },
  {
    method: 'rename',
    request: z.object({ 'sessionId': z.string(), 'title': z.string() }),
    result: z.object({ 'title': z.string(), 'seq': z.number() }),
  },
  {
    method: 'fork',
    request: z.object({ 'sessionId': z.string(), 'atSeq': z.number().optional() }),
    result: z.object({ 'sessionId': z.string() }),
  },
  {
    method: 'prompt',
    request: z.object({
      'sessionId': z.string(),
      'content': z.array(promptContentPart),
      'mode': z.string().optional(),
      'clientTimeZone': z.string().optional(),
    }),
    result: accepted,
  },
  {
    method: 'attachment',
    request: z.object({ 'sessionId': z.string(), 'attachmentId': z.string() }),
    result: z.object({ 'attachment': z.unknown(), 'data': z.string() }),
  },
  {
    method: 'updateQueue',
    request: z.object({ 'sessionId': z.string(), 'itemId': z.string(), 'action': queueAction }),
    result: accepted,
  },
  {
    method: 'cancel',
    request: z.object({ 'sessionId': z.string(), 'confirm': z.boolean().optional() }),
    result: accepted,
  },
  {
    method: 'selectModel',
    request: z.object({
      'sessionId': z.string(),
      'provider': z.string(),
      'model': z.string(),
      'reasoningEffort': z.string().optional(),
    }),
    result: z.object({ 'selected': selection }),
  },
]
