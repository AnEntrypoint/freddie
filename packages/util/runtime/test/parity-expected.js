export const expectedRecord = {
  shared: 856,
  gapsApplied: 3,
  gapsInactive: 1,
  inactiveReason: {
    'os.release': 'applies only when /proc/sys/kernel/osrelease is absent; this host reads it, so the gap is inactive here by design',
  },
}

export function recordDrift(summary, withGaps) {
  const drift = []
  if (summary.shared !== expectedRecord.shared) drift.push('shared ' + summary.shared + ', record ' + expectedRecord.shared)
  if (withGaps && summary.gaps !== expectedRecord.gapsApplied) drift.push('gaps applied ' + summary.gaps + ', record ' + expectedRecord.gapsApplied)
  if (withGaps && summary.gapInactive !== expectedRecord.gapsInactive) drift.push('gaps inactive ' + summary.gapInactive + ', record ' + expectedRecord.gapsInactive)
  return drift
}
