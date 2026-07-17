import * as adapter from './handler.js'
import * as commentAdapter from './comment.js'
import * as commentRulesAdapter from './comment-rules.js'
import { _tool as feishuDocTool } from './feishu-doc.js'
import { _tool as feishuDriveTool } from './feishu-drive.js'

export default {
    name: 'platform-feishu',
    surfaces: 'pi',
    register({ pi }) {
        pi.platforms.register({ name: 'feishu', module: adapter })
        pi.platforms.register({ name: 'feishu_comment', module: commentAdapter })
        pi.platforms.register({ name: 'feishu_comment_rules', module: commentRulesAdapter })
        pi.tools.register(feishuDocTool)
        pi.tools.register(feishuDriveTool)
    },
}
export { commentAdapter as comment, commentRulesAdapter as commentRules }
