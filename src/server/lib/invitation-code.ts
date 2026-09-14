import Hashids from 'hashids';
import { INVITATION_CODE_HASH } from '@/lib';

/**
 * User::InvitationCodeHash. Same salt, minimum length and alphabet as the Ruby
 * Hashids instance, so codes already handed out to users still resolve.
 */
const hashids = new Hashids(
  INVITATION_CODE_HASH.salt,
  INVITATION_CODE_HASH.minLength,
  INVITATION_CODE_HASH.alphabet,
);

/** User#invitation_code */
export function encodeInvitationCode(userId: number): string {
  return hashids.encode(userId);
}

/**
 * User.find_inviter's decoding half. The Ruby guarded with `code !~ /\A\d+\z/`,
 * which — given the alphabet above also contains letters — means only all-digit
 * codes are ever decoded. That quirk is reproduced rather than fixed: changing it
 * would start resolving codes the live system rejects.
 */
export function decodeInvitationCode(code: string | null | undefined): number | null {
  if (!code || !/^\d+$/.test(code)) return null;
  const decoded = hashids.decode(code);
  if (!decoded.length) return null;
  const id = Number(decoded[0]);
  return Number.isFinite(id) ? id : null;
}
