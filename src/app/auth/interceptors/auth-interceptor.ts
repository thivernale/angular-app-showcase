import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token') ?? '';

  // other URLs are not intercepted
  if (token === '' || !req.url.startsWith(environment.authUrl)) {
    return next(req);
  }

  req = req.clone({
    setHeaders: {
      'Authorization': `Token ${token}`
    }
  });

  return next(req);
};
