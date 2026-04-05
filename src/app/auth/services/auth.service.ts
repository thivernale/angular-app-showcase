import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ErrorResponse, LoginModel, RegisterModel, User, UserResponse } from '../types/user.interface';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly _currentUserSignal = signal<User | null | undefined>(undefined);
  currentUserSignal = this._currentUserSignal.asReadonly();
  private readonly baseUrl = environment.authUrl;
  private readonly http = inject(HttpClient);

  private readonly requestHeaders = new HttpHeaders(
    { 'Content-Type': 'application/json; charset=utf-8' }
  );

  register(user: RegisterModel) {
    return this.http.post<UserResponse>(
      `${this.baseUrl}/api/users`,
      { user },
      { headers: this.requestHeaders }
    ).pipe(
      map(response => response.user),
      tap(user => {
        localStorage.setItem('token', user.token);
        this._currentUserSignal.set(user);
      }),
      catchError(this.handleError)
    );
  }

  login(user: LoginModel) {
    return this.http.post<UserResponse>(
      `${this.baseUrl}/api/users/login`,
      { user },
      { headers: this.requestHeaders }
    ).pipe(
      map(response => response.user),
      tap(user => {
        localStorage.setItem('token', user.token);
        this._currentUserSignal.set(user);
      }),
      catchError(this.handleError)
    );
  }

  getCurrentUser() {
    if (localStorage.getItem('token') === null) {
      this._currentUserSignal.set(null);
      return of(null);
    }

    return this.http.get<UserResponse>(`${this.baseUrl}/api/user`).pipe(
      map(response => response.user),
      tap(user => {
        this._currentUserSignal.set(user);
      }),
      catchError(() => {
        this.logout();
        return of(null);
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    this._currentUserSignal.set(null);
  }

  private readonly handleError = (response: HttpErrorResponse) => {
    throw new Error(this.formatError(response));
  };

  private formatError(response: HttpErrorResponse): string {
    const errors = (response.error as ErrorResponse)?.errors;

    if (errors && typeof errors === 'object' && !Array.isArray(errors) && Object.entries(errors).length) {
      return '<ul>' + Object.entries(errors)
        .map(([key, messages]) => `<li>${key} ${messages.join(', ' + key + ' ')}</li>`)
        .join('') + '</ul>';
    } else {
      return response.message ?? 'An unknown error occurred';
    }
  }
}
