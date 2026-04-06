import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ArticleService } from './services/articles.service';


@Component({
  selector: 'app-articles',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe
  ],
  templateUrl: './articles.component.html',
})
export class ArticlesComponent {
  protected readonly Date = Date;
  private readonly fb = inject(FormBuilder);
  protected form = this.fb.nonNullable.group({
    searchText: '',
  });
  private readonly searchTextSignal = signal<string>('');
  private readonly articleService = inject(ArticleService);
  protected readonly articlesSignal = toSignal(
    toObservable(this.searchTextSignal).pipe(
      switchMap(text => this.articleService.search(text))
    ),
    { initialValue: [] }
  );

  protected onSubmit() {
    this.searchTextSignal.set(this.form.value.searchText ?? '');
  }

  protected setSearchText(text: string) {
    if (this.form.value.searchText === text) {
      text = '';
    }
    this.form.patchValue({ searchText: text });
    this.searchTextSignal.set(text);
  }
}
