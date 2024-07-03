import fetchMock from 'jest-fetch-mock';
import { startTelemetryHttpListener, TelemetryHttpListener } from '~/httpListener';
import fetch from 'node-fetch';

const EXTENSION_NAME = 'test-extension';
const serverEndpoint = new URL('http://localhost:9324');

const startServer = () =>
  startTelemetryHttpListener(EXTENSION_NAME, serverEndpoint.hostname, Number(serverEndpoint.port));

describe('test http logs listener', () => {
  let listener: TelemetryHttpListener;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    listener = await startServer();
    fetchMock.disableMocks();
    fetchMock.dontMock();
  });

  afterAll((done) => {
    fetchMock.enableMocks();
    fetchMock.mockReset();
    listener.server.close(done);
  });

  afterEach(() => {
    listener.logsQueue.splice(0);
  });

  test('http server should receive logs', async () => {
    const response = await fetch('http://localhost:9324', {
      method: 'POST',
      body: JSON.stringify([
        {
          type: 'function',
          time: '2022-10-12T00:03:50.000Z',
          record: '[INFO] Hello world, I am a function!',
        },
      ]),
    });

    expect(response.status).toBe(200);
    expect(listener.logsQueue.length).toBe(0);
  });

  test.only('http server should return status 200 on malformed logs', async () => {
    const response = await fetch('http://localhost:9324', {
      method: 'POST',
      body: '[{"type":"function","time":,"record":{}}]',
    });
    expect(response.status).toBe(200);
    expect(listener.logsQueue.length).toBe(1);
    console.log(listener.logsQueue);
  });
});
