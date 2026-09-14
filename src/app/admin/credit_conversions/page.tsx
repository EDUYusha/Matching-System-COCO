import { Suspense } from 'react';
import { CreditConversionsPage } from '@/components/admin/CreditConversionsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <CreditConversionsPage />
    </Suspense>
  );
}
