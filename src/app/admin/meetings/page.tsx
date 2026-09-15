import { Suspense } from 'react';
import { MeetingsPage } from '@/components/admin/MeetingsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <MeetingsPage />
    </Suspense>
  );
}
