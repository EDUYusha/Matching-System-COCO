import { Suspense } from 'react';
import { MeetingDetailPage } from '@/components/admin/MeetingDetailPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <MeetingDetailPage />
    </Suspense>
  );
}
