import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerStockBodies } from '@gonogo/core';
import '@gonogo/components'; // triggers all component self-registration
import './dataSources'; // triggers all data source self-registration
import App from './App';

registerStockBodies();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
