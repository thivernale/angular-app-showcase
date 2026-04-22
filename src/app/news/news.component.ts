import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { PaginationComponent } from '../components/pagination/pagination.component';
import { NewsService } from './services/news.service';
import { ArticlesResponse, NewsResult, SearchParams, TopHeadlinesParams } from './types/article.interface';
import {
  CATEGORIES,
  Category,
  COUNTRIES,
  Country,
  LANGUAGES,
  Language,
  SEARCH_TYPES,
  SearchType,
  SORT_BY,
  SortBy,
  SOURCE_NAMES,
  SourceName,
} from './types/constants';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function toNewsResult(r: ArticlesResponse): NewsResult {
  if (r.status === 'error') {
    return { state: 'error', code: r.code ?? 'unknown', message: r.message ?? '' };
  }
  return { state: 'ok', data: r };
}

@Component({
  imports: [ReactiveFormsModule, PaginationComponent, DatePipe, NgOptimizedImage],
  templateUrl: './news.component.html',
})
export class NewsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly newsService = inject(NewsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly today = todayString();

  protected readonly SEARCH_TYPES = SEARCH_TYPES;
  protected readonly LANGUAGES = LANGUAGES;
  protected readonly CATEGORIES = CATEGORIES;
  protected readonly COUNTRIES = COUNTRIES;
  protected readonly SOURCE_NAMES = SOURCE_NAMES;
  protected readonly SORT_BY = SORT_BY;

  protected readonly searchTypeLabels: Record<SearchType, string> = {
    'everything':    'Everything',
    'top-headlines': 'Top Headlines',
  };

  protected readonly searchType = signal<SearchType>('everything');
  protected readonly isTopHeadlines = computed(() => this.searchType() === 'top-headlines');
  protected readonly filtersExpanded = signal(true);

  protected readonly form = this.fb.nonNullable.group({
    searchText: [''],
    from:       [todayString()],
    to:         [''],
    language:   ['de' as Language | ''],
    sources:    [[] as SourceName[]],
    sortBy:     ['' as SortBy | ''],
    category:   ['' as Category | ''],
    country:    ['' as Country | ''],
  });

  private readonly searchParamsSignal = signal<SearchParams>({
    language: 'de',
    from: todayString(),
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
        type === 'top-headlines'
          ? this.newsService.searchTopHeadlines(params as TopHeadlinesParams).pipe(map(toNewsResult))
          : this.newsService.searchEverything(params).pipe(map(toNewsResult))
      )
    ),
    { initialValue: { state: 'loading' } as NewsResult }
  );

  constructor() {
    this.form.controls.sources.valueChanges.pipe(takeUntilDestroyed()).subscribe(sources => {
      this.syncSourcesExclusivity(sources);
    });

    const snapshot = this.route.snapshot.queryParams;
    if (Object.keys(snapshot).length) {
      this.populateFromQueryParams(snapshot);
    }
  }

  private syncSourcesExclusivity(sources: SourceName[]): void {
    if (sources.length > 0) {
      this.form.controls.category.disable();
      this.form.controls.country.disable();
    } else {
      this.form.controls.category.enable();
      this.form.controls.country.enable();
    }
  }

  private populateFromQueryParams(params: Params): void {
    const sources = params['sources']
      ? (params['sources'] as string).split(',') as SourceName[]
      : [];
    if (params['searchType'] === 'top-headlines') {
      this.searchType.set('top-headlines');
    }
    this.form.patchValue({
      searchText: params['q'] ?? '',
      from:       params['from'] ?? todayString(),
      to:         params['to'] ?? '',
      language:   params['language'] ?? '',
      sources,
      sortBy:     params['sortBy'] ?? '',
      category:   params['category'] ?? '',
      country:    params['country'] ?? '',
    });
    this.syncSourcesExclusivity(sources);
    this.onSubmit();
  }

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

  private syncToUrl(params: Partial<TopHeadlinesParams>): void {
    const queryParams: Record<string, string | number | undefined> = {
      searchType: this.searchType(),
      q:          params.q,
      from:       params.from,
      to:         params.to,
      language:   params.language,
      sources:    params.sources,
      sortBy:     params.sortBy,
      category:   params.category,
      country:    params.country,
      page:       params.page,
    };
    for (const k of Object.keys(queryParams)) {
      if (queryParams[k] === undefined || queryParams[k] === '') {
        delete queryParams[k];
      }
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  protected onSubmit(): void {
    const v = this.form.getRawValue();
    const sourcesStr = v.sources.join(',');

    const delta: Partial<TopHeadlinesParams> = {
      page:     1,
      q:        v.searchText || undefined,
      from:     v.from || undefined,
      to:       v.to || undefined,
      language: (v.language as Language) || undefined,
      sources:  sourcesStr || undefined,
      sortBy:   (v.sortBy as SortBy) || undefined,
    };

    if (this.isTopHeadlines() && !sourcesStr) {
      delta.category = (v.category as Category) || undefined;
      delta.country  = (v.country as Country) || undefined;
    }

    this.updateSearchParams(delta);
    this.syncToUrl(delta);
  }

  protected setSearchType(type: SearchType): void {
    this.searchType.set(type);
    if (type === 'everything') {
      this.form.patchValue({ category: '', country: '' });
    } else {
      this.form.patchValue({ from: '', to: '', sortBy: '' });
    }
    this.onSubmit();
  }

  protected toggleFilters(): void {
    this.filtersExpanded.update(v => !v);
  }

  protected onPageChange(page: number): void {
    this.updateSearchParams({ page });
    this.syncToUrl(this.searchParamsSignal());
  }
}
