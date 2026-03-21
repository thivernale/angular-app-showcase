import { AsyncPipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RegionService } from '../../services/region.service';
import { VehicleService } from '../../services/vehicle.service';
import { LogEntry } from '../../types/log-entry';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
})
export class HistoryComponent implements OnInit, OnDestroy {
  private vehicleService = inject(VehicleService);
  private regionService = inject(RegionService);
  protected logs: LogEntry[] = [];

  private log$ = this.vehicleService.log$;
  private sub!: Subscription;

  ngOnInit() {
    this.sub = this.log$.subscribe(log => {
      this.logs.push(log);
      if (this.logs.length > environment.history_steps) {
        this.logs.shift();
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  formatLogEntry(entry: LogEntry): string {
    return `
      ${new Date(entry.timestamp).toLocaleString()}:
      ${this.vehicleService.getVehicleName(entry.vehicle)}
      moved from ${this.regionService.getRegionName(entry.source)}
      to ${this.regionService.getRegionName(entry.destination)}
      `;
  }
}
