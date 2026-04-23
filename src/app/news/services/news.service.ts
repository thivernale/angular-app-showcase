import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Article, ArticlesResponse, SearchParams, TopHeadlinesParams } from '../types/article.interface';
import { articles } from './tmp-data.json';

@Injectable({
  providedIn: 'root',
})
export class NewsService {
  private readonly http = inject(HttpClient);
  public readonly baseUrl = '/newsapi/v2';

  searchEverything(params: SearchParams): Observable<ArticlesResponse> {
    return this.http
      .get<ArticlesResponse>(`${this.baseUrl}/everything`, { params: this.buildParams(params) })
      .pipe(catchError(err => of(this.errorResponse(err))));
  }

  searchTopHeadlines(params: TopHeadlinesParams): Observable<ArticlesResponse> {
    return this.http
      .get<ArticlesResponse>(`${this.baseUrl}/top-headlines`, { params: this.buildParams(params) })
      .pipe(catchError(err => of(this.errorResponse(err))));
  }

  private buildParams(params: SearchParams): HttpParams {
    let p = new HttpParams().set('apiKey', environment.newsApiKey).set('pageSize', params.pageSize).set('page', params.page);
    if (params.q) p = p.set('q', params.q);
    if (params.from) p = p.set('from', params.from);
    if (params.to) p = p.set('to', params.to);
    if (params.language) p = p.set('language', params.language);
    if (params.sources) p = p.set('sources', params.sources);
    if (params.sortBy) p = p.set('sortBy', params.sortBy);
    const hp = params as TopHeadlinesParams;
    if (hp.category) p = p.set('category', hp.category);
    if (hp.country) p = p.set('country', hp.country);
    return p;
  }

  private errorResponse(err: HttpErrorResponse): ArticlesResponse {
    const body = err.error as Partial<ArticlesResponse>;
    return {
      status: 'error',
      totalResults: 0,
      articles: [],
      code: body?.code ?? String(err.status),
      message: body?.message ?? err.message,
    };
  }

  public mockResponse(params: SearchParams): Observable<ArticlesResponse> {
    const allArticles = [...articles] as Article[];
    const sliceStart = (params.page - 1) * params.pageSize;
    return of({
      articles: allArticles.slice(sliceStart, sliceStart + params.pageSize),
      totalResults: allArticles.length,
      status: 'ok' as const,
    });
  }
}
