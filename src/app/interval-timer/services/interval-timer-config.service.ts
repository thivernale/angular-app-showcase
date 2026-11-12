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
import { CloudConnectionService } from './cloud-connection.service';
import {
  cloudCacheKey,
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

type PendingOp = { id: string } & (
  | { type: 'put'; config: IntervalTimerConfig }
  | { type: 'delete'; name: string }
);

/** localStorage keys of one storage (the anonymous one or a cloud profile's device copy). */
interface StorageKeys {
  presets: string;
  folders: string;
  openFolder: string;
}

/** API responses that will never succeed on retry; the change is dropped instead of retried forever. */
const REJECTED_STATUSES = [400, 404, 409, 413];

const DEFAULT_FOLDER: IntervalTimerFolder = { id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME };

let opCounter = 0;

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
    if (this.cloud.connected()) {
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

    this.queueChange({ type: 'delete', name: removed.name });
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
    const folders = this.library().folders.map(f => (f.id === id ? { ...f, name: trimmed } : f));
    if (!this.persistFolders(folders)) {
      return false;
    }
    this.library.update(lib => ({ ...lib, folders }));
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
  }

  /** Checks the key and, if accepted, switches this device to that key's cloud profile. */
  async connect(key: string): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed || this.cloud.connected()) {
      return false;
    }
    this.statusSignal.set('connecting');

    let profile: string;
    try {
      profile = (await this.cloud.verify(trimmed)).profile;
    } catch (e) {
      this.statusSignal.set('local');
      this.alertService.showAlert({
        type: 'danger',
        text: isStatus(e, 401) ? 'That key was not accepted.' : 'Could not reach cloud storage. Try again later.',
      });
      return false;
    }

    this.cloud.setConnection(trimmed, profile);
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

  /** Sends queued changes, then reloads the profile's presets from the API. */
  async sync(): Promise<void> {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    this.statusSignal.set('syncing');
    try {
      const remote = await this.serialize(async () => {
        await this.flushPending(profile);
        return this.cloud.listPresets();
      });
      if (this.cloud.profile() !== profile) {
        return;
      }
      // Changes made while the list was loading are still queued; show them on top of the API's list.
      const configs = applyPending(remote, this.readPending(profile));
      this.library.update(lib => ({ ...lib, presets: configs }));
      this.persistPresets(configs);
      this.statusSignal.set('synced');
    } catch (e) {
      this.handleFailure(e, profile, false);
    }
  }

  /** Copies the anonymous presets into the connected profile; name clashes get a " (n)" suffix. */
  async importLocalPresets(): Promise<void> {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    const local = this.readList(LOCAL_PRESETS_KEY);
    const taken = this.configs().map(c => c.name);
    const copies = local.map(config => {
      const name = uniqueName(config.name, taken);
      taken.push(name);
      return { ...config, id: newId(), folderId: DEFAULT_FOLDER_ID, name };
    });

    const updated = [...this.configs(), ...copies];
    if (!this.persistPresets(updated)) {
      return;
    }
    this.library.update(lib => ({ ...lib, presets: updated }));
    this.localPresetCountSignal.set(0);
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

  private queueChange(change: { type: 'put'; config: IntervalTimerConfig } | { type: 'delete'; name: string }): void {
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

  /** Sends queued changes in order. Throws on the first change that may succeed on a later retry. */
  private async flushPending(profile: string): Promise<void> {
    for (let op = this.readPending(profile)[0]; op; op = this.readPending(profile)[0]) {
      try {
        if (op.type === 'put') {
          await this.cloud.putPreset(op.config);
        } else {
          await this.cloud.deletePreset(op.name);
        }
      } catch (e) {
        if (!(e instanceof HttpErrorResponse) || !REJECTED_STATUSES.includes(e.status)) {
          throw e;
        }
        const name = op.type === 'put' ? op.config.name : op.name;
        this.alertService.showAlert({
          type: 'danger',
          text: `Cloud storage rejected the change to "${name}": ${e.error?.error ?? e.statusText}`,
        });
      }
      const sentId = op.id;
      this.writePending(profile, this.readPending(profile).filter(p => p.id !== sentId));
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
    localStorage.removeItem(cloudCacheKey(profile));
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

  private enqueue(
    profile: string,
    change: { type: 'put'; config: IntervalTimerConfig } | { type: 'delete'; name: string },
  ): void {
    const op = { ...change, id: `${Date.now()}-${opCounter++}` } as PendingOp;
    this.writePending(profile, [...this.readPending(profile), op]);
  }

  private keys(): StorageKeys {
    const profile = this.cloud.profile();
    return profile
      ? { presets: cloudCacheKey(profile), folders: `${cloudCacheKey(profile)}:folders`, openFolder: `${LOCAL_OPEN_FOLDER_KEY}:${profile}` }
      : { presets: LOCAL_PRESETS_KEY, folders: LOCAL_FOLDERS_KEY, openFolder: LOCAL_OPEN_FOLDER_KEY };
  }

  /** Reads a storage's library; presets saved before ids existed get one, written back so it stays stable. */
  private readLibrary(keys: StorageKeys): IntervalTimerLibrary {
    const { presets, changed } = upgradePresets(readJsonArray<unknown>(keys.presets));
    if (changed) {
      this.writeStorage(keys.presets, JSON.stringify(presets));
    }
    return { folders: readJsonArray<IntervalTimerFolder>(keys.folders), presets };
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

function applyPending(configs: IntervalTimerConfig[], ops: PendingOp[]): IntervalTimerConfig[] {
  let result = configs;
  for (const op of ops) {
    if (op.type === 'put') {
      const exists = result.some(c => c.id === op.config.id);
      result = exists ? result.map(c => (c.id === op.config.id ? op.config : c)) : [...result, op.config];
    } else {
      result = result.filter(c => c.name !== op.name);
    }
  }
  return result;
}
