import { z } from 'zod';
import { externalPublishMessageSchema } from './external';

export const sidePanelExecutionMessageSchema = z
  .object({
    type: z.literal('execution'),
  })
  .passthrough();

export const sidePanelExecutionAgentEventSchema = z.object({
  type: z.literal('execution'),
  actor: z.enum(['system', 'user', 'planner', 'navigator', 'validator']),
  state: z.enum([
    'task.start',
    'task.ok',
    'task.fail',
    'task.pause',
    'task.resume',
    'task.cancel',
    'step.start',
    'step.ok',
    'step.fail',
    'step.cancel',
    'act.start',
    'act.ok',
    'act.fail',
  ]),
  data: z.object({
    taskId: z.string(),
    step: z.number(),
    maxSteps: z.number(),
    details: z.string(),
  }),
  timestamp: z.number(),
});

export const sidePanelErrorMessageSchema = z.object({
  type: z.literal('error'),
  error: z.string().optional(),
});

export const sidePanelSpeechToTextResultMessageSchema = z.object({
  type: z.literal('speech_to_text_result'),
  text: z.string().optional(),
});

export const sidePanelSpeechToTextErrorMessageSchema = z.object({
  type: z.literal('speech_to_text_error'),
  error: z.string().optional(),
});

export const sidePanelHeartbeatAckMessageSchema = z.object({
  type: z.literal('heartbeat_ack'),
});

export const sidePanelExternalPublishReceivedMessageSchema = z.object({
  type: z.literal('external_publish_received'),
  message: z.string(),
  payload: externalPublishMessageSchema,
  from: z.string().optional(),
  timestamp: z.number(),
});

export const sidePanelInternalMessageSchema = z.union([
  sidePanelExecutionMessageSchema,
  sidePanelErrorMessageSchema,
  sidePanelSpeechToTextResultMessageSchema,
  sidePanelSpeechToTextErrorMessageSchema,
  sidePanelExternalPublishReceivedMessageSchema,
  sidePanelHeartbeatAckMessageSchema,
]);

export type SidePanelExecutionMessage = z.infer<typeof sidePanelExecutionMessageSchema>;
export type SidePanelExecutionAgentEventMessage = z.infer<typeof sidePanelExecutionAgentEventSchema>;
export type SidePanelErrorMessage = z.infer<typeof sidePanelErrorMessageSchema>;
export type SidePanelSpeechToTextResultMessage = z.infer<typeof sidePanelSpeechToTextResultMessageSchema>;
export type SidePanelSpeechToTextErrorMessage = z.infer<typeof sidePanelSpeechToTextErrorMessageSchema>;
export type SidePanelHeartbeatAckMessage = z.infer<typeof sidePanelHeartbeatAckMessageSchema>;
export type SidePanelExternalPublishReceivedMessage = z.infer<typeof sidePanelExternalPublishReceivedMessageSchema>;
export type SidePanelInternalMessage = z.infer<typeof sidePanelInternalMessageSchema>;
