import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  loadOptionalPatches,
  loadOverlayPatches,
  renderConfigDump,
} from '@freddie/freddie-app-boot'
import { homePatchPath, prepareProfile, PROFILE_ROOT_FILENAME } from './profile-boot.js'

const NAME = 'freddie'

export function runDumpConfig(profile, defaultOnly, patches) {
  const loaded = prepareProfile(profile, !defaultOnly)
  const layers = loaded.layers.map(layer => ({
    label: layer.packageName,
    patches: layer.patches,
  }))
  if (!defaultOnly) {
    if (existsSync(loaded.patchPath)) {
      layers.push({ label: loaded.patchPath, patches: loaded.patches })
    }
    const homePatchFile = homePatchPath()
    const homePatches = loadOptionalPatches(NAME, homePatchFile)
    if (homePatches !== undefined) {
      layers.push({ label: homePatchFile, patches: homePatches })
    }
    for (const file of patches) {
      const absolute = resolve(file)
      layers.push({ label: absolute, patches: loadOverlayPatches(NAME, absolute) })
    }
  }
  process.stdout.write(renderConfigDump(NAME, join(loaded.dir, PROFILE_ROOT_FILENAME), layers))
}
