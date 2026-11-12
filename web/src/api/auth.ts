import {http} from './http';

export type LoginPayload = { email: string; password: string };
export type LoginResponse = { token: string; user: { id: string; fullName: string; email: string; userType: string } };

export type RegistrationInput = {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
};
export type RegisterResponse = { id: string; email: string };

// Backend API Response wrapper
type ApiResponse<T> = {
  message: string;
  data: T;
};

// Backend LoginResponse structure
type BackendLoginResponse = {
  message: string;
  success: boolean;
  id: number;
  fullName: string;
  role: string; 
  token: string;
};


export async function loginApi(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await http.post<ApiResponse<BackendLoginResponse>>('/auth/login', payload);
  
  const backend = data.data;
  if (!backend || !backend.token) {
    throw new Error(data?.message || 'Đăng nhập thất bại');
  }
  
  // Create frontend-compatible response
  return {
    token: backend.token,
    user: {
      id: String(backend.id),
      fullName: backend.fullName,
      email: payload.email,
      userType: backend.role,
    },
  };
}

export async function registerApi(payload: RegistrationInput): Promise<RegisterResponse> {
  const { data } = await http.post<ApiResponse<{ id: number; email: string }>>('/auth/register', payload);
  
  const backendResponse = data.data;
  
  return {
    id: backendResponse.id.toString(),
    email: backendResponse.email
  };
}

export function registerAdminApi(payload: RegistrationInput) {
  return http.post('/auth/register-admin', payload);
}

// Forgot Password
export type ForgotPasswordPayload = {
  email: string;
};

export type ForgotPasswordResponse = {
  message: string;
  success: boolean;
};

export async function forgotPasswordApi(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
  const { data } = await http.post<ApiResponse<{ message: string }>>('/auth/forgot-password', payload);
  return {
    message: data.message || 'Email đã được gửi thành công',
    success: true,
  };
}

// Reset Password (dùng token từ link email để đặt lại mật khẩu)
export type ResetPasswordPayload = {
  token: string;
  newPassword: string;
  confirmPassword: string;
};

export type ResetPasswordResponse = {
  message: string;
  success: boolean;
};

export async function resetPasswordApi(payload: ResetPasswordPayload): Promise<ResetPasswordResponse> {
  const { data } = await http.post<ApiResponse<{ message: string }>>('/auth/reset-password', payload);
  return {
    message: data.message || 'Đổi mật khẩu thành công',
    success: true,
  };
}

// Change Password (đổi mật khẩu khi đã đăng nhập)
export type ChangePasswordPayload = {
  email: string;
  oldPassword: string; // Mật khẩu hiện tại
  newPassword: string; // Mật khẩu mới patient muốn đặt
  confirmPassword: string;
};

export type ChangePasswordResponse = {
  message: string;
  success: boolean;
};

export async function changePasswordApi(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
  const { data } = await http.post<ApiResponse<{ message: string }>>('/auth/change-password', payload);
  return {
    message: data.message || 'Đổi mật khẩu thành công',
    success: true,
  };
}