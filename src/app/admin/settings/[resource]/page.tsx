import { Suspense } from 'react';
import { CrudPage } from '@/components/admin/CrudPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <CrudPage />
    </Suspense>
  );
}
