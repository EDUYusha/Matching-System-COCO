import { Suspense } from 'react';
import { ReviewsPage } from '@/components/admin/ReviewsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <ReviewsPage />
    </Suspense>
  );
}
