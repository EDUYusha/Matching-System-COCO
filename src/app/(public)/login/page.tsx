import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import { LoginPage } from '@/components/screens/auth/LoginPage';

/*
 * SessionsController#login_page. The root url became the public landing page,
 * so the form lives here; a signed-in visitor goes where the root sends them.
 * The Suspense boundary is what useSearchParams needs to read `prev_page`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await currentUser();
  if (user) redirect(user.userType === 'cast' ? '/meetings' : '/home');

  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
