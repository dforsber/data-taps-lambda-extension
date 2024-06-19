import fetch from 'node-fetch';
import { FunctionLogEvent } from '~/aws/events';

const AWS_LAMBDA_FUNCTION_NAME = process.env['AWS_LAMBDA_FUNCTION_NAME'] ?? 'NA';
// const AWS_LAMBDA_FUNCTION_MEMORY_SIZE = process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE'] ?? '0';
const AWS_REGION = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'NA';
const _X_AMZN_TRACE_ID = process.env['_X_AMZN_TRACE_ID'] ?? 'NA';
// const AWS_LAMBDA_FUNCTION_VERSION = process.env['AWS_LAMBDA_FUNCTION_VERSION'] ?? 'NA';
const AWS_LAMBDA_LOG_GROUP_NAME = process.env['AWS_LAMBDA_LOG_GROUP_NAME'] ?? AWS_LAMBDA_FUNCTION_NAME;
const AWS_LAMBDA_LOG_STREAM_NAME = process.env['AWS_LAMBDA_LOG_STREAM_NAME'] ?? new Date().toISOString();

export const dataTapsLogForwarder =
  (token: string, ingestionUrl: string, listener: { logsQueue: FunctionLogEvent[] }) => (): Promise<void> => {
    const logs = listener.logsQueue.splice(0);
    if (logs.length === 0) return Promise.resolve();

    return fetch(ingestionUrl, {
      method: 'POST',
      body: logs
        .map((log) => ({
          time: log.time,
          type: log.type,
          // lambda: `${AWS_LAMBDA_FUNCTION_NAME}:${AWS_LAMBDA_FUNCTION_VERSION}`,
          region: AWS_REGION,
          logGroup: AWS_LAMBDA_LOG_GROUP_NAME,
          logStream: AWS_LAMBDA_LOG_STREAM_NAME,
          x_trace_id: _X_AMZN_TRACE_ID,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          record: log.record,
        }))
        .map((e) => JSON.stringify(e))
        .join('\n'),
      headers: {
        'Content-Type': 'application/x-ndjson',
        'x-bd-authorization': token,
      },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
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
