// Central registry for every environment variable freddie reads via process.env.
// Call sites should use env('NAME') instead of process.env.NAME directly so the
// full surface of externally-configurable behavior is discoverable in one place
// (see runDoctor() in src/cli/doctor.js, which walks provider: true entries).
//
// kind: 'secret' | 'url' | 'toggle' | 'path' | 'string' | 'number'
// provider: true marks vars that gate an LLM/model provider (used by doctor)

const REGISTRY = {
    // --- core freddie config ---
    FREDDIE_HOME: { purpose: 'override for freddie home directory', kind: 'path' },
    FREDDIE_PROFILE: { purpose: 'active named profile under ~/.freddie/profiles', kind: 'string' },
    FREDDIE_PROFILES_ROOT: { purpose: 'override for profiles root directory', kind: 'path' },
    FREDDIE_DEBUG: { purpose: 'enable debug logging', kind: 'toggle' },
    FREDDIE_DISABLE_CC_HOOKS: { purpose: 'disable Claude Code hook discovery', kind: 'toggle' },
    FREDDIE_EXTRA_CC_ROOTS: { purpose: 'extra Claude Code root directories to scan', kind: 'path' },
    FREDDIE_LLM_MODEL: { purpose: 'default LLM model id for freddie-internal LLM calls', kind: 'string' },
    FREDDIE_LLM_TIMEOUT_MS: { purpose: 'timeout in ms for freddie-internal LLM calls', kind: 'number' },
    FREDDIE_LLM_URL: { purpose: 'base URL for freddie-internal LLM endpoint', kind: 'url' },
    FREDDIE_MATRIX_URL: { purpose: 'base URL override for matrix platform integration', kind: 'url' },
    FREDDIE_TEST_DB: { purpose: 'override sqlite db path used in tests', kind: 'path' },
    FREDDIE_CHAOS_INJECT: { purpose: 'dev-only: percent chance (0-100) of a synthetic tool-dispatch error, to verify the agent loop degrades gracefully instead of crashing', kind: 'number' },

    // --- process / OS ---
    HOME: { purpose: 'OS home directory (posix)', kind: 'path' },
    USERPROFILE: { purpose: 'OS home directory (windows)', kind: 'path' },
    SHELL: { purpose: 'user login shell', kind: 'path' },

    // --- LLM providers ---
    ANTHROPIC_API_KEY: { purpose: 'Anthropic provider key', kind: 'secret', provider: true },
    OPENAI_API_KEY: { purpose: 'OpenAI provider key', kind: 'secret', provider: true },
    OPENAI_BASE_URL: { purpose: 'OpenAI-compatible base URL override', kind: 'url' },
    OPENROUTER_API_KEY: { purpose: 'OpenRouter provider key', kind: 'secret', provider: true },
    XAI_API_KEY: { purpose: 'xAI (Grok) provider key', kind: 'secret', provider: true },
    NOUS_API_KEY: { purpose: 'Nous Research provider key', kind: 'secret', provider: true },
    ZAI_BASE_URL: { purpose: 'Z.ai base URL override', kind: 'url' },
    ZAI_ENDPOINT: { purpose: 'Z.ai endpoint override', kind: 'url' },
    KIMI_BASE_URL: { purpose: 'Kimi (Moonshot) base URL override', kind: 'url' },
    KIMI_REGION: { purpose: 'Kimi (Moonshot) region selector', kind: 'string' },
    YUANBAO_API_KEY: { purpose: 'Tencent Yuanbao provider key', kind: 'secret', provider: true },
    AZURE_OPENAI_API_VERSION: { purpose: 'Azure OpenAI API version', kind: 'string' },
    AZURE_OPENAI_DEPLOYMENT: { purpose: 'Azure OpenAI deployment name', kind: 'string' },
    AZURE_OPENAI_ENDPOINT: { purpose: 'Azure OpenAI endpoint URL', kind: 'url' },
    AWS_ACCESS_KEY_ID: { purpose: 'AWS access key id (Bedrock provider)', kind: 'secret', provider: true },
    AWS_SESSION_TOKEN: { purpose: 'AWS session token (Bedrock provider)', kind: 'secret' },
    AWS_REGION: { purpose: 'AWS region for Bedrock provider', kind: 'string' },
    GOOGLE_OAUTH_TOKEN: { purpose: 'Google OAuth token (Gemini/Meet)', kind: 'secret', provider: true },
    COPILOT_TOKEN: { purpose: 'GitHub Copilot provider token', kind: 'secret', provider: true },

    // --- ACP / bridge ---
    ACP_SHARED_SECRET: { purpose: 'shared secret for ACP bridge auth', kind: 'secret' },
    ACPTOAPI_LIVE_PROBE: { purpose: 'enable live probe against acptoapi', kind: 'toggle' },
    ACPTOAPI_PROBE_CAP: { purpose: 'max number of acptoapi probes to run', kind: 'number' },

    // --- sandboxes / execution environments ---
    DAYTONA_API_KEY: { purpose: 'Daytona sandbox API key', kind: 'secret' },
    DAYTONA_API_URL: { purpose: 'Daytona sandbox API URL', kind: 'url' },
    DAYTONA_TARGET: { purpose: 'Daytona sandbox target region', kind: 'string' },
    MODAL_TOKEN_ID: { purpose: 'Modal sandbox token id', kind: 'secret' },
    MODAL_TOKEN_SECRET: { purpose: 'Modal sandbox token secret', kind: 'secret' },
    VERCEL_TOKEN: { purpose: 'Vercel API token (auth + sandbox)', kind: 'secret' },
    VERCEL_SANDBOX_URL: { purpose: 'Vercel sandbox base URL', kind: 'url' },
    SINGULARITY_BIN: { purpose: 'path to singularity/apptainer binary', kind: 'path' },

    // --- memory backends ---
    BYTEROVER_API_KEY: { purpose: 'Byterover memory backend key', kind: 'secret' },
    HINDSIGHT_API_KEY: { purpose: 'Hindsight memory backend key', kind: 'secret' },
    HONCHO_API_KEY: { purpose: 'Honcho memory backend key', kind: 'secret' },
    MEM0_API_KEY: { purpose: 'Mem0 memory backend key', kind: 'secret' },
    OPENVIKING_API_KEY: { purpose: 'OpenViking memory backend key', kind: 'secret' },
    RETAINDB_API_KEY: { purpose: 'RetainDB memory backend key', kind: 'secret' },
    SUPERMEMORY_API_KEY: { purpose: 'Supermemory memory backend key', kind: 'secret' },

    // --- misc tool integrations ---
    ATROPOS_TOKEN: { purpose: 'Atropos RL training service token', kind: 'secret' },
    ATROPOS_URL: { purpose: 'Atropos RL training service URL', kind: 'url' },
    ELEVENLABS_API_KEY: { purpose: 'ElevenLabs TTS API key', kind: 'secret' },
    NEUTTS_URL: { purpose: 'NeuTTS synth service URL', kind: 'url' },
    REPLICATE_API_TOKEN: { purpose: 'Replicate image-gen API token', kind: 'secret' },
    SERPAPI_KEY: { purpose: 'SerpAPI web search key (optional, falls back to DDG)', kind: 'secret' },
    SPOTIFY_ACCESS_TOKEN: { purpose: 'Spotify access token', kind: 'secret' },

    // --- chat platforms ---
    BLUEBUBBLES_PASSWORD: { purpose: 'BlueBubbles server password', kind: 'secret' },
    DINGTALK_ACCESS_TOKEN: { purpose: 'DingTalk bot access token', kind: 'secret' },
    DISCORD_BOT_TOKEN: { purpose: 'Discord bot token', kind: 'secret' },
    FEISHU_APP_TOKEN: { purpose: 'Feishu (Lark) app token', kind: 'secret' },
    HASS_TOKEN: { purpose: 'Home Assistant long-lived access token', kind: 'secret' },
    HASS_URL: { purpose: 'Home Assistant base URL', kind: 'url' },
    IMAP_HOST: { purpose: 'IMAP host for email platform', kind: 'string' },
    MATRIX_ACCESS_TOKEN: { purpose: 'Matrix access token', kind: 'secret' },
    MATRIX_HOMESERVER: { purpose: 'Matrix homeserver URL', kind: 'url' },
    MATTERMOST_TOKEN: { purpose: 'Mattermost bot token', kind: 'secret' },
    MATTERMOST_URL: { purpose: 'Mattermost server URL', kind: 'url' },
    QQBOT_TOKEN: { purpose: 'QQ bot token', kind: 'secret' },
    SIGNAL_CLI_URL: { purpose: 'signal-cli REST API URL', kind: 'url' },
    SIGNAL_NUMBER: { purpose: 'Signal registered phone number', kind: 'string' },
    SLACK_BOT_TOKEN: { purpose: 'Slack bot token', kind: 'secret' },
    SLACK_SIGNING_SECRET: { purpose: 'Slack request signing secret', kind: 'secret' },
    SMTP_HOST: { purpose: 'SMTP host for email platform', kind: 'string' },
    SMTP_PASS: { purpose: 'SMTP password', kind: 'secret' },
    SMTP_PORT: { purpose: 'SMTP port', kind: 'number' },
    SMTP_USER: { purpose: 'SMTP username', kind: 'string' },
    TELEGRAM_BOT_TOKEN: { purpose: 'Telegram bot token', kind: 'secret' },
    TWILIO_FROM: { purpose: 'Twilio sending phone number', kind: 'string' },
    TWILIO_SID: { purpose: 'Twilio account SID', kind: 'secret' },
    TWILIO_TOKEN: { purpose: 'Twilio auth token', kind: 'secret' },
    WECOM_CALLBACK_TOKEN: { purpose: 'WeCom callback verification token', kind: 'secret' },
    WECOM_ENCODING_AES_KEY: { purpose: 'WeCom callback AES encoding key', kind: 'secret' },
    WECOM_WEBHOOK_KEY: { purpose: 'WeCom webhook key', kind: 'secret' },
    WEIXIN_TOKEN: { purpose: 'WeChat (Weixin) verification token', kind: 'secret' },
    WHATSAPP_API_TOKEN: { purpose: 'WhatsApp Cloud API token', kind: 'secret' },
    WHATSAPP_PHONE_NUMBER_ID: { purpose: 'WhatsApp Cloud API phone number id', kind: 'string' },
    WHATSAPP_VERIFY_TOKEN: { purpose: 'WhatsApp webhook verify token', kind: 'secret' },
    WHATSAPP_APP_SECRET: { purpose: 'WhatsApp Cloud API app secret (enables webhook signature verification)', kind: 'secret' },
    WHATSAPP_WEBHOOK_PORT: { purpose: 'WhatsApp webhook listener port override', kind: 'number' },
    WHATSAPP_WEBHOOK_PATH: { purpose: 'WhatsApp webhook listener path override', kind: 'string' },
}

/**
 * Read an environment variable through the registry. Falls back to
 * REGISTRY[name].default (if any) when unset. Unregistered names still work
 * (pass-through) but log nothing extra — prefer adding an entry to REGISTRY.
 */
export function env(name) {
    const entry = REGISTRY[name]
    const raw = process.env[name]
    if (raw !== undefined) return raw
    return entry && 'default' in entry ? entry.default : undefined
}

export function envRegistry() {
    return REGISTRY
}

export function providerEnvKeys() {
    return Object.keys(REGISTRY).filter(k => REGISTRY[k].provider)
}
