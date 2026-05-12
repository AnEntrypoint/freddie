const fs = require('fs')
const { execSync } = require('child_process')

const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))

for (const name of ['anentrypoint-design', 'acptoapi']) {
    if (p.dependencies && p.dependencies[name] && p.dependencies[name].startsWith('file:')) {
        let v = '0.0.0'
        try { v = execSync(`npm view ${name} version`, { encoding: 'utf8' }).trim() } catch {}
        p.dependencies[name] = '^' + v
        console.log(`Pinned ${name} to ^${v}`)
    }
}

fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
