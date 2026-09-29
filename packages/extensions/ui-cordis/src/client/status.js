export function packageOf(
  row,
  packageId,
) {
  return row.packages.find(pkg => pkg.packageId === packageId)
}

export function cordisVisibleStatus(
  row,
  packageId,
  loaded,
) {
  const run = row.activeRun
  if (run === undefined || run.packageId !== packageId) return 'idle'
  const pkg = packageOf(row, packageId)
  if (pkg?.hasClientHalf !== true) return 'running'
  return loaded.some(live => live.pluginId === row.pluginId
    && live.packageId === packageId
    && live.pluginRunId === run.pluginRunId)
    ? 'running'
    : 'client-pending'
}
