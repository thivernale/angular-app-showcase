import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertService } from '../../components/alert/services/alert.service';
import { IntervalTimerConfig, IntervalTimerFolder } from '../types/interval-timer-config.interface';
import {
  CLOUD_KEY_KEY,
  CLOUD_PROFILE_KEY,
  cloudFoldersKey,
  cloudOpenFolderKey,
  cloudPendingKey,
  cloudPresetsKey,
  INTERVAL_TIMER_API_URL,
  LOCAL_FOLDERS_KEY,
  LOCAL_PRESETS_KEY,
} from './cloud-storage';
import { IntervalTimerConfigService } from './interval-timer-config.service';

const API = 'https://api.example.test';
const KEY = 'k'.repeat(43);

const tabata: IntervalTimerConfig = { id: 'tabata', folderId: 'default', name: 'Tabata', rounds: 8, work: 20, rest: 10, playSound: true };
const emom: IntervalTimerConfig = { id: 'emom', folderId: 'default', name: 'EMOM', rounds: 10, work: 60, rest: 0, playSound: false };
const kb: IntervalTimerFolder = { id: 'f1', name: 'KB' };

interface Remote {
  folders?: IntervalTimerFolder[];
  presets?: IntervalTimerConfig[];
}

const stamp = <T>(items: T[]) => items.map(i => ({ ...i, updatedAt: '2026-01-01T00:00:00.000Z' }));
const libraryBody = ({ folders = [], presets = [] }: Remote) => ({ folders: stamp(folders), presets: stamp(presets) });

describe('IntervalTimerConfigService (cloud mode)', () => {
  let http: HttpTestingController;
  let showAlert: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: INTERVAL_TIMER_API_URL, useValue: API },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    showAlert = vi.spyOn(TestBed.inject(AlertService), 'showAlert');
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const createService = () => TestBed.inject(IntervalTimerConfigService);

  /** Waits for the service to issue a request, since API calls start after awaited steps. */
  const expectRequest = (method: string, path: string): Promise<TestRequest> =>
    vi.waitFor(() => http.expectOne(r => r.method === method && r.url === `${API}${path}`));

  const settle = () => vi.waitFor(() => expect(showAlert).toHaveBeenCalled());

  function storeConnection(profile = 'me', cache: IntervalTimerConfig[] = [], folders: IntervalTimerFolder[] = []) {
    localStorage.setItem(CLOUD_KEY_KEY, KEY);
    localStorage.setItem(CLOUD_PROFILE_KEY, profile);
    localStorage.setItem(cloudPresetsKey(profile), JSON.stringify(cache));
    localStorage.setItem(cloudFoldersKey(profile), JSON.stringify(folders));
  }

  async function connect(service: IntervalTimerConfigService, remote: Remote = {}) {
    const connected = service.connect(KEY);
    (await expectRequest('GET', '/me')).flush({ profile: 'me', label: 'laptop' });
    (await expectRequest('GET', '/library')).flush(libraryBody(remote));
    expect(await connected).toBe(true);
  }

  it('stays in anonymous mode until a key is entered', () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([tabata]));
    const service = createService();

    expect(service.cloudEnabled).toBe(true);
    expect(service.cloudStatus()).toBe('local');
    expect(service.profile()).toBeNull();
    expect(service.configs()).toEqual([tabata]);
  });

  it('connects with a valid key and loads the profile library', async () => {
    const service = createService();
    const connected = service.connect(` ${KEY} `);

    const me = await expectRequest('GET', '/me');
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    me.flush({ profile: 'me', label: 'laptop' });
    (await expectRequest('GET', '/library')).flush(libraryBody({ folders: [kb], presets: [emom] }));

    expect(await connected).toBe(true);
    expect(service.profile()).toBe('me');
    expect(service.cloudStatus()).toBe('synced');
    expect(service.configs()).toEqual([emom]);
    expect(service.folders()).toEqual([{ id: 'default', name: 'My workouts' }, kb]);
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBe(KEY);
    expect(JSON.parse(localStorage.getItem(cloudPresetsKey('me'))!)).toEqual([emom]);
    expect(JSON.parse(localStorage.getItem(cloudFoldersKey('me'))!)).toEqual([kb]);
  });

  it('rejects a key the API does not accept', async () => {
    const service = createService();
    const connected = service.connect(KEY);
    (await expectRequest('GET', '/me')).flush({ error: 'no' }, { status: 401, statusText: 'Unauthorized' });

    expect(await connected).toBe(false);
    expect(service.cloudStatus()).toBe('local');
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBeNull();
    expect(showAlert).toHaveBeenCalledWith({ type: 'danger', text: 'That key was not accepted.' });
  });

  it('keeps anonymous presets and folders separate from the profile library', async () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([tabata]));
    localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify([{ id: 'l1', name: 'Local' }]));
    const service = createService();
    await connect(service, { folders: [kb], presets: [emom] });

    expect(service.configs()).toEqual([emom]);
    expect(service.folders().map(f => f.name)).toEqual(['My workouts', 'KB']);
    expect(service.localPresetCount()).toBe(1);

    service.disconnect();

    expect(service.configs()).toEqual([tabata]);
    expect(service.folders().map(f => f.name)).toEqual(['My workouts', 'Local']);
    expect(service.cloudStatus()).toBe('local');
    expect(localStorage.getItem(cloudPresetsKey('me'))).toBeNull();
    expect(localStorage.getItem(cloudFoldersKey('me'))).toBeNull();
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBeNull();
  });

  it('resumes the stored connection, showing the device copy until the API answers', async () => {
    storeConnection('me', [tabata]);
    const service = createService();

    expect(service.configs()).toEqual([tabata]);
    expect(service.cloudStatus()).toBe('syncing');

    (await expectRequest('GET', '/library')).flush(libraryBody({ presets: [emom] }));
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(service.configs()).toEqual([emom]);
  });

  it('ignores and removes data stored by the version without folders', async () => {
    storeConnection('me');
    localStorage.setItem('interval-timer-cloud:me', JSON.stringify([{ name: 'Old', rounds: 1, work: 1, rest: 0, playSound: true }]));
    localStorage.setItem(
      'interval-timer-cloud-pending:me',
      JSON.stringify([{ id: '1-0', type: 'delete', name: 'Old' }]),
    );
    const service = createService();

    (await expectRequest('GET', '/library')).flush(libraryBody({}));
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));

    expect(localStorage.getItem('interval-timer-cloud-pending:me')).toBeNull();
    expect(localStorage.getItem('interval-timer-cloud:me')).toBeNull();
    expect(service.configs()).toEqual([]);
  });

  it('sends saved presets to the API and keeps the device copy', async () => {
    const service = createService();
    await connect(service);

    service.save(tabata);
    expect(service.configs()).toEqual([tabata]);

    const put = await expectRequest('PUT', '/presets');
    expect(put.request.body).toEqual(tabata);
    put.flush({ preset: tabata });

    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(JSON.parse(localStorage.getItem(cloudPresetsKey('me'))!)).toEqual([tabata]);
    expect(localStorage.getItem(LOCAL_PRESETS_KEY)).toBeNull();
    expect(localStorage.getItem(cloudPendingKey('me'))).toBeNull();
  });

  it('deletes presets by id', async () => {
    const service = createService();
    await connect(service, { presets: [tabata] });

    service.remove('tabata');

    const del = await expectRequest('DELETE', '/presets');
    expect(del.request.params.get('id')).toBe('tabata');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(service.configs()).toEqual([]);
  });

  it('sends new and renamed folders', async () => {
    const service = createService();
    await connect(service);

    const folder = service.createFolder('KB')!;
    const put = await expectRequest('PUT', '/folders');
    expect(put.request.body).toEqual(folder);
    put.flush({ folder });
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));

    service.renameFolder(folder.id, 'Kettlebell');
    const rename = await expectRequest('PUT', '/folders');
    expect(rename.request.body).toEqual({ id: folder.id, name: 'Kettlebell' });
    rename.flush({ folder: rename.request.body });
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(JSON.parse(localStorage.getItem(cloudFoldersKey('me'))!)).toEqual([{ id: folder.id, name: 'Kettlebell' }]);
  });

  it('deletes a folder with one request; the server removes its presets', async () => {
    const service = createService();
    await connect(service, { folders: [kb], presets: [{ ...tabata, folderId: 'f1' }, emom] });

    service.removeFolder('f1');

    const del = await expectRequest('DELETE', '/folders');
    expect(del.request.params.get('id')).toBe('f1');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(service.configs()).toEqual([emom]);
  });

  it('replays offline folder and preset changes in order', async () => {
    const service = createService();
    await connect(service, { presets: [emom] });

    const folder = service.createFolder('KB')!;
    (await expectRequest('PUT', '/folders')).error(new ProgressEvent('error'));
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('offline'));

    const saved = service.save({ ...tabata, folderId: folder.id })!;
    (await expectRequest('PUT', '/folders')).error(new ProgressEvent('error'));
    service.remove('emom');
    (await expectRequest('PUT', '/folders')).error(new ProgressEvent('error'));
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('offline'));
    expect(JSON.parse(localStorage.getItem(cloudPendingKey('me'))!)).toHaveLength(3);

    const synced = service.sync();
    const putFolder = await expectRequest('PUT', '/folders');
    expect(putFolder.request.body).toEqual(folder);
    putFolder.flush({ folder });
    const putPreset = await expectRequest('PUT', '/presets');
    expect(putPreset.request.body).toEqual(saved);
    putPreset.flush({ preset: saved });
    const del = await expectRequest('DELETE', '/presets');
    expect(del.request.params.get('id')).toBe('emom');
    del.flush(null, { status: 204, statusText: 'No Content' });
    (await expectRequest('GET', '/library')).flush(libraryBody({ folders: [folder], presets: [saved] }));
    await synced;

    expect(service.cloudStatus()).toBe('synced');
    expect(service.configs()).toEqual([saved]);
    expect(localStorage.getItem(cloudPendingKey('me'))).toBeNull();
  });

  it('opens the default folder when a sync shows the open folder is gone', async () => {
    const service = createService();
    await connect(service, { folders: [kb] });
    service.openFolder('f1');
    expect(service.openFolderId()).toBe('f1');
    expect(localStorage.getItem(cloudOpenFolderKey('me'))).toBe('f1');

    const synced = service.sync();
    (await expectRequest('GET', '/library')).flush(libraryBody({}));
    await synced;

    expect(service.openFolderId()).toBe('default');
  });

  it('drops a change the API rejects instead of retrying it forever', async () => {
    const service = createService();
    await connect(service);

    service.save(tabata);
    (await expectRequest('PUT', '/presets')).flush(
      { error: 'rounds must be a number' },
      { status: 400, statusText: 'Bad Request' },
    );

    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(localStorage.getItem(cloudPendingKey('me'))).toBeNull();
    expect(showAlert).toHaveBeenCalledWith({
      type: 'danger',
      text: 'Cloud storage rejected the change to "Tabata": rounds must be a number',
    });
  });

  it('drops a preset saved into a folder deleted on another device', async () => {
    const service = createService();
    await connect(service, { folders: [kb] });

    service.save({ ...tabata, folderId: 'f1' });
    (await expectRequest('PUT', '/presets')).flush({ error: 'Folder not found' }, { status: 404, statusText: 'Not Found' });

    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(localStorage.getItem(cloudPendingKey('me'))).toBeNull();
    expect(showAlert).toHaveBeenCalledWith({
      type: 'danger',
      text: 'Cloud storage rejected the change to "Tabata": Folder not found',
    });
  });

  it('falls back to anonymous mode when the key is revoked', async () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([emom]));
    storeConnection('me', [tabata]);
    const service = createService();

    (await expectRequest('GET', '/library')).flush({ error: 'no' }, { status: 401, statusText: 'Unauthorized' });

    await vi.waitFor(() => expect(service.cloudStatus()).toBe('local'));
    expect(service.profile()).toBeNull();
    expect(service.configs()).toEqual([emom]);
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBeNull();
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
  });

  it('copies anonymous presets into the profile with new ids, renaming clashes', async () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([tabata, emom]));
    const service = createService();
    await connect(service, { presets: [tabata] });
    showAlert.mockClear();

    const imported = service.importLocalPresets();

    const first = await expectRequest('PUT', '/presets');
    expect(first.request.body).toEqual({ ...tabata, id: expect.any(String), name: 'Tabata (2)' });
    expect(first.request.body.id).not.toBe('tabata');
    first.flush({});
    const second = await expectRequest('PUT', '/presets');
    expect(second.request.body).toEqual({ ...emom, id: expect.any(String) });
    second.flush({});
    await imported;
    await settle();

    expect(service.configs().map(c => c.name)).toEqual(['Tabata', 'Tabata (2)', 'EMOM']);
    expect(service.localPresetCount()).toBe(0);
    expect(JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY)!)).toEqual([tabata, emom]);
  });

  it('copies anonymous folders into the profile, matching existing folders by name', async () => {
    localStorage.setItem(
      LOCAL_FOLDERS_KEY,
      JSON.stringify([
        { id: 'l-kb', name: 'KB' },
        { id: 'l-cardio', name: 'Cardio' },
        { id: 'l-empty', name: 'Empty' },
      ]),
    );
    localStorage.setItem(
      LOCAL_PRESETS_KEY,
      JSON.stringify([
        { ...tabata, id: 'a', folderId: 'l-kb', name: 'A' },
        { ...tabata, id: 'b', folderId: 'l-cardio', name: 'B' },
      ]),
    );
    const service = createService();
    await connect(service, { folders: [{ id: 'f1', name: 'kb' }], presets: [{ ...tabata, id: 'x', folderId: 'f1', name: 'A' }] });

    const imported = service.importLocalPresets();

    const putFolder = await expectRequest('PUT', '/folders');
    expect(putFolder.request.body).toEqual({ id: expect.any(String), name: 'Cardio' });
    const cardioId = putFolder.request.body.id;
    putFolder.flush({});
    const first = await expectRequest('PUT', '/presets');
    expect(first.request.body).toEqual(expect.objectContaining({ folderId: 'f1', name: 'A (2)' }));
    first.flush({});
    const second = await expectRequest('PUT', '/presets');
    expect(second.request.body).toEqual(expect.objectContaining({ folderId: cardioId, name: 'B' }));
    second.flush({});
    await imported;

    expect(service.folders().map(f => f.name)).toEqual(['My workouts', 'Cardio', 'kb']);
  });
});

describe('IntervalTimerConfigService (cloud storage not configured)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: INTERVAL_TIMER_API_URL, useValue: '' }],
    });
  });

  afterEach(() => localStorage.clear());

  it('ignores a stored key and uses the anonymous presets', () => {
    localStorage.setItem(CLOUD_KEY_KEY, KEY);
    localStorage.setItem(CLOUD_PROFILE_KEY, 'me');
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([tabata]));

    const service = TestBed.inject(IntervalTimerConfigService);

    expect(service.cloudEnabled).toBe(false);
    expect(service.profile()).toBeNull();
    expect(service.cloudStatus()).toBe('local');
    expect(service.configs()).toEqual([tabata]);
  });

  it('stores 100 presets with 100-line exercise lists', () => {
    const service = TestBed.inject(IntervalTimerConfigService);
    const exercises = Array.from({ length: 100 }, () => 'x'.repeat(80)).join('\n');

    for (let i = 0; i < 100; i++) {
      service.save({ ...tabata, id: `w${i}`, name: `Workout ${i}`, exercises });
    }

    expect(JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY)!)).toHaveLength(100);
  });

  it('refuses a save, with a message, when browser storage is full', () => {
    const service = TestBed.inject(IntervalTimerConfigService);
    const showAlert = vi.spyOn(TestBed.inject(AlertService), 'showAlert');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(service.save(tabata)).toBeUndefined();
    setItem.mockRestore();

    expect(service.configs()).toEqual([]);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
  });
});
