import { Routes } from '@angular/router';
import { authGuard } from './auth/guards/auth-guard';
import { authRoutes } from './auth/routes/auth-routes';

import { CalendarComponent } from './calendar/calendar.component';
import activities from './calendar/data/data.json';
import { Activities } from './calendar/types/activities.interface';
import { FleetNavigatorComponent } from './fleet/fleet-navigator.component';
import { TodosComponent } from './todos/todos.component';

export const routes: Routes = [
  { path: '', redirectTo: 'todos', pathMatch: 'full' },
  { path: 'todos', loadComponent: () => TodosComponent },
  { path: 'fleet-navigator', loadComponent: () => FleetNavigatorComponent },
  { path: 'calendar', loadComponent: () => CalendarComponent, data: { 'activities': (activities as Activities) } },
  { path: 'auth', children: authRoutes, canActivateChild: [authGuard] }
];

export type RoutingLinkOptions = Array<{
  label: string;
  link: string;
  icon: string;
}>

export const routingLinkOptions: RoutingLinkOptions = [
    {
      label: 'Todos', link: 'todos', icon: 'fa-list'
    },
    {
      label: 'Fleet Navigator', link: 'fleet-navigator', icon: 'fa-automobile'
    },
    {
      label: 'Calendar', link: 'calendar', icon: 'fa-calendar-alt'
    }
  ]
;
