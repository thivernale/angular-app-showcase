import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent, {
      /*bindings: [
        inputBinding('isSidebarCollapsed', () => false),
        outputBinding('toggleSidebarCollapsed', () => new OutputEmitterRef<boolean>())
      ]*/
    });
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle the isSidebarCollapsed state and emit the new value', () => {
    // const mockToggleSidebarCollapsed = TestBed.runInInjectionContext(() => new OutputEmitterRef<boolean>());
    // component.toggleSidebarCollapsed = mockToggleSidebarCollapsed;

    const emitSpy = vi.spyOn(component.toggleSidebarCollapsed, 'emit');

    // Test case: When isSidebarCollapsed is false
    fixture.componentRef.setInput('isSidebarCollapsed', false);
    component.toggleSidebar();
    expect(emitSpy).toHaveBeenCalledWith(true);

    // Test case: When isSidebarCollapsed is true
    fixture.componentRef.setInput('isSidebarCollapsed', true);
    component.toggleSidebar();
    expect(emitSpy).toHaveBeenCalledWith(false);
  });
});
