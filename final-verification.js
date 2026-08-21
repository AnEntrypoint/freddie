#!/usr/bin/env node
/**
 * Final comprehensive verification of the audit row fix:
 * audit-llm-aws-secret-access-key-missing-HIGH
 *
 * Verifies all 5 tasks:
 * 1. Add AWS_SECRET_ACCESS_KEY to src/auth.js ENV_OF['bedrock']
 * 2. Add AWS_SECRET_ACCESS_KEY to src/env.js env registry
 * 3. Add AWS_SECRET_ACCESS_KEY to src/cli/setup.js ENV_BY_PROVIDER
 * 4. Verify redactSecrets() can now redact both keys
 * 5. Verify scrubEnv() can now strip both keys from subprocess env
 */

import { createRequire } from 'module'
import {
    redactSecrets,
    listKnownEnvVars,
    hasUsableSecret,
    getProviderAuthState,
    extraEnvForProvider
} from './src/auth.js'
import { scrubEnv } from './src/host/env-scope.js'

const require = createRequire(import.meta.url)
const fs = require('fs')

// Set up test credentials
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

let passed = 0, failed = 0

function test(name, condition, detail = '') {
    if (condition) {
        console.log(`✓ ${name}`)
        passed++
    } else {
        console.log(`✗ ${name}${detail ? ': ' + detail : ''}`)
        failed++
    }
}

console.log('=== COMPREHENSIVE AUDIT FIX VERIFICATION ===\n')

// Task 1: Verify src/auth.js structure is enhanced
console.log('TASK 1: src/auth.js AWS_SECRET_ACCESS_KEY handling')
test('extraEnvForProvider("bedrock") includes AWS_SECRET_ACCESS_KEY',
    extraEnvForProvider('bedrock').includes('AWS_SECRET_ACCESS_KEY'))
test('listKnownEnvVars() includes AWS_ACCESS_KEY_ID',
    listKnownEnvVars().includes('AWS_ACCESS_KEY_ID'))
test('listKnownEnvVars() includes AWS_SECRET_ACCESS_KEY',
    listKnownEnvVars().includes('AWS_SECRET_ACCESS_KEY'))

// Task 2: Check src/env.js has both (read and verify)
console.log('\nTASK 2: src/env.js has both AWS env vars registered')
const envJsContent = fs.readFileSync('./src/env.js', 'utf8')
test('src/env.js declares AWS_ACCESS_KEY_ID',
    envJsContent.includes("'AWS_ACCESS_KEY_ID'") || envJsContent.includes('"AWS_ACCESS_KEY_ID"'))
test('src/env.js declares AWS_SECRET_ACCESS_KEY',
    envJsContent.includes("'AWS_SECRET_ACCESS_KEY'") || envJsContent.includes('"AWS_SECRET_ACCESS_KEY"'))

// Task 3: Check src/cli/setup.js prompts for secret key
console.log('\nTASK 3: src/cli/setup.js handles bedrock two-key setup')
const setupJsContent = fs.readFileSync('./src/cli/setup.js', 'utf8')
test('src/cli/setup.js checks provider === "bedrock"',
    setupJsContent.includes('provider === \'bedrock\''))
test('src/cli/setup.js prompts for AWS_SECRET_ACCESS_KEY',
    setupJsContent.includes('AWS_SECRET_ACCESS_KEY'))
test('src/cli/setup.js stores secret key via getAuthStore()',
    setupJsContent.includes('setCredential(\'AWS_SECRET_ACCESS_KEY\''))

// Task 4: Verify redactSecrets() redacts both keys
console.log('\nTASK 4: redactSecrets() redacts both AWS keys')
const toolResult = {
    ak: 'AKIAIOSFODNN7EXAMPLE',
    sk: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
}
const redacted = redactSecrets(toolResult)
test('Access key redacted by redactSecrets()',
    redacted.ak !== 'AKIAIOSFODNN7EXAMPLE' && redacted.ak.includes('…'))
test('Secret key redacted by redactSecrets()',
    redacted.sk !== 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' && redacted.sk.includes('…'))

// Embedded redaction
const embedded = {
    cmd: `aws configure set aws_secret_access_key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
}
const redactedEmbed = redactSecrets(embedded)
test('Embedded secret key redacted in strings',
    !redactedEmbed.cmd.includes('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'))

// Task 5: Verify scrubEnv() strips both keys
console.log('\nTASK 5: scrubEnv() removes both AWS keys from env')
const fullEnv = {
    PATH: '/usr/bin',
    AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    CUSTOM_VAR: 'preserve-me'
}
const knownVars = listKnownEnvVars()
const scrubbed = scrubEnv(fullEnv, knownVars)
test('scrubEnv() removes AWS_ACCESS_KEY_ID', !scrubbed.AWS_ACCESS_KEY_ID)
test('scrubEnv() removes AWS_SECRET_ACCESS_KEY', !scrubbed.AWS_SECRET_ACCESS_KEY)
test('scrubEnv() preserves other vars', scrubbed.CUSTOM_VAR === 'preserve-me')
test('scrubEnv() preserves PATH', scrubbed.PATH === '/usr/bin')

// Bonus: Verify hasUsableSecret() requires BOTH for bedrock
console.log('\nBONUS: hasUsableSecret("bedrock") requires BOTH keys')
let hasSecret = await hasUsableSecret('bedrock')
test('hasUsableSecret("bedrock") = true with both env vars set', hasSecret === true)

delete process.env.AWS_SECRET_ACCESS_KEY
hasSecret = await hasUsableSecret('bedrock')
test('hasUsableSecret("bedrock") = false when secret key missing', hasSecret === false)

// Restore for final test
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
delete process.env.AWS_ACCESS_KEY_ID
hasSecret = await hasUsableSecret('bedrock')
test('hasUsableSecret("bedrock") = false when access key missing', hasSecret === false)

// Restore both
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'

// Verify getProviderAuthState reports extra env vars
console.log('\nBONUS: getProviderAuthState() shows extra env vars')
const state = await getProviderAuthState('bedrock')
test('getProviderAuthState("bedrock").extraEnv defined', state.extraEnv !== undefined)
test('getProviderAuthState("bedrock").extraEnv includes AWS_SECRET_ACCESS_KEY',
    state.extraEnv && state.extraEnv.includes('AWS_SECRET_ACCESS_KEY'))

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed === 0) {
    console.log('\n✓ ALL AUDIT ROW REQUIREMENTS VERIFIED')
}
process.exit(failed > 0 ? 1 : 0)
