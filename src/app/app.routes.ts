import { Routes } from '@angular/router';
import { CalendarComponent } from './calendar/calendar.component';
import { Activities } from './calendar/types/activities.interface';
import { TodosComponent } from './todos/todos.component';
import activities from './calendar/data/data.json' ;

export const routes: Routes = [
  { path: '', redirectTo: 'todos', pathMatch: 'full' },
  { path: 'todos', loadComponent: () => TodosComponent },
  { path: 'calendar', loadComponent: () => CalendarComponent, data: { 'activities': (activities as Activities) } },
];
