import { Suspense } from 'react';
import { UserDetailPage } from '@/components/admin/UserDetailPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <UserDetailPage />
    </Suspense>
  );
}
