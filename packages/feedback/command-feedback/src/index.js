import { getOrCreateAnonymousUserId } from '@freddie/freddie-anonymous-user-id'

export const name = 'command-feedback'
export const inject = ['commands']

const USAGE = 'Usage: /feedback <text>'

/* v8 ignore next 3 -- only the ignored default arm calls this; the closed union cannot reach it via the public API. */
function assertNever(value) {
  throw new Error(`command-feedback: unsupported sharing status ${JSON.stringify(value)}`)
}

function sharingSentence(sharing) {
  switch (sharing) {
    case 'full':
      return 'Session sharing is enabled.'
    case 'feedback-only':
      return 'Session sharing is feedback-gated; recording feedback releases the session prefix for sharing.'
    case 'disabled':
      return 'Session sharing is disabled.'
    /* v8 ignore next 2 -- the seam's closed union cannot reach the default; a future status must be given a sentence here. */
    default:
      return assertNever(sharing)
  }
}

function sharingDisclosure(telemetry) {
  if (telemetry === undefined) {
    return 'Session sharing is not configured.'
  }
  return sharingSentence(telemetry.sharing)
}

export function recordFeedback(session, text) {
  const normalized = text.trim()
  if (normalized.length === 0) throw new TypeError('feedback text must not be empty')
  session.append('feedback/record', { text: normalized })
}

function executeFeedbackCommand(invocation, ctx) {
  if (invocation.rawInput.trim().length === 0) {
    return { kind: 'error', text: `Feedback text is required. ${USAGE}` }
  }
  recordFeedback(invocation.agent.session, invocation.rawInput)
  const telemetry = ctx.get('sessionTelemetry')
  return {
    kind: 'success',
    text: `Feedback recorded for session ${invocation.agent.session.id}\nAnonymous user: ${getOrCreateAnonymousUserId()}. ${sharingDisclosure(telemetry)}`,
  }
}

export function apply(ctx) {
  ctx.commands.register({
    name: 'feedback',
    description: 'record feedback about this session',
    input: { hint: '<text>' },
    recordInput: false,
    handler: invocation => executeFeedbackCommand(invocation, ctx),
  })
}
