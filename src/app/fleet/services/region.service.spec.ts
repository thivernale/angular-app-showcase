import { TestBed } from '@angular/core/testing';

import { RegionService } from './region.service';

describe('RegionService', () => {
  let service: RegionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RegionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list regions', () => {
    let regions = service.getRegions();
    expect(regions).not.toBeNull();
    expect(regions).toBeInstanceOf(Array);
    expect(regions.length).toEqual(5);
  })

  it('should get region by id', () => {
    expect(service.getRegion(1)).toStrictEqual({ id: 1, name: 'Sofia'});
  });
});
