import { Suspense } from 'react';
import { CreditTransactionsPage } from '@/components/admin/CreditTransactionsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <CreditTransactionsPage />
    </Suspense>
  );
}
