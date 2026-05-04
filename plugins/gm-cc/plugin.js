import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { loadClaudePlugin } from 'plugsdk'

const _require = createRequire(import.meta.url)
const gmCcBase = path.dirname(_require.resolve('gm-cc/package.json'))

export default {
    name: 'gm-cc',
    surfaces: 'pi',
    register({ pi }) {
        if (!fs.existsSync(path.join(gmCcBase, 'skills'))) return
        const cc = loadClaudePlugin(gmCcBase)
        for (const s of cc.skills) {
            pi.skills.register({
                name: 'gm:' + s.name,
                description: s.fields.description || '',
                content: s.body,
                source: 'gm-cc',
                frontmatter: s.fields,
                file: s.file,
            })
        }
    },
}
