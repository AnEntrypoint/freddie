import { saveConfigValue } from './config.js'

export const DEFAULT_DISTRIBUTIONS = {
    coder: { enabledToolsets: ['core', 'browse'], disabledToolsets: [] },
    researcher: { enabledToolsets: ['core', 'browse', 'creative'], disabledToolsets: [] },
    ops: { enabledToolsets: ['core'], disabledToolsets: ['creative', 'browse'] },
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
}
export function listDistributions() { return Object.keys(DEFAULT_DISTRIBUTIONS) }
export function getDistribution(name) { return DEFAULT_DISTRIBUTIONS[name] || null }
export function applyDistribution(name) {
    const d = getDistribution(name)
    if (!d) throw new Error('unknown distribution: ' + name)
    saveConfigValue('toolsets.enabled', d.enabledToolsets)
    saveConfigValue('toolsets.disabled', d.disabledToolsets)
    return d
}
