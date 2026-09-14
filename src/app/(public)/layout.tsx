import type { ReactNode } from 'react';

/**
 * Signup, password reset and the legal pages: reachable without a session, so
 * they render bare — no bottom navigation, no /api/me round-trip.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="app-shell">{children}</div>;
}
