import { NgClass } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  imports: [
    NgClass
  ],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.css',
})
export class PaginationComponent {
  currentPage = input(1);
  limit = input(10);
  total = input(0);
  pageChange = output<number>();

  // number of pages to show before and after the current page
  protected readonly numPagesBeforeAfter = 2;

  totalPages = computed(() => Math.ceil(this.total() / this.limit()));

  pages = computed<number[]>(() => {
    const start = Math.max(1, this.currentPage() - this.numPagesBeforeAfter);
    const numPages = Math.min(this.totalPages(), this.currentPage() + this.numPagesBeforeAfter) - start + 1;
    return this.range(numPages, start);
  });

  private range(numPages: number, start: number = 1) {
    return Array.from({ length: numPages }, (_, i) => i + start);
  }
}
