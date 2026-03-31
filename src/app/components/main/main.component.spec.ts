import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainComponent } from './main.component';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MainComponent);
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    fixture.componentRef.setInput('screenWidth', 1536);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return empty string for sizeClass when sidebar is collapsed', async () => {
    fixture.componentRef.setInput('isSidebarCollapsed', true);
    fixture.componentRef.setInput('screenWidth', 1536);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sizeClass()).toBe('');
  });

  it('should return body-trimmed for sizeClass when sidebar is expanded on large screens', async () => {
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    fixture.componentRef.setInput('screenWidth', 1536);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sizeClass()).toBe('body-trimmed');
  });

  it('should return body-md-screen for sizeClass when sidebar is expanded on medium screens', async () => {
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    fixture.componentRef.setInput('screenWidth', 767);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sizeClass()).toBe('body-md-screen');
  });

  it('should update sizeClass when inputs change', async () => {
    // Start with expanded sidebar on large screen
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    fixture.componentRef.setInput('screenWidth', 1536);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.sizeClass()).toBe('body-trimmed');

    // Collapse sidebar
    fixture.componentRef.setInput('isSidebarCollapsed', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.sizeClass()).toBe('');

    // Expand sidebar and change to medium screen
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    fixture.componentRef.setInput('screenWidth', 600);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.sizeClass()).toBe('body-md-screen');
  });

});
