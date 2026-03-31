import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let app: App;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  describe('onResize', () => {
    it('should update screenWidth signal with the event target width', () => {
      const event = { target: { innerWidth: 500 } } as unknown as Event;

      app.onResize(event);

      expect(app.screenWidth()).toBe(500);
    });

    it('should set isSidebarCollapsed to true if width is less than 768', () => {
      const event = { target: { innerWidth: 500 } } as unknown as Event;

      app.onResize(event);

      expect(app.isSidebarCollapsed()).toBe(true);
    });
  })
});
