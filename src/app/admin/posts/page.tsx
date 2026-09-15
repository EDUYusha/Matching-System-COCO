import { Suspense } from 'react';
import { PostsPage } from '@/components/admin/PostsPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <PostsPage />
    </Suspense>
  );
}
