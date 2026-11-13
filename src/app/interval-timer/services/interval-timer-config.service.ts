import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { AlertService } from '../../components/alert/services/alert.service';
import {
  DEFAULT_FOLDER_ID,
  DEFAULT_FOLDER_NAME,
  IntervalTimerConfig,
  IntervalTimerFolder,
  IntervalTimerLibrary,
  MAX_FOLDERS,
  PRESET_LIMITS,
} from '../types/interval-timer-config.interface';
import { byName, newId, uniqueName, upgradePresets } from '../utils/library';
import { CloudConnectionService, CloudIdentity } from './cloud-connection.service';
import {
  cloudFoldersKey,
  cloudOpenFolderKey,
  cloudPresetsKey,
  legacyCloudKeys,
  cloudPendingKey,
  LOCAL_FOLDERS_KEY,
  LOCAL_OPEN_FOLDER_KEY,
  LOCAL_PRESETS_KEY,
} from './cloud-storage';

/**
 * Where the presets shown come from:
 * - `local`: anonymous mode, presets live only in this browser
 * - `connecting`: checking a newly entered key
 * - `syncing`: connected, talking to the storage API
 * - `synced`: connected and up to date
 * - `offline`: connected, but the API is unreachable; changes are queued on this device
 */
export type CloudStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'offline';

/** A change to send to the API; queued in order, so a new folder reaches the server before presets saved into it. */
type Change =
  | { type: 'put'; config: IntervalTimerConfig }
  | { type: 'delete'; id: string }
  | { type: 'putFolder'; folder: IntervalTimerFolder }
  | { type: 'renameFolder'; folder: IntervalTimerFolder }
  | { type: 'deleteFolder'; id: string };

type PendingOp = { opId: string } & Change;

/** localStorage keys of one storage (the anonymous one or a cloud profile's device copy). */
interface StorageKeys {
  presets: string;
  folders: string;
  openFolder: string;
}

/** API responses that will never succeed on retry; the change is dropped instead of retried forever. */
const REJECTED_STATUSES = [400, 404, 409, 413];

const DEFAULT_FOLDER: IntervalTimerFolder = { id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME };

@Injectable({
  providedIn: 'root'
})
export class IntervalTimerConfigService {
  private readonly alertService = inject(AlertService);
  private readonly cloud = inject(CloudConnectionService);

  /** Folders (without the default one) and presets of the current storage. */
  private readonly library = signal<IntervalTimerLibrary>(this.readLibrary(this.keys()));
  private readonly openFolderSignal = signal<string>(localStorage.getItem(this.keys().openFolder) ?? DEFAULT_FOLDER_ID);

  /** All presets of the current storage. */
  readonly configs = computed(() => this.library().presets);
  /** The default folder first, then the user's folders by name. */
  readonly folders = computed<IntervalTimerFolder[]>(() => [DEFAULT_FOLDER, ...[...this.library().folders].sort(byName)]);
  /** The open folder; the default folder when the remembered one no longer exists. */
  readonly openFolderId = computed(() => {
    const id = this.openFolderSignal();
    return this.library().folders.some(f => f.id === id) ? id : DEFAULT_FOLDER_ID;
  });
  /** The open folder's presets, by name. */
  readonly openFolderConfigs = computed(() =>
    this.configs().filter(c => c.folderId === this.openFolderId()).sort(byName),
  );

  /** Whether cloud storage is available in this build. */
  readonly cloudEnabled = this.cloud.enabled;
  /** Connected cloud profile, or null in anonymous mode. */
  readonly profile = this.cloud.profile;
  /** Label of this device's key, e.g. "laptop"; null until known. */
  readonly keyLabel = this.cloud.label;

  private readonly statusSignal = signal<CloudStatus>(this.cloud.connected() ? 'syncing' : 'local');
  readonly cloudStatus = this.statusSignal.asReadonly();

  /** Anonymous presets on this device that can be copied into the connected profile. */
  private readonly localPresetCountSignal = signal(
    this.cloud.connected() ? this.readList(LOCAL_PRESETS_KEY).length : 0,
  );
  readonly localPresetCount = this.localPresetCountSignal.asReadonly();

  /** Serializes API work so queued changes are sent once and in order. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor() {
    const profile = this.cloud.profile();
    if (profile) {
      removeLegacyKeys(profile);
      void this.sync();
    }
    const onOnline = () => void this.sync();
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('online', onOnline));
  }

  /**
   * Saves a preset by id, creating or replacing it. A name already used by another preset in the same folder gets a
   * " (n)" suffix. Returns the saved preset, or undefined when the browser's storage is full.
   */
  save(config: IntervalTimerConfig): IntervalTimerConfig | undefined {
    const presets = this.configs();
    const taken = presets.filter(c => c.folderId === config.folderId && c.id !== config.id).map(c => c.name);
    const saved = { ...config, name: uniqueName(config.name, taken) };
    const exists = presets.some(c => c.id === saved.id);
    const updated = exists ? presets.map(c => (c.id === saved.id ? saved : c)) : [...presets, saved];

    if (!this.persistPresets(updated)) {
      return undefined;
    }
    this.library.update(lib => ({ ...lib, presets: updated }));

    this.alertService.showAlert({
      type: 'success',
      text: `Configuration "${saved.name}" saved!`
    });

    this.queueChange({ type: 'put', config: saved });
    return saved;
  }

  load(id: string): IntervalTimerConfig | undefined {
    return this.configs().find(c => c.id === id);
  }

  /** The preset with that name, when exactly one has it (for links copied before presets had ids). */
  findUniqueByName(name: string): IntervalTimerConfig | undefined {
    const matches = this.configs().filter(c => c.name === name);
    return matches.length === 1 ? matches[0] : undefined;
  }

  remove(id: string): void {
    const removed = this.load(id);
    if (!removed) {
      return;
    }
    const updated = this.configs().filter(c => c.id !== id);
    this.library.update(lib => ({ ...lib, presets: updated }));
    this.persistPresets(updated);

    this.alertService.showAlert({
      type: 'success',
      text: `Configuration "${removed.name}" removed.`
    });

    this.queueChange({ type: 'delete', id });
  }

  openFolder(id: string): void {
    const target = this.folders().some(f => f.id === id) ? id : DEFAULT_FOLDER_ID;
    this.openFolderSignal.set(target);
    this.writeStorage(this.keys().openFolder, target);
  }

  /** Creates a folder; refuses (with a message) an invalid or taken name, or one folder too many. */
  createFolder(name: string): IntervalTimerFolder | undefined {
    const trimmed = this.checkFolderName(name, null);
    if (trimmed === null) {
      return undefined;
    }
    if (this.library().folders.length >= MAX_FOLDERS) {
      this.alertService.showAlert({ type: 'danger', text: `You can have at most ${MAX_FOLDERS} folders.` });
      return undefined;
    }
    const folder: IntervalTimerFolder = { id: newId(), name: trimmed };
    const folders = [...this.library().folders, folder];
    if (!this.persistFolders(folders)) {
      return undefined;
    }
    this.library.update(lib => ({ ...lib, folders }));
    this.queueChange({ type: 'putFolder', folder });
    return folder;
  }

  renameFolder(id: string, name: string): boolean {
    if (!this.library().folders.some(f => f.id === id)) {
      return false;
    }
    const trimmed = this.checkFolderName(name, id);
    if (trimmed === null) {
      return false;
    }
    const folder = { id, name: trimmed };
    const folders = this.library().folders.map(f => (f.id === id ? folder : f));
    if (!this.persistFolders(folders)) {
      return false;
    }
    this.library.update(lib => ({ ...lib, folders }));
    this.queueChange({ type: 'renameFolder', folder });
    return true;
  }

  /** Deletes a folder and the presets in it; the default folder opens if it was open. */
  removeFolder(id: string): void {
    if (!this.library().folders.some(f => f.id === id)) {
      return;
    }
    const folders = this.library().folders.filter(f => f.id !== id);
    const presets = this.configs().filter(c => c.folderId !== id);
    this.persistFolders(folders);
    this.persistPresets(presets);
    this.library.set({ folders, presets });
    if (this.openFolderSignal() === id) {
      this.openFolder(DEFAULT_FOLDER_ID);
    }
    // One request: the server deletes the folder's presets too, including ones saved from other devices.
    this.queueChange({ type: 'deleteFolder', id });
  }

  /** Checks the key and, if accepted, switches this device to that key's cloud profile. */
  async connect(key: string): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed || this.cloud.connected()) {
      return false;
    }
    this.statusSignal.set('connecting');

    let identity: CloudIdentity;
    try {
      identity = await this.cloud.verify(trimmed);
    } catch (e) {
      this.statusSignal.set('local');
      this.alertService.showAlert({
        type: 'danger',
        text: isStatus(e, 401) ? 'That key was not accepted.' : 'Could not reach cloud storage. Try again later.',
      });
      return false;
    }

    const { profile } = identity;
    this.cloud.setConnection(trimmed, identity);
    removeLegacyKeys(profile);
    this.localPresetCountSignal.set(this.readList(LOCAL_PRESETS_KEY).length);
    this.switchStorage();
    this.alertService.showAlert({ type: 'success', text: `Connected to cloud profile "${profile}".` });

    await this.sync();
    return true;
  }

  /** Forgets the key on this device and shows the anonymous presets again. */
  disconnect(): void {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    this.leaveCloud(profile);
    this.alertService.showAlert({ type: 'info', text: 'Disconnected. Showing presets stored on this device.' });
  }

  /** Sends queued changes, then reloads the profile's library from the API. */
  async sync(): Promise<void> {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    this.statusSignal.set('syncing');
    try {
      const remote = await this.serialize(async () => {
        if (this.cloud.label() === null) {
          // Connected before the label was kept on the device: fetch it once.
          const identity = await this.cloud.verify();
          if (identity.profile === profile) {
            this.cloud.setLabel(identity.label);
          }
        }
        await this.flushPending(profile);
        return this.cloud.listLibrary();
      });
      if (this.cloud.profile() !== profile) {
        return;
      }
      // Changes made while the library was loading are still queued; show them on top of the API's copy.
      const library = adoptOrphans(applyPending(remote, this.readPending(profile)));
      this.library.set(library);
      this.persistFolders(library.folders);
      this.persistPresets(library.presets);
      this.statusSignal.set('synced');
    } catch (e) {
      this.handleFailure(e, profile, false);
    }
  }

  /**
   * Copies the anonymous presets into the connected profile with new ids. Their folders are matched to the
   * profile's folders by name, or created; a name clash within the target folder gets a " (n)" suffix.
   */
  async importLocalPresets(): Promise<void> {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    const local = this.readLibrary({ presets: LOCAL_PRESETS_KEY, folders: LOCAL_FOLDERS_KEY, openFolder: '' });
    const folders = [...this.library().folders];
    const newFolders: IntervalTimerFolder[] = [];
    const targetIds = new Map<string, string>([[DEFAULT_FOLDER_ID, DEFAULT_FOLDER_ID]]);
    const targetFolder = (localId: string): string => {
      let target = targetIds.get(localId);
      if (target === undefined) {
        const name = local.folders.find(f => f.id === localId)?.name;
        const match = name === undefined ? undefined : folders.find(f => f.name.toLowerCase() === name.toLowerCase());
        if (match) {
          target = match.id;
        } else if (name === undefined || folders.length >= MAX_FOLDERS) {
          // A preset whose folder is missing, or one folder too many: it lands in the default folder.
          target = DEFAULT_FOLDER_ID;
        } else {
          const folder = { id: newId(), name };
          folders.push(folder);
          newFolders.push(folder);
          target = folder.id;
        }
        targetIds.set(localId, target);
      }
      return target;
    };

    const presets = [...this.configs()];
    const copies = local.presets.map(config => {
      const folderId = targetFolder(config.folderId);
      const taken = presets.filter(c => c.folderId === folderId).map(c => c.name);
      const copy = { ...config, id: newId(), folderId, name: uniqueName(config.name, taken) };
      presets.push(copy);
      return copy;
    });

    if (!this.persistFolders(folders) || !this.persistPresets(presets)) {
      return;
    }
    this.library.set({ folders, presets });
    this.localPresetCountSignal.set(0);
    for (const folder of newFolders) {
      this.enqueue(profile, { type: 'putFolder', folder });
    }
    for (const config of copies) {
      this.enqueue(profile, { type: 'put', config });
    }
    this.alertService.showAlert({
      type: 'success',
      text: `Copied ${copies.length} preset${copies.length === 1 ? '' : 's'} to profile "${profile}".`,
    });

    await this.pushPending(profile);
  }

  /** Refuses (with a message) a folder name that is empty, too long, or used by another folder. */
  private checkFolderName(name: string, ownId: string | null): string | null {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > PRESET_LIMITS.folderName) {
      this.alertService.showAlert({
        type: 'danger',
        text: `Folder names are 1-${PRESET_LIMITS.folderName} characters.`,
      });
      return null;
    }
    const clash = this.folders().some(f => f.id !== ownId && f.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      this.alertService.showAlert({ type: 'danger', text: `A folder named "${trimmed}" already exists.` });
      return null;
    }
    return trimmed;
  }

  private queueChange(change: Change): void {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    this.enqueue(profile, change);
    void this.pushPending(profile);
  }

  private async pushPending(profile: string): Promise<void> {
    this.statusSignal.set('syncing');
    try {
      await this.serialize(() => this.flushPending(profile));
      if (this.cloud.profile() === profile) {
        this.statusSignal.set('synced');
      }
    } catch (e) {
      this.handleFailure(e, profile, true);
    }
  }

  private send(change: Change): Promise<void> {
    switch (change.type) {
      case 'put':
        return this.cloud.putPreset(change.config);
      case 'delete':
        return this.cloud.deletePreset(change.id);
      case 'putFolder':
        return this.cloud.putFolder(change.folder);
      case 'renameFolder':
        return this.cloud.renameFolder(change.folder);
      case 'deleteFolder':
        return this.cloud.deleteFolder(change.id);
    }
  }

  /** Sends queued changes in order. Throws on the first change that may succeed on a later retry. */
  private async flushPending(profile: string): Promise<void> {
    for (let op = this.readPending(profile)[0]; op; op = this.readPending(profile)[0]) {
      try {
        await this.send(op);
      } catch (e) {
        if (!(e instanceof HttpErrorResponse) || !REJECTED_STATUSES.includes(e.status)) {
          throw e;
        }
        this.alertService.showAlert({
          type: 'danger',
          text: `Cloud storage rejected the change to ${describeChange(op)}: ${e.error?.error ?? e.statusText}`,
        });
      }
      const sentId = op.opId;
      this.writePending(profile, this.readPending(profile).filter(p => p.opId !== sentId));
    }
  }

  private handleFailure(e: unknown, profile: string, notify: boolean): void {
    if (this.cloud.profile() !== profile) {
      return;
    }
    if (isStatus(e, 401)) {
      this.leaveCloud(profile);
      this.alertService.showAlert({
        type: 'danger',
        text: "This device's cloud key is no longer valid. Showing presets stored on this device.",
      });
      return;
    }
    const wasOffline = this.statusSignal() === 'offline';
    this.statusSignal.set('offline');
    if (notify && !wasOffline) {
      this.alertService.showAlert({
        type: 'warning',
        text: 'Cloud storage is unreachable. Changes are kept on this device and will sync later.',
      });
    }
  }

  /** Drops the key and the profile's device copy. Unsent changes stay queued for a later reconnect. */
  private leaveCloud(profile: string): void {
    this.cloud.clearConnection();
    localStorage.removeItem(cloudPresetsKey(profile));
    localStorage.removeItem(cloudFoldersKey(profile));
    removeLegacyKeys(profile);
    this.statusSignal.set('local');
    this.localPresetCountSignal.set(0);
    this.switchStorage();
  }

  /** Shows the library of the storage now in use (after connecting or leaving a profile). */
  private switchStorage(): void {
    const keys = this.keys();
    this.library.set(this.readLibrary(keys));
    this.openFolderSignal.set(localStorage.getItem(keys.openFolder) ?? DEFAULT_FOLDER_ID);
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private enqueue(profile: string, change: Change): void {
    const op: PendingOp = { ...change, opId: newId() };
    this.writePending(profile, [...this.readPending(profile), op]);
  }

  private keys(): StorageKeys {
    const profile = this.cloud.profile();
    return profile
      ? { presets: cloudPresetsKey(profile), folders: cloudFoldersKey(profile), openFolder: cloudOpenFolderKey(profile) }
      : { presets: LOCAL_PRESETS_KEY, folders: LOCAL_FOLDERS_KEY, openFolder: LOCAL_OPEN_FOLDER_KEY };
  }

  /** Reads a storage's library; presets saved before ids existed get one, written back so it stays stable. */
  private readLibrary(keys: StorageKeys): IntervalTimerLibrary {
    const { presets, changed } = upgradePresets(readJsonArray<unknown>(keys.presets));
    if (changed) {
      this.writeStorage(keys.presets, JSON.stringify(presets));
    }
    return adoptOrphans({ folders: readJsonArray<IntervalTimerFolder>(keys.folders), presets });
  }

  private persistPresets(presets: IntervalTimerConfig[]): boolean {
    return this.writeStorage(this.keys().presets, JSON.stringify(presets));
  }

  private persistFolders(folders: IntervalTimerFolder[]): boolean {
    return this.writeStorage(this.keys().folders, JSON.stringify(folders));
  }

  /** Writes to localStorage; when the browser's quota is used up, says so instead of failing silently. */
  private writeStorage(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      this.alertService.showAlert({
        type: 'danger',
        text: "This browser's storage is full, so the change could not be saved. Delete unused presets and try again.",
      });
      return false;
    }
  }

  private readList(key: string): IntervalTimerConfig[] {
    return readJsonArray<IntervalTimerConfig>(key);
  }

  private readPending(profile: string): PendingOp[] {
    return readJsonArray<PendingOp>(cloudPendingKey(profile));
  }

  private writePending(profile: string, ops: PendingOp[]): void {
    if (ops.length === 0) {
      localStorage.removeItem(cloudPendingKey(profile));
    } else {
      this.writeStorage(cloudPendingKey(profile), JSON.stringify(ops));
    }
  }
}

function readJsonArray<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function isStatus(e: unknown, status: number): boolean {
  return e instanceof HttpErrorResponse && e.status === status;
}

function removeLegacyKeys(profile: string): void {
  for (const key of legacyCloudKeys(profile)) {
    localStorage.removeItem(key);
  }
}

function describeChange(change: Change): string {
  switch (change.type) {
    case 'put':
      return `"${change.config.name}"`;
    case 'putFolder':
    case 'renameFolder':
      return `folder "${change.folder.name}"`;
    case 'delete':
      return 'a deleted workout';
    case 'deleteFolder':
      return 'a deleted folder';
  }
}

/**
 * Puts presets whose folder no longer exists (e.g. saved into a folder while another device deleted it) into the
 * default folder, so they stay visible and can be deleted; saving one moves it there on the server too.
 */
function adoptOrphans(library: IntervalTimerLibrary): IntervalTimerLibrary {
  const known = new Set([DEFAULT_FOLDER_ID, ...library.folders.map(f => f.id)]);
  if (library.presets.every(c => known.has(c.folderId))) {
    return library;
  }
  return {
    ...library,
    presets: library.presets.map(c => (known.has(c.folderId) ? c : { ...c, folderId: DEFAULT_FOLDER_ID })),
  };
}

/** Replaces or adds by id. */
function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some(i => i.id === item.id) ? items.map(i => (i.id === item.id ? item : i)) : [...items, item];
}

/** Shows queued changes on top of the API's copy of the library. */
function applyPending(library: IntervalTimerLibrary, ops: PendingOp[]): IntervalTimerLibrary {
  let { folders, presets } = library;
  for (const op of ops) {
    switch (op.type) {
      case 'put':
        presets = upsert(presets, op.config);
        break;
      case 'delete':
        presets = presets.filter(c => c.id !== op.id);
        break;
      case 'putFolder':
        folders = upsert(folders, op.folder);
        break;
      case 'renameFolder':
        // Only an existing folder; one deleted from another device stays deleted.
        folders = folders.map(f => (f.id === op.folder.id ? op.folder : f));
        break;
      case 'deleteFolder':
        folders = folders.filter(f => f.id !== op.id);
        presets = presets.filter(c => c.folderId !== op.id);
        break;
    }
  }
  return { folders, presets };
}
