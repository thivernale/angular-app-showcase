import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { AlertService } from '../../components/alert/services/alert.service';
import { IntervalTimerConfig } from '../types/interval-timer-config.interface';
import { CloudConnectionService } from './cloud-connection.service';
import { cloudCacheKey, cloudPendingKey, LOCAL_PRESETS_KEY } from './cloud-storage';

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

/** API responses that will never succeed on retry; the change is dropped instead of retried forever. */
const REJECTED_STATUSES = [400, 404, 409, 413];

let opCounter = 0;

@Injectable({
  providedIn: 'root'
})
export class IntervalTimerConfigService {
  private readonly alertService = inject(AlertService);
  private readonly cloud = inject(CloudConnectionService);

  private readonly configsSignal = signal<IntervalTimerConfig[]>(this.readList(this.storageKey()));
  readonly configs = this.configsSignal.asReadonly();

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

  save(config: IntervalTimerConfig): void {
    const existingIndex = this.configsSignal().findIndex(c => c.name === config.name);
    const updated = existingIndex >= 0
      ? this.configsSignal().map((c, i) => i === existingIndex ? config : c)
      : [...this.configsSignal(), config];

    if (!this.persist(updated)) {
      return;
    }
    this.configsSignal.set(updated);

    this.alertService.showAlert({
      type: 'success',
      text: `Configuration "${config.name}" saved!`
    });

    this.queueChange({ type: 'put', config });
  }

  load(name: string): IntervalTimerConfig | undefined {
    return this.configsSignal().find(c => c.name === name);
  }

  remove(name: string): void {
    const updated = this.configsSignal().filter(c => c.name !== name);
    this.configsSignal.set(updated);
    this.persist(updated);

    this.alertService.showAlert({
      type: 'success',
      text: `Configuration "${name}" removed.`
    });

    this.queueChange({ type: 'delete', name });
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
    this.configsSignal.set(this.readList(cloudCacheKey(profile)));
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
      this.configsSignal.set(configs);
      this.persist(configs);
      this.statusSignal.set('synced');
    } catch (e) {
      this.handleFailure(e, profile, false);
    }
  }

  /** Copies the anonymous presets into the connected profile; name clashes get a " (local)" suffix. */
  async importLocalPresets(): Promise<void> {
    const profile = this.cloud.profile();
    if (!profile) {
      return;
    }
    const local = this.readList(LOCAL_PRESETS_KEY);
    const taken = new Set(this.configsSignal().map(c => c.name));
    const copies = local.map(config => {
      const name = uniqueName(config.name, taken);
      taken.add(name);
      return { ...config, name };
    });

    const updated = [...this.configsSignal(), ...copies];
    if (!this.persist(updated)) {
      return;
    }
    this.configsSignal.set(updated);
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
    this.configsSignal.set(this.readList(LOCAL_PRESETS_KEY));
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

  private storageKey(): string {
    const profile = this.cloud.profile();
    return profile ? cloudCacheKey(profile) : LOCAL_PRESETS_KEY;
  }

  private persist(configs: IntervalTimerConfig[]): boolean {
    return this.writeStorage(this.storageKey(), JSON.stringify(configs));
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
      const exists = result.some(c => c.name === op.config.name);
      result = exists ? result.map(c => (c.name === op.config.name ? op.config : c)) : [...result, op.config];
    } else {
      result = result.filter(c => c.name !== op.name);
    }
  }
  return result;
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    return name;
  }
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? `${name} (local)` : `${name} (local ${i})`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
