import { saveConfigValue } from './config.js'
import { _FREDDIE_CORE_TOOLS, getEnabledToolNames } from './toolsets.js'

export const DEFAULT_DISTRIBUTIONS = {
    coder: { enabledToolsets: ['core', 'browse'], disabledToolsets: [] },
    researcher: { enabledToolsets: ['core', 'browse', 'creative'], disabledToolsets: [] },
    ops: { enabledToolsets: ['core'], disabledToolsets: ['creative', 'browse'] },
    // 'minimal' still enables the FULL 'core' toolset category (~70 tools:
    // bash/read/write/edit/grep plus agent_swarm, cronjob, mcp_oauth*,
    // process_registry, credential_files, and more) -- it only excludes the
    // browse/creative CATEGORIES, which is a much coarser cut than the name
    // suggests. Confirmed live this session: a 70-tool schema measurably
    // distracts a small local model (MiniCPM5-1B via vLLM) into reasoning
    // about tools irrelevant to the task at hand (agent_swarm, cronjob) on a
    // simple single-file write. 'small-model' is a NEW, separate preset --
    // it does not change 'minimal' or any other existing distribution.
    minimal: { enabledToolsets: ['core'], disabledToolsets: ['browse', 'creative'] },
    full: { enabledToolsets: ['core', 'browse', 'creative'], disabledToolsets: [] },
    // SAFE for a message-facing agent talking to an untrusted end user (a
    // WhatsApp/Discord/SMS contact, never a developer at a terminal): 'core'
    // is deliberately ABSENT. Freddie's 'core' toolset is scoped for a CODING
    // agent -- it bundles bash, code_execution, edit, write, file_operations,
    // credential_files, read, grep, terminal, cronjob, process_registry,
    // mcp_tool/mcp_oauth*, send_message (bypasses whatever outbound pipeline
    // the consumer built), and more -- every one of those is schema-visible
    // and CALLABLE by the model on any conversation using this distribution,
    // reachable by whatever untrusted text the end user sent. A downstream
    // consumer's OWN custom toolset (e.g. casey's 'cases') is enabled
    // separately by the consumer, alongside this profile -- 'contact-facing'
    // intentionally enables NOTHING from freddie's own plugin library by
    // default, so a consumer never inherits a dangerous tool they never
    // audited just because it happened to land in freddie's 'core' toolset in
    // whatever version they installed. (Found live in casey: enabledToolsets:
    // ['cases','core'] exposed a real, callable bash handler to every WhatsApp
    // message from the public -- fixed there by dropping 'core' entirely; this
    // profile exists so a NEW consumer starts from a safe default instead of
    // discovering the same class of bug the hard way.)
    'contact-facing': { enabledToolsets: [], disabledToolsets: [] },
    // A field worker on a CRM "case" surface talking to real end users over a
    // messaging channel -- SAFE, no bare 'core'. Consumer's own case/enquiry
    // toolset (e.g. casey's 'cases': case_* + case_mine/today/near/select/new)
    // is added via the consumer's OWN enabledToolsets, alongside this profile.
    // Previously included bare 'core' (the exact vulnerability described
    // above); corrected to match 'contact-facing'.
    'field-worker': { enabledToolsets: [], disabledToolsets: [] },
    // Small/local coding models (live-witnessed this session: MiniCPM5-1B via
    // vLLM correctly calls a single tool in 1-2 steps but reasons about
    // agent_swarm/cronjob/mcp_oauth/etc. and degrades on longer multi-step
    // tasks when given the full ~70-tool 'core' schema). enabledToolsets
    // stays ['core'] (still resolves through the real toolset/plugin system,
    // unlike hand-listing tool objects) but disabledToolsets is computed
    // dynamically in applyDistribution() below -- every real tool name minus
    // _FREDDIE_CORE_TOOLS (toolsets.js's own already-defined minimal set:
    // bash/read/write/edit/grep) -- mirroring casey's live
    // reporterTierExcludedToolNames() pattern (derive the excluded list from
    // the live toolset at apply time, never hand-duplicate it) so a newly
    // added core tool is automatically excluded here too, nothing to keep in
    // sync by hand. A NEW, separate, opt-in preset -- does not touch any
    // other distribution's behavior.
    'small-model': { enabledToolsets: ['core'], disabledToolsets: null },
}
export function listDistributions() { return Object.keys(DEFAULT_DISTRIBUTIONS) }
export function getDistribution(name) { return DEFAULT_DISTRIBUTIONS[name] || null }
export async function applyDistribution(name) {
    const d = getDistribution(name)
    if (!d) throw new Error('unknown distribution: ' + name)
    let disabledToolsets = d.disabledToolsets
    if (disabledToolsets === null) {
        // small-model: exclude every enabled-toolset tool name NOT in the
        // curated minimal set. getEnabledToolNames filters by real,
        // currently-registered plugins, so this list tracks the live
        // toolset rather than going stale against it.
        const allNames = await getEnabledToolNames(d.enabledToolsets, [])
        const keep = new Set(_FREDDIE_CORE_TOOLS)
        disabledToolsets = allNames.filter(n => !keep.has(n))
    }
    saveConfigValue('toolsets.enabled', d.enabledToolsets)
    saveConfigValue('toolsets.disabled', disabledToolsets)
    return { ...d, disabledToolsets }
}
