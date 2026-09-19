import { NgClass } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertService } from '../components/alert/services/alert.service';
import { IntervalTimerConfigService } from './services/interval-timer-config.service';
import { YouTubePlayerService } from './services/youtube-player.service';
import { playBeep } from './utils/beep';
import { extractYouTubeVideoId } from './utils/youtube';
import { YouTubePlayerHandle } from './utils/youtube-player';

@Component({
  selector: 'app-interval-timer',
  imports: [
    FormsModule,
    NgClass,
  ],
  template: `
    @let active = isTimerActive();
    @let started = sessionActive();
    <div class="d-flex flex-column gap-4 mx-auto" style="max-width: 1000px;">

      <!-- Display: title + counter on the left, current exercise prominently top-right -->
      <div class="d-flex flex-column flex-lg-row gap-4 align-items-center align-items-lg-start">
        <div class="d-flex flex-column align-items-center w-100 flex-lg-fill">
          <h2 class="fs-1">Interval Timer</h2>
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
        <div class="d-flex flex-column align-items-center align-items-lg-end justify-content-start w-100 flex-lg-fill">
          @if (currentExercise(); as exercise) {
            <div id="exercise-line"
                 class="fs-2 fw-normal text-secondary text-center text-lg-end px-4 py-3 bg-secondary-subtle border border-secondary-subtle rounded-3 shadow-sm">
              {{ exercise }}
            </div>
          }
          @if (started && videoId(); as id) {
            <div id="video-panel" class="w-100" style="max-width: 480px; aspect-ratio: 16 / 9;">
              <div #videoPlayerContainer class="w-100 h-100"></div>
            </div>
          }
        </div>
      </div>

      <!-- Configuration: settings + saved configs on the left, exercise list on the right -->
      <div class="d-flex flex-column flex-lg-row gap-4 justify-content-center align-items-start">
        <div class="d-flex flex-column flex-wrap gap-4 justify-content-center align-items-center">
          <div
            class="text-center gap-2 d-flex flex-column flex-md-row my-3 align-items-center container-fluid justify-content-center">
            <div class="form-floating col-md-3 col-6 flex-shrink-1">
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
            <div class="form-floating col-md-3 col-6 flex-shrink-1">
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
            <div class="form-floating col-md-3 col-6 flex-shrink-1">
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
            <button
              class="btn btn-outline-secondary"
              id="reset-settings"
              (click)="resetSettings()"
              [disabled]="started"
            >Reset
            </button>
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
            <button class="btn btn-sm btn-outline-secondary" id="copy-config-link" (click)="copyConfigLink()"
                    [disabled]="!selectedConfigName()">Copy Link
            </button>
            <input type="text" class="form-control form-control-sm w-auto" [ngModel]="newConfigName()"
                   (ngModelChange)="newConfigName.set($event)" [disabled]="started" placeholder="Config name"
                   id="newConfigName" aria-label="Config name">
            <button class="btn btn-sm btn-outline-secondary" (click)="saveCurrentConfig()"
                    [disabled]="started">Save
            </button>
          </div>
        </div>

        <div class="d-flex flex-column gap-2 w-100" style="max-width: 320px;">
          <label for="exercises" class="form-label fw-semibold">Exercises <span class="text-body-secondary fw-normal">(optional)</span></label>
          <textarea
            class="form-control"
            id="exercises"
            rows="8"
            [ngModel]="exercisesText()" (ngModelChange)="exercisesText.set($event)"
            [disabled]="started"
            placeholder="One exercise per line, e.g.&#10;Push-ups&#10;Squats&#10;Plank"
          ></textarea>

          <label for="videoUrl" class="form-label fw-semibold">Video <span class="text-body-secondary fw-normal">(optional)</span></label>
          <input
            type="text"
            class="form-control"
            id="videoUrl"
            [ngModel]="videoUrl()" (ngModelChange)="videoUrl.set($event)"
            [disabled]="started"
            placeholder="YouTube video, Shorts, or share link"
          >
          @if (videoUrl() && !videoId()) {
            <div class="form-text text-danger">Enter a valid YouTube URL</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class IntervalTimerComponent {
  rounds = model(10);
  work = model(30);
  rest = model(0);
  playSound = model(true);
  exercisesText = model('');
  videoUrl = model('');

  protected readonly videoId = computed(() => extractYouTubeVideoId(this.videoUrl()));
  private readonly videoPlayerContainer = viewChild<ElementRef<HTMLDivElement>>('videoPlayerContainer');
  private readonly youtubePlayerService = inject(YouTubePlayerService);
  private videoPlayer: YouTubePlayerHandle | null = null;

  phase = signal<'work' | 'rest'>('work');
  currentRound = signal(1);
  phaseRemaining = signal(0);
  sessionActive = signal(false);
  isTimerActive = signal(false);

  remaining = computed(() => this.phaseRemaining());

  private readonly exerciseLines = computed<string[]>(() => {
    const text = this.exercisesText();
    if (text.trim() === '') {
      return [];
    }
    return text.replace(/\n$/, '').split('\n');
  });

  protected readonly currentExercise = computed<string | null>(() => {
    const lines = this.exerciseLines();
    if (lines.length === 0) {
      return null;
    }

    if (!this.sessionActive()) {
      return `Next: ${this.exerciseLabelForRound(1, lines)}`;
    }

    const phase = this.phase();
    const round = phase === 'work' ? this.currentRound() : this.currentRound() + 1;
    const label = this.exerciseLabelForRound(round, lines);

    return phase === 'rest' ? `Next: ${label}` : label;
  });

  private exerciseLabelForRound(round: number, lines: string[]): string {
    const line = lines[(round - 1) % lines.length].trim();
    return line === '' ? 'Staple exercise' : line;
  }

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private targetTime = 0;

  private readonly configService = inject(IntervalTimerConfigService);
  protected readonly savedConfigs = this.configService.configs;
  protected selectedConfigName = signal('');
  protected newConfigName = signal('');

  private readonly route = inject(ActivatedRoute);

  constructor() {
    const configName = this.route.snapshot.queryParamMap.get('config');
    if (configName) {
      this.selectedConfigName.set(configName);
      this.loadSelectedConfig();
    }
  }

  protected loadSelectedConfig(): void {
    const config = this.configService.load(this.selectedConfigName());
    if (!config) {
      return;
    }
    this.rounds.set(config.rounds);
    this.work.set(config.work);
    this.rest.set(config.rest);
    this.playSound.set(config.playSound);
    this.exercisesText.set(config.exercises ?? '');
    this.videoUrl.set(config.videoUrl ?? '');
  }

  protected saveCurrentConfig(): void {
    const typedName = this.newConfigName().trim();
    const existingSelection = this.selectedConfigName();
    const name = typedName || existingSelection || this.generateDefaultName();

    this.configService.save({
      name,
      rounds: this.rounds(),
      work: this.work(),
      rest: this.rest(),
      playSound: this.playSound(),
      exercises: this.exercisesText(),
      videoUrl: this.videoUrl(),
    });
    this.newConfigName.set('');

    if (typedName || existingSelection) {
      this.selectedConfigName.set(name);
    }
  }

  protected deleteSelectedConfig(): void {
    if (!this.selectedConfigName()) {
      return;
    }
    this.configService.remove(this.selectedConfigName());
    this.selectedConfigName.set('');
  }

  private readonly alertService = inject(AlertService);

  protected async copyConfigLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}?config=${encodeURIComponent(this.selectedConfigName())}`;
    await navigator.clipboard.writeText(url);
    this.alertService.showAlert({ type: 'success', text: 'Link copied!' });
  }

  private generateDefaultName(): string {
    const rest = this.rest() > 0 ? `/${this.rest()}` : '';
    const sound = this.playSound() ? '' : ' (silent)';
    return `${this.rounds()}x${this.work()}${rest}${sound}`;
  }

  protected resetSettings(): void {
    this.rounds.set(10);
    this.work.set(30);
    this.rest.set(0);
    this.playSound.set(true);
    this.exercisesText.set('');
    this.videoUrl.set('');
    this.newConfigName.set('');
    this.selectedConfigName.set('');
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

  private readonly manageVideoPlayer = effect((onCleanup) => {
    const running = this.sessionActive();
    const id = this.videoId();
    const container = this.videoPlayerContainer();

    if (running && id && container) {
      this.youtubePlayerService.create(container.nativeElement, id).then(handle => {
        this.videoPlayer = handle;
        handle.play();
      });
    }

    onCleanup(() => {
      if (this.videoPlayer) {
        this.videoPlayer.destroy();
        this.videoPlayer = null;
      }
    });
  });

  private readonly syncVideoPlaybackState = effect(() => {
    const active = this.isTimerActive();
    if (!this.videoPlayer) {
      return;
    }
    if (active) {
      this.videoPlayer.play();
    } else {
      this.videoPlayer.pause();
    }
  });
}
