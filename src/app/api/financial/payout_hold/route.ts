import { holdPayout } from '@/server/services/payouts';
import { requireGate, requirePermission } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: POST /financial/payout_hold */
export const POST = route(async (_request) => {
  const user = await requireGate('payout');
  await requirePermission('payout');
  await holdPayout(user.id);
  return {
    ok: true,
    redirect: '/financial/payout',
    flash: { type: 'notice', message: 'ポイントを保留しました。管理者が解除した後に振込処理します。' },
  };
});
