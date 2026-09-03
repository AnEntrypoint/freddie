#!/usr/bin/env node
// One-shot script for PRD f22-plugin-dirs-reorg: moves plugin dirs under
// plugins/{core,gui,platform,memory,tools,security,debug}/ and fixes the
// relative-import depth (every '../'-leading import gains one more '../',
// uniformly, since the whole subtree shifts down one directory level).
// Not meant to be re-run after the move lands; kept in scripts/ for the
// record per repo convention (see AGENTS.md docs policy), not wired into
// any pipeline.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLUGINS = path.join(ROOT, 'plugins')

const CATEGORY = {
    core: ['core-agent-machine', 'core-cli', 'core-commands', 'core-compressor', 'core-context-engine', 'core-cron', 'sessions', 'skills', 'skills-hub', 'todo', 'checkpoint', 'confirmation', 'clarify', 'mcp', 'delegate'],
    gui: ['gui-acptoapi-chains', 'gui-agents', 'gui-auth', 'gui-batch', 'gui-chat', 'gui-config', 'gui-cron', 'gui-debug', 'gui-env', 'gui-gateway', 'gui-llm-passthrough', 'gui-machines', 'gui-models-discover', 'gui-profiles-commands-health', 'gui-projects', 'gui-sessions', 'gui-skills', 'gui-tools'],
    platform: ['platform-api_server', 'platform-dingtalk', 'platform-discord', 'platform-feishu', 'platform-homeassistant', 'platform-matrix', 'platform-providers', 'platform-signal', 'platform-slack', 'platform-telegram', 'platform-wecom', 'platform-weixin', 'platform-whatsapp', 'platform-yuanbao'],
    memory: ['memory', 'memory-providers'],
    tools: ['bash', 'terminal', 'files', 'web', 'code_execution', 'image_gen', 'media', 'neutts_synth', 'send_message', 'mixture_of_agents', 'rl_training', 'process_registry', 'managed_tool_gateway', 'achievements', 'budget_config', 'env_passthrough'],
    security: ['credential_files', 'osv_check', 'path_security', 'tirith_security', 'skills-guard'],
    debug: ['debug_helpers', 'observability', 'plugin-validate'],
}

function allFilesRecursive(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...allFilesRecursive(p))
        else out.push(p)
    }
    return out
}

function bumpRelativeImports(file) {
    if (!file.endsWith('.js') && !file.endsWith('.mjs')) return
    let src = fs.readFileSync(file, 'utf8')
    // Match import/export/require/dynamic-import specifiers starting with ../
    const before = src
    src = src.replace(/(['"`])(\.\.\/[^'"`]*)\1/g, (m, q, spec) => `${q}../${spec}${q}`)
    if (src !== before) fs.writeFileSync(file, src)
}

function main() {
    const listed = new Set(fs.readdirSync(PLUGINS, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== '_shared').map(e => e.name))
    const categorized = new Set(Object.values(CATEGORY).flat())
    const missing = [...listed].filter(n => !categorized.has(n))
    const extra = [...categorized].filter(n => !listed.has(n))
    if (missing.length) { console.error('Uncategorized plugin dirs:', missing); process.exit(1) }
    if (extra.length) { console.error('Categorized names not present on disk:', extra); process.exit(1) }

    // Stage into a scratch dir first: a category name (e.g. "memory") can
    // collide with an existing plugin dir of the same name, so renaming
    // straight into plugins/<cat>/<name> risks a self-referential rename.
    const staging = path.join(PLUGINS, '.reorg-staging')
    fs.mkdirSync(staging, { recursive: true })
    for (const [cat, names] of Object.entries(CATEGORY)) {
        const catStage = path.join(staging, cat)
        fs.mkdirSync(catStage, { recursive: true })
        for (const name of names) {
            const src = path.join(PLUGINS, name)
            const dst = path.join(catStage, name)
            fs.renameSync(src, dst)
            for (const f of allFilesRecursive(dst)) bumpRelativeImports(f)
        }
    }
    for (const cat of Object.keys(CATEGORY)) {
        fs.renameSync(path.join(staging, cat), path.join(PLUGINS, cat))
    }
    fs.rmdirSync(staging)
    console.log('reorg complete')
}

main()
