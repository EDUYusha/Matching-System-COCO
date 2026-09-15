/**
 * DTOs crossing the HTTP boundary. The API serialises exactly these shapes and
 * both front-ends consume them, so a field rename breaks the build rather than
 * the page.
 */
import type {
  CastAttendanceRole,
  ConversationCategory,
  CreditTransactionCategory,
  DecisionBy,
  FlowDirection,
  MeetingCategory,
  MeetingStatus,
  MessageCategory,
  PayoutHandlingType,
  PayoutRequestStatus,
  PostCategory,
} from '@/lib/enums';
import type { AccessLevel, UserType } from '@/lib/permissions';

/** Everything the shell needs about the signed-in user, returned by /api/me. */
export interface CurrentUser {
  id: number;
  nickName: string;
  userType: UserType;
  accessLevel: AccessLevel;
  email: string | null;
  phone: string | null;
  snsId: string | null;
  profilePicUrl: string;
  motto: string | null;
  birthday: string | null;
  birthdayPublished: number | null;
  age: number | null;
  publicProfile: boolean;
  creditBalance: number;
  frozenCredits: number;
  orderFeePerTime: number | null;
  serviceFeePermille: number | null;
  availableUntil: string | null;
  available: boolean;
  businessAreaId: number | null;
  businessAreaName: string | null;
  castLevel: LevelRef | null;
  customerLevel: LevelRef | null;
  invitationCode: string;
  hasCreditCard: boolean;
  customersSelected: boolean;
  guestTitle: string | null;
  individualRepeatCount: number;
  firstPrivatelyMetUserId: number | null;
  firstPrivatelyMetAt: string | null;
  lastPostReadAt: string | null;
  lastServiceMessageReadAt: string | null;
  settings: UserSettingsDto | null;
  /** Derived permissions so the UI never re-implements can?/access?. */
  permissions: {
    cast: boolean;
    customer: boolean;
    inviter: boolean;
    operator: boolean;
    admin: boolean;
    payout: boolean;
  };
  gates: {
    notRejected: boolean;
    acceptTerms: boolean;
    order: boolean;
    search: boolean;
    post: boolean;
    payout: boolean;
    financialHistory: boolean;
    receiveStickers: boolean;
  };
}

export interface UserSettingsDto {
  messageNotification: boolean;
  footprintNotification: boolean;
  noRanking: boolean;
  noFame: boolean;
  noRankingSetAt: string | null;
}

export interface LevelRef {
  id: number;
  name: string;
  color: string;
  sortIndex: number;
}

/** The badge counts the bottom navigation renders (ApplicationController#set_current_user). */
export interface NavCounters {
  unreadMessagesCount: number;
  unreadPostsCount: number;
  unreadServiceMessagesCount: number;
  availableMeetingsCount: number;
  availability: boolean;
}

/** Card-sized user summary used by search, rankings, home and chat lists. */
export interface UserCard {
  id: number;
  nickName: string;
  userType: UserType;
  profilePicUrl: string;
  age: number | null;
  birthdayPublished: boolean;
  motto: string | null;
  online: boolean;
  available: boolean;
  publicProfile: boolean;
  joinDate: string;
  lastLogin: string | null;
  level: LevelRef | null;
  orderFeePerTime: number | null;
  businessAreaId: number | null;
  guestTitle: string | null;
  isNew: boolean;
  favorited: boolean;
  occupation: string | null;
  income: string | null;
  attributes: Record<string, string | null>;
  daysElapsedLabel: string | null;
}

export interface ProfileDetail extends UserCard {
  pictures: PictureDto[];
  attributeGroups: AttributeGroup[];
  meetingPreferences: MeetingPreferenceDto[];
  stickers: ProfileStickerCount[];
  trophies: TrophyDto[];
  posts: PostDto[];
  reviewStats: { average: number; count: number } | null;
  /** existing private conversation with the viewer, if any */
  acquaintanceConversationId: number | null;
  memo: string | null;
  isMe: boolean;
  canChat: boolean;
  bookable: boolean;
  blockedByMe: boolean;
  individualRepeatCount: number;
  priceSettings: string | null;
}

export interface PictureDto {
  id: number;
  url: string;
  profilePic: boolean;
  public: boolean;
}

export interface AttributeGroup {
  category: string;
  entries: AttributeEntry[];
}

export interface AttributeEntry {
  id: number;
  name: string;
  value: string | null;
  valueType: string | null;
  category: string;
  comment: string | null;
  valueList: string[] | null;
  sortIndex: number | null;
}

export interface MeetingPreferenceDto {
  id: number;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  score: number;
  selected: boolean;
}

export interface ProfileStickerCount {
  stickerTemplateId: number;
  name: string;
  pictureUrl: string;
  count: number;
}

export interface TrophyDto {
  id: number;
  name: string;
  imageUrl: string;
  description: string | null;
}

export interface HighlightingGroup {
  id: number;
  categoryName: string;
  note: string | null;
  entries: Array<{ id: number; content: string; user: UserCard }>;
}

// --- meetings -------------------------------------------------------------

export interface MeetingSummary {
  id: number;
  status: MeetingStatus;
  statusLabel: string;
  category: MeetingCategory;
  ownerId: number;
  owner: UserCard | null;
  anonymous: boolean;
  areaId: number;
  areaName: string;
  plannedStartTime: string;
  plannedEndTime: string;
  requestStartTime: string | null;
  requestEndTime: string | null;
  realEndTime: string | null;
  neededPersonCount: number;
  minimumPersonCount: number | null;
  baseCostPerTime: number | null;
  prolongCostPerTime: number | null;
  castRank: { id: number; name: string; fixedPrice: boolean; proposedPrice: boolean } | null;
  description: string | null;
  conversationId: number | null;
  estimatedCosts: number;
  estimatedCostsWithNightSurcharge: number;
  estimatedNightSurcharge: number;
  finalCosts: number | null;
  finalDiscount: number;
  frozenCredits: number;
  plannedLengthMinutes: number;
  attendanceCount: number;
  attendingCount: number;
  preferences: number[];
  /** Set for the signed-in cast when they have a row on this order. */
  myAttendance: CastAttendanceDto | null;
  ownerAttributes: Record<string, string | null>;
}

export interface CastAttendanceDto {
  id: number;
  userId: number;
  meetingId: number;
  role: CastAttendanceRole;
  decisionBy: DecisionBy | null;
  startTime: string | null;
  endTime: string | null;
  serviceFeePermille: number | null;
  leaderId: number | null;
  additionalScore: number;
  /** how often this cast already met the order's owner (cast selection screen) */
  timesMet: number | null;
  user: UserCard | null;
  earnings: number | null;
  costs: CostBreakdown | null;
}

export interface CostBreakdown {
  base: number;
  prolong: number;
  night: number;
  selection: number;
  total: number;
}

export interface OrderFormOptions {
  businessAreas: Array<{ id: number; name: string; color: string }>;
  areas: Array<{ id: number; name: string; businessAreaId: number; custom: boolean }>;
  castRanks: Array<{
    id: number;
    name: string;
    baseCostPerTime: number;
    prolongCostPerTime: number;
    proposedPrice: boolean;
    fixedPrice: boolean;
  }>;
  meetingPreferences: MeetingPreferenceDto[];
  minMeetingDelay: number;
  costTimeInterval: number;
}

// --- chat -----------------------------------------------------------------

export interface ConversationSummary {
  id: number;
  name: string;
  category: ConversationCategory;
  pictureUrl: string | null;
  lastContent: string | null;
  lastSenderName: string | null;
  lastSenderId: number | null;
  updatedAt: string | null;
  unreadCount: number;
  partner: { id: number; nickName: string; profilePicUrl: string } | null;
  speakerCount: number;
}

export interface MessageDto {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderProfilePicUrl: string;
  category: MessageCategory;
  /** text, pre-rendered sticker HTML, or the picture url for picture messages */
  content: string;
  sentAt: string;
  createdAt: string;
  wasUnread: boolean;
  partnerUnreadCount: number;
  ignored: boolean;
  isSystem: boolean;
  isMine: boolean;
  title?: string | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: MessageDto[];
  /** id of the next older message, when more pages exist */
  overflowMessageId: number | null;
  page: number;
  disableNewMessages: boolean;
  partner: UserCard | null;
  meeting: MeetingSummary | null;
  myAttendance: CastAttendanceDto | null;
  /** gift shelf the viewer may send from in this room */
  stickers: StickerTemplateDto[];
  roulettes: RouletteDto[];
  canOrder: boolean;
  canRequestOrder: boolean;
  priceSettings: string | null;
  myRole: string;
}

export interface StickerTemplateDto {
  id: number;
  name: string;
  pictureUrl: string;
  price: number;
  free: boolean;
  eventCampaign: { id: number; name: string; castDailyLimit: number; remainingToday: number } | null;
}

export interface RouletteDto {
  id: number;
  name: string;
  fee: number;
  sortIndex: number;
  entries: Array<{
    id: number;
    stickerTemplateId: number;
    name: string;
    pictureUrl: string;
    displayChance: string | null;
    highValue: boolean;
  }>;
}

export interface RouletteRollDto {
  id: number;
  rouletteId: number;
  fee: number;
  pending: boolean;
  /** the reel, first entry wins */
  outcome: Array<{ id: number; stickerTemplateId: number; name: string; pictureUrl: string }>;
  winningEntryId: number;
}

// --- posts ----------------------------------------------------------------

export interface PostDto {
  id: number;
  userId: number;
  content: string;
  category: PostCategory;
  postLikesCount: number;
  likedByMe: boolean;
  createdAt: string;
  user: {
    id: number;
    nickName: string;
    userType: UserType;
    profilePicUrl: string;
    age: number | null;
    birthdayPublished: boolean;
    discarded: boolean;
  };
  pictures: string[];
  usersWhoLiked: Array<{
    id: number;
    nickName: string;
    profilePicUrl: string;
    userType: UserType;
    levelName: string | null;
    age: number | null;
    anonymous: boolean;
  }>;
  isMine: boolean;
}

export interface ServiceMessageDto {
  id: number;
  title: string | null;
  content: string | null;
  createdAt: string;
  unread: boolean;
}

// --- money ----------------------------------------------------------------

export interface TransactionRow {
  total: number;
  createdAt: string;
  category: CreditTransactionCategory;
  categoryLabel: string;
  meetingId: number | null;
  stickerId: number | null;
  creditConversionId: number | null;
  inverseConversionId: number | null;
  flowDirection: FlowDirection | null;
  /** a receipt PDF is available for this row */
  receiptAvailable: boolean;
}

export interface PayoutPageDto {
  creditBalance: number;
  currentMonthCredits: number;
  payableBalance: number;
  scheduledDate: string;
  fastScheduledDate: string;
  costs: { fee: number; netOut: number };
  fastCosts: { fee: number; netOut: number };
  minNetAmount: number;
  baseFee: number;
  bankAccount: BankAccountDto | null;
  pendingRequests: PayoutRequestDto[];
}

export interface BankAccountDto {
  bankName: string;
  bankNumber: string;
  branchName: string;
  branchNumber: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
}

export interface PayoutRequestDto {
  id: number;
  creditAmount: number;
  fee: number;
  netAmount: number;
  fastPayout: boolean;
  status: PayoutRequestStatus;
  handlingType: PayoutHandlingType | null;
  scheduledPayoutOn: string;
  processedAt: string | null;
  createdAt: string;
}

export interface ChargePageDto {
  steps: Array<{ credits: number; bonus: number; yen: number; total: number }>;
  creditBalance: number;
  card: {
    status: string;
    maskedCardNumber: string | null;
    expiryYear: number | null;
    expiryMonth: number | null;
    nameOnCard: string | null;
  } | null;
}

// --- rankings -------------------------------------------------------------

export type RankingCategory = 'credits' | 'meeting' | 'sticker' | 'patron' | 'limited_event' | 'event_choco_count';
export type RankingPeriod = 'yesterday' | 'this_week' | 'this_month' | 'prev_month' | 'this_year' | 'event_period';

export interface RankingRow {
  position: number;
  score: number;
  userId: number;
  nickName: string;
  userType: UserType;
  profilePicUrl: string;
  age: number | null;
  birthdayPublished: boolean;
  level: LevelRef | null;
  guestTitle: string | null;
  anonymous: boolean;
  linkable: boolean;
}

export interface RankingResponse {
  category: RankingCategory;
  period: RankingPeriod;
  userType: 'cast' | 'customer';
  rows: RankingRow[];
  myRanking: RankingRow | null;
  myRankingInTopThirty: boolean;
  campaign: { id: number; name: string; startAt: string; endAt: string } | null;
}

// --- plumbing -------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

/** Rails flash, carried in the JSON body so the SPA can show the same toasts. */
export interface FlashMessage {
  type: 'notice' | 'alert' | 'success' | 'danger' | 'open_modal';
  message: string;
}

export interface ActionResult {
  ok: boolean;
  flash?: FlashMessage;
  /** client-side path to navigate to, mirroring the original redirect_to */
  redirect?: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
  /** client-side path to navigate to, mirroring the original redirect_to */
  redirect?: string;
  flash?: FlashMessage;
}
