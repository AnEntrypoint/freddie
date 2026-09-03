import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { getFreddieHome } from '../home.js'

// Project-local plugin trust gate: <cwd>/.freddie/plugins/ is code that ships
// WITH whatever repo the user happens to be running freddie inside -- unlike
// the freddie-repo-shipped plugins/ or the user's own ~/.freddie/plugins/,
// this directory is attacker-controlled the moment the user clones/checks out
// an untrusted repo. discoverPlugins() imports and registers any plugin.js/
// handler.js found there unconditionally (arbitrary code execution on host()
// boot), with no prompt -- this module adds the missing approval step.
//
// Allow-list persisted at <FREDDIE_HOME>/trust.json, keyed by the resolved
// absolute plugin-root path (so a rename/move of the project re-prompts).

function trustFilePath() {
    return path.join(getFreddieHome(), 'trust.json')
}

function readTrustFile() {
    try {
        return JSON.parse(fs.readFileSync(trustFilePath(), 'utf8'))
    } catch {
        return {}
    }
}

function writeTrustFile(data) {
    fs.writeFileSync(trustFilePath(), JSON.stringify(data, null, 2) + '\n')
}

export function getTrustDecision(resolvedRoot) {
    const trust = readTrustFile()
    return trust[resolvedRoot]?.decision ?? null
}

export function setTrustDecision(resolvedRoot, decision) {
    const trust = readTrustFile()
    trust[resolvedRoot] = { decision, decided_at: Date.now() }
    writeTrustFile(trust)
}

async function promptYesNo(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return await new Promise(resolve => {
        rl.question(question, answer => {
            rl.close()
            resolve(/^y(es)?$/i.test(answer.trim()))
        })
    })
}

// Returns true if `resolvedRoot` should be scanned for plugins, false if it
// should be skipped this boot. Never throws -- a broken/non-TTY prompt path
// fails closed (untrusted) rather than silently loading unapproved code.
//
// `approve` param mirrors pi's --approve/-a / --no-approve/-na CLI override:
// true forces trust without prompting, false forces distrust without
// prompting, undefined/null means "consult the persisted decision, prompt
// if none exists and stdin is a TTY, else fail closed."
export async function checkPluginTrust(resolvedRoot, { approve = null } = {}) {
    if (!fs.existsSync(resolvedRoot)) return false // nothing to gate if the dir doesn't exist
    if (approve === true) { setTrustDecision(resolvedRoot, 'trusted'); return true }
    if (approve === false) { setTrustDecision(resolvedRoot, 'untrusted'); return false }

    const existing = getTrustDecision(resolvedRoot)
    if (existing === 'trusted') return true
    if (existing === 'untrusted') return false

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        // Non-interactive (CI, piped, gateway process): fail closed, do not
        // silently execute unapproved project-local code. FREDDIE_TRUST_CWD_PLUGINS=1
        // is the explicit non-interactive opt-in, mirroring pi's --approve.
        if (process.env.FREDDIE_TRUST_CWD_PLUGINS === '1') { setTrustDecision(resolvedRoot, 'trusted'); return true }
        return false
    }

    const trusted = await promptYesNo(
        `\nThis project has local plugins at ${resolvedRoot}\n` +
        `Loading them runs their code with full process permissions (same as any freddie plugin).\n` +
        `Trust this project's plugins? [y/N] `
    )
    setTrustDecision(resolvedRoot, trusted ? 'trusted' : 'untrusted')
    return trusted
}
