import { inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { User } from '../types/user.interface';

import { authGuard } from './auth-guard';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  const AuthServiceStub = vi.fn(class {
    _currentUserSignal = signal<User | null | undefined>(undefined);
    currentUserSignal = this._currentUserSignal.asReadonly();
    getCurrentUser = vi.fn(() => {
      let currentUser = { username: 'testuser' } as User;
      this._currentUserSignal.set(currentUser);
      return of(currentUser);
    });
    logout = vi.fn(() => {
      this._currentUserSignal.set(null);
    });
  }) as unknown as { new(): AuthService };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
      ],
    });

    vi.resetAllMocks();
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should return true when currentUserSignal is null', () => {
    TestBed.runInInjectionContext(() => {
      const authServiceStub = inject(AuthService);

      authServiceStub.logout();

      const result = authGuard({} as any, {} as any);
      expect(result).toBe(true);
    });
  });

  it('should return false when currentUserSignal is not null', () => {
    TestBed.runInInjectionContext(() => {
      const authServiceStub = inject(AuthService);

      authServiceStub.getCurrentUser().subscribe();

      const result = authGuard({} as any, {} as any);
      expect(result).toBe(false);
    });
  });
});
