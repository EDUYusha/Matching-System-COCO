import { Suspense } from 'react';
import { BroadcastPage } from '@/components/admin/BroadcastPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <BroadcastPage />
    </Suspense>
  );
}
