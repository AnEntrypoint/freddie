import { Service } from '@freddie/cordis'
import { HarnessError } from '@freddie/freddie-llm'

export class UserQuestionError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'UserQuestionError'
  }
}

export class UserQuestionService extends Service {
  provider

  constructor(ctx) {
    super(ctx, 'userQuestions')
  }

  registerProvider(provider) {
    const dispose = this.ctx.effect(function* () {
      if (this.provider !== undefined) {
        throw new UserQuestionError('a user-questions provider is already registered', 'DUPLICATE_PROVIDER')
      }
      this.provider = provider
      yield () => {
        this.provider = undefined
      }
    }.bind(this), 'userInteraction.registerProvider()')
    return () => void dispose()
  }

  async ask(request) {
    if (request.signal?.aborted) {
      throw new UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED')
    }
    if (request.questions.length === 0) {
      throw new UserQuestionError('ask_user_question requires at least one question', 'EMPTY_QUESTIONS')
    }
    const agent = request.agent
    if (agent !== undefined) {
      const agents = this.ctx.get('agents')
      if (agents === undefined || agents.get(agent.id) !== agent) {
        throw new UserQuestionError(
          'human interaction requires the exact live calling agent when an agent is supplied',
          'CALLER_NOT_LIVE')
      }
      if (!agents.roots().includes(agent)) {
        throw new UserQuestionError(
          'human interaction is unavailable while the calling agent is owned by another live agent; '
          + "include the unresolved question or decision in the child agent's final result",
          'DELEGATED_CALLER')
      }
    }
    for (const question of request.questions) {
      const intent = question.intent
      if (intent === undefined) continue
      if (!(question.options ?? []).some(option => option.label === intent.approve)) {
        throw new UserQuestionError(
          `question ${question.id} declares intent ${intent.kind} whose approve label `
          + `${JSON.stringify(intent.approve)} names none of its options`,
          'BAD_INTENT')
      }
      if (question.detail === undefined) {
        throw new UserQuestionError(
          `question ${question.id} declares intent ${intent.kind} without the detail it reviews`,
          'BAD_INTENT')
      }
    }
    if (this.provider === undefined) {
      throw new UserQuestionError('no user-questions provider is registered', 'NO_PROVIDER')
    }
    return this.provider.ask(request)
  }
}

export default UserQuestionService
