import { z } from 'zod';

export const externalPingMessageSchema = z.object({
  type: z.literal('ping'),
});

export const externalPublishMessageSchema = z.object({
  type: z.literal('publish'),
  touchpointUrl: z.string().optional(),
  markdown: z.string().optional(),
});

export const externalIncomingMessageSchema = z.union([externalPingMessageSchema, externalPublishMessageSchema]);

export const externalPongResponseSchema = z.object({
  ok: z.literal(true),
  type: z.literal('pong'),
});

export const externalPublishReceivedResponseSchema = z.object({
  ok: z.literal(true),
  type: z.literal('publish_received'),
});

export const externalForbiddenResponseSchema = z.object({
  ok: z.literal(false),
  error: z.literal('forbidden'),
});

export const externalInvalidMessageResponseSchema = z.object({
  ok: z.literal(false),
  error: z.literal('invalid_message'),
});

export const externalDefaultResponseSchema = z.object({
  ok: z.literal(true),
  received: z.literal(true),
});

export const externalResponseSchema = z.union([
  externalPongResponseSchema,
  externalPublishReceivedResponseSchema,
  externalForbiddenResponseSchema,
  externalInvalidMessageResponseSchema,
  externalDefaultResponseSchema,
]);

export type ExternalPingMessage = z.infer<typeof externalPingMessageSchema>;
export type ExternalPublishMessage = z.infer<typeof externalPublishMessageSchema>;
export type ExternalIncomingMessage = z.infer<typeof externalIncomingMessageSchema>;
export type ExternalPongResponse = z.infer<typeof externalPongResponseSchema>;
export type ExternalPublishReceivedResponse = z.infer<typeof externalPublishReceivedResponseSchema>;
export type ExternalForbiddenResponse = z.infer<typeof externalForbiddenResponseSchema>;
export type ExternalInvalidMessageResponse = z.infer<typeof externalInvalidMessageResponseSchema>;
export type ExternalDefaultResponse = z.infer<typeof externalDefaultResponseSchema>;
export type ExternalResponse = z.infer<typeof externalResponseSchema>;
