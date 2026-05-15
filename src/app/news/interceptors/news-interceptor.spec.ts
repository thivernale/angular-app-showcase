import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn, HttpParams, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsService } from '../services/news.service';
import { newsInterceptor } from './news-interceptor';

describe('newsInterceptor', () => {
  let mockNewsService: NewsService;
  let interceptor: HttpInterceptorFn;
  let reloadSpy: ReturnType<typeof vi.fn>;
  const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

  beforeEach(() => {
    reloadSpy = vi.fn();
    mockNewsService = {
      baseUrl: 'https://api.news.com',
      mockResponse: vi.fn(),
    } as unknown as NewsService;

    TestBed.configureTestingModule({
      providers: [
        { provide: NewsService, useValue: mockNewsService },
        { provide: DOCUMENT, useValue: { defaultView: { location: { reload: reloadSpy } } } },
      ],
    });

    interceptor = (req, next) => {
      return newsInterceptor(req, next);
    };
  });

  afterEach(() => {
    getItemSpy.mockClear();
    setItemSpy.mockClear();
    localStorage.clear();
  });

  it('should pass through non-relevant URLs', () => {
    const req = new HttpRequest('GET', 'https://api.other.com/resource');
    const next = vi.fn().mockImplementation(() => of(new HttpResponse()));

    TestBed.runInInjectionContext(() => {
      interceptor(req, next).subscribe();
    });

    expect(next).toHaveBeenCalledWith(req);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should mock response if mock-response is enabled', () => {
    getItemSpy.mockReturnValue('true');
    mockNewsService.mockResponse = vi.fn().mockReturnValue(
      of({ data: 'mocked response' })
    );

    const req = new HttpRequest('GET', `${mockNewsService.baseUrl}/search`, {
      params: new HttpParams({ fromObject: { page: '1', pageSize: '10' } }),
    });
    const next = vi.fn();

    TestBed.runInInjectionContext(() => {
      interceptor(req, next).subscribe((response) => {
        expect(response).toBeInstanceOf(HttpResponse);
        expect((response as HttpResponse<unknown>).body).toEqual({ data: 'mocked response' });
      });
    });

    expect(mockNewsService.mockResponse).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle real API calls for relevant URLs', () => {
    getItemSpy.mockReturnValue(null);

    const req = new HttpRequest('GET', `${mockNewsService.baseUrl}/articles`);
    const next = vi.fn().mockImplementation(() => of(new HttpResponse({ body: 'real response' })));

    TestBed.runInInjectionContext(() => {
      interceptor(req, next).subscribe((response) => {
        expect(next).toHaveBeenCalledWith(req);
        expect((response as HttpResponse<unknown>).body).toEqual('real response');
      });
    });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([401, 429])('should handle %i error by enabling mock-response and reloading', (status) => {
    const req = new HttpRequest('GET', `${mockNewsService.baseUrl}/restricted`);
    const next = vi.fn().mockReturnValue(throwError(() => ({ status })));

    TestBed.runInInjectionContext(() => {
      interceptor(req, next).subscribe({ error: (_e: unknown) => void _e });
    });

    expect(setItemSpy).toHaveBeenCalledWith('mock-response', 'true');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
