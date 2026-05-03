export const TIPS = [
    'Use /skill <name> to inject a skill body as a user message — preserves prompt cache.',
    'Profiles isolate state: freddie profile create <name>; FREDDIE_PROFILE=<name> freddie ...',
    'freddie doctor checks env, deps, config — run when something feels off.',
    'freddie dump exports your config + sessions to JSON for backup.',
    'Set FREDDIE_DEBUG=1 to see verbose logs.',
    'freddie dashboard runs a webjsx UI on a local port.',
    '/cron add "*/15 * * * *" "your prompt" schedules a recurring run.',
    'freddie batch <file.txt> runs many prompts in parallel.',
    'Skin not for you? freddie skin ares|mono|slate.',
    'Memory provider: freddie memory-setup.',
]
export function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)] }
export function listTips() { return TIPS }
