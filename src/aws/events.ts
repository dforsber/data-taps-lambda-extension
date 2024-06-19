import { z } from 'zod';

export interface InvokeEvent {
  eventType: 'INVOKE';
  deadlineMs: number;
  requestId: string;
  invokedFunctionArn: string;
  tracing: {
    type: string;
    value: string;
  };
}

export interface ShutdownEvent {
  eventType: 'SHUTDOWN';
  shutdownReason: string;
  deadlineMs: string;
}

export type FunctionLogEvent = z.infer<typeof functionLogEventSchema>;

export const functionLogEventSchema = z.object({
  time: z.preprocess((value) => (typeof value === 'string' ? new Date(value) : undefined), z.date()),
  type: z.union([z.literal('function'), z.string().startsWith('platform'), z.literal('extension')]),
  record: z.any(),
});
