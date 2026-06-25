import axios, { AxiosError } from 'axios';
import { authClient } from './authClient';

const api = axios.create({
  baseURL: `${(import.meta.env.VITE_API_BASE_URL as string) || ''}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await authClient.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // X.1: session gone — soft re-auth, preserving the current location (P8)
      await authClient.signOut();
      const here = window.location.pathname + window.location.search;
      if (!['/', '/dev-login', '/auth/callback'].includes(window.location.pathname)) {
        sessionStorage.setItem('hl_redirect', here);
        window.location.href = authClient.isDev ? '/dev-login' : '/';
      }
    }
    return Promise.reject(error);
  },
);

/** Extract the standard error envelope from an axios error (tech/08 §2). */
export function apiError(e: unknown): { code: string; message?: string; fields?: Record<string, unknown> } {
  if (axios.isAxiosError(e)) {
    const body = e.response?.data as
      | { error?: { code: string; message?: string; fields?: Record<string, unknown> } }
      | undefined;
    if (body?.error) return body.error;
    if (!e.response) return { code: 'OFFLINE', message: "You're offline — check your connection." };
  }
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
}

/** Unwrap the { data, error } envelope, returning data. */
export async function unwrap<T>(p: Promise<{ data: { data: T } }>): Promise<T> {
  const res = await p;
  return res.data.data;
}

export default api;
