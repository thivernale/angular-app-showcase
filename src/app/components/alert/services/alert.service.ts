import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Alert } from '../types/alert.interface';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private alertSubject = new Subject<Alert>();
  alert$ = this.alertSubject.asObservable();

  showAlert(alert: Alert) {
    this.alertSubject.next(alert);
  }
}
