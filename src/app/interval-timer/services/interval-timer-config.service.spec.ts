import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertService } from '../../components/alert/services/alert.service';
import { IntervalTimerConfig } from '../types/interval-timer-config.interface';
import { IntervalTimerConfigService } from './interval-timer-config.service';

const STORAGE_KEY = 'interval-timer-configs';
const FOLDERS_KEY = 'interval-timer-folders';
const OPEN_FOLDER_KEY = 'interval-timer-open-folder';

const sampleConfig: IntervalTimerConfig = {
  id: 'p1',
  folderId: 'default',
  name: '10x30/10',
  rounds: 10,
  work: 30,
  rest: 10,
  playSound: true,
};

function preset(id: string, name: string, folderId = 'default'): IntervalTimerConfig {
  return { id, folderId, name, rounds: 1, work: 10, rest: 0, playSound: true };
}

function freshService(): IntervalTimerConfigService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(IntervalTimerConfigService);
}

describe('IntervalTimerConfigService', () => {
  let service: IntervalTimerConfigService;
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(IntervalTimerConfigService);
    alertSpy = vi.spyOn(TestBed.inject(AlertService), 'showAlert');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with an empty configs list when localStorage is empty', () => {
    expect(service.configs()).toEqual([]);
  });

  it('loads existing configs from localStorage on creation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([sampleConfig]));

    expect(freshService().configs()).toEqual([sampleConfig]);
  });

  it('falls back to an empty list when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(freshService().configs()).toEqual([]);
  });

  describe('presets stored before folders', () => {
    beforeEach(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { name: 'A', rounds: 1, work: 10, rest: 0, playSound: true },
          { name: 'B', rounds: 2, work: 10, rest: 0, playSound: true },
        ]),
      );
    });

    it('get ids and the default folder', () => {
      const configs = freshService().configs();

      expect(configs.map(c => c.name)).toEqual(['A', 'B']);
      expect(configs.every(c => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
      expect(new Set(configs.map(c => c.id)).size).toBe(2);
      expect(configs.every(c => c.folderId === 'default')).toBe(true);
    });

    it('keep the same ids across reloads', () => {
      const first = freshService().configs().map(c => c.id);
      const second = freshService().configs().map(c => c.id);

      expect(second).toEqual(first);
    });
  });

  it('shows a workout whose folder no longer exists in the default folder', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([preset('a', 'Orphan', 'gone')]));

    const fresh = freshService();

    expect(fresh.configs()[0].folderId).toBe('default');
    expect(fresh.openFolderConfigs().map(c => c.id)).toEqual(['a']);
  });

  describe('save()', () => {
    it('adds a new config and persists it', () => {
      service.save(sampleConfig);

      expect(service.configs()).toEqual([sampleConfig]);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([sampleConfig]);
    });

    it('replaces the config with the same id in place', () => {
      service.save(sampleConfig);
      service.save({ ...sampleConfig, name: 'Renamed', rounds: 20 });

      expect(service.configs()).toEqual([{ ...sampleConfig, name: 'Renamed', rounds: 20 }]);
    });

    it('returns the saved config and announces its final name', () => {
      service.save(preset('a', 'Tabata'));

      const saved = service.save(preset('b', 'tabata'));

      expect(saved?.name).toBe('tabata (2)');
      expect(service.load('b')?.name).toBe('tabata (2)');
      expect(alertSpy).toHaveBeenLastCalledWith({ type: 'success', text: 'Configuration "tabata (2)" saved!' });
    });

    it('lets a workout keep its own name in another case', () => {
      service.save(preset('a', 'Tabata'));

      expect(service.save(preset('a', 'TABATA'))?.name).toBe('TABATA');
    });

    it('allows the same name in another folder', () => {
      service.createFolder('Kettlebell');
      const folderId = service.folders()[1].id;
      service.save(preset('a', 'Tabata'));

      expect(service.save(preset('b', 'Tabata', folderId))?.name).toBe('Tabata');
    });
  });

  describe('load()', () => {
    it('returns the config with the given id', () => {
      service.save(sampleConfig);

      expect(service.load('p1')).toEqual(sampleConfig);
      expect(service.load(sampleConfig.name)).toBeUndefined();
    });
  });

  describe('findUniqueByName()', () => {
    it('returns the only workout with that name', () => {
      service.save(preset('a', 'Tabata'));

      expect(service.findUniqueByName('Tabata')?.id).toBe('a');
    });

    it('returns undefined when the name is ambiguous', () => {
      service.createFolder('Kettlebell');
      service.save(preset('a', 'Tabata'));
      service.save(preset('b', 'Tabata', service.folders()[1].id));

      expect(service.findUniqueByName('Tabata')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('removes by id only and persists', () => {
      service.save(preset('a', 'Same'));
      service.save(preset('b', 'Other'));

      service.remove('a');

      expect(service.configs().map(c => c.id)).toEqual(['b']);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).map((c: IntervalTimerConfig) => c.id)).toEqual(['b']);
    });

    it('is a no-op for an unknown id', () => {
      service.save(sampleConfig);

      service.remove('does-not-exist');

      expect(service.configs()).toEqual([sampleConfig]);
    });
  });

  describe('folders', () => {
    it('always lists the default folder first', () => {
      expect(service.folders()).toEqual([{ id: 'default', name: 'My workouts' }]);
    });

    it('creates folders, sorted by name after the default folder, and persists them', () => {
      const kb = service.createFolder('Kettlebell');
      service.createFolder('  Cardio  ');

      expect(kb).toEqual({ id: expect.any(String), name: 'Kettlebell' });
      expect(service.folders().map(f => f.name)).toEqual(['My workouts', 'Cardio', 'Kettlebell']);
      expect(freshService().folders().map(f => f.name)).toEqual(['My workouts', 'Cardio', 'Kettlebell']);
      expect(JSON.parse(localStorage.getItem(FOLDERS_KEY)!)).toHaveLength(2);
    });

    it('refuses a name that clashes with another folder', () => {
      service.createFolder('Kettlebell');

      expect(service.createFolder(' kettlebell ')).toBeUndefined();
      expect(alertSpy).toHaveBeenLastCalledWith({ type: 'danger', text: 'A folder named "kettlebell" already exists.' });
      expect(service.createFolder('my workouts')).toBeUndefined();
      expect(service.folders()).toHaveLength(2);
    });

    it('refuses empty and too long names', () => {
      expect(service.createFolder('   ')).toBeUndefined();
      expect(service.createFolder('n'.repeat(41))).toBeUndefined();
      expect(alertSpy).toHaveBeenLastCalledWith({ type: 'danger', text: 'Folder names are 1-40 characters.' });
      expect(service.folders()).toHaveLength(1);
    });

    it('refuses the 51st folder', () => {
      for (let i = 1; i <= 50; i++) {
        expect(service.createFolder(`F${i}`)).toBeDefined();
      }

      expect(service.createFolder('F51')).toBeUndefined();
      expect(alertSpy).toHaveBeenLastCalledWith({ type: 'danger', text: 'You can have at most 50 folders.' });
    });

    it('renames a folder', () => {
      const kb = service.createFolder('Kettlebell')!;

      expect(service.renameFolder(kb.id, 'KB')).toBe(true);
      expect(service.folders()[1]).toEqual({ id: kb.id, name: 'KB' });
      expect(service.renameFolder(kb.id, 'my workouts')).toBe(false);
    });

    it('lets a folder be renamed to its own name in another case', () => {
      const kb = service.createFolder('Kettlebell')!;

      expect(service.renameFolder(kb.id, 'KETTLEBELL')).toBe(true);
    });

    it('never renames or deletes the default folder', () => {
      service.save(preset('a', 'Tabata'));

      expect(service.renameFolder('default', 'Other')).toBe(false);
      service.removeFolder('default');

      expect(service.folders()).toEqual([{ id: 'default', name: 'My workouts' }]);
      expect(service.configs()).toHaveLength(1);
    });

    it('deletes a folder with its workouts and opens the default folder', () => {
      const kb = service.createFolder('Kettlebell')!;
      service.save(preset('a', 'Swing', kb.id));
      service.save(preset('b', 'Tabata'));
      service.openFolder(kb.id);

      service.removeFolder(kb.id);

      expect(service.folders().map(f => f.id)).toEqual(['default']);
      expect(service.configs().map(c => c.id)).toEqual(['b']);
      expect(service.openFolderId()).toBe('default');
    });
  });

  describe('open folder', () => {
    it('starts in the default folder', () => {
      expect(service.openFolderId()).toBe('default');
    });

    it('is remembered on this device', () => {
      const kb = service.createFolder('Kettlebell')!;

      service.openFolder(kb.id);

      expect(service.openFolderId()).toBe(kb.id);
      expect(freshService().openFolderId()).toBe(kb.id);
    });

    it('falls back to the default folder when the remembered folder no longer exists', () => {
      localStorage.setItem(OPEN_FOLDER_KEY, 'gone');

      expect(freshService().openFolderId()).toBe('default');
    });

    it('ignores unknown folders', () => {
      service.openFolder('gone');

      expect(service.openFolderId()).toBe('default');
    });

    it("lists the open folder's workouts sorted by name", () => {
      const kb = service.createFolder('Kettlebell')!;
      service.save(preset('a', 'zebra'));
      service.save(preset('b', 'Alpha'));
      service.save(preset('c', 'Swing', kb.id));

      expect(service.openFolderConfigs().map(c => c.name)).toEqual(['Alpha', 'zebra']);
      service.openFolder(kb.id);
      expect(service.openFolderConfigs().map(c => c.name)).toEqual(['Swing']);
    });
  });
});
