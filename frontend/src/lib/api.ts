import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL as string}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const { data: { session } } = await supabase.auth.refreshSession();
      if (session) {
        error.config.headers.Authorization = `Bearer ${session.access_token}`;
        return api(error.config);
      }
      await supabase.auth.signOut();
      window.location.href = '/';
    }
    return Promise.reject(error);
  },
);

export default api;
