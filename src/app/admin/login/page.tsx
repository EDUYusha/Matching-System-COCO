import { Suspense } from 'react';
import { LoginPage } from '@/components/admin/LoginPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
