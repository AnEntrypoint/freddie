#!/usr/bin/env node
/**
 * freddie — command-line entry. Dynamic imports per mode keep unrelated modes out
 * of each dispatch path; the adapter prints and exits for
 * `--help`/`--version`/a parse error, so only a valid mode reaches the switch.
 * @module @freddie/freddie/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadLayeredEnv } from '@freddie/freddie-app-boot'
import { parseDshArgs } from './args.js'
import { reexecWithExposeInternals } from './expose-internals.js'

// Both the source tree (apps/cli/src) and the bundled bin (apps/cli/lib) sit
// one directory under apps/cli, so the checked-in manifest resolves with the
// same relative hop from either artifact.
/** This app's version, read from its checked-in package.json. */
function readVersion() {
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  )
  return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
}

const invocation = parseDshArgs(process.argv.slice(2), readVersion())

// The `web` profile's host-side HMR service (cordis-plugin-hmr) requires
// Node's internal module loader, which requires --expose-internals at the
// ORIGINAL process launch -- it cannot be set at runtime. Re-exec once, only
// for the one profile that needs it, before anything else in this process
// touches the loader. reexecWithExposeInternals never returns when it
// re-spawns: the parent exits with the child's exact exit code.
if (invocation.mode === 'profile' && invocation.profile === 'web') {
  await reexecWithExposeInternals()
}

switch (invocation.mode) {
  case 'profile': {
    const { runProfile } = await import('./profile-boot.js')
    await runProfile({
      environment: loadLayeredEnv('freddie'),
      profile: invocation.profile,
      patchFiles: invocation.patches,
      args: invocation.args,
    })
    break
  }
  case 'plugin': {
    const { runPlugin } = await import('./plugin.js')
    process.exit(runPlugin(invocation.profile, invocation.args))
    break
  }
  case 'dump-config': {
    const { runDumpConfig } = await import('./dump-config.js')
    runDumpConfig(invocation.profile, invocation.defaultOnly, invocation.patches)
    break
  }
  default:
    throw new Error(`freddie: unhandled invocation mode ${JSON.stringify(invocation)}`)
}
