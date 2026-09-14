import { Suspense } from 'react';
import { AccessRequestsPage } from '@/components/admin/AccessRequestsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <AccessRequestsPage />
    </Suspense>
  );
}
