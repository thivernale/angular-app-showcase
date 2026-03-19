import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { HistoryComponent } from './components/history/history.component';
import { VehicleComponent } from './components/vehicle/vehicle.component';
import { VehicleService } from './services/vehicle.service';

@Component({
  selector: 'app-fleet-navigator',
  imports: [
    AsyncPipe,
    VehicleComponent,
    HistoryComponent
  ],
  templateUrl: './fleet-navigator.component.html',
})
export class FleetNavigatorComponent {
  private vehicleService = inject(VehicleService);
  vehicles$ = this.vehicleService.vehicle$;
}
