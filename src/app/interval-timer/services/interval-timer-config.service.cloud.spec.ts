import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertService } from '../../components/alert/services/alert.service';
import { IntervalTimerConfig } from '../types/interval-timer-config.interface';
import {
  CLOUD_KEY_KEY,
  CLOUD_PROFILE_KEY,
  cloudCacheKey,
  cloudPendingKey,
  INTERVAL_TIMER_API_URL,
  LOCAL_PRESETS_KEY,
} from './cloud-storage';
import { IntervalTimerConfigService } from './interval-timer-config.service';

const API = 'https://api.example.test';
const KEY = 'k'.repeat(43);

const tabata: IntervalTimerConfig = { name: 'Tabata', rounds: 8, work: 20, rest: 10, playSound: true };
const emom: IntervalTimerConfig = { name: 'EMOM', rounds: 10, work: 60, rest: 0, playSound: false };

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

  function storeConnection(profile = 'me', cache: IntervalTimerConfig[] = []) {
    localStorage.setItem(CLOUD_KEY_KEY, KEY);
    localStorage.setItem(CLOUD_PROFILE_KEY, profile);
    localStorage.setItem(cloudCacheKey(profile), JSON.stringify(cache));
  }

  async function connect(service: IntervalTimerConfigService, remote: IntervalTimerConfig[] = []) {
    const connected = service.connect(KEY);
    (await expectRequest('GET', '/me')).flush({ profile: 'me', label: 'laptop' });
    (await expectRequest('GET', '/presets')).flush({
      presets: remote.map(p => ({ ...p, updatedAt: '2026-01-01T00:00:00.000Z' })),
    });
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

  it('connects with a valid key and loads the profile presets', async () => {
    const service = createService();
    const connected = service.connect(` ${KEY} `);

    const me = await expectRequest('GET', '/me');
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    me.flush({ profile: 'me', label: 'laptop' });
    (await expectRequest('GET', '/presets')).flush({ presets: [{ ...emom, updatedAt: 'x' }] });

    expect(await connected).toBe(true);
    expect(service.profile()).toBe('me');
    expect(service.cloudStatus()).toBe('synced');
    expect(service.configs()).toEqual([emom]);
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBe(KEY);
    expect(JSON.parse(localStorage.getItem(cloudCacheKey('me'))!)).toEqual([emom]);
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

  it('keeps anonymous presets separate from the profile presets', async () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([tabata]));
    const service = createService();
    await connect(service, [emom]);

    expect(service.configs()).toEqual([emom]);
    expect(service.localPresetCount()).toBe(1);

    service.disconnect();

    expect(service.configs()).toEqual([tabata]);
    expect(service.cloudStatus()).toBe('local');
    expect(localStorage.getItem(cloudCacheKey('me'))).toBeNull();
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBeNull();
  });

  it('resumes the stored connection, showing the device copy until the API answers', async () => {
    storeConnection('me', [tabata]);
    const service = createService();

    expect(service.configs()).toEqual([tabata]);
    expect(service.cloudStatus()).toBe('syncing');

    (await expectRequest('GET', '/presets')).flush({ presets: [{ ...emom, updatedAt: 'x' }] });
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(service.configs()).toEqual([emom]);
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
    expect(JSON.parse(localStorage.getItem(cloudCacheKey('me'))!)).toEqual([tabata]);
    expect(localStorage.getItem(LOCAL_PRESETS_KEY)).toBeNull();
    expect(localStorage.getItem(cloudPendingKey('me'))).toBeNull();
  });

  it('deletes presets by name', async () => {
    const service = createService();
    await connect(service, [tabata]);

    service.remove('Tabata');

    const del = await expectRequest('DELETE', '/presets');
    expect(del.request.params.get('name')).toBe('Tabata');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(service.cloudStatus()).toBe('synced'));
    expect(service.configs()).toEqual([]);
  });

  it('queues changes while offline and replays them on the next sync', async () => {
    const service = createService();
    await connect(service);

    service.save(tabata);
    (await expectRequest('PUT', '/presets')).error(new ProgressEvent('error'));

    await vi.waitFor(() => expect(service.cloudStatus()).toBe('offline'));
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    expect(JSON.parse(localStorage.getItem(cloudPendingKey('me'))!)).toHaveLength(1);
    expect(service.configs()).toEqual([tabata]);

    const synced = service.sync();
    (await expectRequest('PUT', '/presets')).flush({ preset: tabata });
    (await expectRequest('GET', '/presets')).flush({ presets: [{ ...tabata, updatedAt: 'x' }] });
    await synced;

    expect(service.cloudStatus()).toBe('synced');
    expect(service.configs()).toEqual([tabata]);
    expect(localStorage.getItem(cloudPendingKey('me'))).toBeNull();
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

  it('falls back to anonymous mode when the key is revoked', async () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([emom]));
    storeConnection('me', [tabata]);
    const service = createService();

    (await expectRequest('GET', '/presets')).flush({ error: 'no' }, { status: 401, statusText: 'Unauthorized' });

    await vi.waitFor(() => expect(service.cloudStatus()).toBe('local'));
    expect(service.profile()).toBeNull();
    expect(service.configs()).toEqual([emom]);
    expect(localStorage.getItem(CLOUD_KEY_KEY)).toBeNull();
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
  });

  it('copies anonymous presets into the profile, renaming clashes', async () => {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify([tabata, emom]));
    const service = createService();
    await connect(service, [tabata]);
    showAlert.mockClear();

    const imported = service.importLocalPresets();

    const first = await expectRequest('PUT', '/presets');
    expect(first.request.body).toEqual({ ...tabata, name: 'Tabata (local)' });
    first.flush({});
    const second = await expectRequest('PUT', '/presets');
    expect(second.request.body).toEqual(emom);
    second.flush({});
    await imported;
    await settle();

    expect(service.configs().map(c => c.name)).toEqual(['Tabata', 'Tabata (local)', 'EMOM']);
    expect(service.localPresetCount()).toBe(0);
    expect(JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY)!)).toEqual([tabata, emom]);
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
      service.save({ ...tabata, name: `Workout ${i}`, exercises });
    }

    expect(JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY)!)).toHaveLength(100);
  });

  it('refuses a save, with a message, when browser storage is full', () => {
    const service = TestBed.inject(IntervalTimerConfigService);
    const showAlert = vi.spyOn(TestBed.inject(AlertService), 'showAlert');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    service.save(tabata);
    setItem.mockRestore();

    expect(service.configs()).toEqual([]);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
  });
});
