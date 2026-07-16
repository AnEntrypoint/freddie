import { env } from '../env.js'

export function isAzureBaseUrl(url) {
    if (!url) return false
    return /\.openai\.azure\.com\b/i.test(String(url)) || /azure-api\.net\b/i.test(String(url))
}
export function detectFromEnv() {
    const url = env('AZURE_OPENAI_ENDPOINT') || env('OPENAI_BASE_URL')
    if (!url) return { azure: false }
    return { azure: isAzureBaseUrl(url), endpoint: url, deployment: env('AZURE_OPENAI_DEPLOYMENT'), apiVersion: env('AZURE_OPENAI_API_VERSION') || '2024-08-01-preview' }
}
