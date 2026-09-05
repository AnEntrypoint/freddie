/** Platform-neutral assembly of generated Host Remote contributions. */

import commandsRemote from '@freddie/freddie-commands/remote'
import goalsRemote from '@freddie/freddie-goal/remote'
import dynamicRemote from '@freddie/freddie-cordis-host-runner/remote'
import fileReferencesRemote from '@freddie/freddie-file-reference/remote'
import pluginInventoryRemote from '@freddie/freddie-host-plugin-inventory/remote'
import messageFeedbackRemote from '@freddie/freddie-message-feedback/remote'
import sessionReferencesRemote from '@freddie/freddie-session-reference/remote'

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx) {
  const disposers = []
  try {
    for (const contribution of [
      commandsRemote, goalsRemote, dynamicRemote, fileReferencesRemote,
      pluginInventoryRemote, messageFeedbackRemote, sessionReferencesRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
