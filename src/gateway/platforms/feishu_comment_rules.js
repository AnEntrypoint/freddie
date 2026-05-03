export const COMMENT_RULES = {
    auto_reply_keywords: ['question', 'pls', 'help'],
    skip_authors: [],
    max_comment_age_hours: 168,
}
export function shouldAutoReply(comment, rules = COMMENT_RULES) {
    const text = String(comment?.content || '').toLowerCase()
    if (rules.skip_authors.includes(comment.author)) return false
    if (rules.max_comment_age_hours && comment.created && (Date.now() - comment.created) > rules.max_comment_age_hours * 3600_000) return false
    return rules.auto_reply_keywords.some(k => text.includes(k.toLowerCase()))
}
