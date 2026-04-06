import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { RegionService } from '../../services/region.service';
import { VehicleService } from '../../services/vehicle.service';
import { LogEntry } from '../../types/log-entry';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
})
export class HistoryComponent {
  protected logs: LogEntry[] = [];
  private readonly vehicleService = inject(VehicleService);
  private readonly regionService = inject(RegionService);

  constructor() {
    this.vehicleService.log$.pipe(takeUntilDestroyed()).subscribe(log => {
      this.logs.push(log);
      if (this.logs.length > environment.history_steps) {
        this.logs.shift();
      }
    });
  }

  protected formatLogEntry(entry: LogEntry): string {
    return `
      ${new Date(entry.timestamp).toLocaleString()}:
      ${this.vehicleService.getVehicleName(entry.vehicle)}
      moved from ${this.regionService.getRegionName(entry.source)}
      to ${this.regionService.getRegionName(entry.destination)}
      `;
  }
}
