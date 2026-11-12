import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  IntervalTimerConfig,
  IntervalTimerFolder,
  IntervalTimerLibrary,
} from '../types/interval-timer-config.interface';
import { CLOUD_KEY_KEY, CLOUD_PROFILE_KEY, INTERVAL_TIMER_API_URL } from './cloud-storage';

export interface CloudIdentity {
  profile: string;
  label: string;
}

/** Holds this device's access key and talks to the storage API. */
@Injectable({
  providedIn: 'root',
})
export class CloudConnectionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(INTERVAL_TIMER_API_URL);

  /** Whether cloud storage is configured for this build. */
  readonly enabled = this.apiUrl !== '';

  private readonly keySignal = signal<string | null>(this.enabled ? localStorage.getItem(CLOUD_KEY_KEY) : null);
  private readonly profileSignal = signal<string | null>(
    this.keySignal() ? localStorage.getItem(CLOUD_PROFILE_KEY) : null,
  );

  /** Profile this device is connected to, or null in anonymous mode. */
  readonly profile = this.profileSignal.asReadonly();
  readonly connected = computed(() => this.keySignal() !== null && this.profileSignal() !== null);

  /** Checks a key with the API without storing it. */
  verify(key: string): Promise<CloudIdentity> {
    return firstValueFrom(this.http.get<CloudIdentity>(`${this.apiUrl}/me`, { headers: this.headers(key) }));
  }

  setConnection(key: string, profile: string): void {
    localStorage.setItem(CLOUD_KEY_KEY, key);
    localStorage.setItem(CLOUD_PROFILE_KEY, profile);
    this.keySignal.set(key);
    this.profileSignal.set(profile);
  }

  clearConnection(): void {
    localStorage.removeItem(CLOUD_KEY_KEY);
    localStorage.removeItem(CLOUD_PROFILE_KEY);
    this.keySignal.set(null);
    this.profileSignal.set(null);
  }

  /** The profile's folders and presets. */
  async listLibrary(): Promise<IntervalTimerLibrary> {
    type Stamped<T> = T & { updatedAt?: string };
    const { folders, presets } = await firstValueFrom(
      this.http.get<{ folders: Stamped<IntervalTimerFolder>[]; presets: Stamped<IntervalTimerConfig>[] }>(
        `${this.apiUrl}/library`,
        { headers: this.headers() },
      ),
    );
    return {
      folders: folders.map(({ updatedAt: _updatedAt, ...folder }) => folder),
      presets: presets.map(({ updatedAt: _updatedAt, ...config }) => config),
    };
  }

  async putPreset(config: IntervalTimerConfig): Promise<void> {
    await firstValueFrom(this.http.put(`${this.apiUrl}/presets`, config, { headers: this.headers() }));
  }

  async deletePreset(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/presets`, { headers: this.headers(), params: { id } }));
  }

  async putFolder(folder: IntervalTimerFolder): Promise<void> {
    await firstValueFrom(this.http.put(`${this.apiUrl}/folders`, folder, { headers: this.headers() }));
  }

  /** Deletes the folder and, on the server, the presets in it. */
  async deleteFolder(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/folders`, { headers: this.headers(), params: { id } }));
  }

  private headers(key = this.keySignal()): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${key ?? ''}` });
  }
}
