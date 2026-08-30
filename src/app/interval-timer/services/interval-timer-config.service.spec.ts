import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertService } from '../../components/alert/services/alert.service';
import { IntervalTimerConfig } from '../types/interval-timer-config.interface';
import { IntervalTimerConfigService } from './interval-timer-config.service';

const STORAGE_KEY = 'interval-timer-configs';

const sampleConfig: IntervalTimerConfig = {
  name: '10x30/10',
  rounds: 10,
  work: 30,
  rest: 10,
  playSound: true,
};

describe('IntervalTimerConfigService', () => {
  let service: IntervalTimerConfigService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(IntervalTimerConfigService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts with an empty configs list when localStorage is empty', () => {
    expect(service.configs()).toEqual([]);
  });

  it('loads existing configs from localStorage on creation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([sampleConfig]));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(IntervalTimerConfigService);

    expect(freshService.configs()).toEqual([sampleConfig]);
  });

  it('falls back to an empty list when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(IntervalTimerConfigService);

    expect(freshService.configs()).toEqual([]);
  });

  describe('save()', () => {
    it('adds a new config to the signal', () => {
      service.save(sampleConfig);

      expect(service.configs()).toEqual([sampleConfig]);
    });

    it('persists the config to localStorage', () => {
      service.save(sampleConfig);

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([sampleConfig]);
    });

    it('overwrites an existing config with the same name instead of duplicating it', () => {
      service.save(sampleConfig);
      const updated: IntervalTimerConfig = { ...sampleConfig, rounds: 20 };

      service.save(updated);

      expect(service.configs()).toEqual([updated]);
    });

    it('shows a success alert', () => {
      const alertService = TestBed.inject(AlertService);
      const showAlertSpy = vi.spyOn(alertService, 'showAlert');

      service.save(sampleConfig);

      expect(showAlertSpy).toHaveBeenCalledWith({
        type: 'success',
        text: expect.stringContaining(sampleConfig.name),
      });
    });
  });

  describe('load()', () => {
    it('returns the config matching the given name', () => {
      service.save(sampleConfig);

      expect(service.load(sampleConfig.name)).toEqual(sampleConfig);
    });

    it('returns undefined when no config matches', () => {
      expect(service.load('does-not-exist')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('removes the matching config from the signal', () => {
      service.save(sampleConfig);

      service.remove(sampleConfig.name);

      expect(service.configs()).toEqual([]);
    });

    it('persists the removal to localStorage', () => {
      service.save(sampleConfig);

      service.remove(sampleConfig.name);

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
    });

    it('is a no-op when the name does not match any config', () => {
      service.save(sampleConfig);

      service.remove('does-not-exist');

      expect(service.configs()).toEqual([sampleConfig]);
    });
  });
});
