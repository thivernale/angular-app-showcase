import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterSubmitEvent, NewsFilterFormComponent } from './news-filter-form.component';

describe('NewsFilterFormComponent', () => {
  let component: NewsFilterFormComponent;
  let fixture: ComponentFixture<NewsFilterFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewsFilterFormComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(NewsFilterFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('endpoint toggle', () => {
    it('defaults to the everything endpoint with its button active', () => {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      expect(buttons[0].nativeElement.classList).toContain('active');
      expect(buttons[1].nativeElement.classList).not.toContain('active');
    });

    it('activates top-headlines button on click', async () => {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(buttons[1].nativeElement.classList).toContain('active');
    });

    it('clears category/country when switching back to everything', async () => {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();
      buttons[0].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const form = (component as any).form;
      expect(form.controls.category.value).toBe('');
      expect(form.controls.country.value).toBe('');
    });
  });

  describe('conditional filter fields', () => {
    it('shows from/to/sortBy for everything, hides category/country', () => {
      expect(fixture.debugElement.query(By.css('#from'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('#to'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('#sortBy'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('#category'))).toBeNull();
      expect(fixture.debugElement.query(By.css('#country'))).toBeNull();
    });

    it('shows category/country for top-headlines, hides from/to/sortBy', async () => {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('#category'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('#country'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('#from'))).toBeNull();
      expect(fixture.debugElement.query(By.css('#to'))).toBeNull();
      expect(fixture.debugElement.query(By.css('#sortBy'))).toBeNull();
    });

    it('date inputs have a max attribute set to today', () => {
      const fromInput = fixture.debugElement.query(By.css('#from')).nativeElement as HTMLInputElement;
      const toInput = fixture.debugElement.query(By.css('#to')).nativeElement as HTMLInputElement;
      expect(fromInput.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(toInput.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('sources mutual exclusivity', () => {
    async function switchToTopHeadlines() {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('disables category and country selects when sources are selected', async () => {
      await switchToTopHeadlines();
      (component as any).form.controls.sources.setValue(['bbc-news']);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const category = fixture.debugElement.query(By.css('#category')).nativeElement as HTMLSelectElement;
      const country = fixture.debugElement.query(By.css('#country')).nativeElement as HTMLSelectElement;
      expect(category.disabled).toBe(true);
      expect(country.disabled).toBe(true);
    });

    it('re-enables category and country when sources are cleared', async () => {
      await switchToTopHeadlines();
      (component as any).form.controls.sources.setValue(['bbc-news']);
      fixture.detectChanges();
      (component as any).form.controls.sources.setValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const category = fixture.debugElement.query(By.css('#category')).nativeElement as HTMLSelectElement;
      const country = fixture.debugElement.query(By.css('#country')).nativeElement as HTMLSelectElement;
      expect(category.disabled).toBe(false);
      expect(country.disabled).toBe(false);
    });
  });

  describe('filter panel collapse', () => {
    it('is expanded by default', () => {
      expect(fixture.debugElement.query(By.css('form .card-body'))).toBeTruthy();
    });

    it('collapses on header click', () => {
      const header = fixture.debugElement.query(By.css('.card-header[role="button"]'));
      header.nativeElement.click();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('form .card-body'))).toBeNull();
    });

    it('expands again on second header click', () => {
      const header = fixture.debugElement.query(By.css('.card-header[role="button"]'));
      header.nativeElement.click();
      fixture.detectChanges();
      header.nativeElement.click();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('form .card-body'))).toBeTruthy();
    });
  });

  describe('form submission', () => {
    it('emits submitted event with q and type everything when form is submitted with a keyword', async () => {
      let emitted: FilterSubmitEvent | undefined;
      component.submitted.subscribe(e => (emitted = e));
      (component as any).form.controls.searchText.setValue('angular testing');
      const submitBtn = fixture.debugElement.query(By.css('button[type="submit"]'));
      submitBtn.nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(emitted).toEqual(expect.objectContaining({ q: 'angular testing', type: 'everything' }));
    });

    it('emits submitted event with type top-headlines after switching endpoint', async () => {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      let emitted: FilterSubmitEvent | undefined;
      component.submitted.subscribe(e => (emitted = e));
      const submitBtn = fixture.debugElement.query(By.css('button[type="submit"]'));
      submitBtn.nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(emitted?.type).toBe('top-headlines');
    });
  });
});
