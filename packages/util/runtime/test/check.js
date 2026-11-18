import { contract } from './contract-names.js'

export function checkContract(label, subpaths) {
  const missing = []
  let present = 0
  for (const [subpath, names] of Object.entries(contract)) {
    const namespace = subpaths[subpath]
    if (namespace === undefined) {
      missing.push(subpath)
      continue
    }
    for (const name of names) {
      if (namespace[name] === undefined) missing.push(subpath + '.' + name)
      else present += 1
    }
  }
  if (missing.length > 0) throw new Error(label + ' is missing: ' + missing.join(', '))
  console.log(label + ': ' + present + ' names present across ' + Object.keys(contract).length + ' subpaths')
}
