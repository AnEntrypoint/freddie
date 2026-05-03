import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const _require = createRequire(import.meta.url);
const gmCcBase = path.dirname(_require.resolve('gm-cc/package.json'));

export default {
    name: 'gm-cc',
    surfaces: 'pi',
    register({ pi }) {
        const skillsDir = path.join(gmCcBase, 'skills');
        if (!fs.existsSync(skillsDir)) return;
        for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
            const skillMd = entry.isDirectory()
                ? path.join(skillsDir, entry.name, 'SKILL.md')
                : entry.name.endsWith('.md') ? path.join(skillsDir, entry.name) : null;
            if (!skillMd || !fs.existsSync(skillMd)) continue;
            const raw = fs.readFileSync(skillMd, 'utf8');
            const nameMatch = raw.match(/^name:\s*(.+)$/m);
            const descMatch = raw.match(/^description:\s*(.+)$/m);
            const name = nameMatch ? nameMatch[1].trim() : entry.name.replace(/\.md$/, '');
            const description = descMatch ? descMatch[1].trim() : '';
            pi.skills.register({ name: 'gm:' + name, description, content: raw, source: 'gm-cc' });
        }
    },
};
