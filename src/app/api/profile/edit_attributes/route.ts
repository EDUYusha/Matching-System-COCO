import { attributeEntries } from '@/server/services/users';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { groupAttributes } from '@/server/api/profiles-shared';
export const dynamic = 'force-dynamic';

/** profiles: GET /profile/edit_attributes */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const entries = await attributeEntries(user.id, user.userType);
  return { attributeGroups: groupAttributes(entries) };
});
