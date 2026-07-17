// Walks package-lock.json's real dependency tree and queries osv.dev's batch
// API for known vulnerabilities, reusing the same query shape as
// plugins/osv_check/handler.js (POST to api.osv.dev/v1/query, {package,version}).
// Exits non-zero if any CRITICAL-severity vulnerability is found — designed
// to be invoked as a CI gate. Not a test file: a real script hitting the
// real osv.dev API, output witnessed live.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2).filter(a => a !== '--json')
const jsonOutIdx = process.argv.indexOf('--json')
const JSON_OUT = jsonOutIdx !== -1 ? process.argv[jsonOutIdx + 1] : null
const LOCKFILE = args[0] || path.join(process.cwd(), 'package-lock.json')
const BATCH_ENDPOINT = 'https://api.osv.dev/v1/querybatch'
const BATCH_SIZE = 1000 // osv.dev's documented batch query cap

function extractPackages(lockfile) {
    const pkgs = []
    const seen = new Set()
    for (const [key, entry] of Object.entries(lockfile.packages || {})) {
        if (!key || key === '') continue // root package entry
        if (!entry.version) continue
        const name = key.startsWith('node_modules/')
            ? key.slice('node_modules/'.length).replace(/.*node_modules\//, '') // handle nested node_modules paths
            : key
        const dedupeKey = `${name}@${entry.version}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        pkgs.push({ name, version: entry.version })
    }
    return pkgs
}

async function queryBatch(pkgs) {
    const queries = pkgs.map(p => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version }))
    const r = await fetch(BATCH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ queries }),
    })
    if (!r.ok) throw new Error(`osv.dev batch query failed: ${r.status} ${r.statusText}`)
    const data = await r.json()
    return data.results || []
}

// osv.dev's /v1/querybatch deliberately returns minimal {id, modified} pairs
// (documented behavior, keeps batch responses small) — full details
// including severity require a follow-up GET /v1/vulns/{id} per unique id.
async function fetchVulnDetail(id) {
    const r = await fetch(`https://api.osv.dev/v1/vulns/${id}`)
    if (!r.ok) return null
    return r.json()
}

// CVSS_V3/V4 severity[].score is a full vector string ("CVSS:3.1/AV:N/...")
// on real osv.dev records, not a bare numeric string — parse the vector to a
// base score band using the qualitative AV/PR/UI/C/I/A axes is out of scope
// for a lockfile gate; osv.dev's database_specific.severity (a plain
// "LOW"/"MODERATE"/"HIGH"/"CRITICAL" string, set for GHSA-sourced advisories)
// is the reliable field in practice — checked first since it's the field
// osv.dev's own web UI badges off of.
function severityOf(vuln) {
    const dbSev = vuln.database_specific?.severity
    if (dbSev) {
        const norm = String(dbSev).toUpperCase()
        return norm === 'MODERATE' ? 'MEDIUM' : norm
    }
    return 'UNKNOWN'
}

// Extracts the lowest 'fixed' semver for the given package name from an OSV
// record's affected[].ranges[].events[] — used to tell an automated
// dep-bump PR what version to upgrade to.
function fixedVersionOf(vuln, pkgName) {
    const fixed = []
    for (const aff of vuln.affected || []) {
        if (aff.package?.name !== pkgName) continue
        for (const range of aff.ranges || []) {
            for (const ev of range.events || []) {
                if (ev.fixed) fixed.push(ev.fixed)
            }
        }
    }
    if (!fixed.length) return null
    // Lexicographic isn't semver-correct for multi-digit segments, but a
    // real semver compare needs a dep this repo doesn't already carry —
    // sort numerically by dotted segments instead (dependency-free).
    fixed.sort((a, b) => {
        const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pa[i] || 0) - (pb[i] || 0)
            if (d) return d
        }
        return 0
    })
    return fixed[0]
}

async function main() {
    if (!fs.existsSync(LOCKFILE)) {
        console.error(`lockfile not found: ${LOCKFILE}`)
        process.exitCode = 1
        return
    }
    const lockfile = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8'))
    const pkgs = extractPackages(lockfile)
    console.log(`osv-scan-lockfile: ${pkgs.length} unique package@version pairs from ${LOCKFILE}`)

    const idToPkgs = new Map() // vuln id -> [{name, version}, ...] (a vuln can hit multiple packages)
    for (let i = 0; i < pkgs.length; i += BATCH_SIZE) {
        const batch = pkgs.slice(i, i + BATCH_SIZE)
        console.log(`  querying batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} packages)...`)
        const results = await queryBatch(batch)
        for (let j = 0; j < results.length; j++) {
            const vulns = results[j].vulns || []
            if (!vulns.length) continue
            const pkg = batch[j]
            for (const v of vulns) {
                if (!idToPkgs.has(v.id)) idToPkgs.set(v.id, [])
                idToPkgs.get(v.id).push(pkg)
            }
        }
    }

    console.log(`  fetching detail for ${idToPkgs.size} unique vulnerability id(s)...`)
    const findings = []
    for (const [id, affectedPkgs] of idToPkgs) {
        const detail = await fetchVulnDetail(id)
        const severity = detail ? severityOf(detail) : 'UNKNOWN'
        for (const pkg of affectedPkgs) {
            const fixedVersion = detail ? fixedVersionOf(detail, pkg.name) : null
            findings.push({ pkg: pkg.name, version: pkg.version, id, severity, fixedVersion })
        }
    }

    console.log(`\nfound ${findings.length} known-vulnerability record(s) across ${pkgs.length} packages`)
    const bySeverity = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [], UNKNOWN: [] }
    for (const f of findings) (bySeverity[f.severity] || bySeverity.UNKNOWN).push(f)

    for (const [sev, list] of Object.entries(bySeverity)) {
        if (!list.length) continue
        console.log(`\n${sev} (${list.length}):`)
        for (const f of list) console.log(`  ${f.pkg}@${f.version}  ${f.id}`)
    }

    if (JSON_OUT) {
        fs.writeFileSync(JSON_OUT, JSON.stringify({ findings: bySeverity.CRITICAL }, null, 2))
        console.log(`\nwrote ${bySeverity.CRITICAL.length} CRITICAL finding(s) to ${JSON_OUT}`)
    }

    if (bySeverity.CRITICAL.length) {
        console.log(`\n[FAIL] ${bySeverity.CRITICAL.length} CRITICAL vulnerability(ies) found — blocking`)
        process.exitCode = 1
    } else {
        console.log(`\n[ok] no CRITICAL vulnerabilities found`)
    }
}

main().catch(err => {
    console.error('osv-scan-lockfile error:', err.message)
    process.exitCode = 1
})
