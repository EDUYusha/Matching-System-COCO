'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Layout } from '@/components/admin/Layout';
import { LoginPage } from '@/components/admin/LoginPage';
import { useBootstrap } from '@/client/admin-hooks';
import { useAdmin } from '@/client/admin-store';
import { Loading } from '@/components/admin/ui';

/**
 * The panel's gate. /admin/login renders bare; everything else waits for
 * /api/admin/me and shows the login form instead when there is no session.
 */
export function AdminShell({ children }: { children: ReactNode }): ReactNode {
  const { loading } = useBootstrap();
  const admin = useAdmin();
  const pathname = usePathname();

  if (pathname === '/admin/login') return <>{children}</>;
  if (loading) return <Loading />;
  if (!admin) return <LoginPage />;

  return <Layout>{children}</Layout>;
}
