import { AfterViewInit, Directive, DOCUMENT, ElementRef, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, fromEvent, Observable } from 'rxjs';

@Directive({
  selector: '[appClickOutside]',
})
export class ClickOutsideDirective implements AfterViewInit {
  clickOutsideRef = output<void>();

  private readonly element = inject(ElementRef);
  private readonly document = inject(DOCUMENT);

  private readonly eventObservable: Observable<Event> = fromEvent(this.document, 'click')
    .pipe(
      filter(event => !this.isClickInside(event.target as Node)),
      takeUntilDestroyed()
    );

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
