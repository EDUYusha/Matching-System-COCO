import { Suspense } from 'react';
import { ReviewPage } from '@/components/screens/meetings/ReviewPage';

/*
 * Every screen is session- or query-driven, so none of them prerender.
 * The Suspense boundary is what useSearchParams needs to read the query
 * string during streaming.
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <ReviewPage />
    </Suspense>
  );
}
