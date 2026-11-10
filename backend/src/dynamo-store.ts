import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { KeyRecord, Store, StoredPreset } from './store.js';

/**
 * Single-table layout:
 *   key item:    PK = KEY#<sha256 hex>    SK = KEY             profile, label, createdAt
 *   preset item: PK = PROFILE#<profile>   SK = PRESET#<name>   preset, updatedAt
 *   counter:     PK = PROFILE#<profile>   SK = META            presetCount
 */
export const keyPk = (keyHash: string) => `KEY#${keyHash}`;
export const profilePk = (profile: string) => `PROFILE#${profile}`;
export const presetSk = (name: string) => `PRESET#${name}`;
const metaKey = (profile: string) => ({ PK: profilePk(profile), SK: 'META' });

/**
 * DynamoDB client for the current environment. Set DYNAMODB_ENDPOINT (e.g. http://localhost:8000) to use
 * DynamoDB Local during development; otherwise the default AWS configuration applies.
 */
export function createDynamoClient(): DynamoDBClient {
  const endpoint = process.env['DYNAMODB_ENDPOINT'];
  return endpoint
    ? new DynamoDBClient({
        endpoint,
        region: 'local',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
    : new DynamoDBClient({});
}

/** Per-item reasons of a cancelled transaction, in the order of its items. */
function cancellationCodes(e: unknown): (string | undefined)[] {
  return e instanceof TransactionCanceledException ? (e.CancellationReasons ?? []).map((r) => r.Code) : [];
}

export class DynamoStore implements Store {
  private readonly db: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client: DynamoDBClient = createDynamoClient(),
  ) {
    this.db = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getKey(keyHash: string): Promise<KeyRecord | undefined> {
    const { Item } = await this.db.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: keyPk(keyHash), SK: 'KEY' } }),
    );
    if (!Item) {
      return undefined;
    }
    return { profile: Item['profile'], label: Item['label'], createdAt: Item['createdAt'] };
  }

  async listPresets(profile: string): Promise<StoredPreset[]> {
    const presets: StoredPreset[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': profilePk(profile), ':sk': 'PRESET#' },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        presets.push({ ...(item['preset'] as StoredPreset), updatedAt: item['updatedAt'] });
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return presets;
  }

  async putPreset(profile: string, preset: StoredPreset, maxPresets: number): Promise<boolean> {
    const { updatedAt, ...rest } = preset;
    const item = { PK: profilePk(profile), SK: presetSk(preset.name), preset: rest, updatedAt };

    // A new preset is written together with an increment of the profile's preset counter, so the
    // cap is enforced without reading every preset of the profile.
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: { TableName: this.tableName, Item: item, ConditionExpression: 'attribute_not_exists(PK)' },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: metaKey(profile),
                UpdateExpression: 'ADD presetCount :one',
                ConditionExpression: 'attribute_not_exists(presetCount) OR presetCount < :max',
                ExpressionAttributeValues: { ':one': 1, ':max': maxPresets },
              },
            },
          ],
        }),
      );
      return true;
    } catch (e) {
      const [presetCheck, counterCheck] = cancellationCodes(e);
      if (presetCheck === 'ConditionalCheckFailed') {
        // The preset already exists: replace it; the count does not change.
        await this.db.send(
          new PutCommand({ TableName: this.tableName, Item: item, ConditionExpression: 'attribute_exists(PK)' }),
        );
        return true;
      }
      if (counterCheck === 'ConditionalCheckFailed') {
        return false;
      }
      throw e;
    }
  }

  async deletePreset(profile: string, name: string): Promise<void> {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: this.tableName,
                Key: { PK: profilePk(profile), SK: presetSk(name) },
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: metaKey(profile),
                UpdateExpression: 'ADD presetCount :minusOne',
                ExpressionAttributeValues: { ':minusOne': -1 },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (cancellationCodes(e)[0] === 'ConditionalCheckFailed') {
        return; // Nothing to delete.
      }
      throw e;
    }
  }

  // --- Admin operations, used only by the local key-management script. ---

  async putKey(keyHash: string, record: KeyRecord): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: keyPk(keyHash), SK: 'KEY', ...record },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }

  /** Lists key records with their hashes. Scans the table; fine for a handful of keys. */
  async listKeys(): Promise<(KeyRecord & { keyHash: string })[]> {
    const keys: (KeyRecord & { keyHash: string })[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.db.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'SK = :sk',
          ExpressionAttributeValues: { ':sk': 'KEY' },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        keys.push({
          keyHash: String(item['PK']).slice('KEY#'.length),
          profile: item['profile'],
          label: item['label'],
          createdAt: item['createdAt'],
        });
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return keys;
  }

  async deleteKey(keyHash: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({ TableName: this.tableName, Key: { PK: keyPk(keyHash), SK: 'KEY' } }),
    );
  }
}
