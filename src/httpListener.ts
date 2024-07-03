/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import http from 'http';
import { FunctionLogEvent } from '~/aws/events';
// import { dataTapsLogForwarder } from './forwarders/data-taps';

export interface TelemetryHttpListener {
  logsQueue: FunctionLogEvent[];
  server: http.Server;
}

// HTTP server for the logs subscription
// AWS Lambda Telemetry API will POST the logs to this server
export async function startTelemetryHttpListener(
  EXTENSION_NAME: string,
  address: string,
  port: number,
): Promise<{ logsQueue: FunctionLogEvent[]; server: http.Server }> {
  try {
    const logsQueue: FunctionLogEvent[] = [];
    const server = http.createServer((request, response) => {
      switch (request.method) {
        case 'POST': {
          let body = '';
          request.on('data', (data) => (body += data));
          request.on('end', () => {
            let parsedLogs = [];
            try {
              parsedLogs = JSON.parse(body);
              if (Array.isArray(parsedLogs) && parsedLogs.length > 0) logsQueue.push(...parsedLogs);
            } catch (error) {
              const message = `[${EXTENSION_NAME}] Error processing/parsing request: ${error}`;
              logsQueue.push({ time: new Date(), type: 'extension', record: { level: 'ERROR', message } });
            }
            response.writeHead(200);
            response.end();
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            /*
            dataTapsLogForwarder(
              process.env['BD_TAP_CLIENT_TOKEN'] ?? 'NA',
              process.env['BD_DATA_TAP_URL'] ?? 'NA',
              logsQueue,
              false,
            )
              .then(() => {
                response.writeHead(200);
              })
              .catch((error) => {
                response.writeHead(400);
                const message = `[${EXTENSION_NAME}] Error processing request: ${error}`;
                logsQueue.push({ time: new Date(), type: 'extension', record: { level: 'ERROR', message } });
              })
              .finally(() => {
                response.end();
              });
              */
          });
          break;
        }
        case 'GET':
          response.writeHead(200);
          response.end();
          break;
      }
    });

    server.on('error', (error) => {
      throw new Error(`Failed to start http logging listener: ${error.message}`);
    });

    await new Promise((resolve) => server.listen(port, address, undefined, () => resolve(0)));

    return { logsQueue, server };
  } catch (error: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    throw new Error(`Failed to start http logging listener: ${error?.message}`);
  }
}
