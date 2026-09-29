export function presentRuntimeInspectCall(args) {
  const target = args.name === undefined ? args.what : `${args.what}: ${args.name}`
  return { card: 'generic', kind: 'read', title: target === undefined ? 'Inspect Cordis runtime' : `Inspect Cordis runtime: ${target}` }
}

export function presentInspectListCall() {
  return { card: 'generic', kind: 'read', title: 'List Cordis Inspect Providers' }
}

export function presentInspectQueryCall(args) {
  return { card: 'generic', kind: 'read', title: `Query Cordis ${args.platform} ${args.provider}.${args.method}` }
}

export function presentInspectSelfCall(args) {
  const target = args.pluginId === undefined
    ? 'dynamic Cordis Plugins'
    : args.packageId === undefined ? args.pluginId : `${args.pluginId}/${args.packageId}`
  return { card: 'generic', kind: 'read', title: `Inspect ${target}` }
}

export function presentPackageInspectCall(args) {
  return { card: 'generic', kind: 'read', title: `Inspect Cordis Package ${args.pluginId}/${args.packageId}` }
}

export function presentDefineCall(args) {
  const target = args.plugin.kind === 'new' ? `new ${args.plugin.idPrefix}-*` : args.plugin.pluginId
  return {
    card: 'generic',
    kind: 'execute',
    title: `Register Cordis Plugin "${args.name}" for ${target}: ${args.purpose}`,
    rawInput: args.code,
  }
}

export function presentUndefineCall(args) {
  return { card: 'generic', kind: 'delete', title: `Remove Cordis Plugin ${args.pluginId}` }
}

export function presentRunCall(args) {
  return {
    card: 'generic',
    kind: 'execute',
    title: `${args.mode === 'update' ? 'Update' : 'Run'} Cordis Plugin ${args.pluginId} · ${args.packageId}`,
  }
}

export function presentStopCall(args) {
  return { card: 'generic', kind: 'execute', title: `Stop Cordis Plugin ${args.pluginId}` }
}
