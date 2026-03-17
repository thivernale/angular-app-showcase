import { Routes } from '@angular/router';
import { CalendarComponent } from './calendar/calendar.component';
import { TodosComponent } from './todos/todos.component';

export const routes: Routes = [
  { path: '', redirectTo: 'todos', pathMatch: 'full' },
  { path: 'calendar', loadComponent: () => CalendarComponent},
  { path: 'todos', loadComponent: () => TodosComponent },
];
