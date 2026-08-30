import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntervalTimerComponent } from './interval-timer.component';
import { IntervalTimerConfigService } from './services/interval-timer-config.service';

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

describe('IntervalTimerComponent', () => {
  let component: IntervalTimerComponent;
  let fixture: ComponentFixture<IntervalTimerComponent>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    beepStopTimes = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [IntervalTimerComponent],
    }).compileComponents();

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
      });
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
  });
});
