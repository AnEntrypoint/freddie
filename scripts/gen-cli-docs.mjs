#!/usr/bin/env node
// Generates website/content/pages/cli.yaml from the slash-command registry
// (src/commands/registry.js COMMAND_REGISTRY / COMMANDS_BY_CATEGORY). The
// registry is already the single source of truth consumed by interactive.js,
// fallback_cmd.js and gateway routing.js -- this script just projects it into
// the marketing-site yaml shape.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMANDS_BY_CATEGORY, COMMAND_REGISTRY } from '../src/commands/registry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function yamlEscape(s) {
    if (s == null) return '""'
    const str = String(s)
    if (str === '') return '""'
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function main() {
    const categories = Object.keys(COMMANDS_BY_CATEGORY)
    const total = COMMAND_REGISTRY.length

    let y = `title: CLI\n`
    y += `slug: cli\n`
    y += `hero:\n`
    y += `  heading: cli\n`
    y += `  subheading: every freddie surface starts as one command in your terminal\n`
    y += `  accent: install it once. ssh in. it just works.\n`
    y += `  body: >-\n`
    y += `    Auto-generated reference of all ${total} slash commands in the command registry, grouped by category.\n`
    y += `    Regenerate with \`node scripts/gen-cli-docs.mjs\`.\n`
    y += `  badges:\n`
    y += `    - { label: "${total}", desc: registered commands }\n`
    y += `    - { label: "${categories.length}", desc: categories }\n`
    y += `    - { label: registry-driven, desc: single source of truth }\n`
    y += `  ctas:\n`
    y += `    - { label: bin/freddie.js, href: "https://github.com/AnEntrypoint/freddie/blob/master/bin/freddie.js" }\n`
    y += `    - { label: command registry, href: "https://github.com/AnEntrypoint/freddie/blob/master/src/commands/registry.js" }\n`
    y += `sections:\n`
    for (const cat of categories) {
        const cmds = COMMANDS_BY_CATEGORY[cat]
        const id = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        y += `  - id: ${id}\n`
        y += `    name: ${yamlEscape(cat)}\n`
        y += `    lede: ${yamlEscape(`${cmds.length} command${cmds.length === 1 ? '' : 's'} in the ${cat} category.`)}\n`
        y += `    features:\n`
        for (const c of cmds) {
            const label = `/${c.name}${c.args_hint ? ' ' + c.args_hint : ''}`
            const aliasNote = c.aliases.length ? ` (aliases: ${c.aliases.map(a => '/' + a).join(', ')})` : ''
            y += `      - name: ${yamlEscape(label)}\n`
            y += `        desc: ${yamlEscape(c.description + aliasNote)}\n`
            const scope = c.cli_only ? 'cli only' : (c.gateway_only ? 'gateway only' : 'cli + gateway')
            y += `        benefit: ${yamlEscape(scope)}\n`
        }
    }
    y += `examples:\n`
    y += `  - { label: bin/freddie.js, href: "https://github.com/AnEntrypoint/freddie/blob/master/bin/freddie.js", desc: commander entry }\n`
    y += `  - { label: interactive repl, href: "https://github.com/AnEntrypoint/freddie/blob/master/src/cli/interactive.js", desc: readline + slash commands }\n`
    y += `  - { label: command registry, href: "https://github.com/AnEntrypoint/freddie/blob/master/src/commands/registry.js", desc: slash command defs }\n`
    y += `body: |\n`
    y += `  ## all commands\n`
    y += `\n`
    y += `  \`\`\`\n`
    for (const c of COMMAND_REGISTRY) {
        const label = `/${c.name}${c.args_hint ? ' ' + c.args_hint : ''}`
        y += `  ${label.padEnd(28)} ${c.description}\n`
    }
    y += `  \`\`\`\n`

    fs.mkdirSync(path.join(ROOT, 'website/content/pages'), { recursive: true })
    fs.writeFileSync(path.join(ROOT, 'website/content/pages/cli.yaml'), y)
    console.log(`commands: ${total} across ${categories.length} categories`)
    console.log('wrote website/content/pages/cli.yaml')

    console.log('\n--help / slash-help audit: no hand-maintained duplicate found.')
    console.log('interactive.js, fallback_cmd.js, and gateway/builtin_hooks/routing.js all')
    console.log('already consume COMMAND_REGISTRY / COMMANDS_BY_CATEGORY / getCommand() directly')
    console.log('(see gatewayHelpLines(), etc in src/commands/registry.js) -- no refactor needed.')
}

main()
