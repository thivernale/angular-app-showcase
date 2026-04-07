import { AfterViewInit, Directive, DOCUMENT, ElementRef, Inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, fromEvent, Observable } from 'rxjs';

@Directive({
  selector: '[appClickOutside]',
})
export class ClickOutsideDirective implements AfterViewInit {
  clickOutsideRef = output<void>();

  private readonly eventObservable: Observable<Event>;

  constructor(
    private readonly element: ElementRef,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    this.eventObservable = fromEvent(this.document, 'click')
      .pipe(
        filter(event => !this.isClickInside(event.target as Node)),
        takeUntilDestroyed()
      );
  }

  ngAfterViewInit(): void {
    this.eventObservable
      .subscribe({
        next: () => {
          this.clickOutsideRef.emit();
        }
      });
  }

  private isClickInside(target: EventTarget): boolean {
    return target === this.element.nativeElement || this.element.nativeElement.contains(target);
  }
}
