import { guardedPlugin } from './guard.js'

export async function startHostHalf(group, plugin, reportGuardFailure) {
  await group.await()
  const fiber = group.ctx.plugin(guardedPlugin(plugin, reportGuardFailure))
  try {
    await fiber.await()
  } catch (error) {
    await fiber.dispose()
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('already registered')) {
      throw new Error(
        `${message} — to REPLACE something an earlier dynamic package registered, first cordis_stop that package's id `
        + '(find it with cordis_runtime_inspect what:"temporary"), then run the new version.',
      )
    }
    throw error instanceof Error ? error : new Error(message)
  }
  return fiber
}

export function missingServices(ctx, fiber) {
  return Object.keys(fiber.inject).filter(service => ctx.get(service) === undefined)
}
