/** Closed value sets shared by the API and both front-ends. */

export const MEETING_STATUSES = [
  'requested',
  'cast_selectable',
  'cast_requested',
  'scheduled',
  'in_progress',
  'finished',
  'completed',
  'general_fail',
  'not_enough_cast_fail',
  'score_too_low_fail',
  'request_denied_fail',
  'request_canceled_fail',
  'pre_charge_fail',
  'post_charge_fail',
  'chargeback_fail',
  'admin_cancel_fail',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Statuses in which an order is still live. */
export const ACTIVE_MEETING_STATUSES = [
  'requested',
  'cast_selectable',
  'cast_requested',
  'scheduled',
  'in_progress',
] as const;

/** Statuses a cast may still be credited for. */
export const SETTLED_MEETING_STATUSES = ['completed', 'finished', 'post_charge_fail'] as const;

export const isFailStatus = (status: string): boolean => status.endsWith('_fail');

export const MEETING_CATEGORIES = ['general', 'individual'] as const;
export type MeetingCategory = (typeof MEETING_CATEGORIES)[number];

export const CAST_ATTENDANCE_ROLES = ['attending', 'unconfirmed', 'requested', 'out'] as const;
export type CastAttendanceRole = (typeof CAST_ATTENDANCE_ROLES)[number];

export const DECISION_BY = ['customer', 'operator', 'system', 'cast'] as const;
export type DecisionBy = (typeof DECISION_BY)[number];

export const CONVERSATION_CATEGORIES = ['meeting', 'private', 'system', 'operator', 'admin'] as const;
export type ConversationCategory = (typeof CONVERSATION_CATEGORIES)[number];

export const MESSAGE_CATEGORIES = ['text', 'picture', 'sticker', 'service', 'internal'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export const POST_CATEGORIES = ['public', 'cast_only'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const CREDIT_TRANSACTION_CATEGORIES = [
  'meeting',
  'sticker',
  'charge',
  'auto_charge',
  'chargeback',
  'payout',
  'manual',
  'manual_reflect',
  'inviter',
  'inviter_cast',
  'patron_reward',
  'cast_reward',
  'reward',
  'penalty',
  'likes_reward',
  'inviter_profit_share',
  'inviter_cast_profit_share',
  'event_gift_reward',
] as const;
export type CreditTransactionCategory = (typeof CREDIT_TRANSACTION_CATEGORIES)[number];

export const FLOW_DIRECTIONS = ['in', 're_in', 'out', 'fast_out'] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

export const PAYOUT_REQUEST_STATUSES = ['pending', 'on_hold', 'processed', 'cancelled'] as const;
export type PayoutRequestStatus = (typeof PAYOUT_REQUEST_STATUSES)[number];

/**
 * PayoutRequest::HANDLING_TYPES — sub-labels for a pending application.
 * null = ordinary bank transfer (included in the transfer CSV).
 */
export const PAYOUT_HANDLING_TYPES = ['cash', 'bank_ng'] as const;
export type PayoutHandlingType = (typeof PAYOUT_HANDLING_TYPES)[number];

/** FinancialHelper#category_text — Japanese labels for the history screens. */
export const CREDIT_CATEGORY_LABELS: Record<string, string> = {
  meeting: '合流',
  charge: 'チャージ',
  auto_charge: 'オートチャージ',
  payout: '月末締め25日振り込み待ち',
  sticker: 'スタンプ',
  manual: '現金等',
  manual_reflect: '現金等',
  inviter: '紹介（合流回数ボーナス）',
  inviter_cast: '紹介（合流回数ボーナス）',
  inviter_profit_share: '紹介（合流）',
  inviter_cast_profit_share: '紹介（合流）',
  chargeback: 'チャージバック',
  patron_reward: '弟子キャストの売上シェア',
  cast_reward: '初個cocoﾎﾟｲﾝﾄﾊﾞｯｸ',
  reward: 'ポイントバック',
  penalty: 'キャンセル手数料',
  likes_reward: 'つぶやきいいねバック',
  event_gift_reward: 'イベントギフト報酬',
};

/** Japanese labels for order statuses, as shown on the order list and chat. */
export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  requested: '募集中',
  cast_selectable: 'キャスト選択中',
  cast_requested: '承認待ち',
  scheduled: '確定',
  in_progress: '進行中',
  finished: '終了',
  completed: '決済完了',
  general_fail: 'エラー',
  not_enough_cast_fail: 'キャスト不足',
  score_too_low_fail: 'マッチング不成立',
  request_denied_fail: '否認',
  request_canceled_fail: 'キャンセル',
  pre_charge_fail: '事前決済失敗',
  post_charge_fail: '決済失敗',
  chargeback_fail: '返金失敗',
  admin_cancel_fail: '運営キャンセル',
};
