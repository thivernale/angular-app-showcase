import { AsyncPipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, startWith, switchMap, timer } from 'rxjs';
import { AlertService } from './services/alert.service';

@Component({
  selector: 'app-alert',
  imports: [
    NgClass,
    AsyncPipe
  ],
  templateUrl: './alert.component.html',
  styleUrl: './alert.component.css',
})
export class AlertComponent {
  private readonly alertService = inject(AlertService);

  alert$ = this.alertService.alert$.pipe(
    takeUntilDestroyed(),
    switchMap(alert =>
      // Start with the alert, then switch to null after 5 seconds
      timer(5000).pipe(
        map(() => null),
        startWith(alert)
      )
    )
  );
}
