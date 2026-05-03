import * as adapter from './handler.js'
export default { name: 'platform-feishu_comment_rules', surfaces: 'pi', register({ pi }) { pi.platforms.register({ name: 'feishu_comment_rules', module: adapter }) } }
