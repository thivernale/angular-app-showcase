# Interval timer: folders for saved workouts

## Why
Saved workouts (presets) sit in one flat dropdown. Until now the list never grew large, because `localStorage`
kept getting wiped; with optional cloud storage (see [`interval-timer-cloud-storage.md`](interval-timer-cloud-storage.md))
the list survives and will keep growing. Workouts should be grouped the way the user thinks about their own
training, so that one known place shows a short list (about a dozen) that contains what they are looking for.

Groupings are arbitrary and personal (by trainer, length, type, intensity, a program…): the app imposes no
categories. The model is the one of a media player's playlists: named groups, each a plain list.

## Goals
- User-defined **folders**; every workout lives in **exactly one** folder.
- Picking a folder narrows the workout dropdown to that folder's workouts.
- Folder changes are always **explicit**; normal use cannot move or alter folders by accident.
- Workouts are identified by a **generated id**, so names can repeat across folders and a loaded workout can be
  **renamed** in place (today, saving under a new name creates a copy and the old one has to be deleted).
- **Everything works the same in local (anonymous) mode**, where presets and folders live only in `localStorage`,
  and in cloud mode. Folders, ids, the save rules and auto-renaming are implemented in the frontend first; cloud
  storage only persists and syncs them.

## Non-goals
- Tags / a workout in several groups.
- Nested folders.
- Manual ordering inside a folder.
- A move or copy action between folders (may come later as its own control, not inside the folder dropdown).
- Import/export of presets (a likely later step; ids are designed so an import can always assign new ids).
- Migrating existing cloud data: there is none worth keeping.

## Anti-goals (would make it a failure even if it works)
- A workout changes folder, or a folder is changed, without the user explicitly asking.
- Buttons shown that do not apply to the current state.
- Organization that needs constant upkeep.

## Behaviour (decided with the user)

### Folder control
- **Read mode (normal):** the open folder is plain text, e.g. `📁 Kettlebell`, with a ✎ toggle next to it.
- **Edit mode (after ✎):** a folder dropdown listing the folders, followed by actions at the bottom:
  `+ New folder…`, `Rename "<open folder>"…`, `Delete "<open folder>"…`.
  - Picking a folder opens it and returns to read mode. Pressing ✎ again without choosing returns to read mode.
  - **New folder:** the dropdown is replaced in place by a name field with OK / Cancel (no browser dialogs). OK
    creates the folder, opens it (empty, with a hint like "No workouts in this folder yet") and returns to read mode.
    The form keeps its contents.
  - **Rename:** same inline field, prefilled with the current name.
  - **Delete:** an inline confirmation, "Delete folder Kettlebell and its 5 workouts?", Delete / Cancel. Deleting a
    folder **deletes the workouts in it**. Afterwards the default folder opens.
- The workout dropdown shows only the open folder's workouts.

### Saving (the existing name field stays: empty, placeholder "Config name", cleared after each save)
- **A workout is loaded** (Load clicked in the open folder):
  - **Save**, name field empty → updates it, keeps its name.
  - **Save**, name typed → updates it and renames it.
  - **Save as new** → a new workout in the same folder, named as typed, or the original's name if empty.
- **Nothing is loaded** (start, Reset, the loaded workout was deleted, or the folder was switched): only **Save**
  is shown; it creates a new workout in the open folder, named as typed or with the generated name (`10x30/10`).
- **Switching folders unloads** the loaded workout: the form keeps its values but is treated as a new workout. The
  unloaded workout's name is remembered as the default name, so Save with an empty name field keeps it (after Reset
  or a delete there is no remembered name and the generated name applies). So the way to "move" a workout is:
  Load → switch folder → Save → go back and delete the original; the copy keeps its name.
- **Names are unique within a folder, by auto-renaming** (decided with the user): when a save or rename would give
  a workout the same name as another workout in the same folder, the new name gets a suffix, `"<name> (2)"`,
  `"<name> (3)"`, … (first free number; comparison case-insensitive). Nothing is ever overwritten or refused. The
  save message shows the final name. The same rule applies when anonymous presets are copied into a profile,
  replacing the old ` (local)` suffix.

## Data model

### Ids
- Preset `id` and folder `id`: `crypto.randomUUID()` generated on the device (workouts must be creatable offline).
  The API accepts any string of 1-64 characters from `[A-Za-z0-9-]`.
- The default folder has the fixed id `default`, is named "My workouts", is always present, is listed first, and
  cannot be renamed or deleted. It is not stored as a folder record.

### Types (frontend `IntervalTimerConfig` and backend `Preset`)
- Preset gains `id: string` and `folderId: string`. `name` is no longer unique.
- New `IntervalTimerFolder { id: string; name: string }`.

### DynamoDB (single table, unchanged table definition)
| Item | PK | SK | Attributes |
|---|---|---|---|
| key | `KEY#<sha256(key) hex>` | `KEY` | unchanged |
| preset | `PROFILE#<profile>` | `PRESET#<id>` | `preset` (map, includes `folderId`), `updatedAt` |
| folder | `PROFILE#<profile>` | `FOLDER#<id>` | `name`, `updatedAt` |
| counter | `PROFILE#<profile>` | `META` | `presetCount`, `folderCount` |

No secondary index: the app always loads a profile's whole library (at most 200 presets and 50 folders), and
filtering by folder happens on the device.

### API
- `GET /library` → `{ folders: Folder[], presets: Preset[] }` (one query on `PK = PROFILE#<profile>`, split by SK
  prefix). Replaces `GET /presets`.
- `PUT /presets` — body is the preset including `id` and `folderId`. `folderId` must be `default` or an existing
  folder, otherwise `404` (the device drops the change with a message, as for other rejected changes).
- `DELETE /presets?id=<id>`.
- `PUT /folders` — body `{ id, name }`; creates the folder (replaces it if it exists). Name 1-40 characters after
  trimming.
- `PATCH /folders` — body `{ id, name }`; renames an existing folder, `404` if it no longer exists, so a rename
  queued on one device does not bring back a folder deleted from another.
- `DELETE /folders?id=<id>` — deletes the folder **and its presets** on the server (query the profile, delete the
  matching presets in transactions of up to 99 deletes plus one counter update, then the folder, keeping the counters
  right). Done server side so presets saved into the folder from another device are removed too. `default` cannot
  be deleted (`400`).
- Limits: 200 presets per profile (unchanged), 50 folders per profile (`409`), enforced with the `META` counters in
  the same transaction pattern as presets today.

## Frontend

### `IntervalTimerConfigService`
- Keyed by `id` everywhere: `save`, `load`, `remove`, the pending queue (`put`/`delete` carry ids), `applyPending`.
- Folder state: `folders` (readonly signal, default folder first then by name), `openFolderId`,
  `openFolderConfigs`, `openFolder`, `createFolder`, `renameFolder`, `removeFolder` (removes the folder's presets
  locally and queues one folder delete; the server cascades).
- Pending ops gain `putFolder` (create), `renameFolder` and `deleteFolder`, each with a random `opId`. Order is
  preserved, so a new folder reaches the server before presets saved into it.
- Presets whose folder no longer exists are shown in the default folder, so they stay visible and can be deleted.
- The copy of anonymous presets into a profile keeps their folders: a local folder is matched to a profile folder
  by name (case-insensitive) or created; copies get new ids. A name clash within the same target folder is
  auto-renamed like any other save (` (2)`, …).

### Storage on the device
- Anonymous: presets keep the `interval-timer-configs` key; folders go under `interval-timer-folders`. On read,
  presets without an `id` get one and `folderId: 'default'` (a one-time, in-place upgrade of existing local data);
  entries that are not objects are dropped.
- Cloud: `interval-timer-cloud-v2:<profile>` (presets), `interval-timer-cloud-v2-folders:<profile>` and
  `interval-timer-cloud-v2-pending:<profile>`. Caches and queues under the name-keyed version's keys are removed,
  not read.
- The open folder is remembered per device and per storage (anonymous / profile) under its own key; if it no longer
  exists, the default folder opens.

### `IntervalTimerComponent`
- Folder control (read mode / edit mode) as described above, placed before the workout dropdown.
- A `loadedId` signal: set by Load, cleared by folder switch, Reset, and deleting the loaded workout. It decides
  whether Save updates or creates, and whether Save as new is shown.
- The selection and the loaded workout always belong to the open folder: when the library changes without a folder
  switch (a sync, connecting or disconnecting, a folder deleted elsewhere), they are cleared.
- Workouts in the dropdown sorted by name.
- Shared link becomes `?config=<id>`. For links copied before this change, `?config=<name>` still works when
  exactly one workout has that name.

## Limits
| What | Limit |
|---|---|
| Folders per profile | 50 (default folder not counted) |
| Folder name | 1-40 characters, unique within the profile (case-insensitive; checked on the device) |
| Workout name | unchanged (100, including any ` (n)` suffix); unique within a folder by auto-renaming on the device |

## Design decisions
- Folders are stored as their own records (needed because a new folder is empty) rather than derived from presets.
- Fixed undeletable, unrenamable default folder "My workouts" with id `default`.
- Folder delete cascades on the server; `GET /library` replaces `GET /presets`; 50-folder cap; name length 40.
- Folder names unique per profile (a clash is refused with a message), enforced on the device only.
- Workouts sorted by name; the open folder remembered per device.
- After a folder switch, the unloaded workout's name stays the default name for Save (separate from `loadedId`).
- Old `?config=<name>` links resolved when unambiguous.
- Existing cloud items keyed by name are not migrated: `GET /library` ignores items without an `id`, and
  `backend/scripts/cleanup-legacy.ts` removes them and recounts `presetCount`.

## Verification
1. `cd backend && npm test && npm run typecheck`: routes, validation (ids, folder names), folder cap, cascade
   delete, `404` for an unknown `folderId`.
2. Root: `npm run lint`, `npm run test:ci`, `npm run build`. Component tests for read/edit mode, new/rename/delete
   folder, the save rules (loaded vs not, rename, Save as new, unload on folder switch), auto-renaming, and the
   old-link fallback, in local mode as well as cloud mode.
   Service tests for id-keyed queueing, folder ops order, local upgrade of id-less presets, and the import mapping.
3. Manual, with DynamoDB Local (`backend/README.md`): create folders, save into them, rename a workout, switch
   folders and save (new copy), delete a folder with workouts; repeat offline and reconnect; open the same profile
   in a second browser.
