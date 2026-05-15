import { HttpRequest } from '@angular/common/http';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let mockNext: Mock;
  let mockRequest: HttpRequest<unknown>;
  const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

  beforeEach(() => {
    mockNext = vi.fn();
    mockRequest = new HttpRequest('GET', environment.authUrl);
  });

  afterEach(() => {
    getItemSpy.mockClear();
    localStorage.clear();
  });

  it('should pass unaltered request when token is not present in localStorage', () => {
    getItemSpy.mockReturnValue(null);

    authInterceptor(mockRequest, mockNext);

    expect(getItemSpy).toHaveBeenCalledWith('token');
    expect(mockNext).toHaveBeenCalledWith(mockRequest);
  });

  it('should pass unaltered request when url is not auth url', () => {
    getItemSpy.mockReturnValue(null);

    mockRequest = new HttpRequest('GET', 'https://api.example.com/auth');

    authInterceptor(mockRequest, mockNext);

    expect(getItemSpy).toHaveBeenCalledWith('token');
    expect(mockNext).toHaveBeenCalledWith(mockRequest);
  });

  it('should set Authorization header when token is present in localStorage', () => {
    const token = 'mock-token';
    getItemSpy.mockReturnValue(token);

    const clonedRequest = mockRequest.clone({
      setHeaders: { Authorization: `Token ${token}` },
    });

    authInterceptor(mockRequest, mockNext);

    expect(getItemSpy).toHaveBeenCalledWith('token');
    expect(mockNext).toHaveBeenCalledWith(clonedRequest);
  });

  it('should call next.handle() regardless of token state', () => {
    getItemSpy.mockReturnValueOnce(null);
    authInterceptor(mockRequest, mockNext);

    expect(mockNext).toHaveBeenCalled();

    getItemSpy.mockReturnValueOnce('mock-token');
    authInterceptor(mockRequest, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(2);
  });
});
