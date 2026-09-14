import { TimeRange } from '@/lib/time-range';

/**
 * Port of server/config/initializers/constants.rb.
 *
 * In Rails these were `Rails.configuration.*` globals read all over the app.
 * They keep the same names here (snake_case preserved so the two codebases can
 * be diffed) and are read through `config` rather than mutated at boot.
 *
 * Secrets that were hard-coded in the Ruby file — the LINE channel token, Twilio
 * auth token and the Axes payment zkey — are NOT reproduced here. They come from
 * the environment; see apps/api/src/config/env.ts and .env.example.
 */
export const config = {
  /** 1ポイント = 1.1円（税込） */
  thousand_points_in_yen: 1100,
  /** minutes per billing interval */
  cost_time_interval: 30,
  /** subdivides the billing interval for finer rounding */
  cost_time_interval_divider: 6,
  individual_meeting_prolong_multiplier_permille: 1300,
  /** minutes; earliest an order may start */
  min_meeting_delay: 30,

  /** yen; 5/1〜申請制・220円 */
  payout_base_fee: 220,
  payout_fee_multiplier: 0.1,
  payout_max_fee: 1_000_000,
  /** 振込金額（手数料差引後）の最低額。未満は申請不可 */
  payout_min_net_amount: 1000,

  /** seconds (4 weeks) — window in which a cast counts as "new" */
  cast_new_duration: 4 * 7 * 24 * 60 * 60,
  cast_new_level: 3,
  /** seconds (30 min) — buffer after an order in which a cast cannot take another */
  cast_attendance_blocking_period: 30 * 60,
  cast_always_receive_meeting_notifications: true,

  charge_steps: [1000, 3000, 5000, 10000, 30000, 50000, 100_000, 300_000, 500_000],
  charge_steps_boni: [0, 0, 0, 0, 0, 500, 2_000, 6_000, 15_000],

  night_surcharge: 4000,
  night_interval: new TimeRange('00:00', '06:00'),
  cast_selection_surcharge: 2000,

  /** "cast_dependent" means the cast's own service_fee_permille applies */
  night_earnings_permille: 'cast_dependent' as number | 'cast_dependent',
  selection_earnings_permille: 0 as number | 'cast_dependent',
  min_matching_score: null as number | null,
  only_consider_attendance_time_spans_for_costs: false,
  /** effective only when only_consider_attendance_time_spans_for_costs */
  estimated_costs_are_lower_bound: false,
  /** effective only when NOT only_consider_attendance_time_spans_for_costs */
  costs_for_being_early: true,

  customer_days_elapsed: 28,

  customer_start_credits_invited: 5500,
  customer_start_credits_not_invited: 0,

  deferred_payment: false,
  show_stickers_on_profile: true,
  show_posts_on_profile: true,
  show_review_summary_on_profile: false,
  show_operator_select_in_admin_chatroom: false,
  require_sms_verification: false,
  require_sms_verification_for_sns: false,
  friends_functionality: false,
  meeting_places_functionality: false,
  auto_message_send_custome: true,
  minimal_cast_selection: true,
  /** seconds before the selection window closes */
  remind_time_before_selection_end: 5 * 60,
  remind_time_before_meeting_start: null as number | null,
  remind_time_after_meeting_start: null as number | null,
  remind_time_before_meeting_end: 10 * 60,
  invitation_link_methods: { links: true, qrcode: false },
  create_conversation_with_intro_message: true,
  user_memos: true,

  show_unread_posts_count: true,
  show_users_who_liked_posts: true,
  inline_number_of_users_who_liked_posts: 5,
  cast_credits_per_like: 1,
  /** hour of day at which the like-reward day rolls over */
  cast_like_day_change: 0,
  cast_like_hour_limit: 24,

  inquiry_mail_notifications: false,
  /** seconds */
  inquiry_mail_pause_interval: 0,
  admin_new_meeting_email: false,
  admin_new_user_registration_email: false,
  admin_interview_request_email: false,

  /** StickerTemplate ids counted in the cast limited-time gift ranking */
  limited_event_sticker_template_ids: [54, 55, 56, 57],

  /** Cast levels hidden from the "new cast" list on the signup screen. */
  excluded_signup_cast_level_ids: [40, 41, 42, 43, 44, 45, 47, 48, 60],
} as const;

export type AppConfig = typeof config;

/** Hashids salt/alphabet for User#invitation_code (User::InvitationCodeHash). */
export const INVITATION_CODE_HASH = {
  salt: 'H4ch1m1t6u@sekyuR',
  minLength: 6,
  alphabet: '1234567890cfhistuCFHISTU',
} as const;

/** RewardPatron::PATRON_SHARE_PERMILLE */
export const PATRON_SHARE_PERMILLE = 30;

/** PayoutRequest::PAYOUT_MINIMUM_DATE — 申請制開始が2026年5月のため */
export const PAYOUT_MINIMUM_DATE = '2026-06-25';
