export function isAzureBaseUrl(url) {
    if (!url) return false
    return /\.openai\.azure\.com\b/i.test(String(url)) || /azure-api\.net\b/i.test(String(url))
}
export function detectFromEnv() {
    const url = process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_BASE_URL
    if (!url) return { azure: false }
    return { azure: isAzureBaseUrl(url), endpoint: url, deployment: process.env.AZURE_OPENAI_DEPLOYMENT, apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview' }
}
