const SOURCE_ORDER = ['process', 'project-env', 'user-env']



function lookupKey(name) {
  return process.platform === 'win32' ? name.toUpperCase() : name
}


export function createLaunchEnvironmentSnapshot(layers) {
  const bySource = new Map()
  for (const layer of layers) {
    bySource.set(layer.source, {
      ...layer.path === undefined ? {} : { path: layer.path },
      values: new Map(Object.entries(layer.values).map(([name, value]) => [lookupKey(name), value])),
    })
  }
  const getFrom = (name, sources) => {
    const key = lookupKey(name)
    for (const source of SOURCE_ORDER) {
      if (!sources.includes(source)) continue
      const layer = bySource.get(source)
      const value = layer?.values.get(key)
      if (value === undefined) continue
      return { value, source, ...layer?.path === undefined ? {} : { path: layer.path } }
    }
    return undefined
  }
  return {
    get: name => getFrom(name, SOURCE_ORDER),
    getFrom,
  }
}

export const FREDDIE_LAUNCH_ENVIRONMENT_KEY = 'launchEnvironment'

export function launchEnvironmentOf(ctx) {
  return ctx.get(FREDDIE_LAUNCH_ENVIRONMENT_KEY)
    ?? createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }])
}
