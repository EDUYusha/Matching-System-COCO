import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/**
 * Everything behind a login.
 *
 * v2 expressed this as `<Route element={<RequireUser />}><Route element={<Layout/>}>`;
 * the App Router expresses it as a route group with its own layout, so the
 * bottom navigation and the signed-in gate wrap exactly the same set of urls.
 */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
