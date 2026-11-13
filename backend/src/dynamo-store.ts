import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { KeyRecord, Library, Store, StoredFolder, StoredPreset } from './store.js';

/**
 * Single-table layout:
 *   key item:    PK = KEY#<sha256 hex>    SK = KEY             profile, label, createdAt
 *   preset item: PK = PROFILE#<profile>   SK = PRESET#<id>     preset (includes folderId), updatedAt
 *   folder item: PK = PROFILE#<profile>   SK = FOLDER#<id>     name, updatedAt
 *   counter:     PK = PROFILE#<profile>   SK = META            presetCount, folderCount
 *
 * The default folder is not stored; presets in it have folderId 'default'.
 */
const PRESET_PREFIX = 'PRESET#';
const FOLDER_PREFIX = 'FOLDER#';
export const keyPk = (keyHash: string) => `KEY#${keyHash}`;
export const profilePk = (profile: string) => `PROFILE#${profile}`;
export const presetSk = (id: string) => `${PRESET_PREFIX}${id}`;
export const folderSk = (id: string) => `${FOLDER_PREFIX}${id}`;
const metaKey = (profile: string) => ({ PK: profilePk(profile), SK: 'META' });

type Counter = 'presetCount' | 'folderCount';

/** Result of `cleanupLegacyPresets` for one profile. */
export interface ProfileCleanup {
  profile: string;
  /** Preset items without an id (from the version that keyed presets by name). */
  legacyPresets: number;
  presetCount: number;
  folderCount: number;
}

/** DynamoDB allows 100 items per transaction; one of them is the counter update. */
const DELETES_PER_TRANSACTION = 99;

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

  async listLibrary(profile: string): Promise<Library> {
    const library: Library = { folders: [], presets: [] };
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': profilePk(profile) },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        const sk = String(item['SK']);
        if (sk.startsWith(PRESET_PREFIX)) {
          const preset = item['preset'] as Partial<StoredPreset> | undefined;
          // Items written before presets had ids (keyed by name) are ignored.
          if (typeof preset?.id === 'string') {
            library.presets.push({ ...(preset as StoredPreset), updatedAt: item['updatedAt'] });
          }
        } else if (sk.startsWith(FOLDER_PREFIX)) {
          library.folders.push({
            id: sk.slice(FOLDER_PREFIX.length),
            name: item['name'],
            updatedAt: item['updatedAt'],
          });
        }
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return library;
  }

  async putPreset(profile: string, preset: StoredPreset, maxPresets: number): Promise<boolean> {
    const { updatedAt, ...rest } = preset;
    const item = { PK: profilePk(profile), SK: presetSk(preset.id), preset: rest, updatedAt };
    return this.putCounted(profile, item, 'presetCount', maxPresets);
  }

  async deletePreset(profile: string, id: string): Promise<void> {
    await this.deleteCounted(profile, presetSk(id), 'presetCount');
  }

  async folderExists(profile: string, id: string): Promise<boolean> {
    const { Item } = await this.db.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: profilePk(profile), SK: folderSk(id) } }),
    );
    return Item !== undefined;
  }

  async putFolder(profile: string, folder: StoredFolder, maxFolders: number): Promise<boolean> {
    const item = { PK: profilePk(profile), SK: folderSk(folder.id), name: folder.name, updatedAt: folder.updatedAt };
    return this.putCounted(profile, item, 'folderCount', maxFolders);
  }

  async renameFolder(profile: string, folder: StoredFolder): Promise<boolean> {
    const item = { PK: profilePk(profile), SK: folderSk(folder.id), name: folder.name, updatedAt: folder.updatedAt };
    try {
      await this.db.send(
        new PutCommand({ TableName: this.tableName, Item: item, ConditionExpression: 'attribute_exists(PK)' }),
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw e;
    }
  }

  async deleteFolder(profile: string, id: string): Promise<void> {
    // Presets first, so a failure part-way leaves the folder in place and the delete can be retried.
    const { presets } = await this.listLibrary(profile);
    const ids = presets.filter((p) => p.folderId === id).map((p) => p.id);
    for (let i = 0; i < ids.length; i += DELETES_PER_TRANSACTION) {
      await this.deletePresets(profile, ids.slice(i, i + DELETES_PER_TRANSACTION));
    }
    await this.deleteCounted(profile, folderSk(id), 'folderCount');
  }

  /**
   * Deletes up to DELETES_PER_TRANSACTION presets with one counter update. If one of them is already gone (deleted
   * from another device meanwhile), the transaction is cancelled and they are deleted one by one instead, so the
   * counter stays exact.
   */
  private async deletePresets(profile: string, ids: string[]): Promise<void> {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            ...ids.map((presetId) => ({
              Delete: {
                TableName: this.tableName,
                Key: { PK: profilePk(profile), SK: presetSk(presetId) },
                ConditionExpression: 'attribute_exists(PK)',
              },
            })),
            {
              Update: {
                TableName: this.tableName,
                Key: metaKey(profile),
                UpdateExpression: 'ADD presetCount :minus',
                ExpressionAttributeValues: { ':minus': -ids.length },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (!cancellationCodes(e).includes('ConditionalCheckFailed')) {
        throw e;
      }
      for (const presetId of ids) {
        await this.deletePreset(profile, presetId);
      }
    }
  }

  /**
   * Creates or replaces an item. A new item is written together with an increment of the profile's counter,
   * so the cap is enforced without reading the whole profile. Returns false, without saving, when the item is
   * new and the counter has reached `max`.
   */
  private async putCounted(
    profile: string,
    item: Record<string, unknown>,
    counter: Counter,
    max: number,
  ): Promise<boolean> {
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
                UpdateExpression: `ADD ${counter} :one`,
                ConditionExpression: `attribute_not_exists(${counter}) OR ${counter} < :max`,
                ExpressionAttributeValues: { ':one': 1, ':max': max },
              },
            },
          ],
        }),
      );
      return true;
    } catch (e) {
      const [itemCheck, counterCheck] = cancellationCodes(e);
      if (itemCheck === 'ConditionalCheckFailed') {
        // The item already exists: replace it; the count does not change.
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

  /** Deletes an item together with a decrement of the profile's counter; does nothing if it is missing. */
  private async deleteCounted(profile: string, sk: string, counter: Counter): Promise<void> {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: this.tableName,
                Key: { PK: profilePk(profile), SK: sk },
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: metaKey(profile),
                UpdateExpression: `ADD ${counter} :minusOne`,
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

  /**
   * Finds preset items without an id (written before presets had ids) and recounts each profile's presets and
   * folders. With `apply`, deletes those items and stores the counts in the profile's counter item; otherwise only
   * reports. Scans the table, and setting the counters races with writes made meanwhile, so run it while the app is
   * not in use.
   */
  async cleanupLegacyPresets(apply: boolean): Promise<ProfileCleanup[]> {
    const profiles = new Map<string, ProfileCleanup>();
    const legacyKeys: { PK: string; SK: string }[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.db.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'begins_with(PK, :profile)',
          ExpressionAttributeValues: { ':profile': 'PROFILE#' },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        const pk = String(item['PK']);
        const sk = String(item['SK']);
        const profile = pk.slice('PROFILE#'.length);
        let entry = profiles.get(profile);
        if (!entry) {
          entry = { profile, legacyPresets: 0, presetCount: 0, folderCount: 0 };
          profiles.set(profile, entry);
        }
        if (sk.startsWith(PRESET_PREFIX)) {
          if (typeof (item['preset'] as { id?: unknown } | undefined)?.id === 'string') {
            entry.presetCount++;
          } else {
            entry.legacyPresets++;
            legacyKeys.push({ PK: pk, SK: sk });
          }
        } else if (sk.startsWith(FOLDER_PREFIX)) {
          entry.folderCount++;
        }
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);

    if (apply) {
      for (const Key of legacyKeys) {
        await this.db.send(new DeleteCommand({ TableName: this.tableName, Key }));
      }
      for (const { profile, presetCount, folderCount } of profiles.values()) {
        await this.db.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: metaKey(profile),
            UpdateExpression: 'SET presetCount = :presets, folderCount = :folders',
            ExpressionAttributeValues: { ':presets': presetCount, ':folders': folderCount },
          }),
        );
      }
    }
    return [...profiles.values()].sort((a, b) => a.profile.localeCompare(b.profile));
  }

  async deleteKey(keyHash: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({ TableName: this.tableName, Key: { PK: keyPk(keyHash), SK: 'KEY' } }),
    );
  }
}
