import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { ReasoningEffortId } from '@freddie/freddie-llm'
import { installSettingsSection, settingsNamespace } from '@freddie/freddie-settings'

export const AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE = settingsNamespace('agent-default-model')

export const AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string(),
})

function selection(settings) {
  return {
    provider: settings.provider,
    model: settings.model,
    ...settings.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
  }
}

export class AgentDefaultModelConfig extends Service {
  static Config = z.object({
    provider: z.string().required(),
    model: z.string().required(),
  })

  source

  constructor(ctx, config) {
    super(ctx, 'agentDefaultModel')
    const entry = { provider: config.provider, model: config.model }
    this.source = () => entry
    installSettingsSection(ctx, AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA, entry, {
      setSource: (current) => { this.source = current },
      onChange: () => {},
    })
  }

  currentSelection() {
    return selection(this.source())
  }

  async saveSelection(next) {
    await this.ctx.get('settings')?.replace(AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, {
      provider: next.provider,
      model: next.model,
      ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
    })
  }
}

export default AgentDefaultModelConfig
