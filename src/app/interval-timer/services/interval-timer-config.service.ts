import { inject, Injectable, signal } from '@angular/core';
import { AlertService } from '../../components/alert/services/alert.service';
import { IntervalTimerConfig } from '../types/interval-timer-config.interface';

const STORAGE_KEY = 'interval-timer-configs';

@Injectable({
  providedIn: 'root'
})
export class IntervalTimerConfigService {
  private readonly alertService = inject(AlertService);
  private readonly configsSignal = signal<IntervalTimerConfig[]>(this.readFromStorage());
  readonly configs = this.configsSignal.asReadonly();

  save(config: IntervalTimerConfig): void {
    const existingIndex = this.configsSignal().findIndex(c => c.name === config.name);
    const updated = existingIndex >= 0
      ? this.configsSignal().map((c, i) => i === existingIndex ? config : c)
      : [...this.configsSignal(), config];

    this.configsSignal.set(updated);
    this.persist(updated);

    this.alertService.showAlert({
      type: 'success',
      text: `Configuration "${config.name}" saved!`
    });
  }

  load(name: string): IntervalTimerConfig | undefined {
    return this.configsSignal().find(c => c.name === name);
  }

  remove(name: string): void {
    const updated = this.configsSignal().filter(c => c.name !== name);
    this.configsSignal.set(updated);
    this.persist(updated);

    this.alertService.showAlert({
      type: 'success',
      text: `Configuration "${name}" removed.`
    });
  }

  private persist(configs: IntervalTimerConfig[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  }

  private readFromStorage(): IntervalTimerConfig[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as IntervalTimerConfig[];
    } catch {
      return [];
    }
  }
}
