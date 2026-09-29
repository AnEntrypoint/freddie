export function trajectoryNode(
  context,
  anchorSeq,
  data,
) {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'trajectory',
    anchorSeq,
    location: context.start?.location ?? { kind: 'unresolved' },
    data,
  }
}
