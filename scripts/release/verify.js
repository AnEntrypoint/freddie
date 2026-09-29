import { parseArgs } from 'node:util'
import { isEntry } from './process.js'
import { releaseFamily } from './families.js'

function reportPublishOrder(family, plan) {
  console.log(`release verify: publish order for family ${family.id}, ${String(plan.order.length)} member(s):`)
  const width = String(plan.order.length).length
  for (const [index, member] of plan.order.entries()) {
    console.log(`  ${String(index + 1).padStart(width, ' ')}  ${member.name}@${member.version}`)
  }
  if (plan.droppedPeerEdges.length === 0) return
  console.log(
    `release verify: ${String(plan.droppedPeerEdges.length)} peer declaration(s) publish unordered,`
    + ' because the peer cannot precede the package declaring it without contradicting a dependency edge'
    + ' or its own cycle. npm treats an unmet peer as a warning, so this orders nothing and blocks nothing:',
  )
  for (const edge of plan.droppedPeerEdges) console.log(`  ${edge.consumer} -> ${edge.peer}`)
}

function verifyPublishable(members) {
  const priv = members.filter(member => member.manifest.private === true)
  if (priv.length > 0) {
    throw new Error(`publishing requires removing "private": true from:\n${priv.map(member => member.directory).join('\n')}`)
  }
}

function verifyTag(family, members, ref) {
  const prefix = 'refs/tags/'
  if (!ref.startsWith(prefix)) {
    throw new Error(`publishing release family ${family.id} requires running from a ${family.tagPrefix}* tag, got ${ref || '(no ref)'}`)
  }
  const tag = ref.slice(prefix.length)
  if (!tag.startsWith(family.tagPrefix)) {
    throw new Error(`tag ${tag} does not belong to release family ${family.id} (expected ${family.tagPrefix}*)`)
  }
  const expected = members.map(member => family.tagFor(member))
  if (!expected.includes(tag)) {
    throw new Error(`tag ${tag} names no version this family carries; its members would tag as:\n${[...new Set(expected)].join('\n')}`)
  }
}

function main() {
  const { values } = parseArgs({
    options: { family: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.family === undefined) throw new Error('usage: verify.js --family <freddie|vendor>')

  const family = releaseFamily(values.family)
  const members = family.members(process.cwd())
  family.verifyVersions(members)
  const plan = family.publishOrder(members)
  if (plan.order.length !== members.length) {
    throw new Error(
      `release family ${family.id}: publish order covers ${String(plan.order.length)} of ${String(members.length)} members`,
    )
  }
  reportPublishOrder(family, plan)

  const publishing = process.env.RELEASE_PUBLISH === 'true'
  if (publishing) {
    verifyPublishable(members)
    verifyTag(family, members, process.env.GITHUB_REF ?? '')
  }

  const versions = [...new Set(members.map(member => member.version))]
  const summary = versions.length === 1 ? versions[0] : `${String(versions.length)} versions`
  console.log(
    `release verify: family ${family.id}, ${String(members.length)} member(s), ${summary},`
    + ` publish order resolved, ${String(plan.droppedPeerEdges.length)} peer declaration(s) unordered`
    + (publishing ? ', publish gates passed' : ''),
  )
}

if (isEntry(import.meta.url)) main()
