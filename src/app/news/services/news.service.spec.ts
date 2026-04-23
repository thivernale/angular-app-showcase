import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NewsService } from './news.service';

describe('NewsService', () => {
  let service: NewsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    service = TestBed.inject(NewsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe('mock mode', () => {
    it('mockResponse returns ok status with articles', () => {
      let result: any;
      service.mockResponse({ page: 1, pageSize: 10 }).subscribe(r => (result = r));
      expect(result.status).toBe('ok');
      expect(result.articles.length).toBeGreaterThan(0);
      expect(result.totalResults).toBeGreaterThan(0);
    });

    it('mockResponse paginates: page 2 returns different articles than page 1', () => {
      let page1: any;
      let page2: any;
      service.mockResponse({ page: 1, pageSize: 3 }).subscribe(r => (page1 = r));
      service.mockResponse({ page: 2, pageSize: 3 }).subscribe(r => (page2 = r));
      expect(page1.articles).not.toEqual(page2.articles);
      expect(page1.articles.length).toBe(3);
    });

    it('does not make HTTP requests', () => {
      service.mockResponse({ page: 1, pageSize: 10 }).subscribe();
      http.expectNone('/newsapi/v2/everything');
      http.expectNone('/newsapi/v2/top-headlines');
    });
  });

  describe('real mode', () => {
    it('searchEverything sends GET to /newsapi/v2/everything with apiKey and pagination', () => {
      service.searchEverything({ page: 2, pageSize: 5 }).subscribe();
      const req = http.expectOne(r => r.url === '/newsapi/v2/everything');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('5');
      expect(req.request.params.has('apiKey')).toBe(true);
      req.flush({ status: 'ok', totalResults: 0, articles: [] });
    });

    it('searchEverything includes q, from, to, language, sources, sortBy when set', () => {
      service.searchEverything({
        page: 1, pageSize: 10,
        q: 'angular', from: '2024-01-01', to: '2024-01-31',
        language: 'en', sources: 'bbc-news,cnn', sortBy: 'relevancy',
      }).subscribe();
      const req = http.expectOne(r => r.url === '/newsapi/v2/everything');
      const p = req.request.params;
      expect(p.get('q')).toBe('angular');
      expect(p.get('from')).toBe('2024-01-01');
      expect(p.get('to')).toBe('2024-01-31');
      expect(p.get('language')).toBe('en');
      expect(p.get('sources')).toBe('bbc-news,cnn');
      expect(p.get('sortBy')).toBe('relevancy');
      req.flush({ status: 'ok', totalResults: 0, articles: [] });
    });

    it('searchEverything omits optional params when not set', () => {
      service.searchEverything({ page: 1, pageSize: 10 }).subscribe();
      const req = http.expectOne(r => r.url === '/newsapi/v2/everything');
      const p = req.request.params;
      expect(p.has('q')).toBe(false);
      expect(p.has('from')).toBe(false);
      expect(p.has('to')).toBe(false);
      expect(p.has('language')).toBe(false);
      expect(p.has('sortBy')).toBe(false);
      req.flush({ status: 'ok', totalResults: 0, articles: [] });
    });

    it('searchTopHeadlines sends GET to /newsapi/v2/top-headlines with category and country', () => {
      service.searchTopHeadlines({ page: 1, pageSize: 10, category: 'technology', country: 'us' }).subscribe();
      const req = http.expectOne(r => r.url === '/newsapi/v2/top-headlines');
      expect(req.request.params.get('category')).toBe('technology');
      expect(req.request.params.get('country')).toBe('us');
      req.flush({ status: 'ok', totalResults: 0, articles: [] });
    });

    it('converts HTTP error body to ArticlesResponse with status error', () => {
      let result: any;
      service.searchEverything({ page: 1, pageSize: 10 }).subscribe(r => (result = r));
      const req = http.expectOne(r => r.url === '/newsapi/v2/everything');
      req.flush(
        { code: 'rateLimited', message: 'You have made too many requests recently.' },
        { status: 429, statusText: 'Too Many Requests' },
      );
      expect(result.status).toBe('error');
      expect(result.code).toBe('rateLimited');
      expect(result.message).toBe('You have made too many requests recently.');
    });

    it('falls back to HTTP status code as code when error body has no code field', () => {
      let result: any;
      service.searchEverything({ page: 1, pageSize: 10 }).subscribe(r => (result = r));
      const req = http.expectOne(r => r.url === '/newsapi/v2/everything');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      expect(result.status).toBe('error');
      expect(result.code).toBe('500');
    });
  });
});
