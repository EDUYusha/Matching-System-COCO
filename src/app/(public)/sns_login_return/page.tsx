import { Suspense } from 'react';
import { SnsLoginReturnPage } from '@/components/screens/auth/SnsLoginReturnPage';

/*
 * Where /api/sns_callback sends a LINE login. Query-driven, so it never
 * prerenders, and the Suspense boundary is what useSearchParams needs.
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <SnsLoginReturnPage />
    </Suspense>
  );
}
