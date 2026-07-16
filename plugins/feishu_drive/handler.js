import { env } from '../../src/env.js'

export const _tool = ({
    name: 'feishu_drive',
    toolset: 'core',
    schema: { name: 'feishu_drive', description: 'List or download Feishu Drive files.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'download'] }, folder_token: { type: 'string' }, file_token: { type: 'string' } }, required: ['action'] } },
    requiresEnv: ['FEISHU_APP_TOKEN'],
    checkFn: () => Boolean(env('FEISHU_APP_TOKEN')),
    handler: async ({ action, folder_token, file_token }) => {
        const auth = { authorization: `Bearer ${env('FEISHU_APP_TOKEN')}` }
        if (action === 'list') return await (await fetch('https://open.feishu.cn/open-apis/drive/v1/files?folder_token=' + (folder_token || ''), { headers: auth })).json()
        if (action === 'download') return await (await fetch(`https://open.feishu.cn/open-apis/drive/v1/files/${file_token}/download`, { headers: auth })).json()
        return { error: 'unknown action' }
    },
})
