import { Injectable } from '@angular/core';
import initialData from '../data/vehicles.json';
import { Vehicle } from '../types/vehicle';

@Injectable({
  providedIn: 'root',
})
export class VehicleService {
  private vehicles: Vehicle[] = [...initialData];

  getVehicles() {
    return this.vehicles;
  }

  getVehicle(id: number): Vehicle | undefined {
    return this.vehicles.find(v => v.id === id);
  }
}
