import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
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
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DynamoStore } from './dynamo-store.js';

const ddb = mockClient(DynamoDBDocumentClient);
const preset = {
  id: 'p1',
  folderId: 'default',
  name: 'Tabata',
  rounds: 8,
  work: 20,
  rest: 10,
  playSound: true,
  updatedAt: 't',
};
const folder = { id: 'f1', name: 'KB', updatedAt: 't' };

function cancelled(...codes: string[]) {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe('DynamoStore', () => {
  let store: DynamoStore;

  beforeEach(() => {
    ddb.reset();
    store = new DynamoStore('table');
  });

  afterEach(() => ddb.reset());

  describe('putPreset', () => {
    it('keys the preset by its id, not its name', async () => {
      ddb.on(TransactWriteCommand).resolves({});

      await store.putPreset('me', preset, 200);

      const [put] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(put.Put?.Item?.['SK']).toBe('PRESET#p1');
    });

    it('creates a new preset together with a counter increment', async () => {
      ddb.on(TransactWriteCommand).resolves({});

      expect(await store.putPreset('me', preset, 200)).toBe(true);

      const [put, counter] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(put.Put?.Item).toMatchObject({ PK: 'PROFILE#me', SK: 'PRESET#p1', updatedAt: 't' });
      expect(put.Put?.Item?.['preset']).not.toHaveProperty('updatedAt');
      expect(counter.Update?.Key).toEqual({ PK: 'PROFILE#me', SK: 'META' });
      expect(counter.Update?.ExpressionAttributeValues?.[':max']).toBe(200);
    });

    it('replaces an existing preset without counting it again', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('ConditionalCheckFailed', 'None'));
      ddb.on(PutCommand).resolves({});

      expect(await store.putPreset('me', preset, 200)).toBe(true);
      expect(ddb.commandCalls(PutCommand)[0].args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
    });

    it('refuses a new preset once the profile is full', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('None', 'ConditionalCheckFailed'));

      expect(await store.putPreset('me', preset, 200)).toBe(false);
      expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
    });

    it('rethrows other failures', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('ThrottlingError', 'None'));
      await expect(store.putPreset('me', preset, 200)).rejects.toThrow();
    });
  });

  describe('deletePreset', () => {
    it('deletes the preset by id and decrements the counter', async () => {
      ddb.on(TransactWriteCommand).resolves({});
      await store.deletePreset('me', 'p1');

      const [del, counter] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(del.Delete?.Key).toEqual({ PK: 'PROFILE#me', SK: 'PRESET#p1' });
      expect(counter.Update?.UpdateExpression).toBe('ADD presetCount :minusOne');
      expect(counter.Update?.ExpressionAttributeValues?.[':minusOne']).toBe(-1);
    });

    it('does nothing when the preset does not exist', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('ConditionalCheckFailed', 'None'));
      await expect(store.deletePreset('me', 'missing')).resolves.toBeUndefined();
    });
  });

  describe('listLibrary', () => {
    it('splits the profile items into folders and presets with one query', async () => {
      ddb.on(QueryCommand).resolves({
        Items: [
          { PK: 'PROFILE#me', SK: 'FOLDER#f1', name: 'KB', updatedAt: 't0' },
          { PK: 'PROFILE#me', SK: 'META', presetCount: 2, folderCount: 1 },
          { PK: 'PROFILE#me', SK: 'PRESET#p1', preset: { ...preset, updatedAt: undefined }, updatedAt: 't1' },
          { PK: 'PROFILE#me', SK: 'PRESET#Tabata', preset: { name: 'Tabata', rounds: 1 }, updatedAt: 't2' },
        ],
      });

      const library = await store.listLibrary('me');

      expect(library.folders).toEqual([{ id: 'f1', name: 'KB', updatedAt: 't0' }]);
      expect(library.presets.map((p) => [p.id, p.name, p.updatedAt])).toEqual([['p1', 'Tabata', 't1']]);
      const calls = ddb.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.KeyConditionExpression).toBe('PK = :pk');
      expect(calls[0].args[0].input.ExpressionAttributeValues).toEqual({ ':pk': 'PROFILE#me' });
    });

    it('reads across result pages', async () => {
      ddb
        .on(QueryCommand)
        .resolvesOnce({
          Items: [{ SK: 'PRESET#p1', preset: { ...preset, updatedAt: undefined }, updatedAt: 't1' }],
          LastEvaluatedKey: { PK: 'x', SK: 'y' },
        })
        .resolvesOnce({
          Items: [{ SK: 'PRESET#p2', preset: { ...preset, id: 'p2', name: 'EMOM' }, updatedAt: 't2' }],
        });

      const { presets } = await store.listLibrary('me');

      expect(presets.map((p) => [p.name, p.updatedAt])).toEqual([
        ['Tabata', 't1'],
        ['EMOM', 't2'],
      ]);
      expect(ddb.commandCalls(QueryCommand)[1].args[0].input.ExclusiveStartKey).toEqual({ PK: 'x', SK: 'y' });
    });
  });

  describe('folderExists', () => {
    it('reads the folder item', async () => {
      ddb.on(GetCommand).resolves({ Item: { PK: 'PROFILE#me', SK: 'FOLDER#f1' } });

      expect(await store.folderExists('me', 'f1')).toBe(true);
      expect(ddb.commandCalls(GetCommand)[0].args[0].input.Key).toEqual({ PK: 'PROFILE#me', SK: 'FOLDER#f1' });
    });

    it('is false when the folder is missing', async () => {
      ddb.on(GetCommand).resolves({});
      expect(await store.folderExists('me', 'f1')).toBe(false);
    });
  });

  describe('putFolder', () => {
    it('creates a new folder together with a counter increment', async () => {
      ddb.on(TransactWriteCommand).resolves({});

      expect(await store.putFolder('me', folder, 50)).toBe(true);

      const [put, counter] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(put.Put?.Item).toEqual({ PK: 'PROFILE#me', SK: 'FOLDER#f1', name: 'KB', updatedAt: 't' });
      expect(put.Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
      expect(counter.Update?.Key).toEqual({ PK: 'PROFILE#me', SK: 'META' });
      expect(counter.Update?.UpdateExpression).toBe('ADD folderCount :one');
      expect(counter.Update?.ConditionExpression).toBe('attribute_not_exists(folderCount) OR folderCount < :max');
      expect(counter.Update?.ExpressionAttributeValues?.[':max']).toBe(50);
    });

    it('replaces an existing folder without counting it again', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('ConditionalCheckFailed', 'None'));
      ddb.on(PutCommand).resolves({});

      expect(await store.putFolder('me', folder, 50)).toBe(true);
      const put = ddb.commandCalls(PutCommand)[0].args[0].input;
      expect(put.Item).toEqual({ PK: 'PROFILE#me', SK: 'FOLDER#f1', name: 'KB', updatedAt: 't' });
      expect(put.ConditionExpression).toBe('attribute_exists(PK)');
    });

    it('refuses a new folder once the profile has the maximum', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('None', 'ConditionalCheckFailed'));

      expect(await store.putFolder('me', folder, 50)).toBe(false);
      expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
    });

    it('rethrows other failures', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('ThrottlingError', 'None'));
      await expect(store.putFolder('me', folder, 50)).rejects.toThrow();
    });
  });

  describe('renameFolder', () => {
    it('replaces an existing folder only', async () => {
      ddb.on(PutCommand).resolves({});

      expect(await store.renameFolder('me', folder)).toBe(true);
      const put = ddb.commandCalls(PutCommand)[0].args[0].input;
      expect(put.Item).toEqual({ PK: 'PROFILE#me', SK: 'FOLDER#f1', name: 'KB', updatedAt: 't' });
      expect(put.ConditionExpression).toBe('attribute_exists(PK)');
      expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });

    it('is false when the folder does not exist', async () => {
      ddb.on(PutCommand).rejects(new ConditionalCheckFailedException({ message: 'no', $metadata: {} }));
      expect(await store.renameFolder('me', folder)).toBe(false);
    });

    it('rethrows other failures', async () => {
      ddb.on(PutCommand).rejects(new Error('boom'));
      await expect(store.renameFolder('me', folder)).rejects.toThrow('boom');
    });
  });

  describe('deleteFolder', () => {
    const presetItems = (count: number, folderId = 'f1') =>
      Array.from({ length: count }, (_, i) => ({
        SK: `PRESET#p${i}`,
        preset: { ...preset, id: `p${i}`, folderId },
        updatedAt: 't',
      }));

    it('deletes many presets in transactions of at most 99 with one counter update each', async () => {
      ddb.on(QueryCommand).resolves({ Items: [...presetItems(150), ...presetItems(3, 'default')] });
      ddb.on(TransactWriteCommand).resolves({});

      await store.deleteFolder('me', 'f1');

      const transactions = ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems!);
      expect(transactions.map((t) => t.length)).toEqual([100, 52, 2]);
      const first = transactions[0];
      expect(first.slice(0, 99).every((item) => item.Delete?.ConditionExpression === 'attribute_exists(PK)')).toBe(
        true,
      );
      expect(first[99].Update?.UpdateExpression).toBe('ADD presetCount :minus');
      expect(first[99].Update?.ExpressionAttributeValues?.[':minus']).toBe(-99);
      expect(transactions[1][51].Update?.ExpressionAttributeValues?.[':minus']).toBe(-51);
      expect(transactions[2][0].Delete?.Key).toEqual({ PK: 'PROFILE#me', SK: 'FOLDER#f1' });
    });

    it('falls back to single deletes when a preset is already gone', async () => {
      ddb.on(QueryCommand).resolves({ Items: presetItems(2) });
      ddb
        .on(TransactWriteCommand)
        .rejectsOnce(cancelled('None', 'ConditionalCheckFailed', 'None'))
        .resolvesOnce({}) // p0
        .rejectsOnce(cancelled('ConditionalCheckFailed', 'None')) // p1 already gone
        .resolves({}); // folder

      await store.deleteFolder('me', 'f1');

      const transactions = ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems!);
      expect(transactions.map((t) => t[0].Delete?.Key?.['SK'])).toEqual([
        'PRESET#p0',
        'PRESET#p0',
        'PRESET#p1',
        'FOLDER#f1',
      ]);
    });

    it('rethrows other transaction failures', async () => {
      ddb.on(QueryCommand).resolves({ Items: presetItems(2) });
      ddb.on(TransactWriteCommand).rejects(cancelled('ThrottlingError', 'None', 'None'));

      await expect(store.deleteFolder('me', 'f1')).rejects.toThrow();
    });

    it('deletes the presets in the folder, then the folder with a counter decrement', async () => {
      ddb.on(QueryCommand).resolves({
        Items: [
          { SK: 'FOLDER#f1', name: 'KB', updatedAt: 't' },
          { SK: 'PRESET#p1', preset: { ...preset, folderId: 'f1' }, updatedAt: 't' },
          { SK: 'PRESET#p2', preset: { ...preset, id: 'p2', folderId: 'default' }, updatedAt: 't' },
        ],
      });
      ddb.on(TransactWriteCommand).resolves({});

      await store.deleteFolder('me', 'f1');

      const transactions = ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems!);
      expect(transactions).toHaveLength(2);
      const [presetDelete, presetCounter] = transactions[0];
      expect(presetDelete.Delete?.Key).toEqual({ PK: 'PROFILE#me', SK: 'PRESET#p1' });
      expect(presetCounter.Update?.UpdateExpression).toBe('ADD presetCount :minus');
      expect(presetCounter.Update?.ExpressionAttributeValues?.[':minus']).toBe(-1);
      const [folderDelete, folderCounter] = transactions[1];
      expect(folderDelete.Delete?.Key).toEqual({ PK: 'PROFILE#me', SK: 'FOLDER#f1' });
      expect(folderDelete.Delete?.ConditionExpression).toBe('attribute_exists(PK)');
      expect(folderCounter.Update?.Key).toEqual({ PK: 'PROFILE#me', SK: 'META' });
      expect(folderCounter.Update?.UpdateExpression).toBe('ADD folderCount :minusOne');
      expect(folderCounter.Update?.ExpressionAttributeValues?.[':minusOne']).toBe(-1);
    });

    it('does nothing when the folder does not exist', async () => {
      ddb.on(QueryCommand).resolves({ Items: [] });
      ddb.on(TransactWriteCommand).rejects(cancelled('ConditionalCheckFailed', 'None'));

      await expect(store.deleteFolder('me', 'missing')).resolves.toBeUndefined();
    });
  });

  describe('cleanupLegacyPresets', () => {
    function scanPages() {
      ddb
        .on(ScanCommand)
        .resolvesOnce({
          Items: [
            { PK: 'PROFILE#me', SK: 'META', presetCount: 5, folderCount: 0 },
            { PK: 'PROFILE#me', SK: 'PRESET#Tabata', preset: { name: 'Tabata' } },
            { PK: 'PROFILE#me', SK: 'PRESET#p1', preset },
          ],
          LastEvaluatedKey: { PK: 'PROFILE#me', SK: 'PRESET#p1' },
        })
        .resolvesOnce({
          Items: [
            { PK: 'PROFILE#me', SK: 'FOLDER#f1', name: 'KB' },
            { PK: 'PROFILE#you', SK: 'PRESET#p2', preset: { ...preset, id: 'p2' } },
          ],
        });
    }

    it('reports legacy items and real counts without writing by default', async () => {
      scanPages();

      expect(await store.cleanupLegacyPresets(false)).toEqual([
        { profile: 'me', legacyPresets: 1, presetCount: 1, folderCount: 1 },
        { profile: 'you', legacyPresets: 0, presetCount: 1, folderCount: 0 },
      ]);
      expect(ddb.commandCalls(ScanCommand)[0].args[0].input.FilterExpression).toBe('begins_with(PK, :profile)');
      expect(ddb.commandCalls(DeleteCommand)).toHaveLength(0);
      expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('deletes the legacy items and sets the counters when applied', async () => {
      scanPages();
      ddb.on(DeleteCommand).resolves({});
      ddb.on(UpdateCommand).resolves({});

      await store.cleanupLegacyPresets(true);

      expect(ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input.Key)).toEqual([
        { PK: 'PROFILE#me', SK: 'PRESET#Tabata' },
      ]);
      const updates = ddb.commandCalls(UpdateCommand).map((c) => c.args[0].input);
      expect(updates.map((u) => [u.Key, u.ExpressionAttributeValues])).toEqual([
        [{ PK: 'PROFILE#me', SK: 'META' }, { ':presets': 1, ':folders': 1 }],
        [{ PK: 'PROFILE#you', SK: 'META' }, { ':presets': 1, ':folders': 0 }],
      ]);
    });
  });
});
