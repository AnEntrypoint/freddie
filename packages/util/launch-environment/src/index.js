const SOURCE_ORDER = ['process', 'project-env', 'user-env']

/**
 * One resolved variable and the layer it came from.
 * @typedef {object} LaunchEnvironmentResolution
 * @property {string} value
 * @property {string} source - the layer name the value came from.
 * @property {string} [path] - the layer's originating file path, when it has one.
 */

/**
 * The frozen environment of one launch. Construct through
 * {@link createLaunchEnvironmentSnapshot}; nothing mutates it afterwards, so a
 * later `chdir`, workspace switch, or resumed session observes the same
 * values a consumer resolved at boot.
 * @typedef {object} LaunchEnvironmentSnapshot
 * @property {function(string): (LaunchEnvironmentResolution|undefined)} get - resolve one name down the canonical trust order.
 * @property {function(string, string[]): (LaunchEnvironmentResolution|undefined)} getFrom - resolve one name down a caller-chosen subset/order of layers.
 */

function lookupKey(name) {
  /* v8 ignore next -- native Windows coverage exercises the folding arm; POSIX covers the exact one */
  return process.platform === 'win32' ? name.toUpperCase() : name
}

/**
 * One layer's raw contents, as {@link createLaunchEnvironmentSnapshot} receives them.
 * @typedef {object} LaunchEnvironmentLayer
 * @property {string} source - the layer name (`process`, `project-env`, `user-env`).
 * @property {string} [path] - the layer's originating file path, when it has one.
 * @property {Record<string, string>} values
 */

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
