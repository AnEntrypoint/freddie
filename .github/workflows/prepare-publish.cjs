const fs = require('fs')
const { execSync } = require('child_process')

const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))

if (p.dependencies && p.dependencies['anentrypoint-design'] && p.dependencies['anentrypoint-design'].startsWith('file:')) {
    p.dependencies['anentrypoint-design'] = '^0.0.29'
}

let published = '0.0.0'
try {
    published = execSync('npm view freddie version', { encoding: 'utf8' }).trim()
} catch {}

const [a, b, c] = published.split('.').map(Number)
p.version = `${a}.${b}.${c + 1}`

fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log('Published:', published, '→ Bumped:', p.version)
