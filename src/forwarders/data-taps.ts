import fetch from 'node-fetch';
import { FunctionLogEvent } from '~/aws/events';
import { function as F, array as A, either as E } from 'fp-ts';
import { z } from 'zod';

const AWS_LAMBDA_FUNCTION_NAME = process.env['AWS_LAMBDA_FUNCTION_NAME'] ?? 'NA';
const AWS_LAMBDA_FUNCTION_MEMORY_SIZE = process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE'] ?? '0';
const AWS_REGION = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'NA';
const _X_AMZN_TRACE_ID = process.env['_X_AMZN_TRACE_ID'] ?? 'NA';
const AWS_LAMBDA_FUNCTION_VERSION = process.env['AWS_LAMBDA_FUNCTION_VERSION'] ?? 'NA';

// @see https://awslabs.github.io/aws-lambda-powertools-typescript/latest/core/logger/#standard-structured-keys
export const powertoolsLogSchema = z
  .object({
    level: z.string(), // Logging level set for the Lambda function's invocation
    message: z.string(), // A descriptive, human-readable representation of this log item
    timestamp: z.string(), // Timestamp string in simplified extended ISO format (ISO 8601)
    service: z.string(), // A unique name identifier of the service this Lambda function belongs to, by default service_undefined
    xray_trace_id: z.string().optional(), // X-Ray Trace ID. Always present in Lambda environment, but not sent locally.
    sampling_rate: z.number().optional(), // When enabled, it prints all the logs of a percentage of invocations, e.g. 10%
    error: z.string().optional(), // Optional - An object containing information about the Error passed to the logger
  })
  .passthrough();

export type PowertoolsLogRecord = z.infer<typeof powertoolsLogSchema>;

export const parseMessageWithPowertoolsLogFormat = (message: string): E.Either<Error, PowertoolsLogRecord> =>
  F.pipe(
    E.tryCatch(
      (): unknown => JSON.parse(message),
      (reason) => new Error(`String is not JSON: ${reason}`),
    ),
    E.chain((entry) => {
      const result = powertoolsLogSchema.safeParse(entry);

      if (result.success) {
        return E.right(result.data);
      } else {
        return E.left(new Error(`Message is not in lambda powertools format`));
      }
    }),
  );

export const dataTapsLogForwarder =
  (token: string, ingestionUrl: string, listener: { logsQueue: FunctionLogEvent[] }) => (): Promise<void> => {
    const logs = listener.logsQueue.splice(0);

    if (logs.length === 0) {
      return Promise.resolve();
    }

    const metadata = {
      lambda: AWS_LAMBDA_FUNCTION_NAME,
      lambda_version: AWS_LAMBDA_FUNCTION_VERSION,
      region: AWS_REGION,
      memory: AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      x_trace_id: _X_AMZN_TRACE_ID,
    };

    return fetch(ingestionUrl, {
      method: 'POST',
      body: F.pipe(
        logs,
        A.map((log) =>
          F.pipe(
            log.record,
            parseMessageWithPowertoolsLogFormat,
            E.fold(
              () => ({
                ...metadata,
                message: log.record,
              }),
              ({ message, ...data }) => ({
                ...metadata,
                message,
                ...data,
              }),
            ),
          ),
        ),
      )
        .map((e) => JSON.stringify(e))
        .join('\n'),
      headers: {
        'Content-Type': 'application/x-ndjson',
        'x-bd-authorization': token,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
      })
      .catch((error) => {
        console.error(
          `Error during log forwarding, pushing logs ${logs.length} back onto queue: ${
            error instanceof Error ? error.message : error
          }`,
        );
        listener.logsQueue.unshift(...logs);
      });
  };
