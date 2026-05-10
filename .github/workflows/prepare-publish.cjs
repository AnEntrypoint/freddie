const fs = require('fs')
const { execSync } = require('child_process')

const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))

// Replace file: dep with published npm version so npm publish doesn't reject it
if (p.dependencies && p.dependencies['anentrypoint-design'] && p.dependencies['anentrypoint-design'].startsWith('file:')) {
    let dv = '0.0.0'
    try { dv = execSync('npm view anentrypoint-design version', { encoding: 'utf8' }).trim() } catch {}
    p.dependencies['anentrypoint-design'] = '^' + dv
    console.log('Pinned anentrypoint-design to', p.dependencies['anentrypoint-design'])
}

// Replace acptoapi file: dep with the published npm version
if (p.dependencies && p.dependencies['acptoapi'] && p.dependencies['acptoapi'].startsWith('file:')) {
    let v = '0.0.0'
    try { v = execSync('npm view acptoapi version', { encoding: 'utf8' }).trim() } catch {}
    p.dependencies['acptoapi'] = '^' + v
    console.log('Pinned acptoapi to', p.dependencies['acptoapi'])
}

let published = '0.0.0'
try {
    published = execSync('npm view freddie version', { encoding: 'utf8' }).trim()
} catch {}

const [a, b, c] = published.split('.').map(Number)
p.version = `${a}.${b}.${c + 1}`

fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log('Published:', published, '→ Bumped:', p.version)
