/**
 * One-off admin CLI: removes preset items from the version that keyed presets by name (they have no id and the API
 * ignores them) and recounts each profile's presets and folders. Runs with the operator's own AWS credentials.
 *
 *   npm run cleanup-legacy                Report what would change
 *   npm run cleanup-legacy -- --apply     Delete the items and fix the counters
 *
 * The table name comes from --table <name> or the TABLE_NAME environment variable. Run it while the app is not in
 * use: it scans the table, and the counters it sets do not account for writes made meanwhile.
 */
import { createDynamoClient, DynamoStore } from '../src/dynamo-store.js';

function parseArgs(argv: string[]): { table: string; apply: boolean } {
  const rest = [...argv];
  let table = process.env['TABLE_NAME'] ?? '';
  const tableIndex = rest.indexOf('--table');
  if (tableIndex >= 0) {
    table = rest[tableIndex + 1] ?? '';
    rest.splice(tableIndex, 2);
  }
  const apply = rest.includes('--apply');
  const unknown = rest.filter((arg) => arg !== '--apply');
  if (!table || unknown.length > 0) {
    console.error('Usage: npm run cleanup-legacy -- [--table <name>] [--apply]');
    process.exit(1);
  }
  return { table, apply };
}

async function main(): Promise<void> {
  const { table, apply } = parseArgs(process.argv.slice(2));
  const store = new DynamoStore(table, createDynamoClient());
  const profiles = await store.cleanupLegacyPresets(apply);
  if (profiles.length === 0) {
    console.log('No profiles.');
    return;
  }
  console.log('profile\tlegacy presets\tpresets\tfolders');
  for (const p of profiles) {
    console.log(`${p.profile}\t${p.legacyPresets}\t${p.presetCount}\t${p.folderCount}`);
  }
  const legacy = profiles.reduce((sum, p) => sum + p.legacyPresets, 0);
  console.log(
    apply
      ? `\nDeleted ${legacy} legacy preset item(s) and set the counters to the counts above.`
      : `\nDry run: ${legacy} legacy preset item(s) would be deleted. Run again with --apply to change the table.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
