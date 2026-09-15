/**
 * GiveSticker's rule for who may send which gift, kept free of I/O so the
 * purchase can check it before any money moves.
 *
 * Free gifts are handed out by cast; paid gifts are bought by anyone with
 * customer permission.
 */
const PAID_STICKER_SENDERS = ['customer', 'inviter', 'operator', 'admin', 'system'];

/** The refusal message, or null when the sender may send this gift. */
export function stickerSendRefusal(
  userType: string,
  price: number,
  options: { review?: boolean } = {},
): string | null {
  const free = price === 0;
  const isCast = userType === 'cast';

  if (free && !isCast) return 'Only cast can send free stickers';
  if (!free && !PAID_STICKER_SENDERS.includes(userType)) return 'Only customers can send non-free stickers';
  if (options.review && !isCast) return 'Only cast can send stickers after meeting';
  return null;
}
