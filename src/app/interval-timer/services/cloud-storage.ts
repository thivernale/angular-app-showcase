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
/*
 * Device copy of a profile's library, so it shows instantly and works offline. The "-v2" keys hold presets keyed by
 * id; data under the keys of the version without folders is removed, not read.
 */
export const cloudPresetsKey = (profile: string) => `interval-timer-cloud-v2:${profile}`;
export const cloudFoldersKey = (profile: string) => `interval-timer-cloud-v2-folders:${profile}`;
/** Changes made while the API was unreachable, replayed in order. */
export const cloudPendingKey = (profile: string) => `interval-timer-cloud-v2-pending:${profile}`;
/** Folder last opened for a profile on this device. */
export const cloudOpenFolderKey = (profile: string) => `interval-timer-open-folder:${profile}`;
/** Keys of the version without folders, removed when found. */
export const legacyCloudKeys = (profile: string) => [
  `interval-timer-cloud:${profile}`,
  `interval-timer-cloud-pending:${profile}`,
];
