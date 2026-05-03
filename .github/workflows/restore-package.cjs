const fs = require('fs')
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (p.dependencies) p.dependencies['anentrypoint-design'] = 'file:../anentrypoint-design'
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log('Restored file: dep, version remains', p.version)
