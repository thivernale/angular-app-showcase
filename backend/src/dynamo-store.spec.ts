import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DynamoStore } from './dynamo-store.js';

const ddb = mockClient(DynamoDBDocumentClient);
const preset = { name: 'Tabata', rounds: 8, work: 20, rest: 10, playSound: true, updatedAt: 't' };

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
    it('creates a new preset together with a counter increment', async () => {
      ddb.on(TransactWriteCommand).resolves({});

      expect(await store.putPreset('me', preset, 200)).toBe(true);

      const [put, counter] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(put.Put?.Item).toMatchObject({ PK: 'PROFILE#me', SK: 'PRESET#Tabata', updatedAt: 't' });
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
    it('deletes the preset and decrements the counter', async () => {
      ddb.on(TransactWriteCommand).resolves({});
      await store.deletePreset('me', 'Tabata');

      const [del, counter] = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(del.Delete?.Key).toEqual({ PK: 'PROFILE#me', SK: 'PRESET#Tabata' });
      expect(counter.Update?.ExpressionAttributeValues?.[':minusOne']).toBe(-1);
    });

    it('does nothing when the preset does not exist', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('ConditionalCheckFailed', 'None'));
      await expect(store.deletePreset('me', 'missing')).resolves.toBeUndefined();
    });
  });

  it('lists presets across result pages, leaving out the counter item', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({
        Items: [{ preset: { ...preset, updatedAt: undefined }, updatedAt: 't1' }],
        LastEvaluatedKey: { PK: 'x', SK: 'y' },
      })
      .resolvesOnce({ Items: [{ preset: { ...preset, name: 'EMOM' }, updatedAt: 't2' }] });

    const presets = await store.listPresets('me');

    expect(presets.map((p) => [p.name, p.updatedAt])).toEqual([
      ['Tabata', 't1'],
      ['EMOM', 't2'],
    ]);
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues?.[':sk']).toBe('PRESET#');
  });
});
