import { Routes } from '@angular/router';
import { RoutingLinkOptions } from '../../app.routes';
import { LoginComponent } from '../components/login/login.component';
import { RegisterComponent } from '../components/register/register.component';

export const authRoutes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent }
];

export const authRoutingLinkOptions: RoutingLinkOptions = [
  { label: 'Login', link: 'auth/login', icon: 'fa-sign-in-alt' },
  { label: 'Register', link: 'auth/register', icon: 'fa-user-plus' }
];
