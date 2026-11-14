/**
 * Runs the Lambda handler as a local HTTP server against DynamoDB Local, for development.
 *
 *   docker run -d --rm -p 8000:8000 --name interval-timer-dynamodb amazon/dynamodb-local
 *   npm run local
 *
 * Environment (defaults in brackets): PORT [3100], DYNAMODB_ENDPOINT [http://localhost:8000],
 * TABLE_NAME [interval-timer-local], ALLOWED_ORIGIN [http://localhost:4200], HEARTBEAT_MINUTES [10].
 * Log lines are timestamped; an "alive" line every HEARTBEAT_MINUTES and a line on exit show when the server stopped.
 * Creates the table on start if it does not exist. CORS is handled here the way the Function URL handles it in AWS.
 */
import { CreateTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createServer, IncomingMessage } from 'node:http';

process.env['DYNAMODB_ENDPOINT'] ??= 'http://localhost:8000';
process.env['TABLE_NAME'] ??= 'interval-timer-local';

const port = Number(process.env['PORT'] ?? 3100);
const allowedOrigin = process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:4200';
const tableName = process.env['TABLE_NAME'];
/** Minutes between "alive" lines in the log; 0 turns them off. */
const heartbeatMinutes = Number(process.env['HEARTBEAT_MINUTES'] ?? 10);

/** Writes a timestamped line, so the log shows when the server last did something. */
function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

// Records how the process ends. A process killed outright cannot log; then the last "alive" line shows roughly when.
process.on('exit', (code) => log(`Exiting with code ${code}`));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
  process.on(signal, () => {
    log(`Received ${signal}, stopping`);
    process.exit(0);
  });
}
process.on('uncaughtException', (e) => {
  log(`Uncaught exception: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  log(`Unhandled rejection: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});

// Imported after the environment is set, so the handler's store uses DynamoDB Local.
const { createDynamoClient } = await import('../src/dynamo-store.js');
const { handler } = await import('../src/handler.js');

async function ensureTable(): Promise<void> {
  try {
    await createDynamoClient().send(
      new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        BillingMode: 'PROVISIONED',
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      }),
    );
    log(`Created table ${tableName}`);
  } catch (e) {
    if (!(e instanceof ResourceInUseException)) {
      throw e;
    }
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function toEvent(req: IncomingMessage, body: string): APIGatewayProxyEventV2 {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[name.toLowerCase()] = value;
    }
  }
  const query = Object.fromEntries(url.searchParams);
  return {
    rawPath: url.pathname,
    headers,
    queryStringParameters: Object.keys(query).length ? query : undefined,
    body: body || undefined,
    isBase64Encoded: false,
    requestContext: { http: { method: req.method ?? 'GET' } },
  } as unknown as APIGatewayProxyEventV2;
}

await ensureTable();

createServer(async (req, res) => {
  const cors = {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '3600',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  const result = await handler(toEvent(req, await readBody(req)));
  res.writeHead(result.statusCode ?? 200, { ...cors, ...(result.headers as Record<string, string>) });
  res.end(result.body ?? '');
  log(`${req.method} ${req.url} -> ${result.statusCode}`);
}).listen(port, () => {
  log(
    `Storage API on http://localhost:${port} (table ${tableName} at ${process.env['DYNAMODB_ENDPOINT']}, ` +
      `pid ${process.pid})`,
  );
});

if (heartbeatMinutes > 0) {
  const started = Date.now();
  setInterval(
    () => log(`Alive for ${Math.round((Date.now() - started) / 60_000)} min`),
    heartbeatMinutes * 60_000,
  ).unref();
}
