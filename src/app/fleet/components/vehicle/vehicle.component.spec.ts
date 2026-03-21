import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VehicleComponent } from './vehicle.component';

describe('VehicleComponent', () => {
  let component: VehicleComponent;
  let fixture: ComponentFixture<VehicleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VehicleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VehicleComponent);
    fixture.componentRef.setInput('vehicle', { id: 1, name: 'Test Vehicle', region: 1 });
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
