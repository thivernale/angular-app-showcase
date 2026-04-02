import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';
import { Mocked, vi } from 'vitest';
import { AuthService } from '../services/auth.service';

import { authGuard } from './auth-guard';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  // Vitest's `Mocked` utility type ensures the stub is type-safe
  const authServiceStub: Mocked<AuthService> = {
    //  Create a real signal to use as the mock value
    currentUserSignal: signal(undefined),
  } as unknown as Mocked<AuthService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceStub },
      ],
    });

    vi.resetAllMocks();
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should return true when currentUserSignal is null', () => {
    TestBed.runInInjectionContext(() => {
      // Update the signal value directly
      authServiceStub.currentUserSignal.set(null);

      const result = authGuard({} as any, {} as any);
      expect(result).toBe(true);
    });
  });

  it('should return false when currentUserSignal is not null', () => {
    TestBed.runInInjectionContext(() => {
      // Update the signal value directly
      authServiceStub.currentUserSignal.set({ username: 'testUser', email: '', token: '' });

      const result = authGuard({} as any, {} as any);
      expect(result).toBe(false);
    });
  });
});
