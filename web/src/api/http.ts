import axios, { type AxiosRequestConfig } from 'axios';

export const base: string = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');

// In-memory access token storage (XSS defense: never persist raw JWT in localStorage)
let memoryAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

export const http = axios.create({
  baseURL: base,
  withCredentials: true, // Send httpOnly cookies (refreshToken, CSRF state)
  headers: { 'Content-Type': 'application/json' },
});

interface AxiosErrorWithResponse extends Error {
  response?: {
    data?: { message?: string; error?: string; code?: string };
    status?: number;
  };
  status?: number;
}

// Request interceptor: attach bearer token from in-memory store
http.interceptors.request.use((config) => {
  if (memoryAccessToken) {
    config.headers.Authorization = `Bearer ${memoryAccessToken}`;
  }
  return config;
});

// Response interceptor: handle 401 with single automatic refresh token rotation
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

http.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    const originalRequest = (err as { config?: AxiosRequestConfig & { _retry?: boolean } })?.config;
    const axiosError = err as {
      response?: { data?: { message?: string; error?: string; code?: string }; status?: number };
      message?: string;
    };

    // If 401 Unauthorized and not already retried and not the refresh/login/register endpoint itself
    if (
      axiosError?.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/register')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return http(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${base}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = response.data?.data?.token;
        if (newToken) {
          setAccessToken(newToken);
          processQueue(null, newToken);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return http(originalRequest);
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        setAccessToken(null);
        sessionStorage.removeItem('user_meta');
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    const message =
      axiosError?.response?.data?.message ||
      axiosError?.response?.data?.error ||
      axiosError?.message ||
      'Đã có lỗi xảy ra';

    const error: AxiosErrorWithResponse = new Error(message);
    error.response = axiosError?.response;
    error.status = axiosError?.response?.status;
    return Promise.reject(error);
  }
);
