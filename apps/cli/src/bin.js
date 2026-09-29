#!/usr/bin/env node

/* v8 ignore file */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadLayeredEnv } from '@freddie/freddie-app-boot'
import { parseDshArgs } from './args.js'
import { reexecWithExposeInternals } from './expose-internals.js'

function readVersion() {
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  )
  return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
}

const invocation = parseDshArgs(process.argv.slice(2), readVersion())

if (invocation.mode === 'profile' && invocation.profile === 'web') {
  await reexecWithExposeInternals()
}

switch (invocation.mode) {
  case 'profile': {
    const { runProfile } = await import('./profile-boot.js')
    const { installProxyFromEnvironment } = await import('@freddie/freddie-http-proxy')
    const environment = loadLayeredEnv('freddie')
    await installProxyFromEnvironment(environment, message => void process.stderr.write(`freddie: ${message}\n`))
    await runProfile({
      environment,
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
