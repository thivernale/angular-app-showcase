import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RegionService } from '../../services/region.service';
import { VehicleService } from '../../services/vehicle.service';
import { LogEntry } from '../../types/log-entry';

@Component({
  selector: 'app-history',
  imports: [
    AsyncPipe
  ],
  templateUrl: './history.component.html',
})
export class HistoryComponent {
  private vehicleService = inject(VehicleService);
  private regionService = inject(RegionService);

  log$ = this.vehicleService.log$;

  formatLogEntry(entry: LogEntry): string {
    return `
      ${new Date(entry.timestamp).toLocaleString()}:
      ${this.vehicleService.getVehicleName(entry.vehicle)}
      moved from ${this.regionService.getRegionName(entry.source)}
      to ${this.regionService.getRegionName(entry.destination)}
      `;
  }
}
