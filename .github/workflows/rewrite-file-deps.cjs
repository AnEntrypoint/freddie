const fs = require('fs')

const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const REPO_NAME = { 'anentrypoint-design': 'design', 'acptoapi': 'acptoapi', 'plugsdk': 'plugsdk' }
for (const name of Object.keys(REPO_NAME)) {
    if (p.dependencies && p.dependencies[name] && p.dependencies[name].startsWith('file:')) {
        p.dependencies[name] = `github:AnEntrypoint/${REPO_NAME[name]}`
        console.log(`Repointed ${name} to ${p.dependencies[name]}`)
    }
}

fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
