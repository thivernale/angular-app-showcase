import { Injectable } from '@angular/core';
import initialData from '../data/regions.json';
import { Region } from '../types/region';

@Injectable({
  providedIn: 'root',
})
export class RegionService {
  private regions: Region[] = [...initialData];

  getRegions() {
    return this.regions;
  }

  getRegionName(id: number): string {
    return this.regions.find(r => r.id === id)?.name ?? 'Unknown Region';
  }
}
