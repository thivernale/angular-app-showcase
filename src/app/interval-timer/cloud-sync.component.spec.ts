import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSyncComponent } from './cloud-sync.component';
import { CloudStatus, IntervalTimerConfigService } from './services/interval-timer-config.service';

class FakeConfigService {
  cloudEnabled = true;
  profile = signal<string | null>(null);
  keyLabel = signal<string | null>(null);
  cloudStatus = signal<CloudStatus>('local');
  localPresetCount = signal(0);
  connect = vi.fn().mockResolvedValue(true);
  disconnect = vi.fn();
  sync = vi.fn().mockResolvedValue(undefined);
  importLocalPresets = vi.fn().mockResolvedValue(undefined);
}

describe('CloudSyncComponent', () => {
  let fixture: ComponentFixture<CloudSyncComponent>;
  let service: FakeConfigService;
  let el: HTMLElement;

  function create(configure: (s: FakeConfigService) => void = () => undefined) {
    service = new FakeConfigService();
    configure(service);
    TestBed.configureTestingModule({
      imports: [CloudSyncComponent],
      providers: [{ provide: IntervalTimerConfigService, useValue: service }],
    });
    fixture = TestBed.createComponent(CloudSyncComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const query = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);

  it('renders nothing when cloud storage is not configured', () => {
    create(s => (s.cloudEnabled = false));
    expect(query('#cloud-sync')).toBeNull();
  });

  describe('in anonymous mode', () => {
    beforeEach(() => create());

    it('shows that presets are local only', () => {
      expect(query('#cloud-profile')?.textContent).toContain('Local only');
    });

    it('marks the form up for password managers', () => {
      const profile = query<HTMLInputElement>('#cloud-profile-name')!;
      const key = query<HTMLInputElement>('#cloud-key')!;

      expect(profile.getAttribute('autocomplete')).toBe('username');
      expect(key.type).toBe('password');
      expect(key.getAttribute('autocomplete')).toBe('current-password');
      expect(key.form).toBe(profile.form);
    });

    it('connects with the key only, ignoring the profile label', async () => {
      const profile = query<HTMLInputElement>('#cloud-profile-name')!;
      profile.value = 'me';
      profile.dispatchEvent(new Event('input'));
      const key = query<HTMLInputElement>('#cloud-key')!;
      key.value = 'secret';
      key.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      query<HTMLButtonElement>('#cloud-connect')!.click();
      await fixture.whenStable();

      expect(service.connect).toHaveBeenCalledWith('secret');
    });

    it('enables Connect only once a key is typed', async () => {
      expect(query<HTMLButtonElement>('#cloud-connect')?.disabled).toBe(true);

      const input = query<HTMLInputElement>('#cloud-key')!;
      input.value = 'secret';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(query<HTMLButtonElement>('#cloud-connect')?.disabled).toBe(false);
    });

    it('connects with the typed key and clears the field', async () => {
      const input = query<HTMLInputElement>('#cloud-key')!;
      input.value = 'secret';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      query<HTMLButtonElement>('#cloud-connect')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(service.connect).toHaveBeenCalledWith('secret');
      await vi.waitFor(() => expect(query<HTMLInputElement>('#cloud-key')?.value).toBe(''));
    });
  });

  describe('when connected', () => {
    beforeEach(() =>
      create(s => {
        s.profile.set('me');
        s.keyLabel.set('laptop');
        s.cloudStatus.set('synced');
        s.localPresetCount.set(2);
      }),
    );

    it('shows the profile with the key label, and the sync status', () => {
      expect(query('#cloud-profile')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Cloud: me (laptop)');
      expect(query('#cloud-status')?.textContent).toContain('Up to date');
      expect(query('#cloud-key')).toBeNull();
    });

    it('shows the profile alone while the key label is not known', () => {
      service.keyLabel.set(null);
      fixture.detectChanges();
      expect(query('#cloud-profile')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Cloud: me');
    });

    it('offers to copy the anonymous presets', () => {
      const button = query<HTMLButtonElement>('#cloud-import')!;
      expect(button.textContent).toContain('Copy 2 local presets');
      button.click();
      expect(service.importLocalPresets).toHaveBeenCalled();
    });

    it('hides the copy button when there is nothing to copy', () => {
      service.localPresetCount.set(0);
      fixture.detectChanges();
      expect(query('#cloud-import')).toBeNull();
    });

    it('syncs and disconnects on request', () => {
      query<HTMLButtonElement>('#cloud-sync-now')!.click();
      query<HTMLButtonElement>('#cloud-disconnect')!.click();
      expect(service.sync).toHaveBeenCalled();
      expect(service.disconnect).toHaveBeenCalled();
    });
  });
});
