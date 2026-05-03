import { listAll as listProfiles } from './profiles_cli.js'
import { getConfigValue, saveConfigValue } from '../config.js'
export const SLACK_SUBCOMMANDS = ['login', 'channels', 'send', 'config']
export async function slackChannels() {
    const token = process.env.SLACK_BOT_TOKEN
    if (!token) return { error: 'SLACK_BOT_TOKEN required' }
    const r = await fetch('https://slack.com/api/conversations.list', { headers: { authorization: 'Bearer ' + token } })
    return await r.json()
}
export async function slackSend({ channel, text }) {
    const token = process.env.SLACK_BOT_TOKEN
    if (!token) return { error: 'SLACK_BOT_TOKEN required' }
    const r = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ channel, text }) })
    return await r.json()
}
export function slackConfig() { return { profile: listProfiles().active, gateway_enabled: getConfigValue('gateway.platforms.slack.enabled') } }
export function setSlackEnabled(enabled) { saveConfigValue('gateway.platforms.slack.enabled', Boolean(enabled)); return { enabled: Boolean(enabled) } }
