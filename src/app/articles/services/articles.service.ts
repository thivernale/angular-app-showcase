import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Article } from '../types/article.interface';

@Injectable({
  providedIn: 'root'
})
export class ArticleService {
  private readonly baseUrl = environment.authUrl;
  private readonly http = inject(HttpClient);

  search(text: string) {
    return this.http.get<{
      articles: Article[],
      articlesCount: number
    }>(`${this.baseUrl}/api/articles?tag=${text}`).pipe(
      map(response => response.articles),
      catchError(() => {
        return of([] as Article[]);
      })
    );
  }
}
