# Interval Timer Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group saved interval-timer workouts into user-defined folders, identify workouts by generated ids
(rename in place, names may repeat across folders, auto-renamed within a folder), in local and cloud mode.

**Architecture:** The frontend owns all behaviour (folders, ids, save rules, auto-renaming) on top of
`localStorage`; `IntervalTimerConfigService` keeps one library (folders + presets) per storage and, in cloud mode,
queues id-keyed changes to the API. The backend stores presets and folders as items under the profile's partition
(`PRESET#<id>`, `FOLDER#<id>`), serves the whole library in one query and cascades folder deletes.

**Tech Stack:** Angular 21 (standalone, signals, Vitest via `ng test`), TypeScript Lambda + DynamoDB
(`@aws-sdk/lib-dynamodb`, Vitest, `aws-sdk-client-mock`).

**Spec:** `docs/interval-timer-folders.md`

## Global Constraints

- Default folder: id `default`, name `My workouts`, always present, listed first, never renamed or deleted, never
  stored as a folder record.
- Ids: 1-64 characters of `[A-Za-z0-9-]`; generated on the device.
- Limits: 200 presets per profile (unchanged); 50 folders per profile, default not counted (`409`); folder name
  1-40 characters after trimming, unique per profile case-insensitively (including `My workouts`), refused with a
  message on the device; workout name max 100 including any ` (n)` suffix.
- Auto-rename: a clash with another workout (different id) in the same folder, compared case-insensitively, gets
  `" (2)"`, `" (3)"`, … (first free number). Never overwrite, never refuse.
- No browser dialogs (`alert`/`confirm`/`prompt`); all folder prompts are inline.
- Everything must work in local (anonymous) mode; cloud mode only persists and syncs.
- Commit messages: plain descriptive sentences (repo style, no `feat:` prefixes), ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by path; never stage `.superpowers/` or
  `src/environments/environment.development.ts`. Do not push.
- Root tests: `npm test -- --no-watch --include <spec>`; full: `npm run test:ci`, `npm run lint`, `npm run build`.
  Backend: `cd backend && npm test && npm run typecheck`.

## Review Focus

1. **Page served over plain HTTP on a LAN address** (`npm start` binds `0.0.0.0`; phones): `crypto.randomUUID` is
   missing outside secure contexts. Saving must still work → `newId()` fallback (Task 4).
2. **Existing local presets without ids:** they must get ids once and keep them across reloads, or links and the
   loaded workout break on every reload → upgrade is written back (Task 5).
3. **Open folder no longer exists** (deleted on another device, then synced; or a stale remembered id): the default
   folder opens instead of an empty, unnamed list (Task 6).
4. **Auto-rename edges:** renaming a workout to its own name in another case must not add ` (2)`; an existing
   `"Tabata (2)"` makes the next clash `"Tabata (3)"`; a 100-character name still fits with its suffix (Task 4/5).
5. **Offline folder work:** a folder created offline and a workout saved into it must replay as `PUT /folders` before
   `PUT /presets`; queues from the name-keyed version must be ignored, not replayed (Task 6).

---

### Task 1: Backend validation for ids, folder ids and folders

**Files:**
- Modify: `backend/src/store.ts` (types only)
- Modify: `backend/src/validate.ts`
- Test: `backend/src/validate.spec.ts`

**Interfaces:**
- Produces (`store.ts`): `export const DEFAULT_FOLDER_ID = 'default'`; `Preset` gains `id: string; folderId: string`;
  `export interface Folder { id: string; name: string }`; `export interface StoredFolder extends Folder { updatedAt: string }`.
- Produces (`validate.ts`): `export const MAX_FOLDER_NAME_LENGTH = 40`; `export const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/`;
  `export function isValidId(value: unknown): value is string`; `validatePreset` now requires `id` and `folderId`
  (both `isValidId`); `export function validateFolder(input: unknown): { ok: true; folder: Folder } | { ok: false; error: string }`
  (id valid and not `default`; name trimmed, 1-40; unknown fields dropped).

- [ ] **Step 1: Write the failing tests.** In `validate.spec.ts` add `id: 'p1', folderId: 'default'` to `valid`, and add:
  - `rejects` cases: `['a missing id', { ...valid, id: undefined }]`, `['an id with a slash', { ...valid, id: 'a/b' }]`,
    `['a long id', { ...valid, id: 'a'.repeat(65) }]`, `['a missing folderId', { ...valid, folderId: undefined }]`.
  - `describe('validateFolder')`: accepts `{ id: 'f1', name: '  Kettlebell  ', extra: 1 }` →
    `{ ok: true, folder: { id: 'f1', name: 'Kettlebell' } }`; rejects `{ id: 'default', name: 'X' }`,
    `{ id: 'f1', name: '   ' }`, `{ id: 'f1', name: 'n'.repeat(41) }`, `{ name: 'X' }`, `'x'`.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/validate.spec.ts` → new cases FAIL.
- [ ] **Step 3: Implement** the types and functions above.
- [ ] **Step 4: Run** `cd backend && npx vitest run src/validate.spec.ts` → PASS (other backend specs may fail to
  compile until Task 2; that is expected).
- [ ] **Step 5: Commit** `backend/src/store.ts backend/src/validate.ts backend/src/validate.spec.ts`:
  "Validate preset ids, folder ids and folders in the storage API".

### Task 2: Backend store: library, id-keyed presets, folders with cap and cascade

**Files:**
- Modify: `backend/src/store.ts` (`Store` interface)
- Modify: `backend/src/dynamo-store.ts`
- Test: `backend/src/dynamo-store.spec.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces (`Store`, replacing `listPresets`/name-keyed methods):
  ```ts
  export interface Library { folders: StoredFolder[]; presets: StoredPreset[] }
  listLibrary(profile: string): Promise<Library>;
  putPreset(profile: string, preset: StoredPreset, maxPresets: number): Promise<boolean>; // keyed by preset.id
  deletePreset(profile: string, id: string): Promise<void>;
  folderExists(profile: string, id: string): Promise<boolean>;
  /** false, without saving, when new and the profile already has maxFolders folders */
  putFolder(profile: string, folder: StoredFolder, maxFolders: number): Promise<boolean>;
  /** deletes the folder's presets, then the folder; no-op if missing */
  deleteFolder(profile: string, id: string): Promise<void>;
  ```
- Produces (`dynamo-store.ts`): `presetSk(id)` = `PRESET#<id>`, `folderSk(id)` = `FOLDER#<id>`; folder item
  attributes `name`, `updatedAt`; META attributes `presetCount`, `folderCount`. Update the layout comment.

- [ ] **Step 1: Write the failing tests** in `dynamo-store.spec.ts` (same mocking style as the existing tests):
  - `listLibrary` sends one `QueryCommand` with `PK = PROFILE#me` (no SK condition) and splits items: a
    `PRESET#p1` item with `preset: { id: 'p1', … }` → in `presets`; a `FOLDER#f1` item `{ name: 'KB', updatedAt }` →
    `folders: [{ id: 'f1', name: 'KB', updatedAt }]`; a `PRESET#Tabata` item whose map has no `id` → skipped; `META` → skipped.
  - `putPreset` uses `SK: 'PRESET#p1'` (from `id`, not `name`).
  - `deletePreset(profile, 'p1')` deletes `SK: 'PRESET#p1'` with the counter decrement.
  - `putFolder` new: transaction Put `FOLDER#f1` (`attribute_not_exists(PK)`) + Update META
    `ADD folderCount :one` with `attribute_not_exists(folderCount) OR folderCount < :max`; existing → plain Put;
    counter check failed → returns `false`.
  - `deleteFolder('me', 'f1')`: with the library holding presets `p1` (folder `f1`), `p2` (folder `default`), sends
    the preset-delete transaction for `p1` only, then a transaction deleting `FOLDER#f1` with `ADD folderCount :minusOne`.
  - `folderExists` → `GetCommand` on `FOLDER#f1`; true when `Item` present.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/dynamo-store.spec.ts` → FAIL.
- [ ] **Step 3: Implement** in `DynamoStore`; `putFolder`/folder delete mirror `putPreset`/`deletePreset`
  (transaction + `cancellationCodes`). `deleteFolder` = `listLibrary` → `deletePreset` for each matching preset →
  folder delete transaction (ConditionalCheckFailed on the folder → return).
- [ ] **Step 4: Run** `cd backend && npx vitest run src/dynamo-store.spec.ts` → PASS.
- [ ] **Step 5: Commit** `backend/src/store.ts backend/src/dynamo-store.ts backend/src/dynamo-store.spec.ts`:
  "Store interval timer presets by id and add folders to the storage table".

### Task 3: Backend routes, docs

**Files:**
- Modify: `backend/src/handler.ts`
- Test: `backend/src/handler.spec.ts` (update `MemoryStore` to the new `Store`)
- Modify: `backend/README.md` (API section, limits table: folders 50, folder name 40),
  `docs/interval-timer-cloud-storage.md` (data model table and routes: point to `interval-timer-folders.md`)

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: `export const MAX_FOLDERS_PER_PROFILE = 50`. Routes:
  `GET /library` → `200 { folders, presets }`;
  `PUT /presets` → `400` invalid, `404 { error: 'Folder not found' }` when `folderId !== 'default'` and
  `!folderExists`, `409` cap, `200 { preset }`;
  `DELETE /presets?id=` → `400` without id, `204`;
  `PUT /folders` → `400` invalid, `409` cap (`A profile can hold at most 50 folders`), `200 { folder }`;
  `DELETE /folders?id=` → `400` without id or for `default`, `204`.
  `GET /presets` is removed (`404`).

- [ ] **Step 1: Write the failing tests** in `handler.spec.ts`: one test per route outcome above, plus
  "a preset saved into a deleted folder is rejected" (PUT folder f1, DELETE folder f1, PUT preset with `folderId: 'f1'` → 404)
  and "deleting a folder deletes its presets" (library afterwards has only the `default` preset). Existing preset
  tests switch to `id`-based bodies and `?id=`.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/handler.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the routes in `createHandler`.
- [ ] **Step 4: Run** `cd backend && npm test && npm run typecheck` → all PASS.
- [ ] **Step 5: Commit** handler, spec, README, cloud-storage doc: "Serve the interval timer library and folders from the storage API".

### Task 4: Frontend types and library helpers

**Files:**
- Modify: `src/app/interval-timer/types/interval-timer-config.interface.ts`
- Create: `src/app/interval-timer/utils/library.ts`
- Test: `src/app/interval-timer/utils/library.spec.ts`

**Interfaces:**
- Produces (types file): `DEFAULT_FOLDER_ID = 'default'`, `DEFAULT_FOLDER_NAME = 'My workouts'`, `MAX_FOLDERS = 50`;
  `PRESET_LIMITS.folderName = 40`; `IntervalTimerConfig` gains required `id: string; folderId: string`;
  `export interface IntervalTimerFolder { id: string; name: string }`;
  `export interface IntervalTimerLibrary { folders: IntervalTimerFolder[]; presets: IntervalTimerConfig[] }`
  (`folders` never contains the default folder).
- Produces (`library.ts`):
  - `newId(): string` — `crypto.randomUUID()` when it is a function, else 32 hex chars from `crypto.getRandomValues`.
  - `uniqueName(name: string, taken: readonly string[], maxLength = PRESET_LIMITS.name): string` — case-insensitive;
    returns `name` if free, else `"<base> (n)"` with the first free `n ≥ 2`, `base` cut so the result fits `maxLength`.
  - `upgradePresets(raw: unknown[]): { presets: IntervalTimerConfig[]; changed: boolean }` — entries without a string
    `id` get `newId()`; without `folderId` get `'default'`.
  - `byName(a: { name: string }, b: { name: string }): number` — `localeCompare` with `sensitivity: 'base'`.

- [ ] **Step 1: Write the failing tests** (`library.spec.ts`):
  - `newId` returns distinct ids matching `/^[A-Za-z0-9-]{1,64}$/`, also with `vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })`.
  - `uniqueName('Tabata', [])` → `'Tabata'`; `uniqueName('Tabata', ['tabata'])` → `'Tabata (2)'`;
    `uniqueName('Tabata', ['Tabata', 'Tabata (2)'])` → `'Tabata (3)'`;
    `uniqueName('x'.repeat(100), ['x'.repeat(100)])` → length 100, ends with `' (2)'`.
  - `upgradePresets([{ name: 'A', rounds: 1, work: 1, rest: 0, playSound: true }])` → one preset with an id,
    `folderId: 'default'`, `changed: true`; an already-upgraded entry → `changed: false`, same object values.
- [ ] **Step 2: Run** `npm test -- --no-watch --include src/app/interval-timer/utils/library.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the helpers and types. Type errors elsewhere from the now-required `id`/`folderId` are
  fixed in Tasks 5-8; do not run the full suite yet.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit**: "Add ids, folders and naming helpers for interval timer presets".

### Task 5: Config service, local mode: id-keyed presets, folders, open folder

**Files:**
- Modify: `src/app/interval-timer/services/cloud-storage.ts`, `src/app/interval-timer/services/interval-timer-config.service.ts`
- Test: `src/app/interval-timer/services/interval-timer-config.service.spec.ts` (rewrite fixtures with `id`/`folderId`)

**Interfaces:**
- Consumes: Task 4.
- Produces (`cloud-storage.ts`): `LOCAL_FOLDERS_KEY = 'interval-timer-folders'`; `LOCAL_OPEN_FOLDER_KEY = 'interval-timer-open-folder'`.
- Produces (service public API; replaces name-keyed methods):
  ```ts
  readonly configs: Signal<IntervalTimerConfig[]>;          // all presets of the current storage
  readonly folders: Signal<IntervalTimerFolder[]>;           // default first, then byName
  readonly openFolderId: Signal<string>;
  readonly openFolderConfigs: Signal<IntervalTimerConfig[]>; // open folder's presets, byName
  openFolder(id: string): void;                              // persists; unknown id → 'default'
  save(config: IntervalTimerConfig): IntervalTimerConfig | undefined; // auto-renames; undefined if storage full
  load(id: string): IntervalTimerConfig | undefined;
  findUniqueByName(name: string): IntervalTimerConfig | undefined;   // exactly one match, else undefined
  remove(id: string): void;
  createFolder(name: string): IntervalTimerFolder | undefined;      // refuses with a 'danger' alert
  renameFolder(id: string, name: string): boolean;
  removeFolder(id: string): void;                            // deletes its presets; opens 'default' if it was open
  ```
- Alerts: save → `Configuration "<final name>" saved!` (success); folder refusals: empty/too long
  `Folder names are 1-40 characters.`, clash `A folder named "<name>" already exists.`, cap
  `You can have at most 50 folders.`; rename/delete of `default` is a no-op returning false.

- [ ] **Step 1: Write the failing tests** (local mode, no API URL):
  - saving `{ id: 'a', folderId: 'default', name: 'Tabata', … }` then `{ id: 'b', …, name: 'tabata' }` → second
    returned/stored as `'tabata (2)'`; re-saving `'a'` as `'TABATA'` → `'TABATA'` (its own name never clashes).
  - same name in another folder stays unchanged.
  - `save` of an existing id replaces it in place (`configs().length` unchanged).
  - `remove('a')` removes by id only.
  - legacy `localStorage['interval-timer-configs']` without ids → `configs()` all have ids and `folderId: 'default'`;
    a fresh service (reset TestBed) sees the **same** ids.
  - `createFolder('Kettlebell')` → in `folders()` after `My workouts`; `createFolder(' kettlebell ')` → undefined + alert;
    `createFolder('my workouts')` → undefined; 51st folder → undefined; `createFolder('n'.repeat(41))` → undefined.
  - `renameFolder`, `removeFolder` (its presets gone, other folders' kept, open folder back to `default`).
  - `openFolder('f1')` persists: fresh service has `openFolderId() === 'f1'`; stored id not in `folders()` → `'default'`.
  - `openFolderConfigs()` filters and sorts by name.
  - `findUniqueByName('Tabata')` → the preset; with two in different folders → undefined.
- [ ] **Step 2: Run** `npm test -- --no-watch --include src/app/interval-timer/services/interval-timer-config.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Keep one internal `library` signal `{ folders, presets }` per storage; write the upgrade
  back when `changed`. Cloud code paths keep compiling by adapting names to ids minimally; their behaviour is Task 6.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit**: "Keep interval timer presets by id with folders in local mode".

### Task 6: Cloud mode: API client, v2 storage keys, pending ops, import with folders

**Files:**
- Modify: `src/app/interval-timer/services/cloud-connection.service.ts`, `cloud-storage.ts`,
  `interval-timer-config.service.ts`
- Test: `src/app/interval-timer/services/interval-timer-config.service.cloud.spec.ts`

**Interfaces:**
- Consumes: Tasks 3-5 (API routes and service API).
- Produces (`CloudConnectionService`): `listLibrary(): Promise<IntervalTimerLibrary>` (drops `updatedAt`),
  `putPreset(config)`, `deletePreset(id: string)` (`?id=`), `putFolder(folder: IntervalTimerFolder)`,
  `deleteFolder(id: string)`.
- Produces (`cloud-storage.ts`, replacing the v1 functions): `cloudPresetsKey(p) = 'interval-timer-cloud-v2:' + p`,
  `cloudFoldersKey(p) = 'interval-timer-cloud-v2-folders:' + p`, `cloudPendingKey(p) = 'interval-timer-cloud-v2-pending:' + p`,
  `cloudOpenFolderKey(p) = 'interval-timer-open-folder:' + p`. On connect/leave, v1 keys
  (`interval-timer-cloud:<p>`, `interval-timer-cloud-pending:<p>`) are removed.
- Pending op union: `{ type: 'put'; config } | { type: 'delete'; id } | { type: 'putFolder'; folder } | { type: 'deleteFolder'; id }`;
  `applyPending(library, ops): IntervalTimerLibrary` handles all four (`deleteFolder` also drops that folder's presets).
- `importLocalPresets()`: local folders matched to profile folders by name (case-insensitive) or created (queued
  `putFolder` before the presets); each copy gets `newId()`, the mapped `folderId`, and `uniqueName` within the target
  folder; empty local folders are not copied.

- [ ] **Step 1: Write the failing tests** (update existing cloud tests to `/library`, ids, `?id=`):
  - connect → `GET /library` → `folders()`/`configs()` from the response.
  - offline: `createFolder('KB')`, save a preset into it, delete another preset, then `sync()` → requests in order
    `PUT /folders`, `PUT /presets`, `DELETE /presets?id=…`, then `GET /library`.
  - `removeFolder('f1')` → one `DELETE /folders?id=f1`, no preset deletes.
  - a stored v1 pending queue under `interval-timer-cloud-pending:me` is never sent and is removed on start-up.
  - after `sync()` returns a library without the open folder → `openFolderId() === 'default'`.
  - import: local `KB` folder with `A`; profile has folder `kb` with `A` → copy lands in `kb` as `A (2)`; local
    `Cardio` (non-empty) is created via `PUT /folders` before its presets' `PUT /presets`.
  - `404` on `PUT /presets` (folder deleted elsewhere) → change dropped with the rejection alert (existing rule).
- [ ] **Step 2: Run** `npm test -- --no-watch --include src/app/interval-timer/services/interval-timer-config.service.cloud.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then the Task 5 spec → PASS.
- [ ] **Step 5: Commit**: "Sync interval timer folders and id-keyed presets with cloud storage".

### Task 7: Folder control in the setup panel

**Files:**
- Modify: `src/app/interval-timer/interval-timer.component.ts`
- Test: `src/app/interval-timer/interval-timer.component.spec.ts` (new `describe('folders')`)

**Interfaces:**
- Consumes: Task 5 service API.
- Produces (component, protected): `folderMode = signal<'read' | 'select' | 'new' | 'rename' | 'delete'>('read')`,
  `folderNameDraft = signal('')`, `openFolderName = computed(...)`, `openFolderCount = computed(...)`,
  `switchFolder(id: string): void` (calls `configService.openFolder`, then the unload hook Task 8 fills in; for now
  clears the workout selection).
- Template element ids (tests rely on them): `#folder-name` (read-mode text `📁 <name>`), `#folder-edit-toggle` (✎),
  `#folder-select` (`<select>`: folders, then options valued `__new`, `__rename`, `__delete`; rename/delete omitted
  for `default`), `#folder-name-input`, `#folder-ok`, `#folder-cancel`, `#folder-delete-message`,
  `#folder-delete-confirm`, `#folder-empty-hint` (`No workouts in this folder yet`). Placed before `#savedConfigs`,
  inside the existing `@if (!started)` block. `#savedConfigs` lists `openFolderConfigs()` with `[value]="c.id"`.
- Delete message: `Delete folder <name> and its <n> workout(s)?` — `workout` when n = 1, `workouts` otherwise
  (`Delete folder <name>?` when n = 0).

- [ ] **Step 1: Write the failing tests:**
  - read mode shows `#folder-name` with `📁 My workouts` and no `#folder-select`; ✎ shows `#folder-select`; ✎ again hides it.
  - choosing a folder in `#folder-select` opens it, returns to read mode, `#savedConfigs` lists only its workouts.
  - `__new` → `#folder-name-input`; typing `Kettlebell` + `#folder-ok` → `📁 Kettlebell`, read mode, `#folder-empty-hint` shown;
    `#folder-cancel` returns to read mode without creating.
  - `__rename` → input prefilled with the open folder's name.
  - `__delete` on a folder with 2 workouts → `#folder-delete-message` text `Delete folder Kettlebell and its 2 workouts?`;
    confirm → `📁 My workouts`, those workouts gone.
  - `#folder-select` for the default folder has no `__rename`/`__delete` options.
  - all folder controls hidden while running (add `#folder-name` to the existing hidden-while-running selector list).
- [ ] **Step 2: Run** `npm test -- --no-watch --include src/app/interval-timer/interval-timer.component.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command → the new tests PASS (save-rule tests are rewritten in Task 8).
- [ ] **Step 5: Commit**: "Add a folder control to the interval timer setup".

### Task 8: Save rules, selection by id, shared links

**Files:**
- Modify: `src/app/interval-timer/interval-timer.component.ts`
- Test: `src/app/interval-timer/interval-timer.component.spec.ts` (rewrite `saved configurations` tests)

**Interfaces:**
- Consumes: Tasks 4, 5, 7.
- Produces (component): `selectedConfigId = signal('')` (replaces `selectedConfigName`), `loadedId = signal<string | null>(null)`,
  `rememberedName = signal('')`, `saveCurrentConfig()`, `saveAsNewConfig()`; buttons `#save-config` (always) and
  `#save-config-as-new` (only while `loadedId()`); title shows the loaded workout's name while running.
- Rules (from the spec):
  - Load: sets form fields, `loadedId = id`, `rememberedName = ''`.
  - Save, loaded: `save({ ...form, id: loadedId, folderId: <its folder>, name: typed || loaded.name })`.
  - Save, nothing loaded: `save({ ...form, id: newId(), folderId: openFolderId, name: typed || rememberedName || generated })`.
  - Save as new: `save({ ...form, id: newId(), folderId: <loaded's folder>, name: typed || loaded.name })`.
  - After any successful save: `loadedId` and `selectedConfigId` = the saved id, `rememberedName = ''`, name field cleared.
  - Folder switch (`switchFolder`, also after creating a folder): if loaded, `rememberedName = loaded.name`;
    `loadedId = null`; `selectedConfigId = ''`.
  - Reset, deleting the loaded workout, deleting the folder that holds it: `loadedId = null`, `rememberedName = ''`.
  - Link `?config=<v>`: `load(v) ?? findUniqueByName(v)`; if found, open its folder, select and load it.
    Copy Link writes `?config=<id>`.

- [ ] **Step 1: Write the failing tests:**
  - nothing loaded: only `#save-config` present; Save with empty name → generated name (`10x30` with defaults) in the open folder.
  - load `Tabata`, type `Tabata EMOM`, Save → same id, renamed, `configs().length` unchanged.
  - load `Tabata`, Save as new with empty name → new id, name `Tabata (2)`, same folder.
  - load `Tabata` (folder `default`), switch to `Kettlebell`, Save with empty name → new workout `Tabata` in
    `Kettlebell`; the original still in `default`; `#save-config-as-new` absent after the switch.
  - Reset after load → Save with empty name uses the generated name, not the old name.
  - `?config=<id>` opens the workout's folder and loads it; `?config=Tabata` (unique) loads it; `?config=Tabata`
    with two matches loads nothing.
  - Copy Link copies `?config=<id>`.
  - existing tests for description/video/intro/exercises save-load updated to ids and still pass.
- [ ] **Step 2: Run** `npm test -- --no-watch --include src/app/interval-timer/interval-timer.component.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run lint && npm run test:ci && npm run build` → all PASS.
- [ ] **Step 5: Commit**: "Update interval timer save rules for folders and workout ids".

### Task 9: End-to-end check against DynamoDB Local

**Files:** none (fix-ups go into the owning task's files with their own commit).

- [ ] **Step 1:** Start DynamoDB Local and the API as in `backend/README.md` ("Local development"); create a key.
- [ ] **Step 2:** `npm start` with `intervalTimerApiUrl: 'http://localhost:3100'` (do not commit it). In local mode, then
  connected: create folders, save into them, rename a workout, Save as new (`(2)`), switch folder and Save (copy keeps
  its name), delete a folder with workouts, open a copied link. Repeat a folder create + save with the API stopped,
  restart it, Sync → both arrive. Open the same profile in a second browser → same folders and workouts.
- [ ] **Step 3:** Report what was checked and any failure with the exact symptom.
