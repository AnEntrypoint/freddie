export async function uploadMedia({ token, file, mime = 'image/png' }) {
    if (!token) throw new Error('yuanbao token required')
    const r = await fetch('https://api.hunyuan.cloud.tencent.com/v1/files', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': mime }, body: file })
    return await r.json()
}
