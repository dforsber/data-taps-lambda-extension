import { either as E } from 'fp-ts';
import { parseEnvironmentVariables } from '~/env';
import { ZodError } from 'zod';

describe('test parseEnvironment`', () => {
  test('should succeed and populate defaults', () => {
    const env = {
      AWS_LAMBDA_RUNTIME_API: 'http://127.0.0.1:9001/',
      BD_TAP_CLIENT_TOKEN: 'test_token',
    };

    const result = parseEnvironmentVariables(env);

    expect(result).toStrictEqual({
      _tag: 'Right',
      right: {
        AWS_LAMBDA_RUNTIME_API: 'http://127.0.0.1:9001/',
        AWS_LAMBDA_RUNTIME_EXTENSION_API_VERSION: '2020-01-01',
        AWS_LAMBDA_RUNTIME_TELEMETRY_API_VERSION: '2022-07-01',
        AWS_LAMBDA_RUNTIME_TELEMETRY_SCHEMA_VERSION: '2022-12-13',
        EXTENSION_NAME: 'data-taps-lambda-extension',
        BD_DATA_TAP_URL: 'https://lambda-function-url/',
        BD_TAP_CLIENT_TOKEN: 'test_token',
        MAX_BYTES: 262144,
        MAX_ITEMS: 10000,
        NODE_ENV: 'production',
        RECEIVER_ADDRESS: 'sandbox',
        RECEIVER_PORT: 4243,
        TIMEOUT_MS: 1000,
      },
    });
  });

  test('should fail when required fields are missing', () => {
    const env = {};
    const result = parseEnvironmentVariables(env);

    expect(E.isLeft(result) && result.left instanceof ZodError).toStrictEqual(true);
  });
});
