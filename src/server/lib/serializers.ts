import {
  access,
  ageFromBirthday,
  can,
  CREDIT_CATEGORY_LABELS,
  MEETING_STATUS_LABELS,
  config,
  displayAge,
  type AccessLevel,
  type CurrentUser,
  type LevelRef,
  type MeetingSummary,
  type MessageDto,
  type PostDto,
  type ProfileDetail,
  type RankingRow,
  type UserCard,
  type UserType,
  type CastAttendanceDto,
  type ConversationSummary,
  type TransactionRow,
} from '@/lib';
import type { CastAttendance, Conversation, Message, Picture, Speaker, User } from '@prisma/client';
import {
  displayNickName,
  displayProfilePicUrl,
  hasValidCreditCard,
  invitationCode,
  isAvailable,
  isBookable,
  isOnline,
  levelOf,
  pictureUrl,
} from '@/server/services/users';
import {
  estimatedCosts,
  estimatedNightSurcharge,
  meetingAreaName,
  plannedLengthMinutes,
  type MeetingLike,
} from '@/server/services/meetings/model';
import { pictureUrlFromContent } from '@/server/services/notifications';
import { SYSTEM_USER_ID } from '@/server/services/messages';

/**
 * Row → DTO conversion. Every API response goes through here so the wire format
 * lives in one file and matches @/lib exactly.
 *
 * The display rules for soft-deleted users (User#nick_name, #profile_pic_url and
 * #birthday return placeholders once discarded_at is set) are applied here rather
 * than in each route.
 */

type LevelRow = { id: number; name: string; color: string; sortIndex: number } | null | undefined;

export function toLevelRef(level: LevelRow): LevelRef | null {
  if (!level) return null;
  return { id: level.id, name: level.name, color: level.color, sortIndex: level.sortIndex };
}

export interface CurrentUserRow extends User {
  businessArea?: { id: number; name: string } | null;
  castLevel?: { id: number; name: string; color: string; sortIndex: number } | null;
  customerLevel?: { id: number; name: string; color: string; sortIndex: number } | null;
  settings?: {
    messageNotification: boolean | null;
    footprintNotification: boolean | null;
    noRanking: boolean;
    noFame: boolean;
    noRankingSetAt: Date | null;
  } | null;
}

export function toCurrentUser(user: CurrentUserRow): CurrentUser {
  const accessLevel = user.accessLevel as AccessLevel;
  const userType = user.userType as UserType;

  return {
    id: user.id,
    nickName: displayNickName(user),
    userType,
    accessLevel,
    email: user.email,
    phone: user.phone,
    snsId: user.snsId,
    profilePicUrl: displayProfilePicUrl(user),
    motto: user.motto,
    birthday: user.birthday ? user.birthday.toISOString() : null,
    birthdayPublished: user.birthdayPublished,
    age: ageFromBirthday(user.birthday),
    publicProfile: user.publicProfile,
    creditBalance: user.creditBalance,
    frozenCredits: user.frozenCredits,
    orderFeePerTime: user.orderFeePerTime,
    serviceFeePermille: user.serviceFeePermille,
    availableUntil: user.availableUntil ? user.availableUntil.toISOString() : null,
    available: isAvailable(user),
    businessAreaId: user.businessAreaId,
    businessAreaName: user.businessArea?.name ?? null,
    castLevel: toLevelRef(user.castLevel),
    customerLevel: toLevelRef(user.customerLevel),
    invitationCode: invitationCode(user.id),
    hasCreditCard: hasValidCreditCard(user),
    customersSelected: user.customersSelected,
    guestTitle: user.guestTitle,
    individualRepeatCount: user.individualRepeatCount,
    firstPrivatelyMetUserId: user.firstPrivatelyMetUserId,
    firstPrivatelyMetAt: user.firstPrivatelyMetAt ? user.firstPrivatelyMetAt.toISOString() : null,
    lastPostReadAt: user.lastPostReadAt ? user.lastPostReadAt.toISOString() : null,
    lastServiceMessageReadAt: user.lastServiceMessageReadAt
      ? user.lastServiceMessageReadAt.toISOString()
      : null,
    settings: user.settings
      ? {
          messageNotification: user.settings.messageNotification ?? true,
          footprintNotification: user.settings.footprintNotification ?? true,
          noRanking: user.settings.noRanking,
          noFame: user.settings.noFame,
          noRankingSetAt: user.settings.noRankingSetAt ? user.settings.noRankingSetAt.toISOString() : null,
        }
      : null,
    permissions: {
      cast: can(userType, 'cast'),
      customer: can(userType, 'customer'),
      inviter: can(userType, 'inviter'),
      operator: can(userType, 'operator'),
      admin: can(userType, 'admin'),
      payout: can(userType, 'payout'),
    },
    gates: {
      notRejected: access(accessLevel, 'not_rejected'),
      acceptTerms: access(accessLevel, 'accept_terms'),
      order: access(accessLevel, 'order'),
      search: access(accessLevel, 'search'),
      post: access(accessLevel, 'post'),
      payout: access(accessLevel, 'payout'),
      financialHistory: access(accessLevel, 'financial_history'),
      receiveStickers: access(accessLevel, 'receive_stickers'),
    },
  };
}

export interface UserCardRow extends User {
  castLevel?: { id: number; name: string; color: string; sortIndex: number } | null;
  customerLevel?: { id: number; name: string; color: string; sortIndex: number } | null;
  userAttributes?: Array<{ name: string; value: string | null }>;
}

export interface UserCardOptions {
  favorited?: boolean;
  attributes?: Array<{ name: string; value: string | null }>;
  /** ProfilesHelper#customer_days_elapsed — "12日ぶりログイン" */
  showDaysElapsed?: boolean;
}

export function toUserCard(user: UserCardRow, options: UserCardOptions = {}): UserCard {
  const attributeRows = options.attributes ?? user.userAttributes ?? [];
  const attributes: Record<string, string | null> = {};
  for (const attribute of attributeRows) attributes[attribute.name] = attribute.value;

  const isNew =
    user.joinDate.getTime() > Date.now() - config.cast_new_duration * 1000 && user.userType === 'cast';

  return {
    id: user.id,
    nickName: displayNickName(user),
    userType: user.userType as UserType,
    profilePicUrl: displayProfilePicUrl(user),
    age: user.discardedAt ? null : ageFromBirthday(user.birthday),
    birthdayPublished: !!user.birthdayPublished && user.birthdayPublished !== 0,
    motto: user.motto,
    online: isOnline(user),
    available: isAvailable(user),
    publicProfile: user.publicProfile,
    joinDate: user.joinDate.toISOString(),
    lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
    level: toLevelRef(levelOf(user)),
    orderFeePerTime: user.orderFeePerTime,
    businessAreaId: user.businessAreaId,
    guestTitle: user.guestTitle,
    isNew,
    favorited: options.favorited ?? false,
    occupation: attributes['お仕事'] ?? null,
    income: attributes['年収'] ?? null,
    attributes,
    daysElapsedLabel:
      options.showDaysElapsed && user.lastLogin
        ? `${Math.floor((Date.now() - user.lastLogin.getTime()) / (24 * 60 * 60 * 1000))}日ぶりログイン`
        : null,
  };
}

export interface ProfileDetailOptions extends UserCardOptions {
  pictures: Picture[];
  attributeGroups: ProfileDetail['attributeGroups'];
  meetingPreferences: ProfileDetail['meetingPreferences'];
  stickers: ProfileDetail['stickers'];
  trophies: ProfileDetail['trophies'];
  posts: PostDto[];
  reviewStats: { average: number; count: number } | null;
  acquaintanceConversationId: number | null;
  memo: string | null;
  isMe: boolean;
  canChat: boolean;
  blockedByMe: boolean;
  priceSettings: string | null;
}

export function toProfileDetail(user: UserCardRow, options: ProfileDetailOptions): ProfileDetail {
  return {
    ...toUserCard(user, options),
    pictures: options.pictures.map((picture) => ({
      id: picture.id,
      url: pictureUrl(picture) ?? '/system/noimage.png',
      profilePic: picture.profilePic,
      public: picture.public,
    })),
    attributeGroups: options.attributeGroups,
    meetingPreferences: options.meetingPreferences,
    stickers: options.stickers,
    trophies: options.trophies,
    posts: options.posts,
    reviewStats: options.reviewStats,
    acquaintanceConversationId: options.acquaintanceConversationId,
    memo: options.memo,
    isMe: options.isMe,
    canChat: options.canChat,
    bookable: isBookable(user),
    blockedByMe: options.blockedByMe,
    individualRepeatCount: user.individualRepeatCount,
    priceSettings: options.priceSettings,
  };
}

// --- meetings --------------------------------------------------------------

export interface MeetingRow extends Omit<MeetingLike, 'status'> {
  id: number;
  status: string;
  anonymous: boolean;
  conversationId: number | null;
  realEndTime: Date | null;
  description: string | null;
  preferences: unknown;
  createdAt: Date;
  owner?: UserCardRow | null;
  castRank?: {
    id: number;
    name: string;
    baseCostPerTime: number;
    prolongCostPerTime: number;
    fixedPrice: boolean;
    proposedPrice: boolean;
  } | null;
  castAttendances?: CastAttendance[];
}

export interface MeetingSummaryOptions {
  myAttendance?: CastAttendanceDto | null;
  ownerAttributes?: Array<{ name: string; value: string | null }>;
  attendanceCount?: number;
  attendingCount?: number;
}

export function toMeetingSummary(meeting: MeetingRow, options: MeetingSummaryOptions = {}): MeetingSummary {
  const attendances = meeting.castAttendances ?? [];
  const ownerAttributes: Record<string, string | null> = {};
  for (const attribute of options.ownerAttributes ?? []) ownerAttributes[attribute.name] = attribute.value;

  return {
    id: meeting.id,
    status: meeting.status as MeetingSummary['status'],
    statusLabel: MEETING_STATUS_LABELS[meeting.status as keyof typeof MEETING_STATUS_LABELS] ?? meeting.status,
    category: meeting.category as MeetingSummary['category'],
    ownerId: meeting.ownerId,
    // an anonymous order hides the guest from the cast-facing list
    owner: meeting.owner && !meeting.anonymous ? toUserCard(meeting.owner, { attributes: options.ownerAttributes }) : null,
    anonymous: meeting.anonymous,
    areaId: meeting.areaId,
    areaName: meetingAreaName(meeting as unknown as MeetingLike),
    plannedStartTime: meeting.plannedStartTime.toISOString(),
    plannedEndTime: meeting.plannedEndTime.toISOString(),
    requestStartTime: meeting.requestStartTime ? meeting.requestStartTime.toISOString() : null,
    requestEndTime: meeting.requestEndTime ? meeting.requestEndTime.toISOString() : null,
    realEndTime: meeting.realEndTime ? meeting.realEndTime.toISOString() : null,
    neededPersonCount: meeting.neededPersonCount,
    minimumPersonCount: meeting.minimumPersonCount,
    baseCostPerTime: meeting.baseCostPerTime,
    prolongCostPerTime: meeting.prolongCostPerTime,
    castRank: meeting.castRank
      ? {
          id: meeting.castRank.id,
          name: meeting.castRank.name,
          fixedPrice: meeting.castRank.fixedPrice,
          proposedPrice: meeting.castRank.proposedPrice,
        }
      : null,
    description: meeting.description,
    conversationId: meeting.conversationId,
    estimatedCosts: estimatedCosts(meeting as unknown as MeetingLike),
    estimatedCostsWithNightSurcharge: estimatedCosts(meeting as unknown as MeetingLike, { withNightSurcharge: true }),
    estimatedNightSurcharge: estimatedNightSurcharge(meeting as unknown as MeetingLike),
    finalCosts: meeting.finalCosts,
    finalDiscount: meeting.finalDiscount,
    frozenCredits: meeting.frozenCredits,
    plannedLengthMinutes: plannedLengthMinutes(meeting as unknown as MeetingLike),
    attendanceCount: options.attendanceCount ?? attendances.filter((a) => a.role !== 'out').length,
    attendingCount: options.attendingCount ?? attendances.filter((a) => a.role === 'attending').length,
    preferences: Array.isArray(meeting.preferences) ? (meeting.preferences as number[]) : [],
    myAttendance: options.myAttendance ?? null,
    ownerAttributes,
  };
}

export function toCastAttendanceDto(
  attendance: CastAttendance & { user?: UserCardRow | null },
  options: {
    timesMet?: number | null;
    earnings?: number | null;
    costs?: CastAttendanceDto['costs'];
    attributes?: Array<{ name: string; value: string | null }>;
  } = {},
): CastAttendanceDto {
  return {
    id: attendance.id,
    userId: attendance.userId,
    meetingId: attendance.meetingId,
    role: attendance.role as CastAttendanceDto['role'],
    decisionBy: (attendance.decisionBy as CastAttendanceDto['decisionBy']) ?? null,
    startTime: attendance.startTime ? attendance.startTime.toISOString() : null,
    endTime: attendance.endTime ? attendance.endTime.toISOString() : null,
    serviceFeePermille: attendance.serviceFeePermille,
    leaderId: attendance.leaderId,
    additionalScore: attendance.additionalScore,
    timesMet: options.timesMet ?? null,
    user: attendance.user ? toUserCard(attendance.user, { attributes: options.attributes }) : null,
    earnings: options.earnings ?? null,
    costs: options.costs ?? null,
  };
}

// --- chat ------------------------------------------------------------------

const CONVERSATION_ICONS: Record<string, string> = {
  meeting: '/system/meeting-chat-logo.png',
  system: '/system/system-chat-logo.png',
  admin: '/system/admin-chat-logo.png',
  operator: '/system/admin-chat-logo.png',
};

/** ConversationsHelper#conversation_icon */
export function conversationIcon(category: string): string {
  return CONVERSATION_ICONS[category] ?? '/system/other-chat-logo.png';
}

export function toConversationSummary(
  conversation: Conversation & { speakers?: Speaker[] },
  options: {
    unreadCount?: number;
    partner?: { id: number; nickName: string; profilePicUrl: string } | null;
    mySpeaker?: Speaker | null;
    speakerCount?: number;
  } = {},
): ConversationSummary {
  return {
    id: conversation.id,
    // the per-speaker override shows the partner's name in a private room
    name: options.mySpeaker?.conversationName || conversation.name,
    category: conversation.category as ConversationSummary['category'],
    pictureUrl: conversation.pictureUrl ?? conversationIcon(conversation.category),
    lastContent: conversation.lastContent,
    lastSenderName: conversation.lastSenderName,
    lastSenderId: conversation.lastSenderId,
    updatedAt: conversation.updatedAt ? conversation.updatedAt.toISOString() : null,
    unreadCount: options.unreadCount ?? 0,
    partner: options.partner ?? null,
    speakerCount: options.speakerCount ?? conversation.speakers?.length ?? 0,
  };
}

export function toMessageDto(
  message: Message & { sender?: Pick<User, 'id' | 'nickName' | 'profilePicUrl' | 'discardedAt'> | null },
  options: { viewerId: number; wasUnread?: boolean; partnerUnreadCount?: number; ignored?: boolean; title?: string | null } = {
    viewerId: 0,
  },
): MessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender ? displayNickName(message.sender) : '',
    senderProfilePicUrl: message.sender ? displayProfilePicUrl(message.sender) : '/system/noimage.png',
    category: message.category as MessageDto['category'],
    // picture messages keep Shrine JSON in content; hand the client a url
    content: message.category === 'picture' ? pictureUrlFromContent(message.content) : message.content,
    sentAt: (message.sentAt ?? message.createdAt).toISOString(),
    createdAt: message.createdAt.toISOString(),
    wasUnread: options.wasUnread ?? false,
    partnerUnreadCount: options.partnerUnreadCount ?? 0,
    ignored: options.ignored ?? false,
    isSystem: message.senderId === SYSTEM_USER_ID,
    isMine: message.senderId === options.viewerId,
    title: options.title ?? null,
  };
}

// --- money ----------------------------------------------------------------

export interface TransactionRowRaw {
  total: number | bigint | null;
  created_at: Date;
  category: string;
  meeting_id: number | null;
  sticker_id: number | null;
  credit_conversion_id: number | null;
  inverse_conversion_id: number | null;
  flow_direction: string | null;
}

/** FinancialHelper#transaction_link decided when a detail link was available. */
const RECEIPT_AVAILABLE_FROM = new Date('2020-01-16T17:00:00+09:00');

export function toTransactionRow(row: TransactionRowRaw): TransactionRow {
  return {
    total: Number(row.total ?? 0),
    createdAt: row.created_at.toISOString(),
    category: row.category as TransactionRow['category'],
    categoryLabel: CREDIT_CATEGORY_LABELS[row.category] ?? row.category,
    meetingId: row.meeting_id,
    stickerId: row.sticker_id,
    creditConversionId: row.credit_conversion_id,
    inverseConversionId: row.inverse_conversion_id,
    flowDirection: row.flow_direction as TransactionRow['flowDirection'],
    receiptAvailable:
      row.meeting_id !== null
        ? row.created_at.getTime() >= RECEIPT_AVAILABLE_FROM.getTime()
        : row.sticker_id !== null,
  };
}

// --- rankings -------------------------------------------------------------

export interface RankingRowInput {
  position: bigint | number;
  score: bigint | number | null;
  user_id: number;
  user_type: string;
  user_nick_name: string;
  user_profile_pic: string | null;
  user_birthday: Date | string | null;
  user_birthday_published: number | null;
  user_level_id: number | null;
  user_guest_title: string | null;
}

/**
 * ProfilesHelper#ranking_profile_link decided both whether a row links anywhere
 * and whether the name is shown at all: a user who opted out of rankings appears
 * anonymised to everyone but themselves and operators.
 */
export function toRankingRow(
  row: RankingRowInput,
  options: {
    viewer: { id: number; userType: string };
    level: LevelRef | null;
    noRanking: boolean;
  },
): RankingRow {
  const { viewer } = options;
  const isOperator = viewer.userType === 'admin' || viewer.userType === 'operator';
  const isSelf = viewer.id === row.user_id;
  const viewerIsGuest = viewer.userType === 'customer' || viewer.userType === 'inviter';

  const permitted =
    isOperator ||
    isSelf ||
    (!options.noRanking &&
      ((viewerIsGuest && row.user_type === 'cast') || viewer.userType === 'cast'));

  // cast cannot open another cast's profile
  const linkable = permitted && !(viewer.userType === 'cast' && row.user_type === 'cast');
  const anonymous = !permitted;

  const birthday = row.user_birthday ? new Date(row.user_birthday) : null;

  return {
    position: Number(row.position),
    score: Number(row.score ?? 0),
    userId: row.user_id,
    nickName: anonymous ? '匿名' : row.user_nick_name,
    userType: row.user_type as UserType,
    profilePicUrl: anonymous
      ? row.user_type === 'cast'
        ? '/system/face_sample_cast.png'
        : '/system/face_sample_customer.png'
      : (row.user_profile_pic || '/system/noimage.png'),
    age: anonymous ? null : ageFromBirthday(birthday),
    birthdayPublished: !!row.user_birthday_published && row.user_birthday_published !== 0,
    level: anonymous ? null : options.level,
    guestTitle: row.user_guest_title,
    anonymous,
    linkable,
  };
}

export { displayAge };
