import readline from 'node:readline'
import { saveConfigValue, getConfigValue } from '../config.js'
import { getAuthStore } from '../auth.js'
import { listBuiltinSkins, setActiveSkin } from '../skin/engine.js'
import { listEnvironments } from '../tools/environments/index.js'

const PROVIDERS = ['anthropic', 'openai', 'groq', 'openrouter', 'xai', 'gemini', 'bedrock']
const ENV_BY_PROVIDER = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', xai: 'XAI_API_KEY', gemini: 'GEMINI_API_KEY', bedrock: 'AWS_ACCESS_KEY_ID' }
const TTS_PROVIDERS = ['none', 'elevenlabs', 'kittentts', 'neutts', 'espeak']
const GATEWAY_PLATFORMS = ['telegram', 'discord', 'slack', 'whatsapp', 'matrix', 'mattermost', 'signal', 'email', 'sms', 'webhook', 'feishu', 'dingtalk', 'wecom', 'weixin', 'qqbot', 'bluebubbles', 'homeassistant']

function makeAsker(input, output) {
    const rl = readline.createInterface({ input, output })
    const ask = (q) => new Promise(r => rl.question(q, a => r(a.trim())))
    return { ask, close: () => rl.close() }
}

export async function setupModelProvider({ input = process.stdin, output = process.stdout } = {}) {
    const { ask, close } = makeAsker(input, output)
    output.write('providers: ' + PROVIDERS.join(', ') + '\n')
    const provider = (await ask('provider [anthropic]: ')) || 'anthropic'
    if (!PROVIDERS.includes(provider)) { close(); throw new Error('unknown provider: ' + provider) }
    saveConfigValue('agent.provider', provider)
    const key = await ask('api key (leave blank to skip): ')
    if (key) await getAuthStore().setCredential(ENV_BY_PROVIDER[provider], key)
    const model = await ask('default model [empty=provider default]: ')
    if (model) saveConfigValue('agent.model', model)
    close()
    return { provider, model: model || null }
}

export async function setupTerminalBackend({ input = process.stdin, output = process.stdout } = {}) {
    const { ask, close } = makeAsker(input, output)
    const opts = listEnvironments()
    output.write('terminal backends: ' + opts.join(', ') + '\n')
    const choice = (await ask('backend [local]: ')) || 'local'
    if (!opts.includes(choice)) { close(); throw new Error('unknown backend: ' + choice) }
    saveConfigValue('terminal.environment', choice)
    if (choice === 'docker') {
        const img = (await ask('docker image [ubuntu:22.04]: ')) || 'ubuntu:22.04'
        saveConfigValue('terminal.docker_image', img)
    } else if (choice === 'ssh') {
        const host = await ask('ssh host: ')
        if (host) saveConfigValue('terminal.ssh_host', host)
    } else if (choice === 'modal' || choice === 'managed_modal') {
        const tok = await ask('MODAL_TOKEN_ID (blank to skip): ')
        if (tok) await getAuthStore().setCredential('MODAL_TOKEN_ID', tok)
    } else if (choice === 'daytona') {
        const k = await ask('DAYTONA_API_KEY (blank to skip): ')
        if (k) await getAuthStore().setCredential('DAYTONA_API_KEY', k)
    } else if (choice === 'vercel_sandbox') {
        const t = await ask('VERCEL_TOKEN (blank to skip): ')
        if (t) await getAuthStore().setCredential('VERCEL_TOKEN', t)
    }
    close()
    return { backend: choice }
}

export async function setupTts({ input = process.stdin, output = process.stdout } = {}) {
    const { ask, close } = makeAsker(input, output)
    output.write('tts providers: ' + TTS_PROVIDERS.join(', ') + '\n')
    const choice = (await ask('tts [none]: ')) || 'none'
    if (!TTS_PROVIDERS.includes(choice)) { close(); throw new Error('unknown tts: ' + choice) }
    saveConfigValue('tts.provider', choice)
    if (choice === 'elevenlabs') {
        const k = await ask('ELEVENLABS_API_KEY (blank to skip): ')
        if (k) await getAuthStore().setCredential('ELEVENLABS_API_KEY', k)
    }
    close()
    return { tts: choice }
}

export async function setupGatewayPlatform(name, { input = process.stdin, output = process.stdout } = {}) {
    if (!GATEWAY_PLATFORMS.includes(name)) throw new Error('unknown platform: ' + name)
    const { ask, close } = makeAsker(input, output)
    const result = { platform: name }
    const tokenEnv = {
        telegram: 'TELEGRAM_BOT_TOKEN', discord: 'DISCORD_BOT_TOKEN', slack: 'SLACK_BOT_TOKEN', signal: 'SIGNAL_API_TOKEN',
        matrix: 'MATRIX_ACCESS_TOKEN', mattermost: 'MATTERMOST_TOKEN', feishu: 'FEISHU_APP_SECRET', dingtalk: 'DINGTALK_APP_SECRET',
        wecom: 'WECOM_APP_SECRET', weixin: 'WEIXIN_APP_SECRET', qqbot: 'QQ_BOT_TOKEN', bluebubbles: 'BLUEBUBBLES_PASSWORD',
        whatsapp: 'WHATSAPP_TOKEN', email: 'IMAP_PASSWORD', sms: 'TWILIO_AUTH_TOKEN', homeassistant: 'HASS_TOKEN',
    }[name]
    if (tokenEnv) {
        const v = await ask(tokenEnv + ' (blank to skip): ')
        if (v) { await getAuthStore().setCredential(tokenEnv, v); result.tokenSaved = true }
    }
    saveConfigValue('gateway.platforms.' + name + '.enabled', true)
    close()
    return result
}

export async function setupAgentSettings({ input = process.stdin, output = process.stdout } = {}) {
    const { ask, close } = makeAsker(input, output)
    const maxIter = parseInt((await ask('max iterations [90]: ')) || '90', 10)
    saveConfigValue('agent.max_iterations', maxIter)
    const compress = ((await ask('enable compression [y]: ')) || 'y').toLowerCase() === 'y'
    saveConfigValue('agent.compression.enabled', compress)
    close()
    return { max_iterations: maxIter, compression: compress }
}

export async function setupSkin({ input = process.stdin, output = process.stdout } = {}) {
    const { ask, close } = makeAsker(input, output)
    output.write('skins: ' + listBuiltinSkins().join(', ') + '\n')
    const skin = (await ask('skin [default]: ')) || 'default'
    setActiveSkin(skin)
    saveConfigValue('display.skin', skin)
    close()
    return { skin }
}

export async function setupWizard({ input = process.stdin, output = process.stdout } = {}) {
    output.write('freddie setup wizard\n')
    const provider = await setupModelProvider({ input, output })
    const backend = await setupTerminalBackend({ input, output })
    const tts = await setupTts({ input, output })
    const agent = await setupAgentSettings({ input, output })
    const skin = await setupSkin({ input, output })
    return { ...provider, ...backend, ...tts, ...agent, ...skin }
}

export function getSetupStatus() {
    return {
        provider: getConfigValue('agent.provider'),
        terminal: getConfigValue('terminal.environment', 'local'),
        tts: getConfigValue('tts.provider', 'none'),
        skin: getConfigValue('display.skin', 'default'),
    }
}

export { PROVIDERS, TTS_PROVIDERS, GATEWAY_PLATFORMS }
