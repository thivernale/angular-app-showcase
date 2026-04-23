import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { switchMap, tap } from 'rxjs';
import { NewsService } from '../services/news.service';
import { SearchParams } from '../types/article.interface';

export const newsInterceptor: HttpInterceptorFn = (req, next) => {
  const newsService = inject(NewsService);
  const doc = inject(DOCUMENT);

  // other URLs are not intercepted
  if (!req.url.startsWith(newsService.baseUrl)) {
    return next(req);
  }

  if (localStorage.getItem('mock-response') === 'true') {
    const page = +(req.params.get('page') ?? 1);
    const pageSize = +(req.params.get('pageSize') ?? 10);

    return newsService.mockResponse({ page, pageSize } as SearchParams).pipe(
      switchMap(async (response) => new HttpResponse({
        body: response,
        status: 200
      }))
    );
  }

  return next(req).pipe(
    /*map(event => {
      // Check if the event is a full HttpResponse
      if (event instanceof HttpResponse) {
        // You can return a cloned response with modified data
        return event.clone({ body: { ...event.body ?? Object.fromEntries([]), intercepted: true } });
      }
      return event;
    }),*/
    tap({
      error: (error) => {
        if (error.status === 429 || error.status === 401) {
          localStorage.setItem('mock-response', true.toString());
          doc.defaultView?.location.reload();
        }
      }
    })
  );
};
