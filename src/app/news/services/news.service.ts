import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Article, ArticlesResponse, SearchParams } from '../types/article.interface';
import { SEARCH_TYPES } from '../types/constants';
import { NEWS_API_KEY } from './api-key';
import { articles } from './tmp-data.json';

@Injectable({
  providedIn: 'root',
})
export class NewsService {
  private readonly baseUrl = `https://newsapi.org/v2/${SEARCH_TYPES.EVERYTHING}?apiKey=${NEWS_API_KEY}`;
  private readonly http = inject(HttpClient);

  search(searchParams: SearchParams): Observable<ArticlesResponse> {
    const cleanEntries = Object.entries(searchParams).filter(([_, value]) => {
      return value !== null && value !== undefined && value !== '';
    });
    const queryString = Object.entries(cleanEntries).length ?
      '&' + new URLSearchParams(Object.fromEntries(cleanEntries)).toString() : '';

    console.log(queryString);

    // use tmp data for now
    const articles2 = [...articles] as Article[];
    let sliceStart = (searchParams.page - 1) * (searchParams.pageSize);
    return of({
      articles: articles2.slice(sliceStart, sliceStart + 10),
      totalResults: articles2.length,
      status: 'error',
    });
    /*
    return this.http.get<ArticlesResponse>(`${this.baseUrl}${queryString}`).pipe(
      catchError((err, caught) => {
        console.error('Error fetching news:', err);
        if (err instanceof HttpErrorResponse) {
          console.error('Error details:', err.error);
        }
        if (err.status === 429) {
        }
        return of({
          articles: [] as Article[],
          totalResults: 0,
          status: 'error',
        });
      })
    );
        */
  }
}
