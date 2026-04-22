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
      (component as any).onSearchSubmit({ type: 'everything' });
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
      (component as any).onSearchSubmit({ type: 'everything' });
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
