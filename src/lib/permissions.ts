/** Port of User#can?, User#access? and User#compatible_level?. */

export type UserType = 'cast' | 'customer' | 'inviter' | 'operator' | 'admin' | 'system';

/**
 * User::ACCESS_LEVEL_RANKING — ordered lowest-privilege first. `compatibleLevel`
 * compares positions in this array, so the order is load-bearing.
 */
export const ACCESS_LEVEL_RANKING = [
  'rejected',
  'ceased',
  'unauthorized',
  'picture_uploaded',
  'interview_date_pending',
  'interview_pending',
  'contract_pending',
  'contract_accepted',
  'full',
] as const;

export type AccessLevel = (typeof ACCESS_LEVEL_RANKING)[number];

/** Capabilities granted by user_type. */
export type Permission = 'cast' | 'customer' | 'inviter' | 'operator' | 'admin' | 'payout';

/** Gates that depend on how far a cast got through onboarding. */
export type AccessGate =
  | 'not_rejected'
  | 'accept_terms'
  | 'order'
  | 'search'
  | 'post'
  | 'payout'
  | 'financial_history'
  | 'receive_stickers';

export function can(userType: UserType, permission: Permission): boolean {
  switch (userType) {
    case 'system':
      return true;
    case 'admin':
      return true;
    case 'operator':
      return permission === 'cast' || permission === 'customer' || permission === 'operator';
    case 'cast':
      return permission === 'cast' || permission === 'payout';
    case 'customer':
      return permission === 'customer';
    case 'inviter':
      return permission === 'inviter' || permission === 'payout' || permission === 'customer';
    default:
      return false;
  }
}

export function compatibleLevel(level: AccessLevel, other: AccessLevel): boolean {
  return ACCESS_LEVEL_RANKING.indexOf(level) >= ACCESS_LEVEL_RANKING.indexOf(other);
}

export function access(level: AccessLevel, gate: AccessGate): boolean {
  switch (gate) {
    // customer request: rejected shall be treated as unauthorized
    case 'not_rejected':
      return compatibleLevel(level, 'rejected');
    case 'accept_terms':
      return compatibleLevel(level, 'contract_pending');
    case 'order':
    case 'search':
    case 'post':
    case 'payout':
    case 'financial_history':
    case 'receive_stickers':
      return compatibleLevel(level, 'full');
    default:
      return false;
  }
}

/** User#public_profile_access? */
export function publicProfileAccess(
  viewer: { id: number; userType: UserType },
  target: { id: number; userType: UserType; publicProfile: boolean },
): boolean {
  if (!target.publicProfile) return false;
  if (target.id === viewer.id) return true;
  if (viewer.userType === 'customer' || viewer.userType === 'inviter') return target.userType === 'cast';
  // キャストは他のキャストのプロフィールを閲覧不可
  if (viewer.userType === 'cast') return target.userType !== 'cast';
  return true;
}

/** User#chat_access? */
export function chatAccess(
  viewer: { id: number; userType: UserType },
  target: { id: number; userType: UserType; publicProfile: boolean },
): boolean {
  return publicProfileAccess(viewer, target) && viewer.userType !== target.userType;
}
