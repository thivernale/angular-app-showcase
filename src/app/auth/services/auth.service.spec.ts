import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { User, UserResponse } from '../types/user.interface';
import { AuthService } from './auth.service';

const mockUser: User = {
  email: 'test@example.com',
  token: 'mock-token-123',
  username: 'testuser',
};

const mockUserResponse: UserResponse = { user: mockUser };

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize currentUserSignal as undefined', () => {
    expect(service.currentUserSignal()).toBeUndefined();
  });

  describe('register()', () => {
    const registerModel = { email: 'test@example.com', password: 'password123', username: 'testuser' };

    it('should POST to the correct URL', () => {
      service.register(registerModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      expect(req.request.method).toBe('POST');
      req.flush(mockUserResponse);
    });

    it('should send the user in the request body', () => {
      service.register(registerModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      expect(req.request.body).toEqual({ user: registerModel });
      req.flush(mockUserResponse);
    });

    it('should set Content-Type header', () => {
      service.register(registerModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      expect(req.request.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      req.flush(mockUserResponse);
    });

    it('should store token in localStorage on success', () => {
      service.register(registerModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      req.flush(mockUserResponse);

      expect(localStorage.getItem('token')).toBe(mockUser.token);
    });

    it('should set currentUserSignal on success', () => {
      service.register(registerModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      req.flush(mockUserResponse);

      expect(service.currentUserSignal()).toEqual(mockUser);
    });

    it('should emit the user on success', () => {
      let emittedUser: User | undefined;
      service.register(registerModel).subscribe(user => (emittedUser = user));

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      req.flush(mockUserResponse);

      expect(emittedUser).toEqual(mockUser);
    });

    it('should throw formatted error on HTTP error', () => {
      const errorResponse = { errors: { email: ['is already taken'] } };
      let thrownError: Error | undefined;

      service.register(registerModel).subscribe({
        error: (err: Error) => (thrownError = err),
      });

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      req.flush(errorResponse, { status: 422, statusText: 'Unprocessable Entity' });

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError!.message).toContain('<ul>');
      expect(thrownError!.message).toContain('email');
      expect(thrownError!.message).toContain('is already taken');
    });

    it('should format multiple error fields', () => {
      const errorResponse = { errors: { email: ['is invalid'], username: ['is taken'] } };
      let thrownError: Error | undefined;

      service.register(registerModel).subscribe({
        error: (err: Error) => (thrownError = err),
      });

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users`);
      req.flush(errorResponse, { status: 422, statusText: 'Unprocessable Entity' });

      expect(thrownError!.message).toContain('email');
      expect(thrownError!.message).toContain('username');
    });
  });

  describe('login()', () => {
    const loginModel = { email: 'test@example.com', password: 'password123' };

    it('should POST to the correct URL', () => {
      service.login(loginModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      expect(req.request.method).toBe('POST');
      req.flush(mockUserResponse);
    });

    it('should send the user in the request body', () => {
      service.login(loginModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      expect(req.request.body).toEqual({ user: loginModel });
      req.flush(mockUserResponse);
    });

    it('should set Content-Type header', () => {
      service.login(loginModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      expect(req.request.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      req.flush(mockUserResponse);
    });

    it('should store token in localStorage on success', () => {
      service.login(loginModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      req.flush(mockUserResponse);

      expect(localStorage.getItem('token')).toBe(mockUser.token);
    });

    it('should set currentUserSignal on success', () => {
      service.login(loginModel).subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      req.flush(mockUserResponse);

      expect(service.currentUserSignal()).toEqual(mockUser);
    });

    it('should emit the user on success', () => {
      let emittedUser: User | undefined;
      service.login(loginModel).subscribe(user => (emittedUser = user));

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      req.flush(mockUserResponse);

      expect(emittedUser).toEqual(mockUser);
    });

    it('should throw formatted error on HTTP error', () => {
      const errorResponse = { errors: { 'email or password': ['is invalid'] } };
      let thrownError: Error | undefined;

      service.login(loginModel).subscribe({
        error: (err: Error) => (thrownError = err),
      });

      const req = httpTesting.expectOne(`${environment.authUrl}/api/users/login`);
      req.flush(errorResponse, { status: 401, statusText: 'Unauthorized' });

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError!.message).toContain('email or password');
      expect(thrownError!.message).toContain('is invalid');
    });
  });

  describe('getCurrentUser()', () => {
    it('should return null and set signal to null when no token in localStorage', () => {
      localStorage.removeItem('token');
      let result: User | null | undefined;

      service.getCurrentUser().subscribe(user => (result = user));

      expect(result).toBeNull();
      expect(service.currentUserSignal()).toBeNull();
      httpTesting.expectNone(`${environment.authUrl}/api/user`);
    });

    it('should GET from correct URL when token exists', () => {
      localStorage.setItem('token', 'existing-token');

      service.getCurrentUser().subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/user`);
      expect(req.request.method).toBe('GET');
      req.flush(mockUserResponse);
    });

    it('should set currentUserSignal on successful response', () => {
      localStorage.setItem('token', 'existing-token');

      service.getCurrentUser().subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/user`);
      req.flush(mockUserResponse);

      expect(service.currentUserSignal()).toEqual(mockUser);
    });

    it('should emit the user on success', () => {
      localStorage.setItem('token', 'existing-token');
      let emittedUser: User | null | undefined;

      service.getCurrentUser().subscribe(user => (emittedUser = user));

      const req = httpTesting.expectOne(`${environment.authUrl}/api/user`);
      req.flush(mockUserResponse);

      expect(emittedUser).toEqual(mockUser);
    });

    it('should call logout and return null on HTTP error', () => {
      localStorage.setItem('token', 'existing-token');
      const logoutSpy = vi.spyOn(service, 'logout');
      let result: User | null | undefined;

      service.getCurrentUser().subscribe(user => (result = user));

      const req = httpTesting.expectOne(`${environment.authUrl}/api/user`);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(logoutSpy).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should clear token from localStorage on HTTP error', () => {
      localStorage.setItem('token', 'existing-token');

      service.getCurrentUser().subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/user`);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should set currentUserSignal to null on HTTP error', () => {
      localStorage.setItem('token', 'existing-token');

      service.getCurrentUser().subscribe();

      const req = httpTesting.expectOne(`${environment.authUrl}/api/user`);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(service.currentUserSignal()).toBeNull();
    });
  });

  describe('logout()', () => {
    it('should remove token from localStorage', () => {
      localStorage.setItem('token', 'some-token');

      service.logout();

      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should set currentUserSignal to null', () => {
      service.currentUserSignal.set(mockUser);

      service.logout();

      expect(service.currentUserSignal()).toBeNull();
    });
  });
});
