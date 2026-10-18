
const scopedSubjectResolvers = Object.freeze({
  'agent/created': args => args[0]['agent'],
  'agent/disposed': args => args[0]['agent'],
  'agent/error': args => args[0]['agent'],
  'agent/inbox/claimed': args => args[0]['agent'],
  'agent/inbox/discarded': args => args[0]['agent'],
  'agent/inbox/inserted': args => args[0]['agent'],
  'agent/pre-step': args => args[0]['agent'],
  'agent/request': args => args[0]['agent'],
  'agent/request-error': args => args[0]['agent'],
  'agent/session-start': args => args[0]['agent'],
  'agent/status': args => args[0]['agent'],
  'agent/turn-stopping': args => args[0]['agent'],
  'approval/request': args => args[0]['agent'],
  'goal/changed': args => args[0]['agent'],
  'session/created': null,
  'session/disposed': null,
  'session/event': null,
  'session/flush': null,
  'subagent/end': null,
  'subagent/start': null,
  'system-prompt/assemble': args => args[1]['scope'],
  'tools/code-dispatch-log': args => args[0]['agent'],
  'tools/execute': args => args[0]['agent'],
  'tools/post-execute': args => args[0]['agent'],
  'tools/pre-execute': args => args[0]['agent'],
  'tools/result': args => args[0]['agent'],
})

export function scopedSubjectResolverFor(event) {
  return scopedSubjectResolvers[event]
}
