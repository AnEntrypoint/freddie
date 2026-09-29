import { ConversationDefinitionRegistry } from './definition-registry.js'

export class ConversationViewRegistry extends ConversationDefinitionRegistry {

  constructor(ctx) {
    super(ctx, 'conversationViews')
  }

  register(definition) {
    return this.registerDefinition(
      definition.target,
      definition,
      `conversation view target "${definition.target}" is already registered`,
      `conversationViews.register(${JSON.stringify(definition.target)})`,
    )
  }
}
