
export const CHAT_SYNTHETIC_SEQ_OFFSETS = {
  interruptedAssistant: -0.9,
  interruptedFollowup: -0.8,
  maxTokensNotice: 0.05,
  finalizedFollowup: 0.1,
}

function contextLocation(context) {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

export function chatNode(
  context,
  kind,
  anchorSeq,
  data,
  options = {},
) {
  return {
    key: context.key,
    kind,
    id: context.id,
    target: 'chat',
    anchorSeq,
    location: options.location ?? contextLocation(context),
    visibility: options.visibility ?? 'visible',
    data,
  }
}

export function lastStep(context) {
  const location = context.start?.location ?? context.matches[0]?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return 0
  return location.turn.steps.at(-1)?.step ?? 0
}
