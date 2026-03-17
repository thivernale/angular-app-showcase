import { Component, computed, Signal, signal, WritableSignal, } from '@angular/core';
import { DateTime, Info, Interval } from 'luxon';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
})
export class CalendarComponent {
  activeDay: WritableSignal<DateTime|null> = signal(null);

  today = signal(DateTime.local()).asReadonly();
  startOfMonth = signal(this.today().startOf('month'));
  weekDays = signal(Info.weekdays('short')).asReadonly();
  daysInMonth: Signal<DateTime[]> = computed(
    () => Interval.fromDateTimes(
      this.startOfMonth().startOf('week'),
      this.startOfMonth().endOf('month').endOf('week')
    )
      .splitBy({ day: 1 })
      .map(value => {
        if (value.start == null) {
          throw new Error('Invalid interval');
        }
        return value.start;
      })
  );
}
