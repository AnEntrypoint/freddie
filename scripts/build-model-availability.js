#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'module'
import { resolveCallLLM } from '../src/agent/llm_resolver.js'
import { discoverModels, listKnownProviders } from '../src/agent/model-discovery.js'
const _require = createRequire(import.meta.url)
const { PROVIDER_KEYS, isAvailable, markFailed, markOk, getStatus } = _require('acptoapi')

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')
const ENV_PATH = path.join(ROOT, '.env')
const OUT_PATH = path.join(ROOT, '.gm', 'model-availability.json')
const PROMPT = 'Reply with exactly the four characters: REAL_OK'
const PER_CELL_TIMEOUT_MS = Number(process.env.PER_CELL_TIMEOUT_MS || 15000)
const MAX_MODELS_PER_PROVIDER = Number(process.env.MAX_MODELS_PER_PROVIDER || 5)
const MODES = ['direct_api','acptoapi_passthrough','freddie_v1','kilo_acp','opencode_acp','claude_cli','freddie_agent_loop']
const DAEMONS = {
    acptoapi_passthrough: 'http://localhost:4800',
    freddie_v1: 'http://localhost:4900',
    kilo_acp: 'http://localhost:4780',
    opencode_acp: 'http://localhost:4790',
}

function loadEnv(){ if(!fs.existsSync(ENV_PATH)) return; for(const ln of fs.readFileSync(ENV_PATH,'utf8').split(/\r?\n/)){ const m=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(ln.trim()); if(m && !process.env[m[1]]) process.env[m[1]]=m[2] } }
function hasKey(p){ if(p==='claude-cli'||p==='kilo'||p==='opencode'||p==='ollama') return true; const env=PROVIDER_KEYS[p]; return !!(env && process.env[env]) }
async function withTimeout(promise, ms, tag){ return await Promise.race([ promise, new Promise((_,rej)=>setTimeout(()=>rej(new Error(`timeout:${tag}:${ms}ms`)), ms)) ]) }
function ok(content){ return /REAL_OK/i.test(String(content||'')) }
function excerpt(s){ return String(s||'').trim().replace(/\s+/g,' ').slice(0,160) }

async function daemonUp(url){ try{ const r=await fetch(url+'/v1/models', { signal: AbortSignal.timeout(1500) }); return r.ok || r.status===404 }catch{ try{ const r2=await fetch(url, { signal: AbortSignal.timeout(1500) }); return r2.ok }catch{ return false } } }

async function probeDirect(provider, model){
    const t0=Date.now()
    try{ const call=resolveCallLLM({ provider, model }); const r=await withTimeout(call({ messages:[{role:'user',content:PROMPT}] }), PER_CELL_TIMEOUT_MS, 'direct'); const good=ok(r.content); good?markOk(provider):markFailed(provider); return { ok:good, latency_ms:Date.now()-t0, excerpt:excerpt(r.content) } }
    catch(e){ markFailed(provider); return { ok:false, latency_ms:Date.now()-t0, error: String(e.message||e).slice(0,200) } }
}

async function probeOpenAICompat(baseUrl, provider, model){
    const t0=Date.now()
    try{
        const body={ model: `${provider}/${model}`, messages:[{role:'user',content:PROMPT}] }
        const r=await withTimeout(fetch(baseUrl+'/v1/chat/completions',{ method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer none' }, body: JSON.stringify(body), signal: AbortSignal.timeout(PER_CELL_TIMEOUT_MS) }), PER_CELL_TIMEOUT_MS, 'compat')
        if(!r.ok){ const t=await r.text(); return { ok:false, latency_ms:Date.now()-t0, error:`${r.status}:${t.slice(0,120)}` } }
        const j=await r.json(); const content=j?.choices?.[0]?.message?.content||''
        return { ok: ok(content), latency_ms:Date.now()-t0, excerpt: excerpt(content) }
    } catch(e){ return { ok:false, latency_ms:Date.now()-t0, error:String(e.message||e).slice(0,200) } }
}

async function probeAcpEndpoint(baseUrl, providerID, model){
    const t0=Date.now()
    try{
        const s=await withTimeout(fetch(baseUrl+'/session',{ method:'POST', headers:{'Content-Type':'application/json'}, body:'{}', signal: AbortSignal.timeout(3000) }), 3000, 'acp-session')
        if(!s.ok) return { ok:false, latency_ms:Date.now()-t0, error:`session:${s.status}` }
        return { ok:false, latency_ms:Date.now()-t0, error:'acp_probe_not_implemented_for_arbitrary_models' }
    }catch(e){ return { ok:false, latency_ms:Date.now()-t0, error:String(e.message||e).slice(0,200) } }
}

async function probeAgentLoop(provider, model){
    const t0=Date.now()
    try{ const call=resolveCallLLM({ provider, model }); const r=await withTimeout(call({ messages:[{role:'user',content:PROMPT}], tools:[] }), PER_CELL_TIMEOUT_MS, 'agent'); const good=ok(r.content); good?markOk(provider):markFailed(provider); return { ok: good, latency_ms: Date.now()-t0, iterations: 1, excerpt: excerpt(r.content) } }
    catch(e){ markFailed(provider); return { ok:false, latency_ms:Date.now()-t0, error:String(e.message||e).slice(0,200) } }
}

let _claudeCliAvailable = null
function claudeCliAvailable(){ if(_claudeCliAvailable!=null) return _claudeCliAvailable; const r=spawnSync('claude',['--version'],{ shell:true, timeout:3000 }); _claudeCliAvailable = r.status===0; return _claudeCliAvailable }

async function probeOne(provider, model, mode, daemons){
    if(mode==='direct_api'){
        if(!hasKey(provider)) return { ok:false, skipped:true, reason:'no_api_key_for_provider' }
        if(!isAvailable(provider)) return { ok:false, skipped:true, reason:'sampler_backoff_active' }
        return await probeDirect(provider, model)
    }
    if(mode==='acptoapi_passthrough'){ if(!daemons.acptoapi_passthrough) return { ok:false, skipped:true, reason:'daemon_not_running:4800' }; return await probeOpenAICompat(DAEMONS.acptoapi_passthrough, provider, model) }
    if(mode==='freddie_v1'){ if(!daemons.freddie_v1) return { ok:false, skipped:true, reason:'daemon_not_running:4900' }; return await probeOpenAICompat(DAEMONS.freddie_v1, provider, model) }
    if(mode==='kilo_acp'){ if(!daemons.kilo_acp) return { ok:false, skipped:true, reason:'daemon_not_running:4780' }; if(provider!=='kilo') return { ok:false, skipped:true, reason:'mode_mismatch:kilo_only_proxies_its_own_models' }; return await probeAcpEndpoint(DAEMONS.kilo_acp, 'kilo', model) }
    if(mode==='opencode_acp'){ if(!daemons.opencode_acp) return { ok:false, skipped:true, reason:'daemon_not_running:4790' }; if(provider!=='opencode') return { ok:false, skipped:true, reason:'mode_mismatch:opencode_only_proxies_its_own_models' }; return await probeAcpEndpoint(DAEMONS.opencode_acp, 'opencode', model) }
    if(mode==='claude_cli'){ if(!claudeCliAvailable()) return { ok:false, skipped:true, reason:'claude_cli_not_installed' }; if(provider!=='claude-cli' && provider!=='anthropic') return { ok:false, skipped:true, reason:'mode_mismatch:claude_cli_only_routes_anthropic_models' }; return await probeDirect('claude-cli', model) }
    if(mode==='freddie_agent_loop'){ if(!hasKey(provider)) return { ok:false, skipped:true, reason:'no_api_key_for_provider' }; if(!isAvailable(provider)) return { ok:false, skipped:true, reason:'sampler_backoff_active' }; return await probeAgentLoop(provider, model) }
    return { ok:false, skipped:true, reason:'unknown_mode' }
}

function pickModels(provider, models){
    if(!Array.isArray(models)||models.length===0) return []
    const SKIP=['embed','whisper','tts','image','rerank','guard','moderation','dall','sd-','stable-diffusion','vision-only']
    const filtered=models.filter(m=>!SKIP.some(h=>m.toLowerCase().includes(h)))
    return filtered.slice(0, MAX_MODELS_PER_PROVIDER)
}

async function main(){
    loadEnv()
    console.log('[matrix] discovering models per provider...')
    const discovered = await discoverModels({})
    console.log('[matrix] checking daemon availability...')
    const daemons = {}; for(const [k,u] of Object.entries(DAEMONS)) daemons[k] = await daemonUp(u)
    console.log('[matrix] daemons:', daemons, 'claude-cli:', claudeCliAvailable())
    const providers=[]
    const providerNames = Object.keys(discovered).sort()
    const perModeCounts = Object.fromEntries(MODES.map(m=>[m,{ok:0,fail:0,skipped:0}]))
    let totalModels=0, usableAny=0

    await Promise.all(providerNames.map(async pName=>{
        const info = discovered[pName]
        const models = pickModels(pName, info.models)
        if(!models.length){
            providers.push({ id: pName, key_present: hasKey(pName), discovery_error: info.error||null, models: [] })
            return
        }
        const modelEntries=[]
        for(const m of models){
            const cellModes={}
            for(const mode of MODES){
                cellModes[mode] = await probeOne(pName, m, mode, daemons)
                const c = cellModes[mode]
                if(c.skipped) perModeCounts[mode].skipped++; else if(c.ok) perModeCounts[mode].ok++; else perModeCounts[mode].fail++
            }
            const anyOk = Object.values(cellModes).some(c=>c.ok)
            totalModels++; if(anyOk) usableAny++
            modelEntries.push({ id: m, discovered_via: info.error?['known_fallback']:['provider_models_endpoint'], modes: cellModes, usable_in_any_mode: anyOk })
            console.log(`[matrix] ${pName}/${m} -> ${Object.values(cellModes).filter(c=>c.ok).length}/${MODES.length} modes ok`)
        }
        providers.push({ id: pName, key_present: hasKey(pName), discovery_error: info.error||null, models: modelEntries })
    }))

    providers.sort((a,b)=>a.id.localeCompare(b.id))
    const out = {
        timestamp: new Date().toISOString(),
        config: { MAX_MODELS_PER_PROVIDER, PER_CELL_TIMEOUT_MS, modes: MODES },
        daemons: { ...daemons, claude_cli: claudeCliAvailable() },
        providers,
        sampler: getStatus(),
        summary: { total_providers: providers.length, total_models: totalModels, usable_in_any_mode: usableAny, per_mode_counts: perModeCounts },
    }
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2))
    console.log(`[matrix] wrote ${OUT_PATH}`)
    console.log(`[matrix] ${totalModels} models across ${providers.length} providers; ${usableAny} usable in any mode`)
    return out
}

if(import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))){
    main().catch(e=>{ console.error('FATAL', e); process.exit(1) })
}
export { main as buildMatrix, MODES, DAEMONS }
