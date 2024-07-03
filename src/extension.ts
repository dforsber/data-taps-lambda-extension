import { function as F, taskEither as TE } from 'fp-ts';
import { EnvironmentVars } from '~/env';
import { pollForNextEvent, registerExtension } from '~/aws/api';
import { subscribeTelemetry, SubscriptionBody } from '~/aws/subscribe';
import { dataTapsLogForwarder } from '~/forwarders/data-taps';
import { AbortHandler } from '~/abortHandler';
import { FunctionLogEvent } from './aws/events';
import http from 'http';

// noinspection HttpUrlsUsage
export const createExtension = (
  abortHandler: AbortHandler,
  env: EnvironmentVars,
  listener: { logsQueue: FunctionLogEvent[]; server: http.Server },
): TE.TaskEither<Error, TE.TaskEither<Error, void>> => {
  return F.pipe(
    {
      ...env,
      extensionBaseUrl: `http://${env.AWS_LAMBDA_RUNTIME_API}/${env.AWS_LAMBDA_RUNTIME_EXTENSION_API_VERSION}`,
      telemetryBaseUrl: `http://${env.AWS_LAMBDA_RUNTIME_API}/${env.AWS_LAMBDA_RUNTIME_TELEMETRY_API_VERSION}`,
    },
    TE.of,
    TE.bind('extensionId', ({ extensionBaseUrl, EXTENSION_NAME }) =>
      registerExtension(extensionBaseUrl, EXTENSION_NAME),
    ),
    TE.chainFirst(
      ({
        telemetryBaseUrl,
        extensionId,
        RECEIVER_ADDRESS,
        RECEIVER_PORT,
        AWS_LAMBDA_RUNTIME_TELEMETRY_SCHEMA_VERSION,
        TIMEOUT_MS,
        MAX_BYTES,
        MAX_ITEMS,
      }) =>
        F.pipe(
          <SubscriptionBody>{
            schemaVersion: AWS_LAMBDA_RUNTIME_TELEMETRY_SCHEMA_VERSION,
            destination: {
              protocol: 'HTTP',
              URI: `http://${RECEIVER_ADDRESS}:${RECEIVER_PORT}`,
            },
            types: ['platform', 'function', 'extension'],
            buffering: {
              timeoutMs: TIMEOUT_MS,
              maxBytes: MAX_BYTES,
              maxItems: MAX_ITEMS,
            },
          },
          (body) => subscribeTelemetry(telemetryBaseUrl, extensionId, body),
        ),
    ),
    TE.map(({ extensionId, extensionBaseUrl }) =>
      F.pipe(
        pollForNextEvent(extensionId, extensionBaseUrl, abortHandler.signal), //
        TE.chainW((event) =>
          TE.tryCatch(
            async () => {
              switch (event.eventType) {
                case 'INVOKE':
                  // console.log(`[${EXTENSION_NAME}] Received INVOKE event`);
                  return await dataTapsLogForwarder(
                    process?.env['BD_TAP_CLIENT_TOKEN'] ?? 'NA',
                    process?.env['BD_DATA_TAP_URL'] ?? 'NA',
                    listener.logsQueue,
                    false,
                  );
                case 'SHUTDOWN':
                default:
                  // console.log(`[${EXTENSION_NAME}] Shutting down due to event ${event.eventType}`);
                  // Close the HTTP server, no more events are coming
                  listener.server.close();
                  // Raise the abort signal to tell the main loop to stop
                  abortHandler.abort();
                  return await dataTapsLogForwarder(
                    process?.env['BD_TAP_CLIENT_TOKEN'] ?? 'NA',
                    process?.env['BD_DATA_TAP_URL'] ?? 'NA',
                    listener.logsQueue,
                    true,
                  );
              }
            },
            () => new Error(),
          ),
        ),
      ),
    ),
  );
};
