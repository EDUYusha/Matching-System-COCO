import { readSession } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: GET /sns_pending */
export const GET = route(async (_request) => {
  const scratch = (await readSession())?.scratch ?? {};
  return {
    hasSns: !!scratch.sns_id,
    nickName: scratch.sns_name ?? null,
    profilePicUrl: scratch.sns_profile_pic_url ?? null,
    inviterCode: scratch.inviter_code ?? null,
  };
});
