import commandsRemote from '@freddie/freddie-commands/remote'
import goalsRemote from '@freddie/freddie-goal/remote'
import dynamicRemote from '@freddie/freddie-cordis-host-runner/remote'
import fileReferencesRemote from '@freddie/freddie-file-reference/remote'
import pluginInventoryRemote from '@freddie/freddie-host-plugin-inventory/remote'
import pluginManagerRemote from '@freddie/freddie-api-plugin-manager-controller/remote'
import messageFeedbackRemote from '@freddie/freddie-message-feedback/remote'
import sessionReferencesRemote from '@freddie/freddie-session-reference/remote'
import sessionArtifactsRemote from '@freddie/freddie-session-artifacts/remote'

export const inject = ['remote']

export async function apply(ctx) {
  const disposers = []
  try {
    for (const contribution of [
      commandsRemote, goalsRemote, dynamicRemote, fileReferencesRemote,
      pluginInventoryRemote, pluginManagerRemote, messageFeedbackRemote, sessionReferencesRemote, sessionArtifactsRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  for (const spec of [
    '@freddie/freddie-gm-client/remote',
    '@freddie/freddie-job-controller/remote',
    '@freddie/freddie-terminal-controller/remote',
    '@freddie/freddie-api-workspace-files/remote',
  ]) {
    try {
      disposers.push(await ctx.remote.$mount((await import(spec)).default))
    } catch (error) {
      console.error(`client api: Remote contribution ${spec} failed to mount`, error)
    }
  }
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
