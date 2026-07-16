const fs = require('fs')
const { execSync } = require('child_process')
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (p.dependencies) {
    // anentrypoint-design tracks "latest" intentionally (always newest SDK). Only
    // re-pin if a local file: dep leaked in; never clobber an explicit "latest".
    if (String(p.dependencies['anentrypoint-design'] || '').startsWith('file:')) {
        let v = '0.0.0'
        try { v = execSync('npm view anentrypoint-design version', { encoding: 'utf8' }).trim() } catch {}
        p.dependencies['anentrypoint-design'] = '^' + v
    }
    let av = '0.0.0'
    try { av = execSync('npm view acptoapi version', { encoding: 'utf8' }).trim() } catch {}
    p.dependencies['acptoapi'] = '^' + av
}
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log('Pinned anentrypoint-design to', p.dependencies['anentrypoint-design'])
console.log('Pinned acptoapi to', p.dependencies['acptoapi'])
