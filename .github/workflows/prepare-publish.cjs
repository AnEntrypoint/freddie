const fs = require('fs')
const { execSync } = require('child_process')

const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))

if (p.dependencies && p.dependencies['anentrypoint-design'] && p.dependencies['anentrypoint-design'].startsWith('file:')) {
    p.dependencies['anentrypoint-design'] = 'github:AnEntrypoint/design'
    console.log('Repointed anentrypoint-design to', p.dependencies['anentrypoint-design'])
}

if (p.dependencies && p.dependencies['acptoapi'] && p.dependencies['acptoapi'].startsWith('file:')) {
    p.dependencies['acptoapi'] = 'github:AnEntrypoint/acptoapi'
    console.log('Repointed acptoapi to', p.dependencies['acptoapi'])
}

if (p.dependencies && p.dependencies['plugsdk'] && p.dependencies['plugsdk'].startsWith('file:')) {
    p.dependencies['plugsdk'] = 'github:AnEntrypoint/plugsdk'
    console.log('Repointed plugsdk to', p.dependencies['plugsdk'])
}

let published = '0.0.0'
try {
    published = execSync('npm view freddie version', { encoding: 'utf8' }).trim()
} catch {}

const [a, b, c] = published.split('.').map(Number)
p.version = `${a}.${b}.${c + 1}`

fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log('Published:', published, '→ Bumped:', p.version)
