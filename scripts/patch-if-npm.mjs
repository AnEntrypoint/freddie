#!/usr/bin/env node
import { execSync } from 'node:child_process'

const userAgent = process.env.npm_config_user_agent ?? ''
const pnpmAlreadyAppliesPatches = userAgent.startsWith('pnpm/')
if (pnpmAlreadyAppliesPatches) process.exit(0)

execSync('npx patch-package', { stdio: 'inherit', shell: true })
