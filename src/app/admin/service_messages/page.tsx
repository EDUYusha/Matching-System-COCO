import { Suspense } from 'react';
import { ServiceMessagesPage } from '@/components/admin/ServiceMessagesPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <ServiceMessagesPage />
    </Suspense>
  );
}
