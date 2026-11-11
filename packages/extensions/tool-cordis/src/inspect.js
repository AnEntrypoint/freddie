function liveImpls(ctx) {
  const store = ctx.reflect.store
  return Object.getOwnPropertySymbols(store)
    .map(key => store[key])
    .filter(impl => impl !== undefined)
}

export function withinFiber(fiber, root) {
  let current = fiber
  while (true) {
    if (current === root) return true
    const parent = current.parent.fiber
    if (parent === current) return false
    current = parent
  }
}

export function providedServices(ctx, fiber) {
  return liveImpls(ctx)
    .filter(impl => withinFiber(impl.fiber, fiber))
    .map(impl => impl.name)
    .sort()
}

export function missingServices(ctx, fiber) {
  return Object.keys(fiber.inject).filter(service => ctx.get(service) === undefined)
}
