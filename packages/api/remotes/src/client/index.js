/** Platform-neutral assembly of generated Host Remote contributions. */

import commandsRemote from '@freddie/freddie-commands/remote'
import goalsRemote from '@freddie/freddie-goal/remote'
import dynamicRemote from '@freddie/freddie-cordis-host-runner/remote'
import fileReferencesRemote from '@freddie/freddie-file-reference/remote'
import pluginInventoryRemote from '@freddie/freddie-host-plugin-inventory/remote'
import messageFeedbackRemote from '@freddie/freddie-message-feedback/remote'
import sessionReferencesRemote from '@freddie/freddie-session-reference/remote'
import sessionArtifactsRemote from '@freddie/freddie-session-artifacts/remote'
import remoteStreamRemote from '@freddie/freddie-remote-stream/remote'
import { installRemoteStream } from '@freddie/freddie-remote-stream/client'

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
      // First: the frame-stream carrier installs `remote.$stream` while its
      // `stream` namespace is mounted, so every namespace mounted after it can
      // open streams on the same Client.
      remoteStreamRemote,
      commandsRemote, goalsRemote, dynamicRemote, fileReferencesRemote,
      pluginInventoryRemote, messageFeedbackRemote, sessionReferencesRemote, sessionArtifactsRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
    // Withdrawn before the namespaces above, so no stream outlives its carrier.
    disposers.push(installRemoteStream(ctx.remote))
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Optional: a mount error must not unwind the namespaces above or blank the
  // shell. session-controller is absent here because its own Client entry mounts
  // the namespace itself; listing it twice would mount it twice.
  for (const spec of [
    '@freddie/freddie-gm-client/remote',
    '@freddie/freddie-job-controller/remote',
    '@freddie/freddie-terminal-controller/remote',
  ]) {
    try {
      disposers.push(await ctx.remote.$mount((await import(spec)).default))
    } catch (error) {
      console.error(`client api: Remote contribution ${spec} failed to mount`, error)
    }
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
