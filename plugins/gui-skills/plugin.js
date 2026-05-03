import path from 'node:path'
import { listSkills } from '../../src/skills/index.js'
export default {
    name: 'gui-skills', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/skills', (_, res) => res.json({ home: listSkills(), bundled: listSkills([path.resolve('skills')]) }))
    },
}
