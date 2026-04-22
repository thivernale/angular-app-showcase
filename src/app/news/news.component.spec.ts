import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsService } from './services/news.service';
import { ArticlesResponse } from './types/article.interface';
import { NewsComponent } from './news.component';

const okResponse: ArticlesResponse = {
  status: 'ok',
  totalResults: 25,
  articles: [
    {
      source: { id: 'bbc-news', name: 'BBC News' },
      title: 'Test Article',
      description: 'A test article description',
      url: 'https://bbc.co.uk/article/1',
      urlToImage: null,
      publishedAt: '2024-01-01T12:00:00Z',
      content: 'Article content here',
    },
  ],
};

const rateLimitedResponse: ArticlesResponse = {
  status: 'error',
  totalResults: 0,
  articles: [],
  code: 'rateLimited',
  message: 'You have made too many requests recently.',
};

const apiKeyInvalidResponse: ArticlesResponse = {
  status: 'error',
  totalResults: 0,
  articles: [],
  code: 'apiKeyInvalid',
  message: 'Your API key is invalid.',
};

describe('NewsComponent', () => {
  let component: NewsComponent;
  let fixture: ComponentFixture<NewsComponent>;
  let newsService: NewsService;

  async function createComponent() {
    fixture = TestBed.createComponent(NewsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewsComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    newsService = TestBed.inject(NewsService);
    vi.spyOn(newsService, 'searchEverything').mockReturnValue(of(okResponse));
    vi.spyOn(newsService, 'searchTopHeadlines').mockReturnValue(of(okResponse));

    await createComponent();
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

    it('activates top-headlines button and calls searchTopHeadlines on click', async () => {
      const buttons = fixture.debugElement.queryAll(By.css('.btn-group .btn'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(buttons[1].nativeElement.classList).toContain('active');
      expect(newsService.searchTopHeadlines).toHaveBeenCalled();
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
    it('calls searchEverything with q and page 1 when form is submitted with a keyword', async () => {
      vi.clearAllMocks();
      vi.spyOn(newsService, 'searchEverything').mockReturnValue(of(okResponse));
      (component as any).form.controls.searchText.setValue('angular testing');
      const submitBtn = fixture.debugElement.query(By.css('button[type="submit"]'));
      submitBtn.nativeElement.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(newsService.searchEverything).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'angular testing', page: 1 }),
      );
    });

    it('resets to page 1 on new search', async () => {
      vi.clearAllMocks();
      vi.spyOn(newsService, 'searchEverything').mockReturnValue(of(okResponse));
      (component as any).onPageChange(3);
      await fixture.whenStable();
      vi.clearAllMocks();
      vi.spyOn(newsService, 'searchEverything').mockReturnValue(of(okResponse));
      (component as any).onSubmit();
      await fixture.whenStable();

      expect(newsService.searchEverything).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
      );
    });
  });

  describe('pagination', () => {
    it('calls service with updated page number on page change', async () => {
      vi.clearAllMocks();
      vi.spyOn(newsService, 'searchEverything').mockReturnValue(of(okResponse));
      (component as any).onPageChange(3);
      await fixture.whenStable();

      expect(newsService.searchEverything).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 }),
      );
    });
  });

  describe('results display', () => {
    it('shows article count text', () => {
      const countEl = fixture.debugElement.query(By.css('p.text-muted'));
      expect(countEl.nativeElement.textContent.trim()).toContain('1 of 25');
    });

    it('renders one card per article', () => {
      const cards = fixture.debugElement.queryAll(By.css('.card.shadow'));
      expect(cards.length).toBe(1);
    });

    it('displays article title and source name', () => {
      const card = fixture.debugElement.query(By.css('.card.shadow')).nativeElement as HTMLElement;
      expect(card.textContent).toContain('Test Article');
      expect(card.textContent).toContain('BBC News');
    });
  });

  describe('error display', () => {
    beforeEach(async () => {
      vi.mocked(newsService.searchEverything).mockReturnValue(of(rateLimitedResponse));
      (component as any).onSubmit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows alert-warning for rateLimited error', () => {
      const alert = fixture.debugElement.query(By.css('.alert'));
      expect(alert).toBeTruthy();
      expect(alert.nativeElement.classList).toContain('alert-warning');
    });

    it('shows "Rate limit exceeded" message', () => {
      const alert = fixture.debugElement.query(By.css('.alert'));
      expect(alert.nativeElement.textContent).toContain('Rate limit exceeded');
    });
  });

  describe('non-rate-limit error display', () => {
    beforeEach(async () => {
      vi.mocked(newsService.searchEverything).mockReturnValue(of(apiKeyInvalidResponse));
      (component as any).onSubmit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows alert-danger for non-rate-limited errors', () => {
      const alert = fixture.debugElement.query(By.css('.alert'));
      expect(alert).toBeTruthy();
      expect(alert.nativeElement.classList).toContain('alert-danger');
    });

    it('shows the error code in the message', () => {
      const alert = fixture.debugElement.query(By.css('.alert'));
      expect(alert.nativeElement.textContent).toContain('apiKeyInvalid');
    });
  });
});
