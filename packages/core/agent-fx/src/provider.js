export function toFxProvider(route, credentialFor) {
  const { name, baseUrl, protocol = 'openai-chat-completions', models, credentialRef } = route
  return {
    provider: { name, baseUrl, protocol, ...models === undefined ? {} : { models } },
    credentials: async () => ({ apiKey: await credentialFor(credentialRef) }),
  }
}
