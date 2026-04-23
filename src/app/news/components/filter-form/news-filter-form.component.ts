import { Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params } from '@angular/router';
import { merge } from 'rxjs';
import { NewsService } from '../../services/news.service';
import { SourceFilterParams, TopHeadlinesParams } from '../../types/article.interface';
import {
  CATEGORIES,
  Category,
  COUNTRIES,
  Country,
  INITIAL_SEARCH_QUERY,
  Language,
  LANGUAGES,
  SEARCH_TYPES,
  SearchType,
  SORT_BY,
  SortBy,
} from '../../types/constants';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export type FilterSubmitEvent = { type: SearchType } & Partial<TopHeadlinesParams>;

@Component({
  selector: 'app-news-filter-form',
  imports: [ReactiveFormsModule],
  templateUrl: './news-filter-form.component.html',
})
export class NewsFilterFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly newsService = inject(NewsService);

  protected readonly today = todayString();
  protected readonly SEARCH_TYPES = SEARCH_TYPES;
  protected readonly LANGUAGES = LANGUAGES;
  protected readonly CATEGORIES = CATEGORIES;
  protected readonly COUNTRIES = COUNTRIES;
  protected readonly SORT_BY = SORT_BY;

  protected readonly searchTypeLabels: Record<SearchType, string> = {
    everything: 'Everything',
    'top-headlines': 'Top Headlines',
  };

  protected readonly searchType = signal<SearchType>('everything');
  protected readonly isTopHeadlines = computed(() => this.searchType() === 'top-headlines');
  protected readonly filtersExpanded = signal(true);

  protected readonly form = this.fb.nonNullable.group({
    searchText: [INITIAL_SEARCH_QUERY],
    from: [todayString()],
    to: [''],
    language: ['' as Language],
    sources: [[] as string[]],
    sortBy: ['' as SortBy | ''],
    category: ['' as Category | '',],
    country: ['' as Country | ''],
  });

  readonly submitted = output<FilterSubmitEvent>();

  private readonly sourceFilterParams = signal<SourceFilterParams>({});

  protected readonly availableSources = computed(() => this.newsService.getSources(this.sourceFilterParams()));

  constructor() {
    this.form.controls.sources.valueChanges.pipe(takeUntilDestroyed()).subscribe(sources => {
      this.syncSourcesExclusivity(sources);
      this.updateSourceFilterParams();
    });

    merge(
      this.form.controls.language.valueChanges,
      this.form.controls.category.valueChanges,
      this.form.controls.country.valueChanges,
    ).pipe(takeUntilDestroyed()).subscribe(() => this.updateSourceFilterParams());

    this.syncSourcesExclusivity(this.form.controls.sources.getRawValue());
    this.updateSourceFilterParams();

    const snapshot = this.route.snapshot.queryParams;
    if (Object.keys(snapshot).length) {
      this.populateFromQueryParams(snapshot);
    }
  }

  private syncSourcesExclusivity(sources: string[]): void {
    if (sources.length > 0) {
      this.form.controls.category.disable();
      this.form.controls.country.disable();
    } else {
      this.form.controls.category.enable();
      this.form.controls.country.enable();
    }
  }

  private updateSourceFilterParams(): void {
    const { language, category, country, sources } = this.form.getRawValue();
    this.sourceFilterParams.set({
      language: language || undefined,
      category: category || undefined,
      country: country || undefined,
    });
    const available = this.availableSources();
    const valid = sources.filter(s => available.includes(s));
    if (valid.length !== sources.length) {
      this.form.controls.sources.setValue(valid, { emitEvent: false });
      this.syncSourcesExclusivity(valid);
    }
  }

  private populateFromQueryParams(params: Params): void {
    const sources = params['sources']
      ? (params['sources'] as string).split(',')
      : [];
    if (params['searchType'] === 'top-headlines') {
      this.searchType.set('top-headlines');
    }
    this.form.patchValue({
      searchText: params['q'] ?? '',
      from: params['from'] ?? todayString(),
      to: params['to'] ?? '',
      language: params['language'] ?? '',
      sources,
      sortBy: params['sortBy'] ?? '',
      category: params['category'] ?? '',
      country: params['country'] ?? '',
    });
    this.syncSourcesExclusivity(sources);
    this.onSubmit();
  }

  protected onSubmit(): void {
    const v = this.form.getRawValue();
    const sourcesStr = v.sources.join(',');

    const event: FilterSubmitEvent = {
      type: this.searchType(),
      q: v.searchText || undefined,
      from: v.from || undefined,
      to: v.to || undefined,
      language: v.language || undefined,
      sources: sourcesStr || undefined,
      sortBy: (v.sortBy as SortBy) || undefined,
    };

    if (this.isTopHeadlines() && !sourcesStr) {
      event.category = (v.category as Category) || undefined;
      event.country = (v.country as Country) || undefined;
    }

    this.submitted.emit(event);
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
}
