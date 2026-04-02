import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token') ?? '';

  if (token === '') {
    return next(req);
  }

  req = req.clone({
    setHeaders: {
      'Authorization': `Token ${token}`
    }
  });

  return next(req);
};
