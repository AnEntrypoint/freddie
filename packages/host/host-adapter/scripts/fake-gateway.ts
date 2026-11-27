import { startDynamicFakeGateway, fakeGatewayFinalText } from '__FX_ROOT__/tests/e2e/tmux-helpers.ts'
const gateway = startDynamicFakeGateway((body: string) => {
  const match = body.match(/AGENT_TURN_PROMPT_\d+/)
  return fakeGatewayFinalText(match ? match[0] : 'no-prompt')
}, { models: [{ id: 'openai/gpt-5', type: 'language', tags: ['tool-use'] }] })
await Bun.write(process.env.GATEWAY_INFO as string, gateway.baseUrl + '\n' + gateway.chatUrl + '\n')
setInterval(() => {}, 1000)
