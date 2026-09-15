import { Suspense } from 'react';
import { RankingsPage } from '@/components/admin/RankingsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <RankingsPage />
    </Suspense>
  );
}
