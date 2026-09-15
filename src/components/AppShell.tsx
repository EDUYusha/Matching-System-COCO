'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useBootstrap, useCounters } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { Layout } from '@/components/Layout';
import { PageLoading } from '@/components/ui';

/**
 * ApplicationController's `before_action :authenticate` for the signed-in half
 * of the site.
 *
 * /api/me is read once here and cached in the store, which is what every screen
 * reads the current user from. While it is in flight nothing renders — the
 * alternative is every page flashing its logged-out state first.
 */
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const { loading } = useBootstrap();
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

  useCounters(!!user);

  useEffect(() => {
    // remembers where the visitor was headed, as flash[:prev_page] did
    if (!loading && !user) {
      router.replace(`/login?prev_page=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) return <PageLoading />;

  return <Layout>{children}</Layout>;
}
