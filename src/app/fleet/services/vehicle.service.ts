import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import initialData from '../data/vehicles.json';
import { LogEntry } from '../types/log-entry';
import { Vehicle } from '../types/vehicle';

@Injectable({
  providedIn: 'root',
})
export class VehicleService {
  private vehicles: Vehicle[] = [...initialData];
  private logs: LogEntry[] = [];

  private logSubject = new BehaviorSubject<LogEntry[]>(this.logs);
  log$ = this.logSubject.asObservable();

  private vehicleSubject = new BehaviorSubject<Vehicle[]>(this.vehicles);
  vehicle$ = this.vehicleSubject.asObservable();

  getVehicleName(id: number) {
    return this.vehicles.find(v => v.id === id)?.name ?? 'Unknown Vehicle';
  }

  changeLocation(vehicle: Vehicle, newLocationId: number) {
    const logEntry = {
      vehicle: vehicle.id,
      source: vehicle.location,
      destination: newLocationId,
      timestamp: Date.now()
    } as LogEntry;

    this.vehicles = this.vehicles.map(v => v.id === vehicle.id ? { ...v, location: newLocationId } : v);
    this.vehicleSubject.next(this.vehicles);

    this.logs.push(logEntry);
    this.logSubject.next(this.logs);
  }
}
