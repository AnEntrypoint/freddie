import { getConfigValue } from '../../config.js'
export const denyHook = async (msg) => {
    const list = getConfigValue('gateway.deny_list', []) || []
    if (msg?.from && list.includes(msg.from)) return { ...msg, denied: true, text: '' }
    return msg
}
