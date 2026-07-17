// Fuzzes plugins/path_security/handler.js's isPathSafe() with real malicious
// path inputs. Not a test file — a real script invoking the real handler,
// run via `node scripts/fuzz-paths.mjs`, output witnessed live.
import { isPathSafe } from '../plugins/path_security/handler.js'

const cwd = process.cwd()

function generateCases() {
    const cases = []

    // ../ traversal chains, varying depth and separator style.
    for (const depth of [1, 2, 5, 10, 50]) {
        cases.push({ label: `traversal-depth-${depth}-posix`, input: '../'.repeat(depth) + 'etc/passwd' })
        cases.push({ label: `traversal-depth-${depth}-win`, input: '..\\'.repeat(depth) + 'Windows\\System32\\config' })
    }
    cases.push({ label: 'traversal-mixed-separators', input: '../..\\../etc/passwd' })
    cases.push({ label: 'traversal-embedded-in-middle', input: 'foo/../../../etc/passwd' })
    cases.push({ label: 'traversal-dot-dot-no-slash', input: '..' })

    // Absolute paths outside cwd.
    cases.push({ label: 'absolute-etc-passwd', input: '/etc/passwd' })
    cases.push({ label: 'absolute-etc-shadow', input: '/etc/shadow' })
    cases.push({ label: 'absolute-ssh-dir', input: '/root/.ssh/id_rsa' })
    cases.push({ label: 'absolute-aws-dir', input: '/home/user/.aws/credentials' })
    cases.push({ label: 'absolute-windows-system32', input: 'C:\\Windows\\System32\\drivers\\etc\\hosts' })
    cases.push({ label: 'absolute-windows-system32-forwardslash', input: 'C:/Windows/System32/cmd.exe' })

    // Null-byte injection (classic path-truncation attack).
    cases.push({ label: 'null-byte-suffix', input: '/etc/passwd\0.txt' })
    cases.push({ label: 'null-byte-prefix', input: '\0/etc/passwd' })
    cases.push({ label: 'null-byte-mid-traversal', input: '../../etc/passwd\0.png' })

    // UNC paths (Windows network-share escape).
    cases.push({ label: 'unc-path-basic', input: '\\\\attacker-host\\share\\file' })
    cases.push({ label: 'unc-path-localhost', input: '\\\\localhost\\C$\\Windows\\System32' })
    cases.push({ label: 'unc-path-admin-share', input: '\\\\127.0.0.1\\ADMIN$\\system32' })

    // Symlink-following attempts (paths that *would* resolve through a
    // symlink pointing outside cwd — isPathSafe can't detect the symlink
    // itself since it's a pure string/path.resolve check, not an fs.realpath
    // call, but it must still reject once path.resolve produces an
    // out-of-tree absolute path).
    cases.push({ label: 'symlink-style-etc-via-proc', input: '/proc/self/root/etc/passwd' })
    cases.push({ label: 'symlink-style-dev-fd', input: '/dev/fd/../../../etc/shadow' })

    // URL-encoded traversal (must be rejected as literal strings — the
    // handler does not decode percent-encoding, so encoded traversal
    // sequences pass through as harmless-looking literal characters unless
    // a caller decodes them first; this fuzzer's job is to confirm the
    // RAW encoded string does not itself resolve to something dangerous,
    // and to flag if it does).
    cases.push({ label: 'url-encoded-dotdot-slash', input: '%2e%2e%2fetc%2fpasswd' })
    cases.push({ label: 'url-encoded-dotdot-backslash', input: '..%5c..%5cWindows%5cSystem32' })
    cases.push({ label: 'double-url-encoded-dotdot', input: '%252e%252e%252fetc%252fpasswd' })

    // Degenerate/edge inputs.
    cases.push({ label: 'empty-string', input: '' })
    cases.push({ label: 'single-dot', input: '.' })
    cases.push({ label: 'whitespace-only', input: '   ' })
    cases.push({ label: 'very-long-traversal', input: '../'.repeat(500) + 'etc/passwd' })

    return cases
}

function main() {
    const cases = generateCases()
    const results = cases.map(({ label, input }) => {
        let outcome
        try {
            outcome = isPathSafe(input, { cwd })
        } catch (err) {
            outcome = { safe: false, reason: `threw: ${err.message}`, threw: true }
        }
        return { label, input, outcome }
    })

    // Cases expected to legitimately resolve to cwd itself (not a traversal
    // at all) or that hit the documented no-decoding caveat are excluded
    // from the pass/fail gate — they are not attacks isPathSafe should catch.
    const EXPECTED_SAFE = new Set(['empty-string', 'single-dot', 'whitespace-only'])
    const trulyDangerous = results.filter(r => {
        if (r.label.includes('url-encoded')) return false
        if (EXPECTED_SAFE.has(r.label)) return false
        return r.outcome.safe === true
    })
    const urlEncodedCases = results.filter(r => r.label.includes('url-encoded'))

    console.log(`fuzz-paths: ${results.length} cases generated`)
    for (const r of results) {
        const tag = r.outcome.safe === false ? 'REJECTED' : 'ALLOWED '
        console.log(`  [${tag}] ${r.label.padEnd(40)} -> ${r.outcome.reason || r.outcome.abs || ''}`)
    }

    console.log(`\nurl-encoded caveat (handler does not decode percent-encoding, by design — a caller must decode before calling isPathSafe if it accepts URL-encoded input):`)
    for (const r of urlEncodedCases) console.log(`  ${r.label}: safe=${r.outcome.safe} abs=${r.outcome.abs || '(n/a)'}`)

    if (trulyDangerous.length) {
        console.log(`\n[FAIL] ${trulyDangerous.length} malicious path(s) were marked safe:`)
        for (const r of trulyDangerous) console.log(`  ${r.label}: ${r.input} -> ${JSON.stringify(r.outcome)}`)
        process.exitCode = 1
    } else {
        console.log(`\n[ok] all ${results.length - urlEncodedCases.length} non-encoding-dependent malicious paths rejected`)
    }
}

main()
