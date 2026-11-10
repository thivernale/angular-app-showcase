import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DynamoStore } from './dynamo-store.js';
import { hashKey, Store } from './store.js';
import { MAX_BODY_BYTES, validatePreset } from './validate.js';

export const MAX_PRESETS_PER_PROFILE = 200;
const MIN_KEY_LENGTH = 20;
const MAX_KEY_LENGTH = 200;
const THROTTLING_ERRORS = new Set(['ProvisionedThroughputExceededException', 'ThrottlingException']);

type Response = APIGatewayProxyStructuredResultV2;

function json(statusCode: number, body: unknown): Response {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

const error = (statusCode: number, message: string) => json(statusCode, { error: message });

function bearerKey(event: APIGatewayProxyEventV2): string | undefined {
  const header = event.headers?.['authorization'];
  const match = header?.match(/^Bearer (\S+)$/);
  const key = match?.[1];
  if (!key || key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
    return undefined;
  }
  return key;
}

function readBody(event: APIGatewayProxyEventV2): { ok: true; value: unknown } | { ok: false; response: Response } {
  const raw = event.body ?? '';
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, response: error(413, 'Body too large') };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: error(400, 'Body must be valid JSON') };
  }
}

/** Builds the request handler. The store is injected so tests can run without AWS. */
export function createHandler(store: Store, now: () => Date = () => new Date()) {
  return async (event: APIGatewayProxyEventV2): Promise<Response> => {
    try {
      const key = bearerKey(event);
      const keyRecord = key ? await store.getKey(hashKey(key)) : undefined;
      if (!keyRecord) {
        return error(401, 'Missing or invalid key');
      }
      // The profile always comes from the key, never from the request.
      const { profile } = keyRecord;

      const method = event.requestContext.http.method;
      const path = event.rawPath.replace(/\/+$/, '') || '/';

      if (path === '/me' && method === 'GET') {
        return json(200, { profile, label: keyRecord.label });
      }

      if (path === '/presets') {
        switch (method) {
          case 'GET':
            return json(200, { presets: await store.listPresets(profile) });

          case 'PUT': {
            const body = readBody(event);
            if (!body.ok) {
              return body.response;
            }
            const result = validatePreset(body.value);
            if (!result.ok) {
              return error(400, result.error);
            }
            const stored = { ...result.preset, updatedAt: now().toISOString() };
            if (!(await store.putPreset(profile, stored, MAX_PRESETS_PER_PROFILE))) {
              return error(409, `A profile can hold at most ${MAX_PRESETS_PER_PROFILE} presets`);
            }
            return json(200, { preset: stored });
          }

          case 'DELETE': {
            const name = event.queryStringParameters?.['name']?.trim();
            if (!name) {
              return error(400, 'name query parameter is required');
            }
            await store.deletePreset(profile, name);
            return { statusCode: 204, headers: { 'cache-control': 'no-store' } };
          }
        }
      }

      return error(404, 'Not found');
    } catch (e) {
      if (THROTTLING_ERRORS.has((e as { name?: string })?.name ?? '')) {
        // The table's provisioned capacity is used up for the moment; the client retries later.
        return error(503, 'Busy, try again later');
      }
      console.error('Unhandled error', e);
      return error(500, 'Internal error');
    }
  };
}

let defaultHandler: ReturnType<typeof createHandler> | undefined;

/** Lambda entry point. */
export const handler = (event: APIGatewayProxyEventV2): Promise<Response> => {
  defaultHandler ??= createHandler(new DynamoStore(process.env['TABLE_NAME'] ?? ''));
  return defaultHandler(event);
};
