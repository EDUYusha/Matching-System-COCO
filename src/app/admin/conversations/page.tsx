import { Suspense } from 'react';
import { ConversationsPage } from '@/components/admin/ConversationsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <ConversationsPage />
    </Suspense>
  );
}
