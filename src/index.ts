#!/usr/bin/env node

import { createExtension } from '~/extension';
import { either as E, function as F, taskEither as TE } from 'fp-ts';
import { parseEnvironmentVariables } from '~/env';
import { createAbortHandler } from '~/abortHandler';
import { startTelemetryHttpListener } from './httpListener';

// Main entrypoint
const main = async () => {
  const abortHandler = createAbortHandler(process);
  const listener = await startTelemetryHttpListener(
    process.env['EXTENSION_NAME'] ?? 'data-taps-lambda-extension',
    process.env['RECEIVER_ADDRESS'] ?? 'sandbox',
    parseInt(process.env['RECEIVER_PORT'] ?? '4243'),
  );

  const runner = await F.pipe(
    parseEnvironmentVariables(),
    TE.fromEither,
    TE.chain((env) => createExtension(abortHandler, env, listener)),
    TE.mapLeft((error) => {
      // Throw early if the extension failed
      throw new Error(`Error during extension creation: ${error.message}`);
    }),
    TE.toUnion,
  )();

  // Consume events until the abort signal tells us to shut down
  while (!abortHandler.signal.aborted) {
    const result = await runner();
    if (E.isLeft(result)) {
      throw result.left;
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
