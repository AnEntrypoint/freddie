export function mergeOrderedBaseline(current, baseline, keyOf) {
  const baselineByKey = new Map()
  for (const value of baseline) baselineByKey.set(keyOf(value), value)

  const merged = current
    .map(value => baselineByKey.get(keyOf(value)))
    .filter(value => value !== undefined)
  const mergedKeys = new Set(merged.map(keyOf))

  for (let index = 0; index < baseline.length; index++) {
    const value = baseline[index]
    /* v8 ignore next */
    if (value === undefined || mergedKeys.has(keyOf(value))) continue
    let insertion = merged.length
    for (let following = index + 1; following < baseline.length; following++) {
      const candidate = baseline[following]
      /* v8 ignore next */
      if (candidate === undefined) continue
      const known = merged.findIndex(item => keyOf(item) === keyOf(candidate))
      if (known !== -1) {
        insertion = known
        break
      }
    }
    merged.splice(insertion, 0, value)
    mergedKeys.add(keyOf(value))
  }
  return merged
}
