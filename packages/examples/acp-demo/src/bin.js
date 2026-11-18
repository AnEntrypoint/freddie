#!/usr/bin/env node
import '@freddie/freddie-runtime/install-node'

import { parseArgs } from '@freddie/freddie-runtime/util'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@freddie/freddie-app-boot'
import { process } from '@freddie/freddie-runtime/process'

const NAME = 'freddie-acp-demo'

installFailLoud(NAME)
const snapshotMode = process.env['FREDDIE_SNAPSHOT']
if (snapshotMode !== 'replay') loadEnv(NAME)
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { config: { type: 'string', short: 'c' } },
  strict: true,
})
const ctx = await boot(NAME, resolveConfigPath(values.config ?? './cordis.yml', snapshotMode))
if (snapshotMode !== undefined) {
  process.stdin.on('end', () => {
    void ctx.fiber.dispose().then(() => { process.exit(0) })
  })
}
