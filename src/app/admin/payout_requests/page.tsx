import { Suspense } from 'react';
import { PayoutRequestsPage } from '@/components/admin/PayoutRequestsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <PayoutRequestsPage />
    </Suspense>
  );
}
