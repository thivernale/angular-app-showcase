import { Component, inject, Input } from '@angular/core';
import { RegionService } from '../../services/region.service';
import { VehicleService } from '../../services/vehicle.service';
import { Vehicle } from '../../types/vehicle';

@Component({
  selector: 'app-vehicle',
  templateUrl: './vehicle.component.html',
})
export class VehicleComponent {
  private vehicleService = inject(VehicleService);
  private regionService = inject(RegionService);

  @Input() vehicle!: Vehicle;

  getRegions() {
    return this.regionService.getRegions()
      .filter(l => l.id !== this.vehicle.location);
  }

  getLocationName(id: number): string {
    return this.regionService.getRegionName(id);
  }

  changeLocation(event: Event): void {
    const newLocationId = Number((event.target as HTMLSelectElement).value);
    this.vehicleService.changeLocation(this.vehicle, newLocationId);
  }
}
