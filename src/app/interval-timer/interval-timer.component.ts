import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertService } from '../components/alert/services/alert.service';
import { IntervalTimerConfigService } from './services/interval-timer-config.service';
import { YouTubePlayerService } from './services/youtube-player.service';
import { playBeep } from './utils/beep';
import { extractYouTubeVideoId } from './utils/youtube';
import { YouTubePlayerHandle } from './utils/youtube-player';

const DEFAULT_SETTINGS: Readonly<{
  rounds: number;
  work: number;
  rest: number;
  intro: number;
  playSound: boolean;
  exercisesText: string;
  videoUrl: string;
}> = {
  rounds: 10,
  work: 30,
  rest: 0,
  intro: 0,
  playSound: true,
  exercisesText: '',
  videoUrl: '',
};

@Component({
  selector: 'app-interval-timer',
  imports: [FormsModule, NgClass, NgTemplateOutlet],
  template: `
    @let active = isTimerActive();
    @let started = sessionActive();
    <div class="d-flex flex-column gap-4 mx-auto" style="max-width: 1000px;">
      <!-- Display: title + counter on the left, current exercise prominently top-right -->
      <div class="d-flex flex-column flex-lg-row gap-4 align-items-center align-items-lg-start">
        <div id="timer-display" class="d-flex flex-column align-items-center w-100 flex-lg-fill">
          <h2 id="timer-title" class="fs-1 text-center">{{ title() }}</h2>
          <div
            id="countdown-circle"
            class="p-5 display-1 shadow-lg fw-bold rounded-circle d-flex justify-content-center align-items-center"
            [ngClass]="{
              'text-success bg-success-subtle': phase() === 'work',
              'text-secondary bg-secondary-subtle': phase() === 'rest' || phase() === 'intro',
              'bg-white': phaseRemaining() === 0,
            }"
            style="width: 200px; height: 200px;"
          >
            {{ phaseRemaining() }}
          </div>
          @if (started) {
            <div id="phase-label" class="pt-3 fs-3 text-center">
              @if (phase() === 'intro') {
                Get Ready
              } @else {
                Interval {{ currentRound() }} of {{ rounds() }} —
                {{ phase() === 'work' ? 'Work' : 'Rest' }}
              }
            </div>
            <div class="d-flex gap-2 align-items-center justify-content-center pt-3">
              <ng-container [ngTemplateOutlet]="sessionControls" />
            </div>
          }
        </div>
        <!-- Rendered only when it has content, so the countdown centres on the page otherwise -->
        @if (currentExercise() || (started && videoId())) {
          <div
            id="side-panel"
            class="d-flex flex-column align-items-center align-items-lg-end justify-content-start w-100 flex-lg-fill"
          >
            @if (currentExercise(); as exercise) {
              <div
                id="exercise-line"
                class="fs-2 fw-normal text-secondary text-center text-lg-end px-4 py-3 bg-secondary-subtle border border-secondary-subtle rounded-3 shadow-sm"
              >
                {{ exercise }}
              </div>
            }
            @if (started && videoId(); as id) {
              <div id="video-panel" class="w-100" style="max-width: 480px; aspect-ratio: 16 / 9;">
                <div #videoPlayerContainer class="w-100 h-100"></div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Configuration: settings + saved configs on the left, exercise list on the right.
           Hidden while a session runs; the session controls then sit under the countdown. -->
      @if (!started) {
        <div class="d-flex flex-column flex-lg-row gap-4 justify-content-center align-items-start">
          <div class="d-flex flex-column flex-wrap gap-4 justify-content-center align-items-center">
            <div
              class="text-center gap-2 d-flex flex-column flex-wrap flex-md-row my-3 align-items-center container-fluid justify-content-start"
            >
              <div class="form-floating col-md-3 col-6 flex-shrink-1">
                <input
                  type="number"
                  class="form-control"
                  [ngModel]="rounds()"
                  (ngModelChange)="rounds.set($event)"
                  [max]="60"
                  [min]="1"
                  [step]="1"
                  placeholder="Rounds"
                  id="rounds"
                />
                <label for="rounds" class="form-label">Number of rounds</label>
              </div>
              <div class="form-floating col-md-3 col-6 flex-shrink-1">
                <input
                  type="number"
                  class="form-control"
                  [ngModel]="work()"
                  (ngModelChange)="work.set($event)"
                  [max]="120"
                  [min]="10"
                  [step]="5"
                  placeholder="Work"
                  id="work"
                />
                <label for="work" class="form-label">Work duration</label>
              </div>
              <div class="form-floating col-md-3 col-6 flex-shrink-1">
                <input
                  type="number"
                  class="form-control"
                  [ngModel]="rest()"
                  (ngModelChange)="rest.set($event)"
                  [max]="60"
                  [min]="0"
                  [step]="5"
                  placeholder="Rest"
                  id="rest"
                />
                <label for="rest" class="form-label">Rest duration</label>
              </div>
              <div class="form-floating col-md-3 col-6 flex-shrink-1">
                <input
                  type="number"
                  class="form-control"
                  [ngModel]="intro()"
                  (ngModelChange)="intro.set($event)"
                  [max]="300"
                  [min]="0"
                  [step]="5"
                  placeholder="Get Ready"
                  id="intro"
                />
                <label for="intro" class="form-label">Get Ready</label>
              </div>
              <ng-container [ngTemplateOutlet]="sessionControls" />
            </div>

            <div
              id="total-duration"
              class="text-body-secondary col-12 text-start p-2 fs-5 border-top"
            >
              Total duration: {{ totalDurationLabel() }}
            </div>

            <div
              class="d-flex flex-column flex-wrap flex-lg-row gap-2 align-items-center justify-content-start w-100 pt-3 border-top small text-body-secondary"
            >
              <select
                class="form-select form-select-sm w-auto"
                [ngModel]="selectedConfigName()"
                (ngModelChange)="selectedConfigName.set($event)"
                id="savedConfigs"
                aria-label="Saved configurations"
              >
                <option value="" disabled>Saved configs…</option>
                @for (c of savedConfigs(); track c.name) {
                  <option [value]="c.name">{{ c.name }}</option>
                }
              </select>
              <button
                class="btn btn-sm btn-outline-secondary"
                (click)="loadSelectedConfig()"
                [disabled]="!selectedConfigName()"
              >
                Load
              </button>
              <button
                class="btn btn-sm btn-outline-secondary"
                (click)="deleteSelectedConfig()"
                [disabled]="!selectedConfigName()"
              >
                Delete
              </button>
              <button
                class="btn btn-sm btn-outline-secondary"
                id="copy-config-link"
                (click)="copyConfigLink()"
                [disabled]="!selectedConfigName()"
              >
                Copy Link
              </button>
              <input
                type="text"
                class="form-control form-control-sm w-auto"
                [ngModel]="newConfigName()"
                (ngModelChange)="newConfigName.set($event)"
                placeholder="Config name"
                id="newConfigName"
                aria-label="Config name"
              />
              <button class="btn btn-sm btn-outline-secondary" (click)="saveCurrentConfig()">
                Save
              </button>
            </div>
          </div>

          <div class="d-flex flex-column gap-2 w-100" style="max-width: 320px;">
            <label for="exercises" class="form-label fw-semibold"
              >Exercises <span class="text-body-secondary fw-normal">(optional)</span></label
            >
            <textarea
              class="form-control"
              id="exercises"
              rows="8"
              [ngModel]="exercisesText()"
              (ngModelChange)="exercisesText.set($event)"
              placeholder="One exercise per line, e.g.&#10;Push-ups&#10;Squats&#10;Plank"
            ></textarea>

            <label for="videoUrl" class="form-label fw-semibold"
              >Video <span class="text-body-secondary fw-normal">(optional)</span></label
            >
            <input
              type="text"
              class="form-control"
              id="videoUrl"
              [ngModel]="videoUrl()"
              (ngModelChange)="videoUrl.set($event)"
              placeholder="YouTube video, Shorts, or share link"
            />
            @if (videoUrl() && !videoId()) {
              <div class="form-text text-danger">Enter a valid YouTube URL</div>
            }
          </div>
        </div>
      }

      <!-- Sound toggle + Start/Stop + Pause/Reset: under the countdown while running,
           in the settings row otherwise. -->
      <ng-template #sessionControls>
        <label
          class="d-flex gap-2 align-items-center px-2 text-nowrap"
          [ngClass]="{ 'col-md-3 col-6': !started }"
        >
          <input
            type="checkbox"
            class="form-check-input"
            name="playSound"
            [ngModel]="playSound()"
            (ngModelChange)="playSound.set($event)"
          />
          <span class="form-check-label">Sound</span>
        </label>
        <button
          class="btn"
          id="toggle-started"
          (click)="toggleTimerStarted()"
          [ngClass]="started ? 'btn-outline-primary' : 'btn-primary'"
        >
          {{ started ? 'Stop' : 'Start' }}
        </button>
        @if (started) {
          <button class="btn btn-primary" id="toggle-active" (click)="toggleTimerActive()">
            {{ active ? 'Pause' : 'Resume' }}
          </button>
        } @else {
          <button class="btn btn-outline-secondary" id="reset-settings" (click)="resetSettings()">
            Reset
          </button>
        }
      </ng-template>
    </div>
  `,
})
export class IntervalTimerComponent {
  rounds = model(DEFAULT_SETTINGS.rounds);
  work = model(DEFAULT_SETTINGS.work);
  rest = model(DEFAULT_SETTINGS.rest);
  intro = model(DEFAULT_SETTINGS.intro);
  playSound = model(DEFAULT_SETTINGS.playSound);
  exercisesText = model(DEFAULT_SETTINGS.exercisesText);
  videoUrl = model(DEFAULT_SETTINGS.videoUrl);

  protected readonly videoId = computed(() => extractYouTubeVideoId(this.videoUrl()));
  private readonly videoPlayerContainer =
    viewChild<ElementRef<HTMLDivElement>>('videoPlayerContainer');
  private readonly youtubePlayerService = inject(YouTubePlayerService);
  private videoPlayer: YouTubePlayerHandle | null = null;

  phase = signal<'intro' | 'work' | 'rest'>('work');
  currentRound = signal(1);
  phaseRemaining = signal(0);
  sessionActive = signal(false);
  isTimerActive = signal(false);

  protected readonly totalDurationLabel = computed(() => {
    const totalSeconds =
      this.intro() + this.rounds() * this.work() + Math.max(0, this.rounds() - 1) * this.rest();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  });

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
    const round = phase === 'rest' ? this.currentRound() + 1 : this.currentRound();
    const label = this.exerciseLabelForRound(round, lines);

    return phase === 'work' ? label : `Next: ${label}`;
  });

  private exerciseLabelForRound(round: number, lines: string[]): string {
    const line = lines[(round - 1) % lines.length].trim();
    return line === '' ? 'Staple exercise' : line;
  }

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private targetTime = 0;
  /** Exact time left in the phase when paused; null when not paused. */
  private pausedRemainingMs: number | null = null;

  private readonly configService = inject(IntervalTimerConfigService);
  protected readonly savedConfigs = this.configService.configs;
  protected selectedConfigName = signal('');
  protected newConfigName = signal('');

  /** The running workout's name when it is a saved configuration, otherwise the page title. */
  protected readonly title = computed(() => {
    const name = this.selectedConfigName();
    const isSavedWorkout = this.savedConfigs().some((c) => c.name === name);
    return this.sessionActive() && isSavedWorkout ? name : 'Interval Timer';
  });

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
    this.intro.set(config.intro ?? 0);
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
      intro: this.intro(),
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
    const intro = this.intro() > 0 ? ` (${this.intro()}s get ready)` : '';
    const sound = this.playSound() ? '' : ' (silent)';
    return `${this.rounds()}x${this.work()}${rest}${intro}${sound}`;
  }

  protected resetSettings(): void {
    this.rounds.set(DEFAULT_SETTINGS.rounds);
    this.work.set(DEFAULT_SETTINGS.work);
    this.rest.set(DEFAULT_SETTINGS.rest);
    this.playSound.set(DEFAULT_SETTINGS.playSound);
    this.exercisesText.set(DEFAULT_SETTINGS.exercisesText);
    this.videoUrl.set(DEFAULT_SETTINGS.videoUrl);
    this.intro.set(DEFAULT_SETTINGS.intro);
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
      this.pausedRemainingMs = null; // discard a pause left over from a stopped session
      this.currentRound.set(1);
      if (this.intro() > 0) {
        this.phase.set('intro');
        this.phaseRemaining.set(this.intro());
      } else {
        this.phase.set('work');
        this.phaseRemaining.set(this.work());
      }
      this.sessionActive.set(true);
      this.isTimerActive.set(true);
    }
  }

  protected toggleTimerActive() {
    if (this.isTimerActive()) {
      // Keep the exact time left: phaseRemaining is rounded up to whole seconds, and
      // resuming from it would add up to a second per pause.
      this.pausedRemainingMs = Math.max(0, this.targetTime - Date.now());
    }
    this.isTimerActive.update((active) => !active);
  }

  private secondsUntilTarget(): number {
    return Math.max(0, Math.ceil((this.targetTime - Date.now()) / 1000));
  }

  private readonly tick = () => {
    // Calculate true remaining time based on a system clock
    const remaining = this.secondsUntilTarget();
    this.phaseRemaining.set(remaining);

    if (this.playSound() && remaining <= 3) {
      playBeep(remaining === 0 ? 0.5 : 0.2);
    }

    if (remaining <= 0) {
      this.advancePhase();
    }
  };

  private advancePhase() {
    if (this.phase() === 'intro') {
      this.startPhase('work', this.work());
      return;
    }

    if (this.phase() === 'work') {
      if (this.currentRound() >= this.rounds()) {
        this.completeSession();
        return;
      }
      if (this.rest() > 0) {
        this.startPhase('rest', this.rest());
        return;
      }
    }

    this.currentRound.update((round) => round + 1);
    this.startPhase('work', this.work());
  }

  private startPhase(phase: 'work' | 'rest', durationSeconds: number) {
    this.phase.set(phase);
    // Chain from the previous phase's scheduled end rather than Date.now(): the tick that
    // notices a phase end is always somewhat late, and that lateness must not carry over.
    this.targetTime += durationSeconds * 1000;
    const remaining = this.secondsUntilTarget();
    this.phaseRemaining.set(remaining);

    if (remaining <= 0) {
      // This phase also already elapsed (e.g. a throttled background tab skipped ticks).
      this.advancePhase();
    }
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
      // untracked: reading phaseRemaining here must not make every tick re-run this
      // effect, which would re-anchor targetTime to the rounded remaining seconds.
      const remainingMs = this.pausedRemainingMs ?? untracked(this.phaseRemaining) * 1000;
      this.pausedRemainingMs = null;
      this.targetTime = Date.now() + remainingMs;
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

    // create() is async: if this effect is cleaned up (e.g. the session stops) before the
    // player is ready, the late handle must be destroyed instead of adopted.
    let cancelled = false;

    if (running && id && container) {
      this.youtubePlayerService.create(container.nativeElement, id).then((handle) => {
        if (cancelled) {
          handle.destroy();
          return;
        }
        this.videoPlayer = handle;
        handle.play();
      });
    }

    onCleanup(() => {
      cancelled = true;
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
