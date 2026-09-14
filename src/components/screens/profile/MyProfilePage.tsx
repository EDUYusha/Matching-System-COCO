'use client';

import type { ReactNode } from 'react';
import type { ProfileDetail } from '@/lib';
import { useApiQuery } from '@/client/hooks';
import { PageLoading } from '@/components/ui';
import { ProfileView } from '@/components/screens/profile/ProfilePage';

/** ProfilesController#show_me. */
export function MyProfilePage(): ReactNode {
  const { data, isLoading, refetch } = useApiQuery<{ profile: ProfileDetail }>(['profile', 'me'], '/profile');
  if (isLoading) return <PageLoading />;
  if (!data) return null;
  return <ProfileView profile={data.profile} onChanged={() => void refetch()} />;
}
