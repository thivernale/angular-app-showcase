import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Base URL of the interval timer storage API; an empty string disables cloud storage. */
export const INTERVAL_TIMER_API_URL = new InjectionToken<string>('INTERVAL_TIMER_API_URL', {
  providedIn: 'root',
  factory: () => environment.intervalTimerApiUrl.replace(/\/+$/, ''),
});

/** Presets of the anonymous (device-only) mode. */
export const LOCAL_PRESETS_KEY = 'interval-timer-configs';
/** Folders of the anonymous mode (the default folder is never stored). */
export const LOCAL_FOLDERS_KEY = 'interval-timer-folders';
/** Folder last opened in the anonymous mode. */
export const LOCAL_OPEN_FOLDER_KEY = 'interval-timer-open-folder';
/** Access key pasted on this device, if any. */
export const CLOUD_KEY_KEY = 'interval-timer-cloud-key';
/** Profile the access key belongs to. */
export const CLOUD_PROFILE_KEY = 'interval-timer-cloud-profile';
/** Device copy of a profile's presets, so they show instantly and work offline. */
export const cloudCacheKey = (profile: string) => `interval-timer-cloud:${profile}`;
/** Changes made while the API was unreachable, replayed in order. */
export const cloudPendingKey = (profile: string) => `interval-timer-cloud-pending:${profile}`;
