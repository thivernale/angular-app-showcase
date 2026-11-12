import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DynamoStore } from './dynamo-store.js';
import { DEFAULT_FOLDER_ID, hashKey, Store } from './store.js';
import { isValidId, MAX_BODY_BYTES, validateFolder, validatePreset } from './validate.js';

export const MAX_PRESETS_PER_PROFILE = 200;
export const MAX_FOLDERS_PER_PROFILE = 50;
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

const noContent = (): Response => ({ statusCode: 204, headers: { 'cache-control': 'no-store' } });

/** The `id` query parameter, or undefined when it is missing or not a valid id. */
function queryId(event: APIGatewayProxyEventV2): string | undefined {
  const id = event.queryStringParameters?.['id'];
  return isValidId(id) ? id : undefined;
}

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

      if (path === '/library' && method === 'GET') {
        return json(200, await store.listLibrary(profile));
      }

      if (path === '/presets') {
        switch (method) {
          case 'PUT': {
            const body = readBody(event);
            if (!body.ok) {
              return body.response;
            }
            const result = validatePreset(body.value);
            if (!result.ok) {
              return error(400, result.error);
            }
            const { folderId } = result.preset;
            if (folderId !== DEFAULT_FOLDER_ID && !(await store.folderExists(profile, folderId))) {
              return error(404, 'Folder not found');
            }
            const stored = { ...result.preset, updatedAt: now().toISOString() };
            if (!(await store.putPreset(profile, stored, MAX_PRESETS_PER_PROFILE))) {
              return error(409, `A profile can hold at most ${MAX_PRESETS_PER_PROFILE} presets`);
            }
            return json(200, { preset: stored });
          }

          case 'DELETE': {
            const id = queryId(event);
            if (!id) {
              return error(400, 'id query parameter is required');
            }
            await store.deletePreset(profile, id);
            return noContent();
          }
        }
      }

      if (path === '/folders') {
        switch (method) {
          case 'PUT': {
            const body = readBody(event);
            if (!body.ok) {
              return body.response;
            }
            const result = validateFolder(body.value);
            if (!result.ok) {
              return error(400, result.error);
            }
            const stored = { ...result.folder, updatedAt: now().toISOString() };
            if (!(await store.putFolder(profile, stored, MAX_FOLDERS_PER_PROFILE))) {
              return error(409, `A profile can hold at most ${MAX_FOLDERS_PER_PROFILE} folders`);
            }
            return json(200, { folder: stored });
          }

          case 'DELETE': {
            const id = queryId(event);
            if (!id) {
              return error(400, 'id query parameter is required');
            }
            if (id === DEFAULT_FOLDER_ID) {
              return error(400, 'The default folder cannot be deleted');
            }
            // Also deletes the folder's presets, including ones saved from other devices.
            await store.deleteFolder(profile, id);
            return noContent();
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
