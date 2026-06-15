// Unauthenticated API client for public-facing routes.
// No auth interceptors — safe to call before login.
import axios from 'axios';

const publicApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL as string}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

export default publicApi;
