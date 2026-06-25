import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { initPostHog } from './lib/posthog';
import { useUIStore } from './store/uiStore';
import './index.css';

initPostHog();

// Apply persisted theme before first paint.
if (useUIStore.getState().darkMode) document.documentElement.classList.add('dark');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // tech/08 P6: retry reads twice w/ backoff, but never on 4xx.
      retry: (count, err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
    mutations: { retry: 0 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
