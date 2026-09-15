import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import { LoginPage } from '@/components/screens/auth/LoginPage';

/**
 * `root to: 'sessions#new'`.
 *
 * Signed out this is the login screen. Signed in it lands where
 * SessionsController#login_preparations sent people: cast to the order board,
 * everyone else to the home feed.
 */
export default async function IndexPage() {
  const user = await currentUser();
  if (user) redirect(user.userType === 'cast' ? '/meetings' : '/home');
  return <LoginPage />;
}
