import { BaseAgent, type BaseAgentOptions, type ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { z } from 'zod';
import type { AgentOutput } from '../types';
import { AIMessage, type BaseMessage, ToolMessage } from '@langchain/core/messages';
import { Actors, ExecutionState } from '../event/types';
import {
  ChatModelAuthError,
  ChatModelBadRequestError,
  ChatModelForbiddenError,
  isAbortedError,
  isAuthenticationError,
  isBadRequestError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
import { filterExternalContent } from '../messages/utils';
import { t } from '@extension/i18n';

const logger = createLogger('PlannerAgent');

// Define Zod schema for planner output
export const plannerOutputSchema = z.object({
  observation: z.string(),
  challenges: z.string(),
  done: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
  next_steps: z.string(),
  final_answer: z.string(),
  reasoning: z.string(),
  web_task: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
  awaiting_user: z
    .union([
      z.boolean(),
      z.string().transform(val => {
        const v = val.toLowerCase().trim();
        if (v === 'true') return true;
        if (v === 'false') return false;
        throw new Error('Invalid boolean string');
      }),
    ])
    .optional()
    .default(false),
  user_action_hint: z.string().optional().default(''),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export class PlannerAgent extends BaseAgent<typeof plannerOutputSchema, PlannerOutput> {
  constructor(options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    super(plannerOutputSchema, options, { ...extraOptions, id: 'planner' });
  }

  private sanitizePlannerMessages(messages: BaseMessage[]): BaseMessage[] {
    const sanitized: BaseMessage[] = [];
    for (const message of messages) {
      if (!(message instanceof ToolMessage)) {
        sanitized.push(message);
        continue;
      }
      const previous = sanitized[sanitized.length - 1];
      if (!(previous instanceof AIMessage) || !Array.isArray(previous.tool_calls) || previous.tool_calls.length === 0) {
        logger.debug('Dropping orphan tool message from planner input');
        continue;
      }
      const toolCallId = message.tool_call_id;
      const matched = !toolCallId || previous.tool_calls.some(toolCall => String(toolCall.id) === String(toolCallId));
      if (!matched) {
        logger.debug('Dropping unmatched tool message from planner input');
        continue;
      }
      sanitized.push(message);
    }
    return sanitized;
  }

  async execute(): Promise<AgentOutput<PlannerOutput>> {
    try {
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_START, '规划中...');

      // get all messages from the message manager, state message should be the last one
      const messages = this.context.messageManager.getMessages();
      // Use a sliding history window to reduce planner latency and token usage.
      const historyMessages = messages.slice(1);
      const windowSize = this.context.options.plannerHistoryWindow;
      const plannerHistory = windowSize > 0 ? historyMessages.slice(-windowSize) : historyMessages;
      const sanitizedHistory = this.sanitizePlannerMessages(plannerHistory);
      const plannerMessages = [this.prompt.getSystemMessage(), ...sanitizedHistory];

      if (import.meta.env.DEV) {
        const serializedPlannerMessages = plannerMessages.map(msg => {
          // LangChain message.content can be string | Array<{type,text/..}>.
          const base: Record<string, unknown> = {
            type: msg.getType(),
            content: (msg as unknown as { content?: unknown }).content,
          };

          if ('tool_call_id' in msg) {
            base.tool_call_id = (msg as unknown as { tool_call_id?: unknown }).tool_call_id;
          }
          if ('tool_calls' in msg) {
            base.tool_calls = (msg as unknown as { tool_calls?: unknown }).tool_calls;
          }
          return base;
        });

        logger.debug('Planner input messages (DEV, full)', {
          messageCount: serializedPlannerMessages.length,
          messages: serializedPlannerMessages,
        });
      }

      const modelOutput = await this.invoke(plannerMessages);
      if (!modelOutput) {
        throw new Error('Failed to validate planner output');
      }

      // clean the model output
      const observation = filterExternalContent(modelOutput.observation);
      const final_answer = filterExternalContent(modelOutput.final_answer);
      const next_steps = filterExternalContent(modelOutput.next_steps);
      const challenges = filterExternalContent(modelOutput.challenges);
      const reasoning = filterExternalContent(modelOutput.reasoning);

      let cleanedPlan: PlannerOutput = {
        ...modelOutput,
        observation,
        challenges,
        reasoning,
        final_answer,
        next_steps,
      };

      if (cleanedPlan.awaiting_user) {
        cleanedPlan = {
          ...cleanedPlan,
          done: false,
          final_answer: '',
        };
        if (!cleanedPlan.user_action_hint?.trim()) {
          cleanedPlan = {
            ...cleanedPlan,
            user_action_hint: observation.trim() || t('exec_awaitUserLogin'),
          };
        }
      }

      // If task is done, emit the final answer; otherwise emit next steps or login/verify hint
      const eventMessage = cleanedPlan.done
        ? cleanedPlan.final_answer
        : cleanedPlan.awaiting_user
          ? cleanedPlan.user_action_hint || cleanedPlan.next_steps
          : cleanedPlan.next_steps;
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_OK, eventMessage);
      logger.info('Planner output', JSON.stringify(cleanedPlan, null, 2));

      return {
        id: this.id,
        result: cleanedPlan,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError(errorMessage, error);
      } else if (isBadRequestError(error)) {
        throw new ChatModelBadRequestError(errorMessage, error);
      } else if (isAbortedError(error)) {
        throw new RequestCancelledError(errorMessage);
      } else if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }

      logger.error(`Planning failed: ${errorMessage}`);
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_FAIL, `规划失败: ${errorMessage}`);
      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }
}
