import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertService } from '../components/alert/services/alert.service';
import { IntervalTimerComponent } from './interval-timer.component';
import { IntervalTimerConfigService } from './services/interval-timer-config.service';
import { YouTubePlayerService } from './services/youtube-player.service';

class FakeOscillator {
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn((atTime: number) => beepStopTimes.push(atTime));
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createOscillator = () => new FakeOscillator();
}

let beepStopTimes: number[];

function fakeVideoHandle() {
  return { play: vi.fn(), pause: vi.fn(), destroy: vi.fn() };
}

class FakeYouTubePlayerService {
  create = vi.fn().mockResolvedValue(fakeVideoHandle());
}

function activatedRouteStub(queryParams: Params) {
  return { snapshot: { queryParamMap: convertToParamMap(queryParams) } };
}

describe('IntervalTimerComponent', () => {
  let component: IntervalTimerComponent;
  let fixture: ComponentFixture<IntervalTimerComponent>;
  let youtubePlayerService: FakeYouTubePlayerService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    beepStopTimes = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
    localStorage.clear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [IntervalTimerComponent],
      providers: [
        { provide: YouTubePlayerService, useClass: FakeYouTubePlayerService },
        { provide: ActivatedRoute, useValue: activatedRouteStub({}) },
      ],
    }).compileComponents();

    youtubePlayerService = TestBed.inject(YouTubePlayerService) as unknown as FakeYouTubePlayerService;

    fixture = TestBed.createComponent(IntervalTimerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.tick();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  // These tests drive the wall-clock-based `tick()`/`advancePhase()` logic directly
  // (via manual Date jumps + explicit tick() calls) rather than relying on the real
  // `setInterval` firing under fake timers, since the component's whole design point
  // is that correctness depends only on Date.now() at call time, not on call counts.
  function start(rounds: number, work: number, rest: number) {
    component.rounds.set(rounds);
    component.work.set(work);
    component.rest.set(rest);
    (component as any).toggleTimerStarted();
    TestBed.tick(); // flush manageInterval effect so targetTime is set
  }

  function toggleActive() {
    (component as any).toggleTimerActive();
    TestBed.tick(); // flush manageInterval effect so targetTime is recomputed on resume
  }

  function stop() {
    (component as any).toggleTimerStarted();
    TestBed.tick();
  }

  function advanceAndTick(seconds: number) {
    vi.setSystemTime(Date.now() + seconds * 1000);
    (component as any).tick();
  }

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('enters the rest phase after the first work interval completes', () => {
    start(2, 5, 2);

    advanceAndTick(5);

    expect(component.phase()).toBe('rest');
    expect(component.phaseRemaining()).toBe(2);
    expect(component.currentRound()).toBe(1);
  });

  it('returns to the work phase for the next round after rest completes', () => {
    start(2, 5, 2);

    advanceAndTick(5); // finish work #1 -> rest
    advanceAndTick(2); // finish rest -> work #2

    expect(component.phase()).toBe('work');
    expect(component.currentRound()).toBe(2);
    expect(component.phaseRemaining()).toBe(5);
  });

  it('ends the session after the final work interval with no trailing rest', () => {
    start(2, 5, 2);

    advanceAndTick(5); // work #1 -> rest
    advanceAndTick(2); // rest -> work #2
    advanceAndTick(5); // work #2 -> done

    expect(component.sessionActive()).toBe(false);
    expect(component.isTimerActive()).toBe(false);
    expect(component.phase()).toBe('work');
  });

  it('never enters the rest phase when rest is 0', () => {
    start(3, 3, 0);

    advanceAndTick(3);
    expect(component.phase()).toBe('work');
    expect(component.currentRound()).toBe(2);

    advanceAndTick(3);
    expect(component.phase()).toBe('work');
    expect(component.currentRound()).toBe(3);
  });

  it('beeps with the boundary duration at the end of a rest phase', () => {
    start(2, 5, 2);
    advanceAndTick(5); // into rest, phaseRemaining = 2

    advanceAndTick(1); // phaseRemaining = 1
    advanceAndTick(1); // phaseRemaining = 0 -> boundary beep, transitions to work

    expect(beepStopTimes).toContain(0.5);
  });

  it('resumes counting down from where it was paused', () => {
    start(2, 5, 2);
    advanceAndTick(3); // 3s into work #1, 2s remaining

    expect(component.phase()).toBe('work');
    expect(component.phaseRemaining()).toBe(2);

    toggleActive(); // pause
    vi.setSystemTime(Date.now() + 10_000); // wall-clock time passes while paused
    toggleActive(); // resume: targetTime recomputed from current phaseRemaining

    advanceAndTick(2); // the remaining 2s of work #1 elapse

    expect(component.phase()).toBe('rest');
  });

  it('resets phase and round to the start when stopped', () => {
    start(2, 5, 2);
    advanceAndTick(5); // into rest

    stop();

    expect(component.phase()).toBe('work');
    expect(component.currentRound()).toBe(1);
    expect(component.sessionActive()).toBe(false);
  });

  describe('countdown circle styling', () => {
    function circleClasses(): DOMTokenList {
      return fixture.debugElement.query(By.css('#countdown-circle')).nativeElement.classList;
    }

    it('uses the work styling while in the work phase', () => {
      start(2, 5, 2);
      fixture.detectChanges();

      expect(circleClasses()).toContain('bg-success-subtle');
      expect(circleClasses()).not.toContain('bg-info-subtle');
    });

    it('uses distinct rest styling while in the rest phase', () => {
      start(2, 5, 2);
      advanceAndTick(5); // into rest
      fixture.detectChanges();

      expect(circleClasses()).toContain('bg-secondary-subtle');
      expect(circleClasses()).not.toContain('bg-success-subtle');
    });
  });

  describe('exercise text', () => {
    it('shows nothing when the textarea is empty', () => {
      start(2, 5, 0);

      expect((component as any).currentExercise()).toBeNull();
      expect(fixture.debugElement.query(By.css('#exercise-line'))).toBeNull();
    });

    it('renders the exercise text under the round label when set', () => {
      component.exercisesText.set('Push-ups');
      start(2, 5, 0);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('#exercise-line')).nativeElement.textContent).toContain('Push-ups');
    });

    it('reuses a single exercise for every round', () => {
      component.exercisesText.set('Push-ups');
      start(3, 5, 0);

      expect((component as any).currentExercise()).toBe('Push-ups');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('Push-ups');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('Push-ups');
    });

    it('cycles through multiple exercises when there are fewer than rounds', () => {
      component.exercisesText.set('A\nB');
      start(4, 5, 0);

      expect((component as any).currentExercise()).toBe('A');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('B');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('A');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('B');
    });

    it('never references exercises beyond the number of rounds', () => {
      component.exercisesText.set('A\nB\nC\nD\nE');
      start(2, 5, 0);

      expect((component as any).currentExercise()).toBe('A');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('B');
      advanceAndTick(5); // session completes, resets to round 1

      expect(component.sessionActive()).toBe(false);
      expect((component as any).currentExercise()).toBe('Next: A');
    });

    it('falls back to "Staple exercise" for a blank line', () => {
      component.exercisesText.set('A\n\nC');
      start(3, 5, 0);

      expect((component as any).currentExercise()).toBe('A');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('Staple exercise');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('C');
    });

    it('falls back to "Staple exercise" for a whitespace-only line', () => {
      component.exercisesText.set('A\n   \nC');
      start(3, 5, 0);

      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('Staple exercise');
    });

    it('treats a single trailing newline as not adding an extra slot', () => {
      component.exercisesText.set('A\nB\n');
      start(3, 5, 0);

      expect((component as any).currentExercise()).toBe('A');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('B');
      advanceAndTick(5);
      expect((component as any).currentExercise()).toBe('A');
    });

    it('shows a preview of the next round\'s exercise during rest', () => {
      component.exercisesText.set('A\nB');
      start(3, 5, 2);

      advanceAndTick(5); // into rest before round 2

      expect(component.phase()).toBe('rest');
      expect((component as any).currentExercise()).toBe('Next: B');
    });

    it('shows the fallback with the "Next:" prefix during rest when the upcoming slot is blank', () => {
      component.exercisesText.set('A\n\n');
      start(2, 5, 2);

      advanceAndTick(5); // into rest before round 2

      expect((component as any).currentExercise()).toBe('Next: Staple exercise');
    });

    it('shows a "Next:" preview of round 1\'s exercise before the session is started', () => {
      component.exercisesText.set('A\nB');

      expect((component as any).currentExercise()).toBe('Next: A');
    });

    it('switches from the "Next:" preview to the plain work-phase label once started', () => {
      component.exercisesText.set('A\nB');
      expect((component as any).currentExercise()).toBe('Next: A');

      start(2, 5, 0);

      expect((component as any).currentExercise()).toBe('A');
    });
  });

  describe('video', () => {
    function circleContainerQuery() {
      return fixture.debugElement.query(By.css('#video-panel'));
    }

    it('does not render the video panel when no video URL is set', () => {
      start(2, 5, 0);
      fixture.detectChanges();

      expect(circleContainerQuery()).toBeNull();
    });

    it('does not render the video panel when the URL is not a valid YouTube URL', () => {
      component.videoUrl.set('https://example.com/not-youtube');
      start(2, 5, 0);
      fixture.detectChanges();

      expect(circleContainerQuery()).toBeNull();
    });

    it('does not render the video panel before the session starts, even with a valid URL', () => {
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');
      fixture.detectChanges();

      expect(circleContainerQuery()).toBeNull();
      expect(youtubePlayerService.create).not.toHaveBeenCalled();
    });

    it('creates and plays a player once the session starts with a valid video URL', async () => {
      const handle = fakeVideoHandle();
      youtubePlayerService.create.mockResolvedValue(handle);
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');

      start(2, 5, 0);
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      expect(circleContainerQuery()).not.toBeNull();
      expect(youtubePlayerService.create).toHaveBeenCalledWith(expect.anything(), 'lhAEvAOPsiU');
      expect(handle.play).toHaveBeenCalled();
    });

    it('destroys the player when the session stops', async () => {
      const handle = fakeVideoHandle();
      youtubePlayerService.create.mockResolvedValue(handle);
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');

      start(2, 5, 0);
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      stop();
      fixture.detectChanges();

      expect(handle.destroy).toHaveBeenCalled();
    });

    it('pauses and resumes the video in sync with the timer', async () => {
      const handle = fakeVideoHandle();
      youtubePlayerService.create.mockResolvedValue(handle);
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');

      start(2, 5, 0);
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      toggleActive(); // pause
      expect(handle.pause).toHaveBeenCalled();

      toggleActive(); // resume
      expect(handle.play).toHaveBeenCalledTimes(2); // initial autoplay + resume
    });
  });

  describe('reset', () => {
    it('restores all settings to their default values', () => {
      component.rounds.set(3);
      component.work.set(45);
      component.rest.set(15);
      component.playSound.set(false);
      component.exercisesText.set('A\nB');
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');
      (component as any).newConfigName.set('foo');
      (component as any).selectedConfigName.set('bar');

      (component as any).resetSettings();

      expect(component.rounds()).toBe(10);
      expect(component.work()).toBe(30);
      expect(component.rest()).toBe(0);
      expect(component.playSound()).toBe(true);
      expect(component.exercisesText()).toBe('');
      expect(component.videoUrl()).toBe('');
      expect((component as any).newConfigName()).toBe('');
      expect((component as any).selectedConfigName()).toBe('');
    });

    it('renders a reset button that is disabled while the session is running', () => {
      start(2, 5, 0);
      fixture.detectChanges();

      const resetButton = fixture.debugElement.query(By.css('#reset-settings')).nativeElement;
      expect(resetButton.disabled).toBe(true);
    });

    it('renders an enabled reset button when the session is not running', () => {
      fixture.detectChanges();

      const resetButton = fixture.debugElement.query(By.css('#reset-settings')).nativeElement;
      expect(resetButton.disabled).toBe(false);
    });
  });

  describe('saved configurations', () => {
    it('saves the current settings under the typed name', () => {
      component.rounds.set(8);
      component.work.set(20);
      component.rest.set(5);
      component.playSound.set(false);
      (component as any).newConfigName.set('My Config');

      (component as any).saveCurrentConfig();

      const configService = TestBed.inject(IntervalTimerConfigService);
      expect(configService.load('My Config')).toEqual({
        name: 'My Config',
        rounds: 8,
        work: 20,
        rest: 5,
        playSound: false,
        exercises: '',
        videoUrl: '',
      });
    });

    it('overwrites the selected configuration when no new name is typed', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'MyWorkout', rounds: 5, work: 20, rest: 0, playSound: true });
      (component as any).selectedConfigName.set('MyWorkout');
      component.rounds.set(9);
      (component as any).newConfigName.set('');

      (component as any).saveCurrentConfig();

      expect(configService.configs()).toHaveLength(1);
      expect(configService.load('MyWorkout')?.rounds).toBe(9);
    });

    it('generates a pattern-based name when the name field is left blank and rest is 0', () => {
      component.rounds.set(10);
      component.work.set(30);
      component.rest.set(0);
      (component as any).newConfigName.set('');

      (component as any).saveCurrentConfig();

      const configService = TestBed.inject(IntervalTimerConfigService);
      expect(configService.load('10x30')).toBeTruthy();
    });

    it('generates a pattern-based name including rest when rest is greater than 0', () => {
      component.rounds.set(10);
      component.work.set(30);
      component.rest.set(10);
      (component as any).newConfigName.set('');

      (component as any).saveCurrentConfig();

      const configService = TestBed.inject(IntervalTimerConfigService);
      expect(configService.load('10x30/10')).toBeTruthy();
    });

    it('does not let a silent config overwrite an otherwise-identical config with sound', () => {
      component.rounds.set(10);
      component.work.set(30);
      component.rest.set(0);
      (component as any).newConfigName.set('');

      component.playSound.set(true);
      (component as any).saveCurrentConfig();
      component.playSound.set(false);
      (component as any).saveCurrentConfig();

      const configService = TestBed.inject(IntervalTimerConfigService);
      expect(configService.configs()).toHaveLength(2);
      expect(configService.configs().some(c => c.playSound === true)).toBe(true);
      expect(configService.configs().some(c => c.playSound === false)).toBe(true);
    });

    it('loads a saved configuration into the settings signals', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'Saved', rounds: 6, work: 40, rest: 15, playSound: false });
      (component as any).selectedConfigName.set('Saved');

      (component as any).loadSelectedConfig();

      expect(component.rounds()).toBe(6);
      expect(component.work()).toBe(40);
      expect(component.rest()).toBe(15);
      expect(component.playSound()).toBe(false);
    });

    it('removes the selected configuration on delete', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'ToDelete', rounds: 1, work: 1, rest: 0, playSound: true });
      (component as any).selectedConfigName.set('ToDelete');

      (component as any).deleteSelectedConfig();

      expect(configService.load('ToDelete')).toBeUndefined();
      expect((component as any).selectedConfigName()).toBe('');
    });

    it('exposes the saved configs list reactively', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);

      configService.save({ name: 'A', rounds: 1, work: 1, rest: 0, playSound: true });

      expect((component as any).savedConfigs()).toEqual([
        { name: 'A', rounds: 1, work: 1, rest: 0, playSound: true },
      ]);
    });

    it('includes the exercise text when saving', () => {
      component.rounds.set(4);
      component.work.set(20);
      component.rest.set(5);
      component.exercisesText.set('A\nB');
      (component as any).newConfigName.set('WithExercises');

      (component as any).saveCurrentConfig();

      const configService = TestBed.inject(IntervalTimerConfigService);
      expect(configService.load('WithExercises')?.exercises).toBe('A\nB');
    });

    it('restores the exercise text on load', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'WithExercises', rounds: 4, work: 20, rest: 5, playSound: true, exercises: 'X\nY' });
      (component as any).selectedConfigName.set('WithExercises');

      (component as any).loadSelectedConfig();

      expect(component.exercisesText()).toBe('X\nY');
    });

    it('resets the exercise text to empty when loading a config saved before this field existed', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'Legacy', rounds: 5, work: 25, rest: 0, playSound: true });
      component.exercisesText.set('leftover text');
      (component as any).selectedConfigName.set('Legacy');

      (component as any).loadSelectedConfig();

      expect(component.exercisesText()).toBe('');
    });

    it('includes the video URL when saving', () => {
      component.rounds.set(4);
      component.work.set(20);
      component.rest.set(5);
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');
      (component as any).newConfigName.set('WithVideo');

      (component as any).saveCurrentConfig();

      const configService = TestBed.inject(IntervalTimerConfigService);
      expect(configService.load('WithVideo')?.videoUrl).toBe('https://www.youtube.com/watch?v=lhAEvAOPsiU');
    });

    it('restores the video URL on load', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({
        name: 'WithVideo',
        rounds: 4,
        work: 20,
        rest: 5,
        playSound: true,
        videoUrl: 'https://www.youtube.com/watch?v=lhAEvAOPsiU',
      });
      (component as any).selectedConfigName.set('WithVideo');

      (component as any).loadSelectedConfig();

      expect(component.videoUrl()).toBe('https://www.youtube.com/watch?v=lhAEvAOPsiU');
    });

    it('resets the video URL to empty when loading a config saved before this field existed', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'Legacy', rounds: 5, work: 25, rest: 0, playSound: true });
      component.videoUrl.set('https://www.youtube.com/watch?v=lhAEvAOPsiU');
      (component as any).selectedConfigName.set('Legacy');

      (component as any).loadSelectedConfig();

      expect(component.videoUrl()).toBe('');
    });
  });

  describe('copy link', () => {
    it('copies a URL with the selected config name as the ?config= param', async () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'My Workout', rounds: 5, work: 20, rest: 0, playSound: true });
      (component as any).selectedConfigName.set('My Workout');

      await (component as any).copyConfigLink();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${location.origin}${location.pathname}?config=My%20Workout`,
      );
    });

    it('shows a success alert after copying', async () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'My Workout', rounds: 5, work: 20, rest: 0, playSound: true });
      (component as any).selectedConfigName.set('My Workout');
      const alertService = TestBed.inject(AlertService);
      const showAlertSpy = vi.spyOn(alertService, 'showAlert');

      await (component as any).copyConfigLink();

      expect(showAlertSpy).toHaveBeenCalledWith({ type: 'success', text: 'Link copied!' });
    });

    it('renders a copy-link button that is disabled when no config is selected', () => {
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('#copy-config-link')).nativeElement;
      expect(button.disabled).toBe(true);
    });

    it('renders an enabled copy-link button once a config is selected', () => {
      const configService = TestBed.inject(IntervalTimerConfigService);
      configService.save({ name: 'My Workout', rounds: 5, work: 20, rest: 0, playSound: true });
      (component as any).selectedConfigName.set('My Workout');
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('#copy-config-link')).nativeElement;
      expect(button.disabled).toBe(false);
    });
  });

  describe('config URL param', () => {
    function createWithQueryParams(queryParams: Params) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [IntervalTimerComponent],
        providers: [
          { provide: YouTubePlayerService, useClass: FakeYouTubePlayerService },
          { provide: ActivatedRoute, useValue: activatedRouteStub(queryParams) },
        ],
      });
      return TestBed.createComponent(IntervalTimerComponent).componentInstance;
    }

    it('loads the config named in the ?config= query param on init', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [IntervalTimerComponent],
        providers: [
          { provide: YouTubePlayerService, useClass: FakeYouTubePlayerService },
          { provide: ActivatedRoute, useValue: activatedRouteStub({ config: 'FromUrl' }) },
        ],
      });
      TestBed.inject(IntervalTimerConfigService).save({
        name: 'FromUrl', rounds: 7, work: 15, rest: 5, playSound: true,
      });

      const freshComponent = TestBed.createComponent(IntervalTimerComponent).componentInstance;

      expect(freshComponent.rounds()).toBe(7);
      expect(freshComponent.work()).toBe(15);
      expect(freshComponent.rest()).toBe(5);
    });

    it('silently ignores an unknown config name in the query param', () => {
      const freshComponent = createWithQueryParams({ config: 'DoesNotExist' });

      expect(freshComponent.rounds()).toBe(10);
      expect(freshComponent.work()).toBe(30);
      expect(freshComponent.rest()).toBe(0);
    });

    it('leaves defaults untouched when no config param is present', () => {
      const freshComponent = createWithQueryParams({});

      expect(freshComponent.rounds()).toBe(10);
    });
  });
});
