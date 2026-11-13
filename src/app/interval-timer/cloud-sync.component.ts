import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IntervalTimerConfigService } from './services/interval-timer-config.service';

const STATUS_LABELS = {
  local: '',
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline, changes are kept on this device',
} as const;

/** Connects this device to a cloud profile with an access key, or shows that presets are local only. */
@Component({
  selector: 'app-cloud-sync',
  imports: [FormsModule],
  template: `
    @if (configService.cloudEnabled) {
      <div class="d-flex flex-wrap gap-2 align-items-center w-100 pt-2 small text-body-secondary" id="cloud-sync">
        @if (configService.profile(); as profile) {
          <span id="cloud-profile"
            ><i class="fa-solid fa-cloud me-1" aria-hidden="true"></i>Cloud: {{ profile }}
            @if (configService.keyLabel(); as label) {
              ({{ label }})
            }
          </span>
          <span id="cloud-status">{{ statusLabel() }}</span>
          @if (configService.localPresetCount() > 0) {
            <button type="button" class="btn btn-sm btn-outline-secondary" id="cloud-import" (click)="importLocal()">
              Copy {{ configService.localPresetCount() }} local
              {{ configService.localPresetCount() === 1 ? 'preset' : 'presets' }} to this profile
            </button>
          }
          <button type="button" class="btn btn-sm btn-outline-secondary" id="cloud-sync-now" (click)="sync()">
            Sync
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="cloud-disconnect" (click)="disconnect()">
            Disconnect
          </button>
        } @else {
          <span id="cloud-profile"><i class="fa-solid fa-hard-drive me-1" aria-hidden="true"></i>Local only</span>
          <!--
            Marked up as a sign-in form so the browser's password manager can save keys and offer them later;
            the profile field only labels the saved entry and is not sent to the API.
          -->
          <form class="d-flex flex-wrap gap-2" (ngSubmit)="connect()">
            <input
              type="text"
              class="form-control form-control-sm w-auto"
              id="cloud-profile-name"
              name="username"
              [ngModel]="profileName()"
              (ngModelChange)="profileName.set($event)"
              placeholder="Profile"
              aria-label="Profile name, for the password manager"
              autocomplete="username"
              [maxlength]="40"
            />
            <input
              type="password"
              class="form-control form-control-sm w-auto"
              id="cloud-key"
              name="password"
              [ngModel]="key()"
              (ngModelChange)="key.set($event)"
              placeholder="Cloud key"
              aria-label="Cloud key"
              autocomplete="current-password"
            />
            <button type="submit" class="btn btn-sm btn-outline-secondary" id="cloud-connect" [disabled]="!canConnect()">
              Connect
            </button>
          </form>
        }
      </div>
    }
  `,
})
export class CloudSyncComponent {
  protected readonly configService = inject(IntervalTimerConfigService);
  protected readonly key = signal('');
  /** Label for the password manager entry only; the API identifies the profile from the key. */
  protected readonly profileName = signal('');
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.configService.cloudStatus()]);
  protected readonly canConnect = computed(
    () => this.key().trim() !== '' && this.configService.cloudStatus() !== 'connecting',
  );

  protected async connect(): Promise<void> {
    if (!this.canConnect()) {
      return;
    }
    if (await this.configService.connect(this.key())) {
      this.key.set('');
    }
  }

  protected disconnect(): void {
    this.configService.disconnect();
  }

  protected sync(): void {
    void this.configService.sync();
  }

  protected importLocal(): void {
    void this.configService.importLocalPresets();
  }
}
