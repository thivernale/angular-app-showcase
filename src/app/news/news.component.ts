import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Component, inject, LOCALE_ID, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { PaginationComponent } from '../components/pagination/pagination.component';
import { NewsService } from './services/news.service';
import { SearchParams } from './types/article.interface';

@Component({
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PaginationComponent,
    NgOptimizedImage
  ],
  templateUrl: './news.component.html',
})
export class NewsComponent {
  protected readonly Date = Date;
  private readonly fb = inject(FormBuilder);
  protected form = this.fb.nonNullable.group({
    searchText: '', // TODO add other search params
  });
  protected readonly searchParamsSignal = signal<SearchParams>({
    // search params initial value
    language: 'de',
    from: (new DatePipe(inject(LOCALE_ID))).transform(Date.now(), 'yyyy-MM-dd') as string,
    // to: (new DatePipe(inject(LOCALE_ID))).transform(Date.now(), 'yyyy-MM-dd') as string,
    page: 1,
    pageSize: 10,
  });
  private readonly newsService = inject(NewsService);
  protected readonly newsSignal = toSignal(
    toObservable(this.searchParamsSignal).pipe(
      switchMap(searchParams => this.newsService.search(searchParams))
    ),
    { initialValue: { articles: [], totalResults: 0, status: 'loading' } }
  );

  private updateSearchParams(delta: Partial<SearchParams>) {
    this.searchParamsSignal.update(params => {
      const newParams = { ...params };

      for (const [key, value] of Object.entries(delta)) {
        if (value !== null && value !== undefined) {
          (newParams as any)[key] = value;
        } else {
          delete newParams[key as keyof SearchParams];
        }
      }

      return newParams;
    });
  }

  protected onSubmit() {
    this.updateSearchParams({
      page: 1,
      q: this.form.value.searchText
    });
  }

  protected setSearchText(text: string) {
    if (this.form.value.searchText === text) {
      text = '';
    }
    this.form.patchValue({ searchText: text });
    this.onSubmit();
  }

  protected onPageChange(page: number) {
    this.updateSearchParams({ page });
  }
}
