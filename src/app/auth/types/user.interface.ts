export interface User {
  email: string;
  token: string;
  username: string;
}

export interface UserResponse {
  user: User;
}

export interface ErrorResponse {
  errors: Record<string, string[]>
}

export interface LoginModel {
  email: string;
  password: string;
}

export interface RegisterModel extends LoginModel {
  username: string;
}
