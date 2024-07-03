import fetch from 'node-fetch';
import { FunctionLogEvent } from '~/aws/events';
import retry from 'async-retry';

// See https://awsteele.com/blog/2022/12/15/lambda-extension-environment-variables.html
// const AWS_LAMBDA_FUNCTION_MEMORY_SIZE = process.env['AWS_LAMBDA_FUNCTION_MEMORY_SIZE'] ?? '0';
const AWS_LAMBDA_FUNCTION_VERSION = process.env['AWS_LAMBDA_FUNCTION_VERSION'] ?? 'NA';
const AWS_REGION = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'NA';
const AWS_LAMBDA_FUNCTION_NAME = process.env['AWS_LAMBDA_FUNCTION_NAME'] ?? 'NA';
// NOTE: No AWS_LAMBDA_LOG_GROUP_NAME or AWS_LAMBDA_LOG_STREAM_NAME for extension..
const AWS_LAMBDA_LOG_GROUP_NAME = AWS_LAMBDA_FUNCTION_NAME;
const AWS_LAMBDA_LOG_STREAM_NAME = `${new Date().toISOString()}_${(Math.random() * 1000).toFixed(0)}`;

// NOTE: Fetch these from disk, if function has stored them?
// const AWS_ACCOUNT = process.env['AWS_ACCOUNT'] ?? 'NA';
// const _X_AMZN_TRACE_ID = process.env['_X_AMZN_TRACE_ID'] ?? 'NA';

const staticFields = {
  version: AWS_LAMBDA_FUNCTION_VERSION,
  region: AWS_REGION,
  // account: AWS_ACCOUNT,
  logGroup: AWS_LAMBDA_LOG_GROUP_NAME,
  logStream: AWS_LAMBDA_LOG_STREAM_NAME,
  // x_trace_id: _X_AMZN_TRACE_ID,
};

export async function dataTapsLogForwarder(
  token: string,
  ingestionUrl: string,
  logsQueue: FunctionLogEvent[],
  forceFlush = false,
): Promise<void> {
  const logs = logsQueue.splice(0);
  if (logs.length === 0) return Promise.resolve();
  logs.push({
    time: new Date(),
    type: 'extension', // https://docs.aws.amazon.com/lambda/latest/dg/telemetry-api.html#telemetry-api-messages
    record: {
      level: 'INFO',
      message: `Sending ${logs.length + 1} messages to Data Tap` + (forceFlush ? ' (SHUTDOWN)' : ''),
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  let retryAttempt = 0;
  return retry(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_) => {
      const res = await fetch(ingestionUrl, {
        signal: AbortSignal.timeout(1000),
        method: 'POST',
        body: logs
          .map((log) => ({
            time: log.time,
            type: log.type,
            ...staticFields,
            // record: typeof log.record == 'object' ? JSON.stringify(log.record) : log.record,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            record: log.record,
            retryAttempt,
          }))
          .map((e) => JSON.stringify(e))
          .join('\n'),
        headers: {
          'Content-Type': 'application/x-ndjson',
          'x-bd-authorization': token,
        },
      }).then(async (response) => {
        if (!response.ok) {
          const t = await response.text();
          logs.push({
            time: new Date(),
            type: 'extension',
            record: {
              level: 'ERROR',
              message: `Data Tap error (${retryAttempt}): ${t}`,
            },
          });
          throw new Error(t);
        }
      });
      return res;
    },
    {
      retries: forceFlush ? 12 : 2,
      randomize: false,
      factor: 2, // 20, 40, 80, 150, 150, 150, 150, 150, 150, 150, 150, 150 ~= 1490 ms
      minTimeout: 20,
      maxTimeout: 150,
      // We don't use console.error() as we want to push this message now.. if retries don't work
      // This message gets pushed back to logs as well (unless shutdown).
      onRetry: (error, attempt) => {
        retryAttempt = attempt;
        logs.push({
          time: new Date(),
          type: 'extension',
          record: {
            level: 'ERROR',
            message: `Async retry (${attempt}) error (${error instanceof Error ? error.name : 'NA'}): ${
              error instanceof Error ? error.message : error
            }`,
          },
        });
      },
    },
  ).catch((error) => {
    // NOTE: In case this is forceFlush() call (extension shutdown), then we have lost log messages :(
    //       This can happen if e.g. Data Tap is deleted (i.e. the URL does not respond)
    logs.push({
      time: new Date(),
      type: 'extension', // https://docs.aws.amazon.com/lambda/latest/dg/telemetry-api.html#telemetry-api-messages
      record: {
        level: 'ERROR',
        message: `Error during log forwarding, pushing logs ${logs.length} back onto queue (${
          error instanceof Error ? error.name : ''
        }): ${error instanceof Error ? error.message : error}`,
      },
    });
    logsQueue.unshift(...logs);
  });
}
