import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map, startWith, switchMap } from 'rxjs';
import { PaginationComponent } from '../components/pagination/pagination.component';
import { FilterSubmitEvent, NewsFilterFormComponent } from './components/filter-form/news-filter-form.component';
import { NewsService } from './services/news.service';
import { ArticlesResponse, NewsResult, SearchParams, TopHeadlinesParams } from './types/article.interface';
import { INITIAL_SEARCH_QUERY, SearchType } from './types/constants';

function toNewsResult(r: ArticlesResponse): NewsResult {
  if (r.status === 'error') {
    return { state: 'error', code: r.code ?? 'unknown', message: r.message ?? '' };
  }
  return { state: 'ok', data: r };
}

@Component({
  imports: [NewsFilterFormComponent, PaginationComponent, DatePipe, NgOptimizedImage],
  templateUrl: './news.component.html',
})
export class NewsComponent {
  private readonly newsService = inject(NewsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly searchType = signal<SearchType>('everything');

  private readonly searchParamsSignal = signal<SearchParams>({
    q: INITIAL_SEARCH_QUERY,
    page: 1,
    pageSize: 10,
  });

  protected readonly currentPage = computed(() => this.searchParamsSignal().page);
  protected readonly pageSize = computed(() => this.searchParamsSignal().pageSize);

  private readonly querySignal = computed(() => ({
    type: this.searchType(),
    params: this.searchParamsSignal(),
  }));

  protected readonly newsSignal = toSignal(
    toObservable(this.querySignal).pipe(
      switchMap(({ type, params }) =>
        (type === 'top-headlines'
            ? this.newsService.searchTopHeadlines(params as TopHeadlinesParams)
            : this.newsService.searchEverything(params)
        )
          .pipe(
            map(toNewsResult),
            // Add 1000ms delay to simulate a slow network
            // delay(1000),
            // This emits BEFORE the search request completes,
            // every time querySignal changes.
            startWith({ state: 'loading' } as NewsResult),
          )
      ),
    ),
    { initialValue: { state: 'loading' } as NewsResult }
  );

  private updateSearchParams(delta: Partial<TopHeadlinesParams>): void {
    this.searchParamsSignal.update(params => {
      const next = { ...params } as TopHeadlinesParams;
      for (const key of Object.keys(delta) as (keyof TopHeadlinesParams)[]) {
        const value = delta[key];
        if (value !== null && value !== undefined) {
          Object.assign(next, { [key]: value });
        } else {
          delete next[key];
        }
      }
      return next;
    });
  }

  private async syncToUrl(params: Partial<TopHeadlinesParams>): Promise<void> {
    const queryParams: Record<string, string | number | undefined> = {
      searchType: this.searchType(),
      q: params.q,
      from: params.from,
      to: params.to,
      language: params.language,
      sources: params.sources,
      sortBy: params.sortBy,
      category: params.category,
      country: params.country,
      page: params.page,
    };
    for (const k of Object.keys(queryParams)) {
      if (queryParams[k] === undefined || queryParams[k] === '') {
        delete queryParams[k];
      }
    }
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  protected async onSearchSubmit(event: FilterSubmitEvent): Promise<void> {
    const { type, ...params } = event;
    this.searchType.set(type);
    this.updateSearchParams({ ...params, page: 1 });
    await this.syncToUrl({ ...params, page: 1 });
  }

  protected async onPageChange(page: number): Promise<void> {
    this.updateSearchParams({ page });
    await this.syncToUrl(this.searchParamsSignal());
  }
}
