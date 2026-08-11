const fs = require('fs')
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (p.dependencies) {
    for (const name of ['anentrypoint-design', 'acptoapi', 'plugsdk']) {
        if (String(p.dependencies[name] || '').startsWith('file:')) {
            p.dependencies[name] = `github:AnEntrypoint/${name === 'anentrypoint-design' ? 'design' : name}`
        }
    }
}
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
for (const name of ['anentrypoint-design', 'acptoapi', 'plugsdk']) {
    console.log(`${name}:`, p.dependencies?.[name])
}
