'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Client providers for the whole tree.
 *
 * The data layer is TanStack Query against the Route Handlers, which is what the
 * screens need: nearly all of them are interactive (the order wizard, the chat,
 * the search filters) and re-read after every mutation. Server Components carry
 * the shells and the static pages.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
