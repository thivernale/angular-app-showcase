import { NgClass } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { RegionService } from '../../services/region.service';
import { VehicleService } from '../../services/vehicle.service';
import { Vehicle } from '../../types/vehicle';

@Component({
  selector: 'app-vehicle',
  templateUrl: './vehicle.component.html',
  imports: [
    NgClass
  ]
})
export class VehicleComponent {
  vehicle = input.required<Vehicle>();
  private readonly vehicleService = inject(VehicleService);
  private readonly regionService = inject(RegionService);

  getRegions() {
    return this.regionService.getRegions()
      .filter(l => l.id !== this.vehicle().location);
  }

  getLocationName(id: number): string {
    return this.regionService.getRegionName(id);
  }

  changeLocation(event: Event): void {
    const newLocationId = Number((event.target as HTMLSelectElement).value);
    this.vehicleService.changeLocation(this.vehicle(), newLocationId);
  }
}
