import { Suspense } from 'react';
import { UsersPage } from '@/components/admin/UsersPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <UsersPage />
    </Suspense>
  );
}
