import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * The operator panel.
 *
 * It shares the Next app with the member site but nothing else: its own
 * session cookie, its own secret, its own `admins` table, and a desk layout
 * rather than the phone-shaped member shell. An operator signing in here never
 * becomes a `users` row.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  // `admin` scopes the panel's component layer — see globals.css
  return (
    <div className="admin">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
