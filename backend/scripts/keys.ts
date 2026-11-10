/**
 * Local admin CLI for access keys. Runs with the operator's own AWS credentials;
 * the public API has no way to create or revoke keys.
 *
 *   npm run keys -- create <profile> [label]   Create a key and print it once
 *   npm run keys -- list                       List profiles and key labels (never the keys)
 *   npm run keys -- revoke <profile> <label>   Revoke one key
 *
 * The table name comes from --table <name> or the TABLE_NAME environment variable.
 */
import { randomBytes } from 'node:crypto';
import { DynamoStore } from '../src/dynamo-store.js';
import { hashKey } from '../src/store.js';

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function usage(message?: string): never {
  if (message) {
    console.error(`Error: ${message}\n`);
  }
  console.error(
    'Usage: npm run keys -- [--table <name>] create <profile> [label] | list | revoke <profile> <label>',
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { table: string; command: string; args: string[] } {
  const rest = [...argv];
  let table = process.env['TABLE_NAME'] ?? '';
  const tableIndex = rest.indexOf('--table');
  if (tableIndex >= 0) {
    table = rest[tableIndex + 1] ?? '';
    rest.splice(tableIndex, 2);
  }
  if (!table) {
    usage('table name missing: pass --table <name> or set TABLE_NAME');
  }
  const [command = '', ...args] = rest;
  return { table, command, args };
}

function checkName(kind: string, value: string | undefined): string {
  if (!value || !NAME_PATTERN.test(value)) {
    usage(`${kind} must be 1-40 characters of a-z, 0-9, "_" or "-", starting with a letter or digit`);
  }
  return value;
}

async function main(): Promise<void> {
  const { table, command, args } = parseArgs(process.argv.slice(2));
  const store = new DynamoStore(table);

  switch (command) {
    case 'create': {
      const profile = checkName('profile', args[0]);
      const label = checkName('label', args[1] ?? 'default');
      const existing = await store.listKeys();
      if (existing.some((k) => k.profile === profile && k.label === label)) {
        usage(`profile "${profile}" already has a key labelled "${label}"`);
      }
      const key = randomBytes(32).toString('base64url');
      await store.putKey(hashKey(key), { profile, label, createdAt: new Date().toISOString() });
      console.log(`Created key "${label}" for profile "${profile}". It is shown only once:\n\n${key}\n`);
      return;
    }

    case 'list': {
      const keys = await store.listKeys();
      if (keys.length === 0) {
        console.log('No keys.');
        return;
      }
      keys.sort((a, b) => a.profile.localeCompare(b.profile) || a.label.localeCompare(b.label));
      for (const k of keys) {
        console.log(`${k.profile}\t${k.label}\t${k.createdAt}`);
      }
      return;
    }

    case 'revoke': {
      const profile = checkName('profile', args[0]);
      const label = checkName('label', args[1]);
      const match = (await store.listKeys()).find((k) => k.profile === profile && k.label === label);
      if (!match) {
        usage(`no key labelled "${label}" for profile "${profile}"`);
      }
      await store.deleteKey(match.keyHash);
      console.log(`Revoked key "${label}" for profile "${profile}".`);
      return;
    }

    default:
      usage(command ? `unknown command "${command}"` : undefined);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
