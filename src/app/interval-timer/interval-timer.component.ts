import { NgClass } from '@angular/common';
import { Component, computed, effect, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IntervalTimerConfigService } from './services/interval-timer-config.service';
import { playBeep } from './utils/beep';

@Component({
  selector: 'app-interval-timer',
  imports: [
    FormsModule,
    NgClass,
  ],
  template: `
    @let active = isTimerActive();
    @let started = sessionActive();
    <div class="d-flex flex-column flex-wrap gap-4 p-5 justify-content-center align-items-center border-bottom">
      <h2 class="fs-1">Interval Timer</h2>
      <div class="d-flex flex-column align-items-center">
        <div
          id="countdown-circle"
          class="p-5 display-1 shadow-lg fw-bold rounded-circle d-flex justify-content-center align-items-center"
          [ngClass]="{
            'text-success bg-success-subtle': phase() === 'work',
            'text-secondary bg-secondary-subtle': phase() === 'rest',
            'bg-white': remaining() === 0
          }"
          style="width: 200px; height: 200px;"
        >
          {{ remaining() }}
        </div>
        @if (started) {
          <div class="pt-3 fs-3 text-center">
            Interval {{ currentRound() }} of {{ rounds() }} — {{ phase() === 'work' ? 'Work' : 'Rest' }}
          </div>
        }
      </div>
      <div
        class="text-center gap-2 d-flex flex-column flex-md-row my-3 align-items-center container-fluid justify-content-center">
        <div class="form-floating col-md-2 col-6">
          <input
            type="number"
            class="form-control"
            [ngModel]="rounds()" (ngModelChange)="rounds.set($event)"
            [disabled]="started"
            [max]="60"
            [min]="0"
            [step]="1"
            placeholder="Rounds"
            id="rounds"
          >
          <label for="rounds" class="form-label">Number of rounds</label>
        </div>
        <div class="form-floating col-md-2 col-6">
          <input
            type="number"
            class="form-control"
            [ngModel]="work()" (ngModelChange)="work.set($event)"
            [disabled]="started"
            [max]="120"
            [min]="10"
            [step]="5"
            placeholder="Work"
            id="work"
          >
          <label for="work" class="form-label">Work duration</label>
        </div>
        <div class="form-floating col-md-2 col-6">
          <input
            type="number"
            class="form-control"
            [ngModel]="rest()" (ngModelChange)="rest.set($event)"
            [disabled]="started"
            [max]="60"
            [min]="0"
            [step]="5"
            placeholder="Rest"
            id="rest"
          >
          <label for="rest" class="form-label">Rest duration</label>
        </div>
        <button
          class="btn"
          id="toggle-started"
          (click)="toggleTimerStarted()"
          [ngClass]="started ? 'btn-outline-primary' : 'btn-primary'"
        >{{ started ? 'Stop' : 'Start' }}
        </button>
        @if (started) {
          <button
            class="btn btn-primary"
            id="toggle-active"
            (click)="toggleTimerActive()"
          >{{ active ? 'Pause' : 'Resume' }}
          </button>
        }
        <label class="d-flex gap-2 align-items-center">
          <input type="checkbox" class="form-check-input" name="playSound" [ngModel]="playSound()"
                 (ngModelChange)="playSound.set($event)">
          <span class="form-check-label">Sound</span>
        </label>
      </div>

      <div
        class="d-flex flex-column flex-lg-row gap-2 align-items-center justify-content-center w-100 mt-4 pt-3 border-top small text-body-secondary">
        <select class="form-select form-select-sm w-auto" [ngModel]="selectedConfigName()"
                (ngModelChange)="selectedConfigName.set($event)" [disabled]="started" id="savedConfigs"
                aria-label="Saved configurations">
          <option value="" disabled>Saved configs…</option>
          @for (c of savedConfigs(); track c.name) {
            <option [value]="c.name">{{ c.name }}</option>
          }
        </select>
        <button class="btn btn-sm btn-outline-secondary" (click)="loadSelectedConfig()"
                [disabled]="started || !selectedConfigName()">Load
        </button>
        <button class="btn btn-sm btn-outline-secondary" (click)="deleteSelectedConfig()"
                [disabled]="started || !selectedConfigName()">Delete
        </button>
        <input type="text" class="form-control form-control-sm w-auto" [ngModel]="newConfigName()"
               (ngModelChange)="newConfigName.set($event)" [disabled]="started" placeholder="Config name"
               id="newConfigName" aria-label="Config name">
        <button class="btn btn-sm btn-outline-secondary" (click)="saveCurrentConfig()"
                [disabled]="started">Save
        </button>
      </div>
    </div>
  `,
})
export class IntervalTimerComponent {
  rounds = model(10);
  work = model(30);
  rest = model(0);
  playSound = model(true);

  phase = signal<'work' | 'rest'>('work');
  currentRound = signal(1);
  phaseRemaining = signal(0);
  sessionActive = signal(false);
  isTimerActive = signal(false);

  remaining = computed(() => this.phaseRemaining());
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private targetTime = 0;

  private readonly configService = inject(IntervalTimerConfigService);
  protected readonly savedConfigs = this.configService.configs;
  protected selectedConfigName = signal('');
  protected newConfigName = signal('');

  protected loadSelectedConfig(): void {
    const config = this.configService.load(this.selectedConfigName());
    if (!config) {
      return;
    }
    this.rounds.set(config.rounds);
    this.work.set(config.work);
    this.rest.set(config.rest);
    this.playSound.set(config.playSound);
  }

  protected saveCurrentConfig(): void {
    const name = this.newConfigName().trim() || this.generateDefaultName();
    this.configService.save({
      name,
      rounds: this.rounds(),
      work: this.work(),
      rest: this.rest(),
      playSound: this.playSound(),
    });
    this.newConfigName.set('');
    this.selectedConfigName.set(name);
  }

  protected deleteSelectedConfig(): void {
    if (!this.selectedConfigName()) {
      return;
    }
    this.configService.remove(this.selectedConfigName());
    this.selectedConfigName.set('');
  }

  private generateDefaultName(): string {
    const rest = this.rest() > 0 ? `/${this.rest()}` : '';
    const sound = this.playSound() ? '' : ' (silent)';
    return `${this.rounds()}x${this.work()}${rest}${sound}`;
  }

  protected toggleTimerStarted() {
    if (this.sessionActive()) {
      // stop timer
      this.sessionActive.set(false);
      this.isTimerActive.set(false);
      this.phase.set('work');
      this.currentRound.set(1);
      this.phaseRemaining.set(0);
    } else {
      // start timer
      this.phase.set('work');
      this.currentRound.set(1);
      this.phaseRemaining.set(this.work());
      this.sessionActive.set(true);
      this.isTimerActive.set(true);
    }
  }

  protected toggleTimerActive() {
    this.isTimerActive.update(active => !active);
  }

  private readonly tick = () => {
    const now = Date.now();
    // Calculate true remaining time based on a system clock
    const remaining = Math.max(0, Math.ceil((this.targetTime - now) / 1000));
    this.phaseRemaining.set(remaining);

    if (this.playSound() && remaining <= 3) {
      playBeep(remaining === 0 ? 0.5 : 0.2);
    }

    if (remaining <= 0) {
      this.advancePhase();
    }
  };

  private advancePhase() {
    const isLastRound = this.currentRound() >= this.rounds();

    if (this.phase() === 'work') {
      if (isLastRound) {
        this.completeSession();
        return;
      }
      if (this.rest() > 0) {
        this.phase.set('rest');
        this.phaseRemaining.set(this.rest());
        this.targetTime = Date.now() + this.rest() * 1000;
        return;
      }
      this.startNextWorkRound();
      return;
    }

    this.startNextWorkRound();
  }

  private startNextWorkRound() {
    this.currentRound.update(round => round + 1);
    this.phase.set('work');
    this.phaseRemaining.set(this.work());
    this.targetTime = Date.now() + this.work() * 1000;
  }

  private completeSession() {
    this.isTimerActive.set(false);
    this.sessionActive.set(false);
    this.phaseRemaining.set(0);
    this.currentRound.set(1);
    this.phase.set('work');
  }

  private readonly manageInterval = effect((onCleanup) => {
    const active = this.isTimerActive();
    const running = this.sessionActive();

    if (!running || !active) {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    } else if (!this.timerInterval) {
      this.targetTime = Date.now() + (this.phaseRemaining() * 1000);
      this.timerInterval = setInterval(this.tick, 1_000);
    }

    onCleanup(() => {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    });
  });
}
