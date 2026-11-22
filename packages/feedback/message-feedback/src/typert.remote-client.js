import { _deepseek_ai_dsh_message_feedback_messageFeedback_delete_parameter_0$schema, _deepseek_ai_dsh_message_feedback_messageFeedback_delete_result$schema, _deepseek_ai_dsh_message_feedback_messageFeedback_list_parameter_0$schema, _deepseek_ai_dsh_message_feedback_messageFeedback_list_result$schema, _deepseek_ai_dsh_message_feedback_messageFeedback_put_parameter_0$schema, _deepseek_ai_dsh_message_feedback_messageFeedback_put_result$schema } from './typert.schemas.js'

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-message-feedback',
  descriptors: [
    {
      id: '@freddie/freddie-message-feedback#messageFeedback/delete',
      service: 'messageFeedback',
      namespace: 'messageFeedback',
      method: 'delete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-message-feedback/types#MessageFeedbackDeleteRequest',
            schema: _deepseek_ai_dsh_message_feedback_messageFeedback_delete_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-message-feedback/types#MessageFeedbackDeleteResult',
        schema: _deepseek_ai_dsh_message_feedback_messageFeedback_delete_result$schema,
      },
      sourceLocation: {"file":"packages/feedback/message-feedback/src/index.ts","line":272,"column":3},
    },
    {
      id: '@freddie/freddie-message-feedback#messageFeedback/list',
      service: 'messageFeedback',
      namespace: 'messageFeedback',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-message-feedback/types#MessageFeedbackListRequest',
            schema: _deepseek_ai_dsh_message_feedback_messageFeedback_list_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-message-feedback/types#MessageFeedbackListResult',
        schema: _deepseek_ai_dsh_message_feedback_messageFeedback_list_result$schema,
      },
      sourceLocation: {"file":"packages/feedback/message-feedback/src/index.ts","line":190,"column":9},
    },
    {
      id: '@freddie/freddie-message-feedback#messageFeedback/put',
      service: 'messageFeedback',
      namespace: 'messageFeedback',
      method: 'put',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-message-feedback/types#MessageFeedbackPutRequest',
            schema: _deepseek_ai_dsh_message_feedback_messageFeedback_put_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-message-feedback/types#MessageFeedbackPutResult',
        schema: _deepseek_ai_dsh_message_feedback_messageFeedback_put_result$schema,
      },
      sourceLocation: {"file":"packages/feedback/message-feedback/src/index.ts","line":206,"column":3},
    },
  ],
}

export default TYPERT_REMOTE
