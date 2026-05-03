export const COMMAND_REGISTRY = [
    cmd('help', 'Show available commands', 'Info', { aliases: ['h', '?'] }),
    cmd('quit', 'Exit freddie', 'Exit', { aliases: ['exit', 'q'] }),
    cmd('clear', 'Clear conversation history', 'Session', { aliases: ['cls'] }),
    cmd('resume', 'Resume a previous session', 'Session', { args_hint: '[session-id]' }),
    cmd('sessions', 'List recent sessions', 'Session'),
    cmd('search', 'Search messages full-text', 'Session', { args_hint: '<query>' }),
    cmd('background', 'Run command in background', 'Session', { aliases: ['bg'], args_hint: '<prompt>' }),
    cmd('model', 'Set or show current model', 'Configuration', { args_hint: '[model]' }),
    cmd('provider', 'Set or show current provider', 'Configuration', { args_hint: '[provider]' }),
    cmd('toolsets', 'List or toggle toolsets', 'Tools & Skills'),
    cmd('tools', 'List available tools', 'Tools & Skills'),
    cmd('skills', 'Skills hub: install, list, run', 'Tools & Skills'),
    cmd('skill', 'Run a skill by name', 'Tools & Skills', { args_hint: '<name>' }),
    cmd('memory', 'Memory provider commands', 'Configuration'),
    cmd('skin', 'Switch CLI skin', 'Configuration', { args_hint: '[name]' }),
    cmd('profile', 'Manage profiles', 'Configuration', { args_hint: '<list|create|switch|delete>' }),
    cmd('logs', 'Tail logs', 'Info'),
    cmd('config', 'Show/set config values', 'Configuration', { args_hint: '[key] [value]' }),
    cmd('status', 'Agent + gateway status', 'Info'),
    cmd('copy', 'Copy last response', 'Session', { cli_only: true }),
    cmd('paste', 'Paste from clipboard', 'Session', { cli_only: true }),
    cmd('reset', 'Reset session state', 'Session'),
]

function cmd(name, description, category, opts = {}) {
    return {
        name, description, category,
        aliases: opts.aliases || [],
        args_hint: opts.args_hint || '',
        cli_only: !!opts.cli_only,
        gateway_only: !!opts.gateway_only,
        gateway_config_gate: opts.gateway_config_gate || null,
    }
}

const _alias = new Map()
for (const c of COMMAND_REGISTRY) {
    _alias.set(c.name, c.name)
    for (const a of c.aliases) _alias.set(a, c.name)
}

export function resolveCommand(input) {
    if (!input) return null
    const stripped = input.replace(/^\//, '').split(/\s+/)[0]
    return _alias.get(stripped) || null
}

export function getCommand(name) {
    return COMMAND_REGISTRY.find(c => c.name === name) || null
}

export const GATEWAY_KNOWN_COMMANDS = new Set(
    COMMAND_REGISTRY.filter(c => !c.cli_only || c.gateway_config_gate).map(c => c.name)
)

export function gatewayHelpLines() {
    return COMMAND_REGISTRY.filter(c => !c.cli_only || c.gateway_config_gate)
        .map(c => `/${c.name}${c.args_hint ? ' ' + c.args_hint : ''} — ${c.description}`)
}

export function telegramBotCommands() {
    return COMMAND_REGISTRY.filter(c => !c.cli_only).map(c => ({ command: c.name, description: c.description }))
}

export function slackSubcommandMap() {
    const out = {}
    for (const c of COMMAND_REGISTRY) if (!c.cli_only) out[c.name] = c.description
    return out
}

export function slackAppManifest({ appName = 'freddie', botUserName = 'freddie' } = {}) {
    return {
        display_information: { name: appName, description: 'Freddie agent', background_color: '#1a1a1a' },
        features: {
            bot_user: { display_name: botUserName, always_online: true },
            slash_commands: [{ command: '/' + appName, description: 'Talk to ' + appName, usage_hint: '<message or /command>', should_escape: false }],
        },
        oauth_config: { scopes: { bot: ['app_mentions:read', 'chat:write', 'commands', 'im:history', 'im:read', 'im:write', 'users:read'] } },
        settings: { event_subscriptions: { bot_events: ['app_mention', 'message.im'] }, interactivity: { is_enabled: true }, org_deploy_enabled: false, socket_mode_enabled: true },
    }
}

export function discordSkillCommands() {
    return COMMAND_REGISTRY.filter(c => !c.cli_only && c.category !== 'Exit').map(c => ({ name: c.name, description: c.description.slice(0, 100) || c.name }))
}

export const COMMANDS = Object.fromEntries(
    COMMAND_REGISTRY.flatMap(c => [[c.name, c], ...c.aliases.map(a => [a, c])])
)

export const COMMANDS_BY_CATEGORY = COMMAND_REGISTRY.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c); return acc
}, {})
