import { NgClass } from '@angular/common';
import { Component, computed, effect, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { playBeep } from './utils/beep';

@Component({
  selector: 'app-interval-timer',
  imports: [
    FormsModule,
    NgClass,
  ],
  template: `
    @let active = isTimerActive();
    @let started = remainingTotal() > 0;
    <div class="d-flex flex-column flex-wrap gap-4 p-5 justify-content-center align-items-center border-bottom">
      <h2 class="">Interval Timer</h2>
      <div class="">
        <div
          class="p-5 display-1 shadow-lg fw-bold text-success bg-success-subtle rounded-circle d-flex justify-content-center align-items-center"
          [ngClass]="remaining() === 0 ? 'bg-white' : ''"
          style="width: 200px; height: 200px;"
        >
          {{ remaining() }}
        </div>
        @if (started) {
          <div class="pt-3 text-center">
            Interval {{ rounds() - Math.ceil(remainingTotal() / duration()) + 1 }} of {{ rounds() }}
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
            [ngModel]="duration()" (ngModelChange)="duration.set($event)"
            [disabled]="started"
            [max]="120"
            [min]="10"
            [step]="5"
            placeholder="Duration"
            id="duration"
          >
          <label for="duration" class="form-label">Interval duration</label>
        </div>
        <button
          class="btn"
          (click)="toggleTimerStarted()"
          [ngClass]="started ? 'btn-outline-primary' : 'btn-primary'"
        >{{ started ? 'Stop' : 'Start' }}
        </button>
        @if (started) {
          <button
            class="btn btn-primary"
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
    </div>
  `,
})
export class IntervalTimerComponent {
  rounds = model(10);
  duration = model(30);
  playSound = model(true);
  remainingTotal = signal(0);
  isTimerActive = signal(false);
  remaining = computed(() => this.remainingTotal() % (this.duration() ?? 1));
  protected readonly Math = Math;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private targetTime = 0;

  protected toggleTimerStarted() {
    if (this.remainingTotal() > 0) {
      // stop timer
      this.remainingTotal.set(0);
      this.isTimerActive.set(false);
    } else {
      // start timer
      this.remainingTotal.set(this.duration() * this.rounds());
      this.isTimerActive.set(true);
    }
  }

  protected toggleTimerActive() {
    if (this.isTimerActive()) {
      // pause timer
      this.isTimerActive.set(false);
    } else {
      // resume timer
      this.isTimerActive.set(true);
    }
  }

  private readonly tick = () => {
    const now = Date.now();
    // Calculate true remaining time based on a system clock
    const remaining = Math.max(0, Math.ceil((this.targetTime - now) / 1000));
    this.remainingTotal.set(remaining);

    if (this.playSound() && this.remaining() <= 3) {
      playBeep(this.remaining() === 0 ? 0.5 : 0.2);
    }

    if (this.remainingTotal() <= 0) {
      this.isTimerActive.set(false);
    }
  };

  private readonly manageInterval = effect((onCleanup) => {
    const active = this.isTimerActive();
    const remaining = this.remainingTotal();

    if (remaining <= 0 || !active) {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    } else if (!this.timerInterval) {
      this.targetTime = Date.now() + (remaining * 1000);
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
