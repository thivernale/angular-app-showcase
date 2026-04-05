import { HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let mockNext: Mock<HttpHandlerFn>;
  let mockRequest: HttpRequest<unknown>;
  const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

  beforeEach(() => {
    mockNext = vi.fn();
    mockRequest = new HttpRequest('GET', '/test');
  });

  afterEach(() => {
    getItemSpy.mockClear();
    localStorage.clear();
  })

  it('should pass unaltered request when token is not present in localStorage', () => {
    getItemSpy.mockReturnValue(null);

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
