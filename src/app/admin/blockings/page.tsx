import { Suspense } from 'react';
import { BlockingsPage } from '@/components/admin/BlockingsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <BlockingsPage />
    </Suspense>
  );
}
