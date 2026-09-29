
const COMPACT_CHECKPOINT_MARKER = Object.freeze({ kind: 'plugin', plugin: 'compact' })

export function compactCheckpointSource(
  compactionId,
  sourceCommandId,
) {
  return Object.freeze({
    ...COMPACT_CHECKPOINT_MARKER,
    compactionId,
    ...sourceCommandId === undefined ? {} : { sourceCommandId },
  })
}

export function isCompactCheckpointSource(source) {
  return source.kind === 'plugin' && source.plugin === COMPACT_CHECKPOINT_MARKER.plugin
}
