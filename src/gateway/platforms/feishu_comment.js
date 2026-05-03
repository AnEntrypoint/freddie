export async function listComments({ token, docToken }) {
    const r = await fetch('https://open.feishu.cn/open-apis/comments/v1/files/' + docToken + '/comments', { headers: { authorization: 'Bearer ' + token } })
    return await r.json()
}
export async function postComment({ token, docToken, content }) {
    const r = await fetch('https://open.feishu.cn/open-apis/comments/v1/files/' + docToken + '/comments', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ comment: { content } }) })
    return await r.json()
}
export async function resolveComment({ token, docToken, commentId }) {
    const r = await fetch('https://open.feishu.cn/open-apis/comments/v1/files/' + docToken + '/comments/' + commentId + '/patch', { method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ is_solved: true }) })
    return await r.json()
}
