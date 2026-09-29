import { spawn } from 'node:child_process'

if (process.argv.length > 2) {
  console.error('usage: pnpm run demo:code-mode')
  process.exit(2)
}

const child = spawn(process.execPath, [
  'packages/examples/acp-demo/src/bin.js',
  '--config',
  'examples/acp-agent/code-mode.cordis.yml',
], { stdio: 'inherit' })
child.on('exit', (code, signal) => { process.exit(signal !== null ? 1 : code ?? 1) })
